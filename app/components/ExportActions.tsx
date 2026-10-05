'use client';
import {useEffect,useRef,useState} from 'react';
import {canSharePdf,downloadPdf} from '../lib/pdfExport';
export function ExportActions({selector,filename,disabled=false}:{selector:string;filename:string;disabled?:boolean}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [busy,setBusy]=useState(false),[file,setFile]=useState<File|null>(null),[message,setMessage]=useState('');
  useEffect(()=>{setFile(null);setMessage('');},[filename,selector]);
  async function prepare(share:boolean){
    setMessage('');setBusy(true);setFile(null);
    if(share)dialog.current?.showModal();
    try{
      const root=document.querySelector<HTMLElement>(selector);if(!root)throw new Error('Pratonton tidak ditemui.');
      const {generatePreviewPdf}=await import('../lib/pdfExport');
      const ready=new File([await generatePreviewPdf(root)],filename,{type:'application/pdf'});setFile(ready);
      if(!share)downloadPdf(ready);
      else setMessage(canSharePdf(ready)?'PDF sedia. Tekan Buka Share Sheet untuk memilih aplikasi.':'Perkongsian fail tidak disokong. Download PDF dan kongsi secara manual.');
    }catch{setMessage('PDF tidak dapat dijana. Cuba lagi atau gunakan Cetak.');}
    finally{setBusy(false);}
  }
  // A second explicit tap after generation preserves the user gesture on iPhone/Android.
  async function shareReady(){
    if(!file)return;
    if(!canSharePdf(file)){setMessage('Download PDF dan kongsi secara manual.');return;}
    try{await navigator.share({files:[file],title:filename});}
    catch(error){setMessage((error as Error).name==='AbortError'?'Perkongsian dibatalkan. PDF masih tersedia.':'Perkongsian tidak berjaya. Download PDF dan kongsi secara manual.');}
  }
  return <div className="export-actions no-print"><div className="export-buttons"><button type="button" className="secondary" disabled={disabled||busy} onClick={()=>window.print()}>🖨 Cetak</button><button type="button" className="secondary" disabled={disabled||busy} onClick={()=>prepare(false)}>📄 PDF</button><button type="button" className="primary" disabled={disabled||busy} onClick={()=>prepare(true)}>📤 Kongsi PDF</button></div>{!dialog.current?.open && (busy||message)?<p role="status">{busy?'Menjana PDF…':message}</p>:null}<dialog ref={dialog} className="pdf-share-dialog"><h3>Kongsi PDF</h3><p role="status">{busy?'Menjana PDF…':message}</p>{file?<><p className="pdf-filename">{file.name}</p>{canSharePdf(file)?<button type="button" className="primary" onClick={shareReady}>📤 Buka Share Sheet</button>:null}<button type="button" className="secondary" onClick={()=>downloadPdf(file)}>📄 Download PDF</button></>:null}<button type="button" className="secondary" onClick={()=>window.print()}>🖨 Cetak</button><button type="button" className="secondary" onClick={()=>dialog.current?.close()}>Tutup</button></dialog></div>;
}
