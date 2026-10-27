import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderQueue } from '../src/presentation/renderQueue.ts';
test('queue runs sequentially and cancellation retains completed assets',async()=>{
 const queue=new RenderQueue(), completed:string[]=[];let active=0,max=0;
 const controller=new AbortController();
 await queue.run(['a','b','c'],async(id,signal)=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));active--;if(id==='b')controller.abort();signal.throwIfAborted();return id;},(id)=>completed.push(id),controller.signal).catch(e=>assert.equal(e.name,'AbortError'));
 assert.equal(max,1);assert.deepEqual(completed,['a']);
});
test('superseded jobs cannot publish late results',async()=>{
 const queue=new RenderQueue(), completed:string[]=[];
 let release:()=>void=()=>{};
 const first=queue.run(['old'],async()=>{await new Promise<void>(r=>release=r);return 'old';},id=>completed.push(id));
 const second=queue.run(['new'],async()=> 'new',id=>completed.push(id));release();await Promise.allSettled([first,second]);
 assert.deepEqual(completed,['new']);
});
