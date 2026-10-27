export interface AssetBackend {read:(key:string)=>Promise<Blob|undefined>;write:(key:string,blob:Blob)=>Promise<void>;prune:(budget:number)=>Promise<void>}
const LIMIT=256*1024*1024;
function request<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
let database:Promise<IDBDatabase>|undefined;
function open(){
 if(!database)database=new Promise<IDBDatabase>((resolve,reject)=>{if(typeof indexedDB==='undefined'){reject(Error('Browser cache unavailable'));return;}const r=indexedDB.open('kirat-render-assets',1);r.onupgradeneeded=()=>r.result.createObjectStore('assets',{keyPath:'key'});r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();database=undefined;};resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Render cache is blocked by another tab'));}).catch(e=>{database=undefined;throw e;});
 return database;
}
async function transaction(mode:IDBTransactionMode,action:(s:IDBObjectStore)=>void){const db=await open();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('assets',mode);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('Cache transaction aborted'));action(tx.objectStore('assets'));});}
const indexedBackend:AssetBackend={
 async read(key){const db=await open(),record=await request<any>(db.transaction('assets').objectStore('assets').get(key));if(!(record?.blob instanceof Blob)||!record.blob.type.startsWith('image/'))return;await transaction('readwrite',s=>s.put({...record,used:Date.now()}));return record.blob;},
 async write(key,blob){await transaction('readwrite',s=>s.put({key,blob,used:Date.now(),bytes:blob.size}));},
 async prune(budget){const db=await open();const rows=await request<any[]>(db.transaction('assets').objectStore('assets').getAll());let total=rows.reduce((sum,r)=>sum+(r.bytes??r.blob?.size??0),0);const remove:string[]=[];for(const r of rows.sort((a,b)=>a.used-b.used)){if(total<=budget)break;remove.push(r.key);total-=r.bytes??r.blob?.size??0;}if(remove.length)await transaction('readwrite',s=>remove.forEach(k=>s.delete(k)));},
};
export class RenderAssets {
 warning='';private memory=new Map<string,Blob>();private bytes=0;
 private backend:AssetBackend;
 constructor(backend:AssetBackend=indexedBackend){this.backend=backend;}
 async get(key:string){if(this.memory.has(key))return this.memory.get(key);try{return await this.backend.read(key);}catch{this.warning='Render cache unavailable. Regenerate missing images; current results can still be exported.';return undefined;}}
 async put(key:string,blob:Blob){this.bytes-=this.memory.get(key)?.size??0;this.memory.delete(key);this.memory.set(key,blob);this.bytes+=blob.size;for(const [id,b] of this.memory){if(this.bytes<=LIMIT)break;if(id!==key){this.memory.delete(id);this.bytes-=b.size;}}
  try{await this.backend.prune(Math.max(0,LIMIT-blob.size));try{await this.backend.write(key,blob);}catch{await this.backend.prune(LIMIT/2);await this.backend.write(key,blob);}this.warning='';}catch{this.warning='Render cache could not save this image. Export now, or rerender after reopening.';}
 }
 clearMemory(){this.memory.clear();this.bytes=0;}
}
export const renderAssets=new RenderAssets();
