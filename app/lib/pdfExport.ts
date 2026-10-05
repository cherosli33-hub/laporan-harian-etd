import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';

// Convert the currently rendered A4 preview, never a screenshot or a second report query.
export function previewDocument(root: HTMLElement): TDocumentDefinitions {
  const text = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const children = (el: Element): Content[] => Array.from(el.children).filter(e => !e.matches('.no-print,button')).map(convert);
  function convert(el: Element): Content {
    if (el.matches('.no-print,button')) return {text: ''};
    if (el.tagName.toLowerCase() === 'svg') {
      const copy = el.cloneNode(true) as Element;
      copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
      return {svg:copy.outerHTML, width:510, height:78, margin:[0,4,0,6]};
    }
    if (el.tagName === 'IMG') return {text:''}; // Logo is attached locally below; never rasterize report text.
    if (el.tagName === 'TABLE') {
      const rows = Array.from(el.querySelectorAll('tr'));
      const count = rows[0]?.children.length || 1;
      const trend=el.matches('.a4-trend-table');
      return {table:{headerRows:el.querySelector('thead') ? 1 : 0, dontBreakRows:true,
        widths:Array(count).fill('*'), body:rows.map(row=>Array.from(row.children).map(cell=>({text:text(cell),bold:cell.tagName==='TH',fillColor:cell.closest('thead')?'#e8f4ef':undefined,fontSize:trend?8:9,margin:[1,0,1,0]})))},layout:{hLineWidth:(i,node)=>i===0||i===node.table.body.length?0:0.5,vLineWidth:()=>0,hLineColor:()=>'#dbe5e1',paddingTop:()=>trend?1:2,paddingBottom:()=>trend?1:2},margin:[0,3,0,7]};
    }
    if (el.matches('.print-table')) {
      return {table:{headerRows:1,dontBreakRows:true,widths:[65,180,95,'*'],body:Array.from(el.children).map((row,i)=>Array.from(row.children).map(cell=>({text:text(cell),bold:i===0,margin:[2,3,2,3]})))},layout:'lightHorizontalLines',margin:[0,4,0,8]};
    }
    if (el.matches('.print-stats,.preview-summary,.a4-kpis')) {
      const cols=el.matches('.print-stats')?4:el.matches('.preview-summary')?4:2;
      const cells: TableCell[]=Array.from(el.children).map(cell=>({stack:children(cell),fillColor:'#f2f8f5',margin:[5,5,5,5]}));
      while(cells.length%cols)cells.push({stack:[{text:''}],fillColor:'#f2f8f5',margin:[5,5,5,5]});
      return {table:{widths:Array(cols).fill('*'),body:Array.from({length:cells.length/cols},(_,i)=>cells.slice(i*cols,(i+1)*cols))},layout:'noBorders',margin:[0,5,0,8]};
    }
    if (el.matches('.preview-columns')) return {columns:Array.from(el.children).map(e=>({stack:children(e)})),columnGap:18,margin:[0,6,0,7]};
    if (el.tagName === 'HEADER') return {stack:children(el),margin:[0,0,0,10],alignment:el.matches('.a4-header')?'center':'left',unbreakable:true};
    if (el.tagName === 'FOOTER') return {text:text(el),fontSize:7,color:'#60766e',margin:[0,8,0,8]};
    if (/^H[123]$/.test(el.tagName)) return {text:text(el),fontSize:el.tagName==='H1'?17:el.tagName==='H2'?14:10,bold:true,color:'#245f4e',margin:[0,7,0,4],headlineLevel:1};
    if (el.matches('dt,dd')) return {text:text(el),margin:[0,1,0,1]};
    if (el.tagName === 'LI' || el.matches('.report-id,.call-breakdown-total')) {
      return {stack:Array.from(el.children).length ? [{text:Array.from(el.children).map(text).join('  |  '),margin:[0,2,0,2]}] : [{text:text(el)}]};
    }
    if (el.tagName==='P' || !el.children.length) return {text:text(el),bold:el.matches('strong,b'),fontSize:el.matches('small,.a4-note')?7.5:9,margin:[0,2,0,3]};
    return {stack:children(el)};
  }
  const sheets = Array.from(root.querySelectorAll(':scope > .a4-sheet'));
  const content: Content[] = sheets.length ? sheets.map((sheet,i)=>({stack:children(sheet),...(i?{pageBreak:'before' as const}:{})})) : children(root);
  return {pageSize:'A4',pageMargins:[30,28,30,30],defaultStyle:{font:'Roboto',fontSize:9,lineHeight:1.15},content,
    footer:(page,pages)=>({text:`${page} / ${pages}`,alignment:'right',fontSize:7,margin:[0,0,30,0]}),
    pageBreakBefore:(node,following)=>Boolean(node.headlineLevel && !following.length)};
}

export async function generatePreviewPdf(root: HTMLElement): Promise<Blob> {
  // Snapshot before imports/network work so export matches the selected preview.
  const definition=previewDocument(root);
  const logo=root.querySelector('img') as HTMLImageElement|null;
  const [pdfModule,fontModule]=await Promise.all([import('pdfmake/build/pdfmake'),import('pdfmake/build/vfs_fonts')]);
  const pdfMake=pdfModule.default;
  pdfMake.vfs=fontModule.default as unknown as Record<string,string>;
  if(logo){
    try{
      const response=await fetch(logo.src); if(!response.ok)throw new Error('Logo');
      const blob=await response.blob();
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
      (definition.content as Content[]).unshift({image:data,width:38,margin:[0,0,0,5]});
    }catch{/* Report contents remain available if the decorative logo cannot load. */}
  }
  return new Promise((resolve,reject)=>{try{pdfMake.createPdf(definition).getBlob(resolve);}catch(error){reject(error);}});
}

export function etdPdfFilename(date:string,shift:string,end?:string):string {
  const safe=(value:string)=>value.normalize('NFKC').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80)||'Laporan';
  const datePart=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('-'):safe(value);
  return `Laporan_ETD_${datePart(date)}${end?`_${datePart(end)}`:''}_${safe(shift)}.pdf`;
}
export function downloadPdf(file:File):void {
  const url=URL.createObjectURL(file);const link=document.createElement('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export function canSharePdf(file:File):boolean {
  try{return typeof navigator.share==='function' && typeof navigator.canShare==='function' && navigator.canShare({files:[file]});}catch{return false;}
}
