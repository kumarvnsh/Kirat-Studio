import { fitRect, type LayoutPage } from './pageLayout.ts';
import type { BookletFont } from './bookletFont.ts';
export async function pageCanvas(page:LayoutPage,font:BookletFont,images:Record<string,string>,draft=false,width=3508,signal?:AbortSignal){
 signal?.throwIfAborted();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.round(width*210/297);const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(width/297,canvas.height/210);
 for(const item of page.items){signal?.throwIfAborted();
  if(item.kind==='text'){ctx.save();ctx.translate(item.x,item.y+item.size);ctx.scale(item.size/font.unitsPerEm,-item.size/font.unitsPerEm);ctx.fillStyle=item.color;for(const g of font.shape(item.text)){ctx.save();ctx.translate(g.x,g.y);ctx.fill(new Path2D(g.path));ctx.restore();}ctx.restore();}
  else if(item.kind==='line'){ctx.beginPath();ctx.strokeStyle='#d1d9dc';ctx.lineWidth=.25;ctx.moveTo(item.x,item.y);ctx.lineTo(item.x2,item.y2);ctx.stroke();}
  else {const src=item.kind==='logo'?item.data:images[item.shotId];if(!src){ctx.fillStyle='#e9eeef';ctx.fillRect(item.x,item.y,item.w!,item.h!);continue;}const image=new Image();image.src=src;await image.decode();const r=fitRect(image.naturalWidth/image.naturalHeight,{x:item.x,y:item.y,w:item.w!,h:item.h!});ctx.drawImage(image,r.x,r.y,r.w,r.h);image.src='';}
 }
 if(draft){ctx.save();ctx.globalAlpha=.16;ctx.fillStyle='#a54724';ctx.font='bold 27px sans-serif';ctx.translate(148,108);ctx.rotate(-.3);ctx.textAlign='center';ctx.fillText('DRAFT',0,0);ctx.restore();}
 return canvas;
}
export function canvasBlob(canvas:HTMLCanvasElement,type='image/png'):Promise<Blob>{return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Image encoding failed. Retry with a smaller output.')),type,.94));}
