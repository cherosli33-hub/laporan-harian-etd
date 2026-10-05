import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const page=fs.readFileSync('app/page.tsx','utf8');
const boundary=page.slice(page.indexOf('  // A local boundary timer'),page.indexOf('  useEffect(() => {\n    if (view !== "form" || !usesPHC'));
function scenario(next){
 let callback,clock,cleanup;
 const memory=new Map(),window={localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},setTimeout:fn=>{callback=fn;return 1;},clearTimeout(){},addEventListener(){},removeEventListener(){}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/lib/localReportRepository.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,window,Date});
 const repo=exports.localReportRepository;
 const draft={id:'2026-10-05_Malam',date:'2026-10-05',operationalDate:'2026-10-05',shift:'Malam',filledBy:'Pengisi',stats:{l1:2,l3:5},carry:{merah:1}};
 repo.saveDraft(draft);
 const context={window,Date,useEffect:fn=>{cleanup=fn();},shiftEngine:{getOperationalShift:()=>next,nextBoundary:()=>new Date(Date.now()+1000)},setClock:v=>clock=v,setDraft:()=>assert.fail('boundary must never replace an active draft')};
 vm.runInNewContext(ts.transpileModule(boundary,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);callback();cleanup();
 assert.equal(clock.operationalDate,next.operationalDate);
 const restored=repo.getDraft('2026-10-05_Malam');assert.equal(restored.shift,'Malam');assert.equal(restored.operationalDate,'2026-10-05');assert.equal(restored.stats.l1,2);assert.equal(repo.getDrafts().length,1);
}
test('night draft survives midnight, 07:00 rollover and later dates without relabelling',()=>{
 for(const next of [{operationalDate:'2026-10-05',shift:'malam'},{operationalDate:'2026-10-06',shift:'pagi'},{operationalDate:'2026-10-08',shift:'pagi'}])scenario(next);
});
test('past date and old draft entry points stay available; changing selection restores its own draft',()=>{
 assert.match(page,/Draf belum dihantar/);assert.match(page,/startReport\(r.shift, r.date\)/);assert.match(page,/startReport\(draft.shift, e.target.value\)/);assert.match(page,/startReport\(s, draft.date\)/);assert.match(page,/const dashboardDate = selectedReportDate \|\| clock.operationalDate/);assert.doesNotMatch(page,/setFollowCurrentShift|followCurrentShift/);
 const start=page.slice(page.indexOf('  const startReport ='),page.indexOf('  const leaveForm ='));
 assert.ok(start.indexOf('saveDraft')<start.indexOf('getDraft'));assert.match(start,/remembered \? structuredClone\(remembered\)/);
});
