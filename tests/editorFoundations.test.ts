import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, defaultView, type Artwork, type DesignState } from '../src/domain/project.ts';
import { selectionScope } from '../src/app/selection.ts';
import { numericDraft } from '../src/app/numericDraft.ts';
import { resizeArtwork } from '../src/editor/resizeArtwork.ts';
import { computeLayout } from '../src/domain/layout.ts';
const art = (): Artwork => ({ groups:[{id:'g',name:'Letters',type:'front'}], elements:[10,20].map((w,i)=>({id:String(i), name:`Letter ${i}`,group:'g',type:'front',override:false,pixels:100,color:'#ffffff',bounds:[i*30,0,i*30+w,20],regions:[{outer:[[i*30,0],[i*30+w,0],[i*30+w,20],[i*30,20]],holes:[]}]})),bounds:[0,0,50,20],imageWidth:50,imageHeight:20,imageData:'',approved:false });
const design = (): DesignState => ({settings:defaultSettings(),artwork:art()});
test('explicit board and group scopes win over stale primary selection',()=>{
 const a=art(), v={...defaultView(),selected:'0',selection:['0','bad','0'],selectedGroup:'__board'};
 assert.equal(selectionScope(a,v).kind,'board');
 assert.deepEqual(selectionScope(a,{...v,selectedGroup:'g'}),{kind:'group',label:'Letters',ids:['0','1']});
 assert.deepEqual(selectionScope(a,{...v,selectedGroup:'missing'}).ids,['0']);
 assert.equal(selectionScope(null,v).kind,'board');
});
test('selection filters invalid ids and preserves primary ordered selection',()=>{
 assert.deepEqual(selectionScope(art(),{...defaultView(),selected:'1',selection:['0','0','bad','1']}).ids,['1','0']);
 assert.equal(selectionScope(art(),defaultView()).kind,'empty');
});
test('numeric drafts reject blank nonfinite and out of range without clamping',()=>{
 for(const raw of ['', ' ', 'bad', 'Infinity','4','101']) assert.equal(numericDraft(raw,5,100).ok,false);
 assert.deepEqual(numericDraft('12.5',5,100),{ok:true,value:12.5});
});
test('linked multi resize uses first actual width and preserves unequal ratios',()=>{
 const d=design(), before=JSON.stringify(d), l=computeLayout(d), w=l.elements[0].bounds[2]-l.elements[0].bounds[0];
 const a=resizeArtwork(d,{ids:['0','1']},'width',w*0.5,true);
 const out=computeLayout({...d,artwork:a});
 for(let i=0;i<2;i++) for(const axis of [0,1]) assert.ok(Math.abs((out.elements[i].bounds[axis+2]-out.elements[i].bounds[axis])/(l.elements[i].bounds[axis+2]-l.elements[i].bounds[axis])-0.5)<1e-8);
 assert.equal(JSON.stringify(d),before);
});
test('group resize preserves inherited sizes and scales existing overrides',()=>{
 const d=design(); d.artwork!.elements[1].charWidth=500;
 const m=computeLayout(d).groupMetrics.g;
 const a=resizeArtwork(d,{ids:['0','1'],groupId:'g'},'height',m.charHeight/2,true);
 assert.equal(a.groups[0].charHeight,m.charHeight/2); assert.equal(a.groups[0].charWidth,m.charWidth/2);
 assert.equal(a.elements[0].charHeight,undefined);assert.equal(a.elements[0].charWidth,undefined);assert.equal(a.elements[1].charWidth,250);
});
test('unlinked resize changes only requested axis and rejects invalid edits atomically',()=>{
 const d=design(),a=resizeArtwork(d,{ids:['0','1']},'height',200,false);
 assert.equal(a.elements[0].charHeight,200);assert.equal(a.elements[0].charWidth,undefined);
 for(const n of [NaN,Infinity,0,-1,4001,1]) assert.throws(()=>resizeArtwork(d,{ids:['0','1']},'height',n,true));
 const bad=design();bad.artwork!.elements[0].charWidth=NaN;
 assert.throws(()=>resizeArtwork(bad,{ids:['0']},'height',200,true));
});
test('group scope ignores mismatched primary element and stale selection arrays',()=>{
 const a=art();a.groups.push({id:'other',name:'Other',type:'front'});a.elements[1].group='other';
 assert.deepEqual(selectionScope(a,{...defaultView(),selected:'1',selection:['1'],selectedGroup:'g'}),{kind:'group',label:'Letters',ids:['0']});
});
test('converted numeric drafts validate internal millimetres',()=>{
 assert.deepEqual(numericDraft('2',5,100,n=>n*25.4),{ok:true,value:50.8});
 assert.equal(numericDraft('4',5,100,n=>n*25.4).ok,false);
});
test('group size rejection does not change inherited dimensions or overrides',()=>{
 const d=design();d.artwork!.elements[1].charWidth=3990;
 const before=JSON.stringify(d),m=computeLayout(d).groupMetrics.g;
 assert.throws(()=>resizeArtwork(d,{ids:['0','1'],groupId:'g'},'height',m.charHeight*1.01,true));
 assert.equal(JSON.stringify(d),before);
});
