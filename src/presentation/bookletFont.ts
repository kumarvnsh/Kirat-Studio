import 'regenerator-runtime/runtime.js';
import fontkit from '@pdf-lib/fontkit';
export function bookletFont(bytes:Uint8Array){
 const font=fontkit.create(bytes),cache=new Map<string,{path:string;x:number;y:number}[]>();
 const shape=(text:string)=>{
  if(cache.has(text))return cache.get(text)!;
  let x=0;const result:{path:string;x:number;y:number}[]=[];
  for(const segment of text.match(/[\p{Script=Devanagari}\p{Mark}]+|[^\p{Script=Devanagari}\p{Mark}]+/gu)??[]){const run=font.layout(segment);run.glyphs.forEach((g,i)=>{if(g.id===0&&!/^\s+$/.test(segment))throw Error('This text contains a character unavailable in the booklet font. Use Latin or Devanagari text.');const p=run.positions[i],path=g.path.toSVG();if(path)result.push({path,x:x+p.xOffset,y:p.yOffset});x+=p.xAdvance;});}
  cache.set(text,result);if(cache.size>1000)cache.delete(cache.keys().next().value!);return result;
 };
 const measure=(text:string,size:number)=>{let advance=0;for(const s of text.match(/[\p{Script=Devanagari}\p{Mark}]+|[^\p{Script=Devanagari}\p{Mark}]+/gu)??[])advance+=font.layout(s).positions.reduce((n,p)=>n+p.xAdvance,0);return advance*size/font.unitsPerEm;};
 return {shape,measure,unitsPerEm:font.unitsPerEm};
}
export type BookletFont=ReturnType<typeof bookletFont>;
let loading:Promise<BookletFont>|undefined;
export function loadBookletFont(){return loading??=fetch('/fonts/NotoSansDevanagari.ttf').then(async r=>{if(!r.ok)throw Error('Booklet font could not load. Retry.');return bookletFont(new Uint8Array(await r.arrayBuffer()));}).catch(e=>{loading=undefined;throw e;});}
