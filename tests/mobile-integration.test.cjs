const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PHC_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Kuala_Lumpur',serviceWorkers:'block'});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const rows=[['1','mecc'],['2','mecc'],['3','awam'],['4','operator'],['5','palsu']].map(([phcId,callSource])=>({phcId,callSource,status:'completed',operationalDate:'2026-10-03',shift:'pagi',deleted:false}));
 let fail=false,failWrite=false,reports=[],saved=[],phcQueries=0;
 const document=r=>({name:'projects/amo-dashboard-v2/databases/(default)/documents/phcCallSummaries/'+r.phcId,fields:Object.fromEntries(Object.entries(r).map(([k,v])=>[k,typeof v==='boolean'?{booleanValue:v}:{stringValue:v}]))});
 // Every external request is intercepted. No test records reach production.
 await p.route('**/*',async route=>{
  const req=route.request(),url=req.url();
  if(url.startsWith('http://127.0.0.1:'))return route.continue();
  if(url.includes('accounts:signUp'))return route.fulfill({json:{idToken:'isolated-test',refreshToken:'isolated-test',expiresIn:'3600'}});
  if(url.includes('firestore.googleapis.com')){
   if(url.endsWith(':runQuery')){
    const q=req.postDataJSON().structuredQuery;
    if(q.from[0].collectionId==='phcCallSummaries'){phcQueries++;
     if(fail)return route.fulfill({status:503,body:'isolated unavailable'});
     const filters=q.where.compositeFilter.filters.map(f=>f.fieldFilter);
     const selected=rows.filter(r=>filters.every(f=>{const a=r[f.field.fieldPath],b=f.value.stringValue;return f.op==='EQUAL'?a===b:f.op==='GREATER_THAN_OR_EQUAL'?a>=b:a<=b}));
     return route.fulfill({json:selected.map(r=>({document:document(r)}))});
    }
    return route.fulfill({json:reports.map(r=>({document:{fields:{reportJson:{stringValue:JSON.stringify(r)}}}}))});
   }
   if(req.method()==='PATCH'){if(failWrite)return route.fulfill({status:503,body:'save failure test'});const fields=req.postDataJSON().fields;saved.push(JSON.parse(fields.reportJson.stringValue));reports=[...saved];return route.fulfill({json:{}})}
   if(url.includes('?'))return route.fulfill({json:{documents:reports.map(r=>({fields:{reportJson:{stringValue:JSON.stringify(r)}}}))}});
   const existing=reports.find(r=>url.includes('/daily_reports/'+r.id));
   if(existing)return route.fulfill({json:{fields:{reportJson:{stringValue:JSON.stringify(existing)}}}});
   return route.fulfill({status:404,body:'not found'});
  }
  return route.abort();
 });
 const target=process.env.ETD_TEST_URL||'http://127.0.0.1:4174/tests/ui/index.html';
 for(let n=0;n<40;n++){try{if((await fetch(target)).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,250))}
 await p.clock.install({time:new Date('2026-10-04T08:00:00+08:00')});await p.goto(target);await p.waitForFunction(()=>typeof window.emitLive==='function');await p.evaluate(rows=>{window.liveRows=rows;window.emitLive();},rows);
 await p.locator('.page-dashboard').waitFor();
 const dailyFixture=[['D1','mecc','pagi'],['D2','mecc','petang'],['D3','operator','malam'],['D4','awam','pagi']].map(([phcId,callSource,shift])=>({phcId,callSource,shift,status:'completed',operationalDate:'2026-10-04'}));
 await p.evaluate(rows=>{window.liveRows=rows;window.emitLive();},dailyFixture);
 await p.waitForFunction(()=>document.querySelector('.daily-call-breakdown .call-breakdown-total strong')?.textContent==='4');
 assert.deepEqual(await p.locator('.daily-call-breakdown dd').allTextContents(),['2','1','1','0']);
 await p.evaluate(rows=>{window.liveRows=rows;window.emitLive();},rows);
 await p.locator('.bottom-nav').getByRole('button',{name:/Isi laporan/}).click();
 await p.locator('form.form-page').waitFor();
 await p.locator('form input[type="date"]').fill('2026-10-03');
 await p.locator('form .segmented button').filter({hasText:/^Pagi$/}).click();
 await p.getByPlaceholder('Contoh: Rosli').fill('ISOLATED TEST');

 // Master selection, live substring matching, manual strings and multiple drivers.
 const memoryKey='etd-laporan-harian:suggestions:v2';
 const staffStep=()=>p.getByRole('button',{name:'Langkah 2: Kakitangan',exact:true}).click();
 const movementStep=()=>p.getByRole('button',{name:'Langkah 6: Ambulans & Kenderaan',exact:true}).click();
 const choose=async(input,value)=>{await input.fill('');await p.getByRole('option',{name:value,exact:true}).tap();assert.equal(await input.inputValue(),value)};
 await staffStep();
 for(const [category,value] of [['Pegawai Perubatan','Dr Aiman'],['PPP','ROSLI'],['Nurse/Jururawat','RAJA'],['PPK','SUFIAN']]){
  const card=p.locator('.staff-category-card').filter({has:p.getByRole('heading',{name:category,exact:true})});
  await card.getByRole('button',{name:'+ Tambah nama',exact:true}).click();
  const input=card.getByRole('combobox').last();
  if(category==='PPP'){await input.fill('ros');assert.deepEqual(await p.getByRole('option').allTextContents(),['ROSLIZA','ROSLI']);}
  await choose(input,value);
  await card.getByRole('button',{name:'+ Tambah nama',exact:true}).click();
  await card.getByRole('combobox').last().fill('CUSTOM '+category);
 }
 await movementStep();
 for(const vehicle of ['VFP 6164','WXJ – Van Jenazah','WXJ – Minibus','CUSTOM VAN']){
  await p.getByRole('button',{name:'+ Tambah perjalanan',exact:true}).click();
  const card=p.locator('.ambulance-card').last(), inputs=card.getByRole('combobox');
  if(vehicle==='CUSTOM VAN')await inputs.nth(0).fill(vehicle);else await choose(inputs.nth(0),vehicle);
  await inputs.nth(1).fill('mer');
  const related=await p.getByRole('option').allTextContents();
  for(const value of ['Klinik Merapoh','Merapoh','Cameron Highland'])assert.ok(related.includes(value));
  if(vehicle==='CUSTOM VAN')await inputs.nth(1).fill('Kuala Medang');else await choose(inputs.nth(1),vehicle==='WXJ – Minibus'?'Merapoh':'Klinik Merapoh');
  await inputs.nth(2).fill('wad');assert.equal(await p.getByRole('option').count(),6);
  if(vehicle==='CUSTOM VAN')await inputs.nth(2).fill('CUSTOM UNIT');else await choose(inputs.nth(2),'Fisioterapi');
  await choose(card.getByRole('combobox',{name:'Pemandu 1',exact:true}),'NIK');
  await card.getByRole('button',{name:'+ Tambah pemandu',exact:true}).click();
  await card.getByRole('combobox',{name:'Pemandu 2',exact:true}).fill('CUSTOM DRIVER');
  await card.getByRole('button',{name:'+ Tambah pemandu',exact:true}).click();
  const third=card.getByRole('combobox',{name:'Pemandu 3',exact:true});await third.fill('azm');await third.press('ArrowDown');await third.press('Enter');assert.equal(await third.inputValue(),'AZMAN');
 }
 assert.equal(await p.evaluate(key=>localStorage.getItem(key),memoryKey),null,'Typing must not learn memory');
 const destination=p.locator('.ambulance-card').last().getByRole('combobox').nth(1);
 for(const width of [320,375,390,414,1280]){
  await p.setViewportSize({width,height:844});await destination.click();
  const bounds=await p.getByRole('listbox').boundingBox();assert.ok(bounds.height<=250);assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await destination.press('Escape');
 }
 await p.setViewportSize({width:390,height:844});
 await p.getByRole('button',{name:'Langkah 3: Statistik kes',exact:true}).click();
 for(const [name,n] of [['L1',1],['L2',2],['L3',3],['L4',4],['L5',5],['Asthma Bay',6],['OSCC',7],['Masuk Wad',8]])await p.getByRole('textbox',{name,exact:true}).fill(String(n));
 await p.getByRole('button',{name:'Langkah 7: Panggilan',exact:true}).click();
 await p.getByRole('status').count();
 await p.waitForFunction(()=>document.querySelector('output[aria-label="MECC / Call Centre"]')?.textContent==='2');
 assert.equal(await p.locator('output[aria-label="Awam"]').textContent(),'1');
 assert.equal(await p.locator('output[aria-label="Palsu"]').textContent(),'1');
 rows.push({phcId:'REALTIME',callSource:'operator',status:'completed',operationalDate:'2026-10-03',shift:'pagi',deleted:false});await p.evaluate(rows=>{window.liveRows=rows;window.emitLive();},rows);await p.waitForFunction(()=>document.querySelector('output[aria-label="Operator"]')?.textContent==='2');assert.ok((await p.locator('.phc-synced').innerText()).includes('Live — Firebase'));rows.pop();
 rows[0].callSource='awam';await p.evaluate(rows=>{window.liveRows=rows;window.emitLive();},rows);
 await p.waitForFunction(()=>document.querySelector('output[aria-label="Awam"]')?.textContent==='2');
 assert.equal(await p.locator('output[aria-label="MECC / Call Centre"]').textContent(),'1');
 fail=true;await p.evaluate(()=>{window.liveFail=true;window.emitLive();});
 await p.getByRole('alert').filter({hasText:'Sync terganggu'}).waitFor();
 await p.getByRole('button',{name:'Langkah 8: Semakan',exact:true}).click();
 assert.equal(await p.getByRole('button',{name:'Simpan ke Firebase',exact:true}).isDisabled(),true);
 assert.equal(await p.getByRole('button',{name:/Cetak A4/}).isDisabled(),true);
 fail=false;await p.getByRole('button',{name:'Langkah 7: Panggilan',exact:true}).click();await p.evaluate(()=>{window.liveFail=false;window.emitLive();});
 await p.waitForFunction(()=>document.querySelector('output[aria-label="Awam"]')?.textContent==='2');
 await p.getByRole('button',{name:'Langkah 8: Semakan',exact:true}).click();
 assert.ok((await p.locator('.report-preview').innerText()).includes('Jumlah: 5'));
 failWrite=true;await p.getByRole('button',{name:'Simpan ke Firebase',exact:true}).click();
 await p.getByRole('alert').filter({hasText:'Laporan gagal disimpan. WhatsApp tidak dibuka.'}).waitFor();assert.equal(await p.getByRole('button',{name:'Hantar WhatsApp',exact:true}).count(),0);assert.equal(saved.length,0);
 assert.equal(await p.evaluate(key=>localStorage.getItem(key),memoryKey),null,'Failed save must not learn memory');
 failWrite=false;await p.getByRole('button',{name:'Simpan ke Firebase',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('.page-dashboard'));
 assert.equal(saved[0].staff.length,8);assert.equal(saved[0].staff[1].name,'CUSTOM Pegawai Perubatan');
 assert.deepEqual(saved[0].ambulances.map(a=>a.vehicleNo),['VFP 6164','WXJ – Van Jenazah','WXJ – Minibus','CUSTOM VAN']);
 assert.deepEqual(saved[0].ambulances[0].drivers,['NIK','CUSTOM DRIVER','AZMAN']);
 const memory=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),memoryKey);
 assert.deepEqual(memory.ppp.map(x=>x.value),['CUSTOM PPP']);assert.deepEqual(memory.drivers.map(x=>x.value),['CUSTOM DRIVER']);assert.deepEqual(memory.destinations.map(x=>x.value),['Kuala Medang']);assert.deepEqual(memory.units.map(x=>x.value),['CUSTOM UNIT']);assert.deepEqual(memory.vehicles.map(x=>x.value),['CUSTOM VAN']);
 assert.equal(saved.length,1);assert.equal(saved[0].calls.awam,2);assert.equal(saved[0].callsSource,'phc');
 await p.getByRole('heading',{name:'✓ Laporan berjaya disimpan'}).waitFor();
 await p.waitForFunction(()=>document.querySelector('dialog')?.open);
 const waBox=await p.getByRole('button',{name:'Hantar WhatsApp',exact:true}).boundingBox();assert.ok(waBox.y>=0 && waBox.y+waBox.height<844,'WhatsApp is immediately inside viewport without scroll');
 await p.evaluate(()=>{window.shareUrls=[];window.open=url=>{window.shareUrls.push(url);return {opener:null}};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedMessage=text}}});});
 const msg=await p.getByLabel('Mesej WhatsApp',{exact:true}).inputValue();
 assert.ok(msg.includes('Jumlah Pesakit: 21'));assert.ok(msg.includes('Diisi oleh: ISOLATED TEST'));assert.ok(msg.includes('BID: 0'));assert.ok(msg.includes('Pergerakan Ambulans & Kenderaan: 4'));assert.ok(msg.includes('Jumlah Panggilan Kecemasan: 5'));assert.ok(msg.includes('MECC / Call Centre: 1'));assert.ok(msg.includes('Awam: 2'));
 for(let i=0;i<2;i++)await p.getByRole('button',{name:'Hantar WhatsApp',exact:true}).click();
 const urls=await p.evaluate(()=>window.shareUrls);assert.equal(urls.length,2);assert.equal(new URL(urls[0]).searchParams.get('text'),msg);assert.equal(saved.length,1,'Sharing must not write Firestore');
 await p.getByRole('button',{name:'Copy Message',exact:true}).click();assert.equal(await p.evaluate(()=>window.copiedMessage),msg);assert.ok(await p.getByText('✓ Mesej disalin',{exact:true}).isVisible());
 for(const width of [320,375,390,414,1280]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'success overflow '+width)}
 await p.setViewportSize({width:390,height:844});
 await p.screenshot({path:process.env.ETD_SUCCESS_SCREENSHOT||'/tmp/etd-whatsapp-mobile-test.png',fullPage:false});
 await p.evaluate(()=>{window.open=()=>null});await p.getByRole('button',{name:'Hantar WhatsApp',exact:true}).click();assert.ok(await p.getByText('WhatsApp tidak dapat dibuka. Gunakan Copy Message di bawah.',{exact:true}).isVisible());assert.equal(saved.length,1);

 await p.getByRole('button',{name:'Tutup',exact:true}).click();

 // Reload device memory, then open the saved non-master values without correction.
 await p.reload();await p.waitForFunction(()=>document.querySelector('.page-dashboard'));
 await p.locator('.bottom-nav').getByRole('button',{name:/Rekod/}).click();
 await p.getByRole('button',{name:'Papar 10 Rekod',exact:true}).click();
 await p.locator('.record-card').first().getByRole('button',{name:'Edit',exact:true}).click();
 await staffStep();
 for(const category of ['Pegawai Perubatan','PPP','Nurse/Jururawat','PPK']){const input=p.getByRole('combobox',{name:`Nama ${category} 2`,exact:true});assert.equal(await input.inputValue(),'CUSTOM '+category);await input.fill('custom');assert.deepEqual(await p.getByRole('option').allTextContents(),['CUSTOM '+category]);await input.fill('CUSTOM '+category);await input.press('Escape');}
 assert.equal(await p.getByRole('combobox',{name:'Nama PPP 2',exact:true}).inputValue(),'CUSTOM PPP');
 await p.getByRole('combobox',{name:'Nama PPP 2',exact:true}).fill('custom');assert.deepEqual(await p.getByRole('option').allTextContents(),['CUSTOM PPP']);
 await p.getByRole('combobox',{name:'Nama PPP 2',exact:true}).fill('CUSTOM PPP');
 await movementStep();
 const old=p.locator('.ambulance-card').last();assert.equal(await old.getByRole('combobox').nth(0).inputValue(),'CUSTOM VAN');assert.equal(await old.getByRole('combobox').nth(1).inputValue(),'Kuala Medang');assert.equal(await old.getByRole('combobox').nth(2).inputValue(),'CUSTOM UNIT');
 await old.getByRole('combobox',{name:'Pemandu 3',exact:true}).fill('custom');assert.deepEqual(await p.getByRole('option').allTextContents(),['CUSTOM DRIVER']);
 await old.getByRole('combobox',{name:'Pemandu 3',exact:true}).fill('AZMAN');
 await p.locator('.bottom-nav').getByRole('button',{name:/Statistik/}).click();
 for(const label of ['Mingguan','Bulanan','Tahunan']){
  await p.getByRole('button',{name:label,exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('.stats-page .call-breakdown-total strong')?.textContent==='5');
  const beforePreviewQueries=phcQueries;
  await p.getByRole('button',{name:'Preview Laporan A4',exact:true}).click();
  await p.getByLabel('Laporan Statistik A4',{exact:true}).waitFor();
  assert.equal(await p.locator('.stats-a4 .call-breakdown-total strong').innerText(),'5');assert.equal(await p.locator('.a4-kpis strong').first().innerText(),'21');
  assert.ok((await p.locator('.stats-a4').innerText()).includes('Pergerakan Ambulans & Kenderaan'));
  for(const width of [320,375,390,414]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'A4 preview overflow '+width)}
  await p.pdf({path:`/tmp/etd-a4-${label}.pdf`,format:'A4',preferCSSPageSize:true,printBackground:true});
  await p.setViewportSize({width:390,height:844});
  if(label==='Bulanan')await p.screenshot({path:'/tmp/etd-a4-mobile.png',fullPage:true});
  await p.locator('.a4-sheet:last-child footer').click();
  await p.getByRole('button',{name:'Kembali',exact:true}).click();assert.equal(phcQueries,beforePreviewQueries,'Preview/return must reuse dataset without Firestore reads');
 }

 for(const width of [320,375,390,414]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+width)}
 // No orphan listeners when changing date/shift/view, and automatic boundary change.
 await p.locator('.bottom-nav').getByRole('button',{name:/Isi laporan/}).click();
 await p.waitForFunction(()=>document.querySelector('form.form-page'));
 await p.clock.fastForward(6*60*60*1000); // 08:00 -> 14:00; no Firestore poll
 await p.waitForFunction(()=>document.querySelector('.form-heading h2')?.textContent.includes('Petang'));
 assert.equal(await p.evaluate(()=>window.subscriptions.size),1);
 await p.clock.fastForward(7*60*60*1000);
 await p.waitForFunction(()=>document.querySelector('.form-heading h2')?.textContent.includes('Malam'));
 await p.clock.fastForward(10*60*60*1000);
 await p.waitForFunction(()=>document.querySelector('.form-heading h2')?.textContent.includes('Pagi')&&document.querySelector('form input[type="date"]')?.value==='2026-10-05');
 assert.equal(await p.evaluate(()=>window.subscriptions.size),1);
 await p.locator('form input[type="date"]').fill('2026-10-03');
 await p.locator('form .segmented button').filter({hasText:/^Malam$/}).click();
 await p.clock.fastForward(7*60*60*1000); // pinned historical Malam remains selected
 assert.ok((await p.locator('.form-heading h2').innerText()).includes('Malam'));
 await p.locator('.bottom-nav').getByRole('button',{name:/Rekod/}).click();
 assert.equal(await p.evaluate(()=>window.subscriptions.size),0);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS ETD autocomplete: all master fields, touch/keyboard, custom save-only memory and refresh isolation, multiple drivers, distinct WXJ/destinations, legacy strings; regression: four sources, realtime after PHC edit, listener lifecycle and automatic shift boundary, error/save/print guard, derived save, week/month/year, widths320-414, no JS error, no production test writes');
})().catch(e=>{console.error(e);process.exit(1)});

