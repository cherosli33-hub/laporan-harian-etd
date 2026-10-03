import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,writeBatch,disableNetwork,enableNetwork,getDocs,collection} from 'firebase/firestore';
import {toSummary,recordEnvelope} from '../../phc-kuala-lipis/src/model.js';
const dir=await mkdtemp(path.join(tmpdir(),'etd-realtime-'));
for(const name of ['phcLive','phcCalls','operationalDate','shiftEngine']){
 let code=await readFile(new URL(`../app/lib/${name}.ts`,import.meta.url),'utf8');
 code=code.replace("'../shared/operationalShift.js'",JSON.stringify(new URL('../app/shared/operationalShift.js',import.meta.url).href));
 for(const name of ['firebase/app','firebase/auth','firebase/firestore'])code=code.replaceAll(`from '${name}'`,`from '${import.meta.resolve(name)}'`);
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from (["'])\.\/(\w+)\1/g,'from "./$2.mjs"');
 await writeFile(path.join(dir,name+'.mjs'),js);
}
const {listenPHCCalls}=await import(pathToFileURL(path.join(dir,'phcLive.mjs')));
globalThis.window=new EventTarget();Object.defineProperty(globalThis.navigator,'onLine',{value:true,configurable:true});
const rules=await readFile(new URL('../../phc-kuala-lipis/backend/firestore.test.rules',import.meta.url),'utf8');
const env=await initializeTestEnvironment({projectId:'demo-phc-kuala-lipis',firestore:{host:'127.0.0.1',port:8080,rules}});
const viewer=()=>env.authenticatedContext('reader-'+Math.random(),{firebase:{sign_in_provider:'anonymous'}}).firestore();
const writer=env.authenticatedContext('staff',{email:'staff@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'}}).firestore();
let version=0;
const record=(id,source,time='08:00',date='2026-10-04')=>{const op=globalThis.OperationalShiftEngine.fromLocal(date,time);return {id,status:'completed',caseDate:date,dispatchTime:time,operationalDate:op.operationalDate,operationalShift:op.shift,shiftEngineVersion:1,callSource:source,meccCentre:source==='mecc'?'MECC Kuantan 2':null,createdAt:'2026-10-03T00:00:00.000Z',updatedAt:new Date(Date.UTC(2026,9,4,0,0,++version)).toISOString()};};
async function save(r){const summary=toSummary(r),batch=writeBatch(writer);batch.set(doc(writer,'phcRecords',r.id),recordEnvelope(r,summary));batch.set(doc(writer,'phcCallSummaries',r.id),summary);await batch.commit();}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){for(let n=0;n<100;n++){if(predicate())return;await delay(50);}throw new Error('Realtime expected snapshot did not arrive');}
test('A–I/K–O actual Firestore listener: scoped shifts, sources, two clients, edit, reconnect, unsubscribe',async()=>{
 await env.clearFirestore();let a,b,night,afternoon;const dbA=viewer(),dbB=viewer();
 const offA=listenPHCCalls('2026-10-04','Pagi',s=>a=s,dbA),offB=listenPHCCalls('2026-10-04','Pagi',s=>b=s,dbB),offN=listenPHCCalls('2026-10-03','Malam',s=>night=s,dbA),offP=listenPHCCalls('2026-10-04','Petang',s=>afternoon=s,dbA);
 await until(()=>a?.status==='ready'&&b?.status==='ready');assert.equal(a.calls.mecc,0);
 await save(record('ONE','mecc'));await until(()=>a.calls?.mecc===1&&b.calls?.mecc===1);assert.equal(a.calls.operator,0);
 for(const source of ['operator','awam','palsu'])await save(record(source,source));await until(()=>a.calls?.palsu===1);assert.deepEqual(a.calls,{mecc:1,operator:1,awam:1,palsu:1});
 await save(record('PETANG','operator','14:00'));await until(()=>afternoon?.calls?.operator===1);assert.equal(a.calls.operator,1);
 await save(record('NIGHT-BEFORE','mecc','23:00','2026-10-03'));await save(record('NIGHT-AFTER','mecc','02:30'));await until(()=>night?.calls?.mecc===2);assert.equal(a.calls.mecc,1);
 await save(record('SEVEN','mecc','07:00'));await until(()=>a.calls?.mecc===2);
 await save(record('operator','mecc'));await until(()=>a.calls?.operator===0&&a.calls?.mecc===3&&b.calls?.mecc===3);
 assert.equal((await getDocs(collection(writer,'phcRecords'))).size,8);
 await disableNetwork(dbA);window.dispatchEvent(new Event('offline'));await until(()=>a?.status==='error');await enableNetwork(dbA);await until(()=>a?.status==='ready');assert.equal(a.calls.mecc,3);
 const before=structuredClone(a);offA();await save(record('AFTER-UNSUB','mecc'));await until(()=>b.calls?.mecc===4);assert.deepEqual(a,before);
 offB();offN();offP();await env.clearFirestore();
});
test('J: no polling source or unbounded listener and both engines identical',async()=>{
 const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8'),live=await readFile(new URL('../app/lib/phcLive.ts',import.meta.url),'utf8');
 assert.doesNotMatch(page,/setInterval|30000|30 saat/);assert.match(live,/where\('operationalDate','==',date\)/);assert.match(live,/where\('shift','==',shift.toLowerCase\(\)\)/);assert.match(live,/stopped=true;unsubscribe\(\)/);
});
test('J idle: actual onSnapshot stays open 180 seconds without periodic re-query',async()=>{
 let state,events=0;const stop=listenPHCCalls('2026-10-04','Pagi',s=>{state=s;events++;},viewer());
 await until(()=>state?.status==='ready');const baseline=events;console.log('180-second idle observation started');
 await delay(180000);assert.equal(events,baseline);assert.equal(state.status,'ready');stop();
});
test.after(async()=>{await env.cleanup();await rm(dir,{recursive:true,force:true});});
