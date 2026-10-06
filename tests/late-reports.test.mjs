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

const cards=page.slice(page.indexOf('        <section className="shift-grid">'),page.indexOf('        <section className="section-block">',page.indexOf('        <section className="shift-grid">')));
const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
const {renderToStaticMarkup}=await import('react-dom/server');
const jsx=ts.transpileModule('export const render=(inspectionVerified,inspectionRows,drafts,inspectionDay)=>('+cards+');',{fileName:'cards.tsx',compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const out={};vm.runInNewContext(jsx,{exports:out,require,shifts:['Pagi','Petang','Malam'],shiftTimes:{Pagi:'Pagi',Petang:'Petang',Malam:'Malam'},busy:false,operationalDateForReport:r=>r.operationalDate||r.date,derived:()=>({merah:0,kuning:0,hijau:0}),totalCases:()=>0,startReport:()=>assert.fail('render may not create/open drafts')});
const record=shift=>({id:'2026-10-05_'+shift,date:'2026-10-05',operationalDate:'2026-10-05',shift,updatedAt:'2026-10-05T15:00:00.000Z',carry:{merah:0,kuning:0,observation:0}});
const render=(finals,drafts,verified=true)=>renderToStaticMarkup(out.render(verified,finals,drafts,'2026-10-05'));
test('1/5: Firebase Pagi/Petang final wins over stale drafts; only true Malam draft can resume',()=>{
 const drafts=['Pagi','Petang','Malam'].map(record),before=JSON.stringify(drafts),html=render(['Pagi','Petang'].map(record),drafts);
 assert.equal((html.match(/Sambung draf/g)||[]).length,1);assert.equal((html.match(/Lihat &amp; kemas kini/g)||[]).length,2);assert.equal(JSON.stringify(drafts),before);
});
test('2/3: all final shifts display no resume drafts; inspecting does not alter local drafts',()=>{
 const records=['Pagi','Petang','Malam'].map(record),before=JSON.stringify(records);const html=render(records,records);
 assert.doesNotMatch(html,/Sambung draf/);assert.equal((html.match(/Sudah diisi/g)||[]).length,3);assert.equal(JSON.stringify(records),before);
});
test('4: absence of a final is not evidence of a draft; unverified Firebase never offers resume',()=>{
 assert.doesNotMatch(render([],[]),/Sambung draf/);assert.equal((render([],[]).match(/Mula laporan/g)||[]).length,3);
 assert.doesNotMatch(render([],['Malam'].map(record),false),/Sambung draf/);
});
test('7/8: compact date picker wraps; original dashboard/form/statistics UI restored',()=>{
 assert.match(page,/section-heading no-print" style=\{\{flexWrap:"wrap",gap:8\}\}/);assert.match(page,/width:150,minHeight:40/);
 assert.doesNotMatch(page,/Draf belum dihantar|selectedReportDate|Hari operasi semasa/);assert.match(page,/Field label="Tarikh laporan"/);
 assert.match(page,/const dashboardDate = clock.operationalDate/);assert.match(page,/remembered = existing \? undefined/);
 const input=page.slice(page.indexOf('aria-label="Tarikh pemeriksaan shift"'),page.indexOf('</label>',page.indexOf('aria-label="Tarikh pemeriksaan shift"')));assert.doesNotMatch(input,/saveDraft|emptyReport|startReport/);
});

test('6: opening old night preserves its real draft; final Pagi overrides stale local copy',async()=>{
 const draft={...record('Malam'),filledBy:'Pengisi Malam',stats:{l1:4},caseNotes:'Draf sebenar'},stale={...record('Pagi'),filledBy:'Stale'},final={...record('Pagi'),filledBy:'Firebase final'};
 const values=[stale,draft],saved=[];let loaded;
 const scope={busy:false,view:'dashboard',previewOnly:false,draft:{},editingFinal:{current:null},initialForm:{current:''},operationalDateForReport:r=>r.operationalDate||r.date,reportRepository:{getByDate:async()=>[final,record('Petang')]},localReportRepository:{getDraft:id=>values.find(r=>r.id===id),saveDraft:r=>saved.push(r)},normalizeReport:r=>r,structuredClone,JSON,withDerived:r=>r,emptyReport:()=>assert.fail('existing draft must be restored'),setBusy(){},setFinalSave(){},setShareStatus(){},setSaveError(){},setFormCalls(){},setPreviewOnly(){},setDraft:r=>loaded=r,setStep(){},setView(){},setDrafts(){},notify:()=>assert.fail('Firebase read should succeed')};
 const code=page.slice(page.indexOf('  const startReport ='),page.indexOf('  const leaveForm ='))+'this.open=startReport;';
 vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,scope);
 await scope.open('Pagi','2026-10-05');assert.equal(loaded.filledBy,'Firebase final');
 await scope.open('Malam','2026-10-05');assert.equal(loaded.date,'2026-10-05');assert.equal(loaded.shift,'Malam');assert.equal(loaded.stats.l1,4);assert.equal(loaded.caseNotes,'Draf sebenar');assert.equal(saved.length,0);
});
