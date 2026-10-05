import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir=await mkdtemp(path.join(tmpdir(),'etd-suggestions-'));
for(const name of ['masterSuggestions','suggestionStore']){
 const source=await readFile(new URL(`../app/lib/${name}.ts`,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("'./masterSuggestions'","'./masterSuggestions.mjs'");
 await writeFile(path.join(dir,name+'.mjs'),js);
}
const {masterSuggestions,staffSuggestionKind}=await import(pathToFileURL(path.join(dir,'masterSuggestions.mjs')));
const {suggestionStore,SUGGESTION_STORAGE_KEY}=await import(pathToFileURL(path.join(dir,'suggestionStore.mjs')));
const setup=()=>{const data=new Map();globalThis.window={localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}};return data};
const report=()=>({filledBy:'Author',staff:[{category:'PPP',name:' HAFIZ '},{category:'PPP',name:'hafiz'},{category:'PPP',name:' ROSLI '},{category:'Pegawai Perubatan',name:'Custom Doctor'},{category:'Nurse/Jururawat',name:'Custom Nurse'},{category:'PPK',name:'Custom PPK'}],ambulances:[{drivers:['Custom Driver',' custom driver ','NIK'],destination:'Kuala Medang',unit:'Custom Unit',vehicleNo:'Custom Van'}]});
test('all exact master categories, vehicle variants and distinct destinations',()=>{
 setup();assert.deepEqual(Object.fromEntries(Object.entries(masterSuggestions).map(([k,v])=>[k,v.length])),{people:0,doctors:13,ppp:17,nurses:7,ppk:9,drivers:23,vehicles:15,units:42,destinations:54});
 assert.deepEqual(suggestionStore.values('ppp','rOs',Infinity),['ROSLIZA','ROSLI']);
 assert.deepEqual(suggestionStore.values('vehicles','wxj',Infinity),['WXJ – Van Jenazah','WXJ – Minibus']);
 assert.equal(suggestionStore.values('units','wad',Infinity).length,6);
 assert.deepEqual(suggestionStore.values('destinations','mer',Infinity),['Klinik Merapoh','Hospital Cameron','Temerloh','Merapoh','Cameron Highland']);
 for(const pair of [['Hospital Raub','Raub'],['Klinik Benta','Benta'],['Klinik Sungai Koyan','Sungai Koyan']])for(const value of pair)assert.ok(masterSuggestions.destinations.includes(value));
 for(const [category,kind] of [['Pegawai Perubatan','doctors'],['PPP','ppp'],['Nurse/Jururawat','nurses'],['PPK','ppk'],['Pemandu Ambulans','drivers']])assert.equal(staffSuggestionKind(category),kind);
});
test('save memory deduplicates defaults and customs without changing report strings',()=>{
 const data=setup(),r=report(),before=JSON.stringify(r);suggestionStore.remember(r);suggestionStore.remember(r);
 assert.equal(JSON.stringify(r),before);
 const memory=JSON.parse(data.get(SUGGESTION_STORAGE_KEY));assert.deepEqual(memory.ppp.map(i=>i.value),['HAFIZ']);assert.deepEqual(memory.drivers.map(i=>i.value),['Custom Driver']);
 assert.deepEqual(memory.doctors.map(i=>i.value),['Custom Doctor']);assert.deepEqual(memory.nurses.map(i=>i.value),['Custom Nurse']);assert.deepEqual(memory.ppk.map(i=>i.value),['Custom PPK']);
 for(const [kind,value] of [['drivers','Custom Driver'],['vehicles','Custom Van'],['units','Custom Unit'],['destinations','Kuala Medang']])assert.deepEqual(suggestionStore.values(kind,value,Infinity),[]);
 assert.deepEqual(suggestionStore.values('drivers','hafiz',Infinity),[]);assert.deepEqual(suggestionStore.values('units','Kuala Medang',Infinity),[]);
 assert.deepEqual(suggestionStore.values('destinations','kuala med',Infinity),[]);
});
test('reading suggestions never stores unsaved partial input',()=>{
 const data=setup();suggestionStore.values('destinations','KUA',Infinity);assert.equal(data.size,0);
});
test('legacy suggestions stay available without inventing staff roles',()=>{
 const data=setup();data.set('etd-laporan-harian:suggestions:v1',JSON.stringify({people:[{value:'Legacy Person'}],drivers:[{value:'Legacy Driver'},{value:' nik '}],destinations:[{value:'Legacy Place'}]}));
 assert.deepEqual(suggestionStore.values('people'),['Legacy Person']);assert.deepEqual(suggestionStore.values('ppp','Legacy',Infinity),[]);assert.deepEqual(suggestionStore.values('drivers','legacy',Infinity),[]);
 suggestionStore.remember(report());assert.deepEqual(suggestionStore.values('destinations','legacy',Infinity),[]);
});
test('malformed or blocked device memory cannot break defaults or successful saves',()=>{
 const data=setup();data.set(SUGGESTION_STORAGE_KEY,JSON.stringify({ppp:[null,{}, {value:42}, {value:'rosli'}, {value:'Hafiz'}, {value:' HAFIZ ' }]}));assert.deepEqual(suggestionStore.values('ppp','hafiz',Infinity),['Hafiz']);
 data.set(SUGGESTION_STORAGE_KEY,'{');assert.ok(suggestionStore.values('doctors').includes('Dr Aiman'));
 window.localStorage={getItem:()=>{throw Error('denied')},setItem:()=>{throw Error('quota')}};assert.doesNotThrow(()=>suggestionStore.remember(report()));assert.deepEqual(suggestionStore.values('drivers','nik'),['NIK']);
 delete globalThis.window;assert.doesNotThrow(()=>suggestionStore.remember(report()));assert.deepEqual(suggestionStore.values('ppp','ros',Infinity),['ROSLIZA','ROSLI']);
});
test.after(async()=>{delete globalThis.window;await rm(dir,{recursive:true,force:true});});
