import { PDFDocument, rgb, pushGraphicsState, popGraphicsState, translate, scale } from 'pdf-lib';
import type { LayoutPage } from './pageLayout.ts';
import { fitRect } from './pageLayout.ts';
import type { BookletFont } from './bookletFont.ts';
const MM=72/25.4;
const color=(hex:string)=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
export async function pdfExport(pages:LayoutPage[],font:BookletFont,images:Record<string,string>,draft:boolean,signal:AbortSignal,onProgress:(n:number)=>void){
 const doc=await PDFDocument.create();doc.setTitle('Sign proposal');doc.setCreator('Kirat Studio');
 const embedded=new Map<string,Awaited<ReturnType<typeof doc.embedPng>>>();
 for(let index=0;index<pages.length;index++){
  signal.throwIfAborted();const page=doc.addPage([297*MM,210*MM]);
  const drawText=(text:string,x:number,y:number,size:number,hex:string)=>{const s=size/font.unitsPerEm*MM;page.pushOperators(pushGraphicsState(),translate(x*MM,(210-y-size)*MM),scale(s,-s));for(const g of font.shape(text))page.drawSvgPath(g.path,{x:g.x,y:-g.y,scale:1,color:color(hex)});page.pushOperators(popGraphicsState());};
  for(const item of pages[index].items){signal.throwIfAborted();
   if(item.kind==='text')drawText(item.text,item.x,item.y,item.size,item.color);
   else if(item.kind==='line')page.drawLine({start:{x:item.x*MM,y:(210-item.y)*MM},end:{x:item.x2*MM,y:(210-item.y2)*MM},thickness:.25*MM,color:rgb(.82,.85,.86)});
   else {const src=item.kind==='logo'?item.data:images[item.shotId];if(!src)throw Error(`Missing image for ${pages[index].title}.`);let image=embedded.get(src);if(!image){const r=await fetch(src,{signal});if(!r.ok)throw Error('A booklet image could not load. Rerender it and retry.');const bytes=await r.arrayBuffer();image=src.startsWith('data:image/jpeg')?await doc.embedJpg(bytes):await doc.embedPng(bytes);embedded.set(src,image);}const r=fitRect(image.width/image.height,{x:item.x,y:item.y,w:item.w!,h:item.h!});page.drawImage(image,{x:r.x*MM,y:(210-r.y-r.h)*MM,width:r.w*MM,height:r.h*MM});}
  }
  if(draft)drawText('DRAFT',120,100,20,'#bc8064');
  onProgress((index+1)/pages.length);await new Promise(r=>setTimeout(r,0));
 }
 signal.throwIfAborted();const bytes=await doc.save();return new Blob([new Uint8Array(bytes)],{type:'application/pdf'});
}
