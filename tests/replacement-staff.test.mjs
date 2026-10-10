import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function compile(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:id=>mocks[id]||require(id)});return exports;}
const types=compile('app/lib/types.ts'),master=compile('app/lib/masterSuggestions.ts');
test('accordion default closed, ordered categories, multiple names, delete and close preserve data',()=>{
 let open=false,report=types.emptyReport('2026-10-10','Pagi');
 const card=compile('app/components/ReplacementStaff.tsx',{'react':{useState:()=>[open,v=>open=v]},'./Autocomplete':{default:'input',__esModule:true},'../lib/types':types,'../lib/masterSuggestions':master}).default;
 const render=()=>card({report,onChange:value=>report={...report,kakitanganGantiTugas:value}});
 function nodes(tree,type){const found=[];const visit=n=>{if(Array.isArray(n))return n.forEach(visit);if(n&&typeof n==='object'&&n.props){if(n.type===type)found.push(n);visit(n.props.children)}};visit(tree);return found}
 assert.equal(nodes(render(),'input').length,0);
 assert.equal(nodes(render(),'button')[0].props['aria-expanded'],false);
 nodes(render(),'button')[0].props.onClick();
 assert.deepEqual(nodes(render(),'h3').map(n=>n.props.children),['Pemandu Ambulans','PPP','Jururawat','PPK','Doktor']);
 for(let i=0;i<5;i++){
  nodes(render(),'button').filter(b=>b.props.children==='+ Tambah nama')[i].props.onClick();
  const input=nodes(render(),'input')[i];input.props.onChange('Manual '+i);
  assert.equal(input.props.kind,['drivers','ppp','nurses','ppk','doctors'][i]);
 }
 nodes(render(),'button').filter(b=>b.props.children==='+ Tambah nama')[0].props.onClick();
 nodes(render(),'input')[1].props.onChange('Second driver');
 assert.equal(report.kakitanganGantiTugas.pemandu.length,2);
 nodes(render(),'button').find(b=>b.props['aria-label']==='Padam nama ganti Pemandu Ambulans 1').props.onClick();
 assert.equal(report.kakitanganGantiTugas.pemandu[0],'Second driver');
 const before=JSON.stringify(report);
 nodes(render(),'button')[0].props.onClick();assert.equal(nodes(render(),'input').length,0);
 nodes(render(),'button')[0].props.onClick();assert.equal(JSON.stringify(report),before);
 assert.equal(nodes(render(),'input').length,5);
});
