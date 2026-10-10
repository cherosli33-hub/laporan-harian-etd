import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const dir = await mkdtemp(path.join(tmpdir(), 'etd-phc-tests-'));
for (const name of ['pdfExport', 'whatsapp', 'shiftEngine', 'phcLive', 'types', 'operationalDate', 'phcCalls', 'reportRepository', 'localReportRepository', 'suggestionStore', 'masterSuggestions']) {
  let code = await readFile(new URL(`../app/lib/${name}.ts`, import.meta.url), 'utf8');
  if (name === 'phcCalls') code = code.replace('PHC_INTEGRATION_START_DATE: string | null = null', 'PHC_INTEGRATION_START_DATE: string | null = "2026-10-03"');
  code=code.replace("'../shared/operationalShift.js'",JSON.stringify(new URL('../app/shared/operationalShift.js',import.meta.url).href));
  for(const name of ['firebase/app','firebase/auth','firebase/firestore']) code=code.replaceAll(`from '${name}'`,`from '${import.meta.resolve(name)}'`);
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from (["'])\.\/(\w+)\1/g, 'from "$2.mjs"').replace(/from "(\w+)\.mjs"/g, 'from "./$1.mjs"');
  await writeFile(path.join(dir, `${name}.mjs`), js);
}
for (const name of ['ExportActions', 'CallBreakdown', 'StatsA4', 'Autocomplete', 'ReplacementStaff']) {
  const source = await readFile(new URL(`../app/components/${name}.tsx`, import.meta.url), 'utf8');
  let js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/from (["'])\.\.\/lib\/(\w+)\1/g,'from "./$2.mjs"').replace(/from (["'])\.\/(CallBreakdown|Autocomplete)\1/g, 'from "./$2.mjs"');
  js=js.replace('from "react/jsx-runtime"',`from "${import.meta.resolve('react/jsx-runtime')}"`);
  for (const dependency of ['react', 'react-dom']) { js=js.replaceAll(`from '${dependency}'`, `from '${import.meta.resolve(dependency)}'`); js=js.replaceAll(`from "${dependency}"`, `from "${import.meta.resolve(dependency)}"`); }
  await writeFile(path.join(dir,`${name}.mjs`),js);
}
let pageSource = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
pageSource += '\nexport { ReportPreview, CallStatus, PeriodNavigator, shiftPeriodAnchor, periodLabel };';
let pageJS = ts.transpileModule(pageSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
pageJS = pageJS.replace(/from (["'])\.\/components\/(\w+)\1/g, 'from "./$2.mjs"');
pageJS = pageJS.replace(/from (["'])\.\/lib\/(\w+)\1/g, 'from "./$2.mjs"');
for (const name of ['react', 'react/jsx-runtime']) pageJS = pageJS.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
await writeFile(path.join(dir, 'page.mjs'), pageJS);
const { ReportPreview, CallStatus, PeriodNavigator, shiftPeriodAnchor, periodLabel } = await import(pathToFileURL(path.join(dir, 'page.mjs')));
const phc = await import(pathToFileURL(path.join(dir, 'phcCalls.mjs')));
const { emptyReport } = await import(pathToFileURL(path.join(dir, 'types.mjs')));
const { operationalDateFromTimestamp, operationalDateForReport } = await import(pathToFileURL(path.join(dir, 'operationalDate.mjs')));
const { reportRepository, periodRange } = await import(pathToFileURL(path.join(dir, 'reportRepository.mjs')));
const storage = () => { const m = new Map(); return { getItem:k=>m.get(k)||null, setItem:(k,v)=>m.set(k,v), removeItem:k=>m.delete(k) }; };
globalThis.window = { localStorage:storage(), sessionStorage:storage() };
let rows = [], etd = [], fail = false, reads = [], writes = [];
const row = (id, source='mecc', shift='pagi', date='2026-10-03', status='completed') => ({ phcId:id, status, operationalDate:date, shift, callSource:source });
const document = r => ({ name:`projects/amo-dashboard-v2/databases/(default)/documents/phcCallSummaries/${r.phcId}`, fields:Object.fromEntries(Object.entries(r).map(([k,v])=>[k, typeof v === 'boolean' ? { booleanValue:v } : { stringValue:v }])) });
globalThis.fetch = async (url, init={}) => {
  if (url.includes('accounts:signUp')) return Response.json({idToken:'test',refreshToken:'test',expiresIn:'3600'});
  if (url.endsWith(':runQuery')) {
    const q = JSON.parse(init.body).structuredQuery;
    if (q.from[0].collectionId === 'phcCallSummaries') {
      reads.push(q);
      if (fail) return new Response('backend unavailable', {status:503});
      const filters = q.where.compositeFilter.filters.map(f=>f.fieldFilter);
      const selected = rows.filter(r=>filters.every(f=> { const v=f.value.stringValue, actual=r[f.field.fieldPath]; return f.op === 'EQUAL' ? actual === v : f.op === 'GREATER_THAN_OR_EQUAL' ? actual >= v : actual <= v; }));
      return Response.json(selected.map(r=>({document:document(r)})));
    }
    return Response.json(etd.map(r=>({document:{fields:{reportJson:{stringValue:JSON.stringify(r)}}}})));
  }
  if (init.method === 'PATCH') { writes.push(JSON.parse(init.body)); return Response.json({}); }
  const existing = etd.find(r=>url.endsWith(encodeURIComponent(r.id)));
  return existing ? Response.json({fields:{reportJson:{stringValue:JSON.stringify(existing)}}}) : new Response('not found',{status:404});
};

test('A/B: completed records derive 1 and then 4 calls with minimal bounded query', async()=>{
  rows=[row('1')];
  assert.deepEqual((await reportRepository.getCalls('2026-10-03','Pagi')).calls,{mecc:1,operator:0,awam:0,palsu:0});
  rows=[row('1'),row('2'),row('3','awam'),row('4','operator')];
  assert.deepEqual((await reportRepository.getCalls('2026-10-03','Pagi')).calls,{mecc:2,operator:1,awam:1,palsu:0});
  assert.deepEqual(reads.at(-1).select.fields.map(f=>f.fieldPath),['phcId','status','operationalDate','shift','callSource','deleted','deletedAt']);
  assert.equal(reads.at(-1).where.compositeFilter.filters.at(-1).fieldFilter.value.stringValue,'pagi');
});
test('C/D: editing/upserting same ID never increments or duplicates',async()=>{
  const records=new Map(); records.set('1',row('1')); records.set('1',row('1','awam')); records.set('1',row('1','awam')); rows=[...records.values()];
  assert.deepEqual((await reportRepository.getCalls('2026-10-03','Pagi')).calls,{mecc:0,operator:0,awam:1,palsu:0});
  assert.equal(phc.callsTotal(phc.derivePHCCalls([rows[0],rows[0]],'2026-10-03')),1);
});
test('E/F/H: draft, other shift, cancelled, void and soft-deleted are excluded',async()=>{
  rows=[row('1'),row('2','awam','petang'),row('3','awam','pagi','2026-10-03','draft'),row('4','mecc','pagi','2026-10-03','cancelled'),row('5','mecc','pagi','2026-10-03','void'),{...row('6'),deleted:true},{...row('7'),deletedAt:'2026-10-03'}];
  assert.equal(phc.callsTotal((await reportRepository.getCalls('2026-10-03','Pagi')).calls),1);
});
test('G: night after midnight uses explicitly confirmed operational date, 07:00 boundary',async()=>{
  assert.equal(operationalDateFromTimestamp('2026-10-04T06:59:00+08:00'),'2026-10-03');
  assert.equal(operationalDateFromTimestamp('2026-10-04T07:00:00+08:00'),'2026-10-04');
  const r=emptyReport('2026-10-03','Malam'); r.createdAt='2026-10-03T01:00:00+08:00';
  assert.equal(operationalDateForReport(r),'2026-10-03');
  rows=[row('night','mecc','malam','2026-10-03')];
  assert.equal(phc.callsTotal((await reportRepository.getCalls('2026-10-03','Malam')).calls),1);
  assert.equal(phc.callsTotal((await reportRepository.getCalls('2026-10-04','Malam')).calls),0);
});
test('I: historical report values and notes untouched, no PHC read for historical retrieval',async()=>{
  const old=emptyReport('2026-10-02','Pagi'); old.calls.mecc=9; old.callNotes='catatan lama'; etd=[old]; const n=reads.length;
  const [loaded]=await reportRepository.getByDate('2026-10-02'); assert.equal(loaded.calls.mecc,9); assert.equal(loaded.callNotes,'catatan lama'); assert.equal(reads.length,n);
});
test('J: network error produces unknown, save blocked and offline cache cannot masquerade as current',async()=>{
  etd=[emptyReport('2026-10-03','Pagi')]; fail=true;
  const state=await reportRepository.getCalls('2026-10-03','Pagi'); assert.equal(state.status,'error'); assert.equal(state.calls,undefined);
  const [r]=await reportRepository.getByDate('2026-10-03'); assert.equal(phc.reportCallsTotal(r),null);
  assert.equal(phc.reportCallsTotal(reportRepository.cachedReports('2026-10-03')[0]),null);
  await assert.rejects(reportRepository.save(r),/PHC/); fail=false;
});
test('K/L/M: form, daily dashboard and week/month/year statistics agree, including PHC without ETD report',async()=>{
  rows=[row('1'),row('2'),row('3','awam'),row('4','operator')]; etd=[emptyReport('2026-10-03','Pagi')];
  const [form]=await reportRepository.getByDate('2026-10-03');
  assert.equal(phc.reportCallsTotal(form),4); assert.equal(phc.callsTotal((await reportRepository.getCalls('2026-10-03')).calls),4);
  for(const period of ['week','month','year']) { const stats=await reportRepository.getStats(period,'2026-10-03',{refresh:true}); assert.equal(stats.totals.calls,4); assert.equal(stats.groups.reduce((s,g)=>s+g.calls,0),4); }
  etd=[]; assert.equal((await reportRepository.getStats('month','2026-10-03',{refresh:true})).totals.calls,4);
});
test('daily statistics combine all three shifts and isolate operational dates without writes',async()=>{
  const day='2026-10-06';
  etd=['Pagi','Petang','Malam'].map((shift,i)=>{const r=emptyReport(day,shift); r.stats.l2=i+1;r.stats.merah=i+1;r.stats.hijau=(i+1)*10;r.stats.kesBaru=(i+1)*11;r.stats.oscc=i;r.stats.masukWad=i+1;r.bid=i;r.did=i+1;r.ambulances=Array.from({length:i},()=>({drivers:[]}));return r;});
  const next=emptyReport('2026-10-07','Pagi');next.stats.hijau=999;
  etd.push(next);
  rows=[row('p','awam','pagi',day),row('e','operator','petang',day),row('n','mecc','malam',day),row('prior','awam','malam','2026-10-05'),row('next','awam','pagi','2026-10-07')];
  const before=writes.length,stats=await reportRepository.getStats('day',day,{refresh:true});
  assert.deepEqual(periodRange('day',day),{start:day,end:day});
  assert.equal(stats.cacheKey,'daily_2026-10-06');assert.equal(stats.reports.length,3);
  assert.equal(stats.totals.cases,66);assert.equal(stats.totals.merah,6);assert.equal(stats.totals.hijau,60);
  assert.equal(stats.totals.oscc,3);assert.equal(stats.totals.ward,6);assert.equal(stats.totals.ambulance,3);
  assert.deepEqual(stats.callState.calls,{mecc:1,operator:1,awam:1,palsu:0});assert.equal(stats.totals.calls,3);
  assert.equal(stats.groups.length,1);assert.equal(stats.groups[0].key,day);assert.equal(stats.groups[0].calls,3);
  assert.equal(writes.length,before);
  const adjacent=await reportRepository.getStats('day','2026-10-07');assert.equal(adjacent.cacheKey,'daily_2026-10-07');assert.equal(adjacent.totals.cases,999);
});
test('daily navigator selects a date and steps one day across month/year boundaries',()=>{
  assert.equal(shiftPeriodAnchor('day','2026-10-01',-1),'2026-09-30');
  assert.equal(shiftPeriodAnchor('day','2026-12-31',1),'2027-01-01');
  assert.match(periodLabel('day','2026-10-06','2026-10-06'),/6 Oktober 2026/);
  const html=renderToStaticMarkup(createElement(PeriodNavigator,{period:'day',anchor:'2026-10-06',today:'2026-10-07',onPeriod:()=>{},onAnchor:()=>{}}));
  assert.match(html,/Harian.*Mingguan.*Bulanan.*Tahunan/);assert.match(html,/type="date" max="2026-10-07" value="2026-10-06"/);
});
test('L: mixed historical boundary and fresh PHC edits bypass statistics cache',async()=>{
  const old=emptyReport('2026-10-02','Pagi');old.calls.mecc=7; etd=[old,emptyReport('2026-10-03','Pagi')];rows=[row('1')];
  const mixed=await reportRepository.getStats('month','2026-10-03'); assert.equal(mixed.totals.calls,8);assert.equal(mixed.callState.calls.mecc,8);assert.equal(phc.callsTotal(mixed.callState.calls),mixed.totals.calls);
  rows=[]; assert.equal((await reportRepository.getStats('month','2026-10-03')).totals.calls,7);
  fail=true;assert.equal((await reportRepository.getStats('month','2026-10-03')).callState.status,'error');fail=false;
});
test('integrated save preserves original calls and notes, stores no clinical data or transient status',async()=>{
  const old=emptyReport('2026-10-03','Pagi');old.calls.mecc=6;old.callNotes='kekal';etd=[old];rows=[row('1','awam')];
  await reportRepository.save(old);
  const saved=JSON.parse(writes.at(-1).fields.reportJson.stringValue);assert.equal(saved.legacyCalls.mecc,6);assert.equal(saved.calls.awam,1);assert.equal(saved.callNotes,'kekal');assert.equal(saved.callData,undefined);assert.equal(saved.callsSource,'phc');
});
test('M: actual React print component displays derived values, manual notes and unavailable state',()=>{
  const base=emptyReport('2026-10-03','Pagi');base.callNotes='Catatan panggilan kekal';
  const ready=phc.reportWithCalls(base,{status:'ready',calls:{mecc:2,operator:1,awam:1,palsu:0}});
  const html=renderToStaticMarkup(createElement(ReportPreview,{report:ready}));
  assert.match(html, /MECC \/ Call Centre<\/span><b>2<\/b>/);
  assert.match(html, /Jumlah: 4/); assert.match(html,/Catatan panggilan kekal/);
  const error=renderToStaticMarkup(createElement(ReportPreview,{report:phc.reportWithCalls(base,{status:'error'})}));
  assert.match(error,/Sync terganggu/);assert.match(error,/Jumlah: —/);assert.doesNotMatch(error,/MECC \/ Call Centre<\/span><b>0<\/b>/);
  const loading=renderToStaticMarkup(createElement(CallStatus,{state:{status:'loading'}}));assert.match(loading,/Menyambung live Firebase/);
});
test('calendar dates reject rollover and cutover remains confirmed',()=>{
  assert.equal(phc.PHC_INTEGRATION_START_DATE,'2026-10-03');
  assert.equal(phc.usesPHC('2026-10-02'),false);
  assert.equal(phc.usesPHC('2026-10-03'),true);
  assert.throws(()=>phc.derivePHCCalls([row('bad','mecc','pagi','2026-02-30')],'2026-02-01','2026-03-01'),/Tarikh/);
  assert.equal(phc.callsTotal(phc.derivePHCCalls([row('leap','palsu','pagi','2028-02-29')],'2028-02-01','2028-03-01')),1);
});
test.after(async()=>{await rm(dir,{recursive:true,force:true});});

test('several calls sum within one operational shift; ready status carries server-query receipt', async () => {
  rows = [row('P1','mecc','pagi'),row('P2','mecc','pagi'),row('T1','operator','petang'),row('M1','awam','malam'),row('D1','mecc','pagi','2026-10-03','draft')];
  fail = false;
  const morning = await reportRepository.getCalls('2026-10-03','Pagi');
  assert.equal(morning.status,'ready');
  assert.equal(morning.calls.mecc,2);
  assert.equal(phc.callsTotal(morning.calls),2);
  assert.equal(morning.operationalDate,'2026-10-03');
  assert.equal(morning.shift,'Pagi');
  assert.ok(Number.isFinite(Date.parse(morning.fetchedAt)));
  assert.equal(phc.callsTotal((await reportRepository.getCalls('2026-10-03','Petang')).calls),1);
  assert.equal(phc.callsTotal((await reportRepository.getCalls('2026-10-03','Malam')).calls),1);
  const status = renderToStaticMarkup(createElement(CallStatus,{state:morning}));
  assert.match(status,/disahkan dari Firebase/);
  assert.match(status,/Pagi/);
});



test('late night save uses original day; final guard blocks stale drafts and concurrent duplicate writes',async()=>{
 fail=false;rows=[];etd=[];writes=[];
 const night=emptyReport('2026-10-05','Malam');night.filledBy='Pengisi';
 const saved=await reportRepository.save(night,{expectedUpdatedAt:null});
 assert.equal(saved.report.date,'2026-10-05');assert.equal(saved.report.operationalDate,'2026-10-05');assert.equal(saved.report.shift,'Malam');assert.equal(saved.report.id,'2026-10-05_Malam');
 etd=[saved.report];const n=writes.length;
 await assert.rejects(reportRepository.save(night,{expectedUpdatedAt:null}),/Final Save/);assert.equal(writes.length,n);
 await assert.rejects(reportRepository.save(night,{expectedUpdatedAt:'stale'}),/Final Save/);assert.equal(writes.length,n);
 await reportRepository.save(saved.report,{expectedUpdatedAt:saved.report.updatedAt});assert.equal(writes.length,n+1);
});

test('replacement staff survives existing draft/final transport and a fresh read; legacy/empty preview stays compact',async()=>{
 const {localReportRepository}=await import(pathToFileURL(path.join(dir,'localReportRepository.mjs')));
 const {normalizeReport}=await import(pathToFileURL(path.join(dir,'types.mjs')));
 fail=false;rows=[];etd=[];writes=[];
 const report=emptyReport('2026-10-01','Pagi');
 report.kakitanganGantiTugas={pemandu:['Pemandu A','Pemandu B'],ppp:['PPP A'],jururawat:['Nurse A'],ppk:['PPK A'],doktor:['Doktor A']};
 localReportRepository.saveDraft(report);
 assert.deepEqual(localReportRepository.getDraft(report.id).kakitanganGantiTugas,report.kakitanganGantiTugas);
 const saved=await reportRepository.save(report);
 assert.deepEqual(JSON.parse(writes[0].fields.reportJson.stringValue).kakitanganGantiTugas,report.kakitanganGantiTugas);
 etd=[saved.report];window.localStorage=storage();
 const read=await reportRepository.getByDate(report.date,false);
 assert.deepEqual(read[0].kakitanganGantiTugas,report.kakitanganGantiTugas);
 const html=renderToStaticMarkup(createElement(ReportPreview,{report:read[0]}));
 for(const name of ['Pemandu A','Pemandu B','PPP A','Nurse A','PPK A','Doktor A'])assert.ok(html.includes(name));
 assert.ok(html.indexOf('Pemandu A')<html.indexOf('Doktor A'));
 const legacy=normalizeReport(emptyReport('2026-10-01','Malam'));
 assert.deepEqual(legacy.kakitanganGantiTugas,{pemandu:[],ppp:[],jururawat:[],ppk:[],doktor:[]});
 assert.ok(!renderToStaticMarkup(createElement(ReportPreview,{report:legacy})).includes('Kakitangan Ganti Tugas'));
});
