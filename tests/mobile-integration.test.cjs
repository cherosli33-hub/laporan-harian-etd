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
 failWrite=false;await p.getByRole('button',{name:'Simpan ke Firebase',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('.page-dashboard'));
 assert.equal(saved.length,1);assert.equal(saved[0].calls.awam,2);assert.equal(saved[0].callsSource,'phc');
 await p.getByRole('heading',{name:'✓ Laporan berjaya disimpan'}).waitFor();
 await p.waitForFunction(()=>document.querySelector('dialog')?.open);
 const waBox=await p.getByRole('button',{name:'Hantar WhatsApp',exact:true}).boundingBox();assert.ok(waBox.y>=0 && waBox.y+waBox.height<844,'WhatsApp is immediately inside viewport without scroll');
 await p.evaluate(()=>{window.shareUrls=[];window.open=url=>{window.shareUrls.push(url);return {opener:null}};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedMessage=text}}});});
 const msg=await p.getByLabel('Mesej WhatsApp',{exact:true}).inputValue();
 assert.ok(msg.includes('Jumlah Pesakit: 21'));assert.ok(msg.includes('Diisi oleh: ISOLATED TEST'));assert.ok(msg.includes('BID: 0'));assert.ok(msg.includes('Pergerakan Ambulans & Kenderaan: 0'));assert.ok(msg.includes('Jumlah Panggilan Kecemasan: 5'));assert.ok(msg.includes('MECC / Call Centre: 1'));assert.ok(msg.includes('Awam: 2'));
 for(let i=0;i<2;i++)await p.getByRole('button',{name:'Hantar WhatsApp',exact:true}).click();
 const urls=await p.evaluate(()=>window.shareUrls);assert.equal(urls.length,2);assert.equal(new URL(urls[0]).searchParams.get('text'),msg);assert.equal(saved.length,1,'Sharing must not write Firestore');
 await p.getByRole('button',{name:'Copy Message',exact:true}).click();assert.equal(await p.evaluate(()=>window.copiedMessage),msg);assert.ok(await p.getByText('✓ Mesej disalin',{exact:true}).isVisible());
 for(const width of [320,375,390,414,1280]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'success overflow '+width)}
 await p.setViewportSize({width:390,height:844});
 await p.screenshot({path:process.env.ETD_SUCCESS_SCREENSHOT||'/tmp/etd-whatsapp-mobile-test.png',fullPage:false});
 await p.evaluate(()=>{window.open=()=>null});await p.getByRole('button',{name:'Hantar WhatsApp',exact:true}).click();assert.ok(await p.getByText('WhatsApp tidak dapat dibuka. Gunakan Copy Message di bawah.',{exact:true}).isVisible());assert.equal(saved.length,1);

 await p.getByRole('button',{name:'Tutup',exact:true}).click();
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
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS ETD mobile: four sources, realtime after PHC edit, listener lifecycle and automatic shift boundary, error/save/print guard, derived save, week/month/year, widths320-414, no JS error, no production test writes');
})().catch(e=>{console.error(e);process.exit(1)});
