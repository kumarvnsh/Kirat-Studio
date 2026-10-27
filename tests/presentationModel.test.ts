import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPresentation, validatePresentation, updateShot } from '../src/presentation/model.ts';
import { shotFingerprint } from '../src/presentation/fingerprints.ts';
import { presentationFixture } from './fixtures/presentation.ts';
test('default booklet has paired installed views and both top cameras', () => {
 const c=defaultPresentation();
 assert.deepEqual(c.shots.slice(0,2).map(s=>s.environment),['day','night']);
 assert.ok(c.shots.some(s=>s.camera.preset==='top'));
 assert.ok(c.shots.some(s=>s.camera.preset==='elevated'));
 assert.deepEqual(validatePresentation(c).value,c);
});
test('invalid presentation recovers with warning', () => {
 for(const mutate of [c=>c.shots[0].width=100,c=>c.shots[0].aspect=NaN,c=>c.pages[0].shotId='absent',c=>c.shots.push(c.shots[0]),c=>c.metadata.project='x'.repeat(201),c=>c.metadata.logoData='data:image/svg+xml;base64,AAAA',c=>c.shots[0].camera={preset:'custom',position:[0,0,0],target:[0,0,0]}] as ((c:any)=>void)[]) {
  const c=defaultPresentation(); mutate(c);assert.ok(validatePresentation(c).warnings.length);
 }
});
test('pair camera editing updates both cameras but leaves night lighting alone',()=>{
 const c=updateShot(defaultPresentation(),'installed-day',{camera:{preset:'elevated'}});
 assert.deepEqual(c.shots[0].camera,c.shots[1].camera);
 assert.equal(c.shots[1].environment,'night');
});
test('render identities ignore metadata, names and review but track physical changes',async()=>{
 const d=presentationFixture('front'), s=defaultPresentation().shots[0];
 const key=await shotFingerprint(d,s,'test');
 d.artwork!.approved=false;d.artwork!.groups[0].name='Renamed';s.name='Renamed';
 assert.equal(await shotFingerprint(d,s,'test'),key);
 d.settings.width+=1;assert.notEqual(await shotFingerprint(d,s,'test'),key);
 d.settings.width-=1;s.power=false;assert.notEqual(await shotFingerprint(d,s,'test'),key);
});
