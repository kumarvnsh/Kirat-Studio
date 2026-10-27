export type CameraPreset = 'front' | 'left' | 'right' | 'top' | 'elevated' | 'threeQuarter' | 'custom';
export type Point3 = [number, number, number];
export type ShotCamera = { preset: CameraPreset; position?: Point3; target?: Point3 };
export type PresentationScene = { kind: 'studio' | 'shopfront' | 'facade' | 'wall' | 'interior'; wallFinish: 'plaster' | 'concrete' | 'brick'; groundFinish: 'paving' | 'concrete' };
export type Shot = { id: string; name: string; scene: PresentationScene; camera: ShotCamera; pairId?: string; environment: 'day' | 'dusk' | 'night'; power: boolean; dimming: number; exposureEV: number; width: 2400 | 3840; aspect: number };
export type BookletPage = { id: string; kind: 'cover' | 'render' | 'summary'; included: boolean; shotId?: string; caption: string; dimensions: boolean; materials: boolean };
export type PresentationConfig = { shots: Shot[]; pages: BookletPage[]; metadata: { project: string; client: string; revision: string; notes: string; logoData?: string }; include: { branding: boolean; projectInfo: boolean; notes: boolean } };
export const cameraNames: Record<CameraPreset,string> = {front:'Front',left:'Left side',right:'Right side',top:'Technical top',elevated:'Elevated 3D',threeQuarter:'3D perspective',custom:'Custom camera'};
export function defaultPresentation(): PresentationConfig {
 const definitions: [string,string,CameraPreset,Shot['environment'],PresentationScene['kind']][] = [
  ['installed-day','Installed · Day','threeQuarter','day','shopfront'], ['installed-night','Installed · Night','threeQuarter','night','shopfront'],
  ['front','Front','front','day','studio'], ['side','Side','right','day','studio'], ['top','Technical top','top','day','studio'],
  ['elevated','Elevated 3D','elevated','day','studio'], ['perspective','3D perspective','threeQuarter','day','studio'],
 ];
 const shots: Shot[] = definitions.map(([id,name,preset,environment,kind])=>({id,name,camera:{preset},scene:{kind,wallFinish:'plaster',groundFinish:'paving'},environment,power:true,dimming:1,exposureEV:0,width:2400,aspect:2,...(id.startsWith('installed')?{pairId:'installed'}:{})}));
 return {shots,pages:shots.map(s=>({id:`page-${s.id}`,kind:'render',included:true,shotId:s.id,caption:s.name,dimensions:false,materials:false})),metadata:{project:'Sign proposal',client:'',revision:'01',notes:''},include:{branding:true,projectInfo:true,notes:true}};
}
export function updateShot(config: PresentationConfig,id: string,patch: Partial<Shot>): PresentationConfig {
 const source=config.shots.find(s=>s.id===id);
 return {...config,shots:config.shots.map(s=>s.id===id?{...s,...patch}:source?.pairId&&s.pairId===source.pairId?{...s,...(patch.camera?{camera:patch.camera}:{}),...(patch.scene?{scene:patch.scene}:{}),...(patch.aspect?{aspect:patch.aspect}:{})}:s)};
}
const finiteRange=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
export function validatePresentation(raw: unknown): {value:PresentationConfig;warnings:string[]} {
 if(raw===undefined) return {value:defaultPresentation(),warnings:[]};
 try {
  const c=raw as PresentationConfig;
  if(!c||!Array.isArray(c.shots)||!Array.isArray(c.pages)||c.shots.length>100||c.pages.length>100) throw Error();
  const ids=new Set<string>(), pages=new Set<string>();
  for(const s of c.shots) {
   if(!s||!text(s.id,100)||!s.id||ids.has(s.id)||!text(s.name,200))throw Error();ids.add(s.id);
   if(!['studio','shopfront','facade','wall','interior'].includes(s.scene.kind)||!['plaster','concrete','brick'].includes(s.scene.wallFinish)||!['paving','concrete'].includes(s.scene.groundFinish))throw Error();
   if(!Object.hasOwn(cameraNames,s.camera.preset)||!['day','dusk','night'].includes(s.environment)||typeof s.power!=='boolean'||![2400,3840].includes(s.width)||!finiteRange(s.aspect,.25,4)||!finiteRange(s.dimming,0,1)||!finiteRange(s.exposureEV,-4,4)||(s.pairId!==undefined&&!text(s.pairId,100)))throw Error();
   if(s.camera.preset==='custom') {
    const {position:p,target:t}=s.camera;
    if(!p||!t||p.length!==3||t.length!==3||![...p,...t].every(v=>finiteRange(v,-10000,10000))||p.every((v,i)=>v===t[i]))throw Error();
   }
  }
  for(const p of c.pages) {
   if(!p||!text(p.id,100)||!p.id||pages.has(p.id)||!['cover','render','summary'].includes(p.kind)||!text(p.caption,500)||![p.included,p.dimensions,p.materials].every(v=>typeof v==='boolean')||(p.kind==='render'&&!ids.has(p.shotId!)))throw Error();pages.add(p.id);
  }
  if(!c.metadata||!['project','client','revision'].every(k=>text(c.metadata[k as 'project'],200))||!text(c.metadata.notes,4000)||!c.include||![c.include.branding,c.include.projectInfo,c.include.notes].every(v=>typeof v==='boolean'))throw Error();
  const logo=c.metadata.logoData;
  if(logo!==undefined&&(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo)||logo.split(',')[1].length*3/4>1048576))throw Error();
  const pairs=new Map<string,Shot>();
  for(const s of c.shots)if(s.pairId){const other=pairs.get(s.pairId);if(other&&(JSON.stringify(other.camera)!==JSON.stringify(s.camera)||JSON.stringify(other.scene)!==JSON.stringify(s.scene)||other.aspect!==s.aspect))throw Error();pairs.set(s.pairId,s);}
  return {value:structuredClone(c),warnings:[]};
 }catch{return {value:defaultPresentation(),warnings:['Presentation settings were invalid and have been reset. Your sign design is preserved.']};}
}
