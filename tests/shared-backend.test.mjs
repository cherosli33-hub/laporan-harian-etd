// Requires both separate repositories and the demo Firestore emulator.
// PHC_PROJECT_PATH points to the PHC checkout. No production credentials/data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {tmpdir} from 'node:os';
import ts from 'typescript';

test('PHC transaction → actual Firestore → ETD reader: create/edit/draft/date/shift/statistics', {skip:!process.env.PHC_PROJECT_PATH}, async()=>{
 const phc=path.resolve(process.env.PHC_PROJECT_PATH);
 assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/,'Demo emulator only');
 const require=createRequire(path.join(phc,'package.json'));
 const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
 const {doc,runTransaction,writeBatch}=require('firebase/firestore');
 const {toSummary,recordEnvelope,planWrite}=await import(pathToFileURL(path.join(phc,'src/model.js')));
 let rules=await readFile(path.join(phc,'backend/firestore.test.rules'),'utf8');
 rules=rules.replace(/\n }\n}\n$/, '\n match /daily_reports/{id} { allow read: if signedIn(); allow write: if false; }\n }\n}\n');
 const project='demo-phc-kuala-lipis';
 const env=await initializeTestEnvironment({projectId:project,firestore:{rules}});
 const dir=await mkdtemp(path.join(tmpdir(),'etd-shared-backend-'));
 const originalFetch=globalThis.fetch, originalWindow=globalThis.window;
 try{
  await env.clearFirestore();
  for(const name of ['types','operationalDate','phcCalls','reportRepository']){
   const source=await readFile(new URL('../app/lib/'+name+'.ts',import.meta.url),'utf8');
   const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from (["'])\.\/(\w+)\1/g,'from "./$2.mjs"');
   await writeFile(path.join(dir,name+'.mjs'),js);
  }
  const payload={aud:project,iss:'https://securetoken.google.com/'+project,sub:'etd-reader',user_id:'etd-reader',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{sign_in_provider:'anonymous'}};
  const token=Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.';
  const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
  globalThis.window={localStorage:storage(),sessionStorage:storage()};
  globalThis.fetch=(url,init)=>{
   if(String(url).includes('accounts:signUp'))return Promise.resolve(Response.json({idToken:token,refreshToken:'emulator-only',expiresIn:'3600'}));
   if(String(url).startsWith('https://firestore.googleapis.com/'))url=String(url).replace('https://firestore.googleapis.com','http://'+process.env.FIRESTORE_EMULATOR_HOST).replace('/projects/amo-dashboard-v2/','/projects/'+project+'/');
   return originalFetch(url,init);
  };
  const {reportRepository}=await import(pathToFileURL(path.join(dir,'reportRepository.mjs')));
  const {emptyReport}=await import(pathToFileURL(path.join(dir,'types.mjs')));
  const db=env.authenticatedContext('admin',{email:'admin@example.test',email_verified:true}).firestore();
  const record=(id,source,shift='pagi',date='2026-10-03',op=date)=>({id,status:'completed',caseDate:date,dispatchTime:'01:00',operationalDate:op,operationalShift:shift,callSource:source,meccCentre:source==='mecc'?'MECC KUANTAN':'',createdAt:'2026-10-03T00:00:00.000Z',updatedAt:'2026-10-03T00:00:01.000Z',notes:'EMULATOR ONLY'});
  const push=async r=>{
   const s=toSummary(r),e=recordEnvelope(r,s),ref=doc(db,'phcRecords',r.id);
   await runTransaction(db,async tx=>{const previous=await tx.get(ref);planWrite(previous.exists()?previous.data():null,e);tx.set(ref,e);tx.set(doc(db,'phcCallSummaries',r.id),s)});
  };
  assert.throws(()=>toSummary({...record('draft','mecc'),status:'draft'}));
  assert.deepEqual((await reportRepository.getCalls('2026-10-03','Pagi')).calls,{mecc:0,operator:0,awam:0,palsu:0});
  const r=record('one','mecc');await push(r);await push(r);
  for(const [id,source] of [['two','operator'],['three','awam'],['four','palsu']])await push(record(id,source));
  assert.deepEqual((await reportRepository.getCalls('2026-10-03','Pagi')).calls,{mecc:1,operator:1,awam:1,palsu:1});
  r.callSource='awam';r.updatedAt='2026-10-03T00:00:02.000Z';await push(r);
  assert.deepEqual((await reportRepository.getCalls('2026-10-03','Pagi')).calls,{mecc:0,operator:1,awam:2,palsu:1});
  await push(record('night','mecc','malam','2026-10-04','2026-10-03'));
  assert.equal((await reportRepository.getCalls('2026-10-03','Malam')).calls.mecc,1);
  assert.equal((await reportRepository.getCalls('2026-10-04','Malam')).calls.mecc,0);
  const old=emptyReport('2026-10-02','Pagi');old.calls.mecc=7;old.callNotes='HISTORICAL';
  await env.withSecurityRulesDisabled(async ctx=>{const b=writeBatch(ctx.firestore());b.set(doc(ctx.firestore(),'daily_reports',old.id),{date:old.date,shift:old.shift,reportJson:JSON.stringify(old),deleted:false});await b.commit()});
  for(const period of ['week','month','year']){const stats=await reportRepository.getStats(period,'2026-10-03',{refresh:true});assert.equal(stats.callState.status,'ready');assert.equal(stats.totals.calls,12);assert.equal(stats.groups.reduce((sum,g)=>sum+g.calls,0),12)}
  assert.equal((await reportRepository.getByDate('2026-10-02'))[0].calls.mecc,7);
 }finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;await env.cleanup();await rm(dir,{recursive:true,force:true})}
});
