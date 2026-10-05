import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
const require=createRequire(import.meta.url);
const callLabels={mecc:'MECC / Call Centre',operator:'Operator',awam:'Awam',palsu:'Palsu'};
const calls={mecc:4,operator:3,awam:2,palsu:1};
const phc={callLabels,callsTotal:c=>Object.values(c).reduce((a,b)=>a+b,0),usesPHC:()=>false,fieldCalls:()=>true,reportCallsTotal:r=>Object.values(r.calls).reduce((a,b)=>a+b,0)};
function compile(path,extra='',mocks={}){
 const exports={};const code=ts.transpileModule(fs.readFileSync(path,'utf8')+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports,require:id=>id==='react'||id==='react/jsx-runtime'?require(id):mocks[id]||{},Intl,Date,console,setTimeout});return exports;
}
const call=compile('app/components/CallBreakdown.tsx','',{'../lib/phcCalls':phc});
const statsComponent=compile('app/components/StatsA4.tsx','',{'./CallBreakdown':call});
const page=compile('app/page.tsx','\nexports.ReportPreview=ReportPreview;',{'./lib/phcCalls':phc,'./lib/operationalDate':{operationalDateForReport:r=>r.operationalDate||r.date}});
const pdf=compile('app/lib/pdfExport.ts');
const report={date:'2026-10-05',operationalDate:'2026-10-05',shift:'Malam',filledBy:'Nama petugas ujian',updatedAt:'2026-10-06T00:30:00+08:00',stats:{l1:1,l2:2,l3:3,l4:4,l5:5,asthmaBay:6,oscc:7,masukWad:8},staff:[{id:'s',name:'Petugas Alpha',category:'PPP'}],carry:{merah:11,kuning:12,observation:13},bid:14,did:15,caseNotes:'Catatan klinikal ujian tanpa data pesakit sebenar.',calls,callNotes:'Nota panggilan ujian',ambulances:[{id:'a',vehicleNo:'WQB UJIAN',destination:'Hospital Ujian',unit:'ETD',drivers:['Pemandu Alpha'],timeOut:'22:00',timeIn:'23:00'}]};
const totals={cases:21,l1:1,l2:2,l3:3,l4:4,l5:5,merah:3,kuning:3,hijau:15,asthma:6,oscc:7,ward:8,kesBaru:16,kesUlangan:5,bid:14,did:15,ambulance:1,calls:10};
function root(markup){return new JSDOM(markup).window.document.body.firstElementChild;}
const shiftRoot=root(renderToStaticMarkup(React.createElement(page.ReportPreview,{report})));
const statsRoot=period=>root(renderToStaticMarkup(React.createElement(statsComponent.StatsA4,{stats:{period,start:'2026-10-01',end:'2026-10-31',totals,reports:[report],callState:{status:'ready',calls}},groups:Array.from({length:31},(_,i)=>({key:`2026-10-${String(i+1).padStart(2,'0')}`,...totals}))})));
const definitionText=def=>JSON.stringify(def);
test('shift PDF uses every actual preview section and retains source report',()=>{
 const before=JSON.stringify(report),def=pdf.previewDocument(shiftRoot),s=definitionText(def);
 for(const text of ['Nama petugas ujian','Petugas Alpha','Observation Ward','Statistik kes','WQB UJIAN','Pemandu Alpha','Catatan klinikal ujian','Nota panggilan ujian'])assert.ok(s.includes(text),text);
 assert.equal(JSON.stringify(report),before);assert.equal(def.pageSize,'A4');assert.ok(!s.includes('canvas'));assert.ok(!s.includes('screenshot'));
});
test('week/month/year PDF retains selected period, table values and vector graph',()=>{
 for(const period of ['week','month','year']){
  const def=pdf.previewDocument(statsRoot(period)),s=definitionText(def);
  assert.equal(def.content.length,2);assert.equal(def.content[1].pageBreak,'before');assert.ok(s.includes('2026-10-31'));assert.ok(s.includes('Trend jumlah pesakit'));assert.ok(s.includes('xmlns'));assert.ok(s.includes('headerRows'));assert.ok(!s.includes('canvas'));
 }
});
test('operational-date filename, safe characters, selected stats range',()=>{
 assert.equal(pdf.etdPdfFilename(report.operationalDate,report.shift),'Laporan_ETD_05-10-2026_Malam.pdf');
 assert.equal(pdf.etdPdfFilename('2026-10-01','Bulanan','2026-10-31'),'Laporan_ETD_01-10-2026_31-10-2026_Bulanan.pdf');
 assert.doesNotMatch(pdf.etdPdfFilename('../bad','A/B:*'),/[/:*]/);
});
test('native sharing supported/unsupported/throwing detection and downloadable retained PDF',()=>{
 const code=ts.transpileModule(fs.readFileSync('app/lib/pdfExport.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 for(const [nav,expected] of [[{},false],[{share(){},canShare:()=>false},false],[{share(){},canShare:()=>true},true],[{share(){},canShare(){throw Error()}},false]]){
  const exports={};vm.runInNewContext(code,{exports,navigator:nav,setTimeout});assert.equal(exports.canSharePdf({name:'x.pdf'}),expected);
 }
 const ui=fs.readFileSync('app/components/ExportActions.tsx','utf8');assert.match(ui,/navigator.share\(\{files:\[file\]/);assert.match(ui,/Download PDF/);assert.match(ui,/AbortError/);assert.match(ui,/window.print\(\)/);assert.doesNotMatch(ui,/firebase|reportRepository|upload/);
});
test('real searchable PDFs generate successfully, A4, long reports paginate',async()=>{
 const pdfMake=require('pdfmake/build/pdfmake.js');pdfMake.vfs=require('pdfmake/build/vfs_fonts.js');
 fs.mkdirSync('tmp/pdfs',{recursive:true});
 for(const [name,el] of [['shift',shiftRoot],['month',statsRoot('month')],['long-shift',root(renderToStaticMarkup(React.createElement(page.ReportPreview,{report:{...report,caseNotes:Array(500).fill('Catatan panjang ujian.').join(' '),staff:Array.from({length:45},(_,i)=>({id:String(i),name:`Petugas ${i}`,category:'PPP'}))}})))]]){
  const blob=await new Promise(resolve=>pdfMake.createPdf(pdf.previewDocument(el)).getBuffer(resolve));assert.equal(blob.subarray(0,5).toString(),'%PDF-');fs.writeFileSync(`tmp/pdfs/${name}.pdf`,blob);
 }
});
test('actual prepared-file handler shares, retains cancelled/failed files and downloads fallback',async()=>{
 const code=ts.transpileModule(fs.readFileSync('app/components/ExportActions.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 for(const mode of ['supported','unsupported','cancelled','failed']){
  let state=0;const messages=[],downloads=[],shares=[],file={name:'Laporan_ETD_05-10-2026_Malam.pdf',type:'application/pdf'};
  const nav={share:async data=>{shares.push(data);if(mode==='cancelled')throw Object.assign(Error(),{name:'AbortError'});if(mode==='failed')throw Error('blocked');}};
  const exports={};vm.runInNewContext(code,{exports,navigator:nav,require:id=>id==='react'?{useEffect(){},useRef:()=>({current:null}),useState:()=>{const i=state++;return [i===0?false:i===1?file:'',v=>messages.push(v)];}}:id==='react/jsx-runtime'?require(id):{canSharePdf:()=>mode!=='unsupported',downloadPdf:f=>downloads.push(f)}});
  const tree=exports.ExportActions({selector:'.report-preview',filename:file.name});
  const buttons=[];function scan(node){if(!node)return;if(Array.isArray(node))return node.forEach(scan);if(typeof node==='object' && node.props){if(node.type==='button')buttons.push(node);scan(node.props.children);}}scan(tree);
  const share=buttons.find(b=>String(b.props.children).includes('Buka Share Sheet'));
  if(mode==='unsupported')assert.equal(share,undefined);else{await share.props.onClick();assert.equal(shares[0].files[0],file);}
  if(mode==='cancelled')assert.ok(messages.some(m=>/dibatalkan/.test(m)));if(mode==='failed')assert.ok(messages.some(m=>/Download PDF/.test(m)));
  buttons.find(b=>String(b.props.children).includes('Download PDF')).props.onClick();assert.equal(downloads[0],file);
 }
});
