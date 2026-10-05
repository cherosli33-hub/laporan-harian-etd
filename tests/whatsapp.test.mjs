import {test} from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import fs from 'node:fs';import vm from 'node:vm';
const context=vm.createContext({Intl,Date});vm.runInContext(fs.readFileSync('app/shared/operationalShift.js','utf8'),context);
const cache={};function mod(name){if(cache[name])return cache[name];const source=fs.readFileSync(`app/lib/${name}.ts`,'utf8'),exports={};const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports,require:id=>id==='./shiftEngine'?{shiftEngine:context.OperationalShiftEngine}:mod(id.slice(2)),process:{env:{}},Intl,Date});return cache[name]=exports;}
const {generateWhatsAppMessage,buildWhatsAppUrl}=mod('whatsapp');
const make=(shift,n,day='2026-10-05',updatedAt='2026-10-05T10:00:00Z')=>({date:day,operationalDate:day,shift,updatedAt,stats:{l1:n,l2:0,l3:n,l4:n,l5:0,asthmaBay:n},carry:{merah:n,kuning:n+1,observation:n+2},filledBy:'DO NOT DISPLAY',bid:9,did:8,calls:{mecc:3,operator:2,awam:1,palsu:4}});
const morning=make('Pagi',1),afternoon=make('Petang',2),night=make('Malam',3);
const all=[morning,afternoon,night];const at='2026-10-05T18:00:00Z';
const expected=r=>`✅ LAPORAN ETD HOSPITAL KUALA LIPIS\n\nTarikh Operasi: 5 Oktober 2026\nShift: ${r.shift}\n\nRINGKASAN PESAKIT SYIF ${r.shift.toUpperCase()}\nJumlah Pesakit: ${r.stats.l1*4}\nRed Zone: ${r.stats.l1}\nYellow Zone: ${r.stats.l1}\nGreen Zone: ${r.stats.l1*2}\nAsthma Bay: ${r.stats.l1}\n\nCARRY FORWARD (BAKI AKHIR SYIF)\nRed Zone: ${r.carry.merah}\nYellow Zone: ${r.carry.kuning}\nObservation Ward: ${r.carry.observation}`;
test('A — Pagi exact format, current shift only',()=>assert.equal(generateWhatsAppMessage(morning,at,all),expected(morning)));
test('B — Petang exact format, current shift only',()=>assert.equal(generateWhatsAppMessage(afternoon,at,all),expected(afternoon)));
test('C — Malam exact totals, no repeated shift breakdown or summed carry',()=>{
 const rows=[...all,make('Pagi',99,'2026-10-04'),make('Pagi',8,'2026-10-05','2026-10-05T09:00:00Z')];
 assert.equal(generateWhatsAppMessage(night,at,rows),expected(night)+'\n\nJUMLAH KESELURUHAN HARI OPERASI\n\nJUMLAH KESELURUHAN: 24 PESAKIT\nRed Zone: 6\nYellow Zone: 6\nGreen Zone: 12\nAsthma Bay: 6');
});
test('D — asthma included in green exactly once; no forbidden fields or statuses',()=>{
 const msg=generateWhatsAppMessage(night,at,all);assert.match(msg,/Jumlah Pesakit: 12/);assert.match(msg,/JUMLAH KESELURUHAN: 24 PESAKIT/);
 assert.doesNotMatch(msg,/Final Save|Diisi oleh|BID|DID|Ambulans|Kenderaan|MECC|Operator|Awam|Palsu|Panggilan|Status|SELESAI|Nota:/);
});
test('E — final save after midnight and 07:00 retains same operational day',()=>{
 for(const savedAt of ['2026-10-06T00:15:00+08:00','2026-10-06T06:59:00+08:00','2026-10-06T07:05:00+08:00'])assert.equal(generateWhatsAppMessage({...night,date:'2026-10-06'},savedAt,all),generateWhatsAppMessage(night,at,all));
 const legacy={...night,operationalDate:undefined,date:'2026-10-06',createdAt:'2026-10-06T01:00:00+08:00'};
 assert.match(generateWhatsAppMessage(legacy,at,all),/Tarikh Operasi: 5 Oktober 2026/);assert.match(generateWhatsAppMessage(legacy,at,all),/JUMLAH KESELURUHAN: 24 PESAKIT/);
});
test('missing shifts or failed read clearly mark unavailable/incomplete totals',()=>{
 assert.match(generateWhatsAppMessage(night,at,[morning]),/belum lengkap 3 syif/);
 assert.match(generateWhatsAppMessage(night,at),/Jumlah harian tidak tersedia/);
});
test('WhatsApp URLs preserve whole message; save/share flow unchanged',()=>{
 const msg=generateWhatsAppMessage(night,at,all);assert.equal(new URL(buildWhatsAppUrl(msg)).searchParams.get('text'),msg);assert.equal(new URL(buildWhatsAppUrl(msg,'+60 12345')).pathname,'/6012345');
 const s=fs.readFileSync('app/page.tsx','utf8');assert.ok(s.indexOf('setFinalSave({report:')>s.indexOf('const saved = await reportRepository.save'));assert.match(s,/getByDate\(operationalDateForReport\(saved.report\), false\)/);const share=s.slice(s.indexOf('  const openWhatsApp'),s.indexOf('  const printReport'));assert.doesNotMatch(share,/reportRepository|persist\(|firebaseFetch/);assert.match(s,/finalSave && <dialog/);
});
