import { cameraNames, type Shot } from '../../presentation/model.ts';
export function RenderSetup({shot,onChange,onCustom}:{shot:Shot;onChange:(p:Partial<Shot>)=>void;onCustom:()=>void}){
 return <section className="render-settings"><div className="booklet-section-label">SHOT SETTINGS</div><h2>{shot.name}</h2>
  <label>Shot name<input value={shot.name} maxLength={200} onChange={e=>onChange({name:e.target.value})}/></label>
  <label>Setting<select value={shot.scene.kind} onChange={e=>onChange({scene:{...shot.scene,kind:e.target.value as Shot['scene']['kind']}})}>{(['studio','shopfront','facade','wall','interior']as const).map(k=><option key={k} value={k}>{k[0].toUpperCase()+k.slice(1)}</option>)}</select></label>
  {shot.scene.kind!=='studio'&&<><label>Wall finish<select value={shot.scene.wallFinish} onChange={e=>onChange({scene:{...shot.scene,wallFinish:e.target.value as Shot['scene']['wallFinish']}})}><option value="plaster">Warm plaster</option><option value="concrete">Concrete</option><option value="brick">Brick</option></select></label><label>Ground<select value={shot.scene.groundFinish} onChange={e=>onChange({scene:{...shot.scene,groundFinish:e.target.value as Shot['scene']['groundFinish']}})}><option value="paving">Paving</option><option value="concrete">Concrete</option></select></label></>}
  <label>Camera<select value={shot.camera.preset} onChange={e=>onChange({camera:{preset:e.target.value as Shot['camera']['preset']}})}>{Object.entries(cameraNames).filter(([k])=>k!=='custom'||shot.camera.preset==='custom').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
  <button onClick={onCustom}>Use editor camera direction</button>
  {shot.pairId&&<p className="booklet-hint">Camera and surroundings are linked to the matching day/night shot.</p>}
  <div className="booklet-field-pair"><label>Time of day<select value={shot.environment} onChange={e=>onChange({environment:e.target.value as Shot['environment']})}><option value="day">Day</option><option value="dusk">Dusk</option><option value="night">Night</option></select></label><label>Final size<select value={shot.width} onChange={e=>onChange({width:Number(e.target.value)as Shot['width']})}><option value={2400}>2400 px</option><option value={3840}>3840 px</option></select></label></div>
  <label>Frame<select value={shot.aspect} onChange={e=>onChange({aspect:Number(e.target.value)})}><option value={2}>Wide · 2:1</option><option value={1.5}>Landscape · 3:2</option><option value={1}>Square</option></select></label>
  <label className="booklet-check"><input type="checkbox" checked={shot.power} onChange={e=>onChange({power:e.target.checked})}/>Sign power</label>
  <label>Dimming · {Math.round(shot.dimming*100)}%<input type="range" min={0} max={1} step={.05} value={shot.dimming} onChange={e=>onChange({dimming:Number(e.target.value)})}/></label>
  <label>Camera exposure · {shot.exposureEV} EV<input type="range" min={-4} max={4} step={.25} value={shot.exposureEV} onChange={e=>onChange({exposureEV:Number(e.target.value)})}/></label>
 </section>;
}
