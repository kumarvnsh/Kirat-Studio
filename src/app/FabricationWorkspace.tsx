import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fabricationPlan, type CutPart } from '../fabrication/plan.ts';
import type { StripSchedule } from '../fabrication/bending.ts';
import type { Region } from '../domain/project.ts';
import { computeLayout } from '../domain/layout.ts';
import { select, setFabrication, setView, useApp, useDesign, useView } from './store.ts';
import { exportBendSchedule, exportCutFiles } from './MakePanel.tsx';

type Part = { key: string; element: string; name: string; group: string; label: string } & (
  { kind: 'cut'; cut: CutPart } | { kind: 'strip'; strip: StripSchedule; index: number }
);
function useParts() {
  const design = useDesign(), fab = useApp(s => s.fabrication), view = useView();
  const plan = fabricationPlan(design, fab);
  const [key, setKey] = useState<string | null>(null), [search, setSearch] = useState(''), [category, setCategory] = useState('all');
  const [segment, setSegment] = useState<number | null>(null);
  useEffect(() => { setKey(null); setSegment(null); }, [design.artwork]);
  useEffect(() => { setSegment(null); }, [fab, key]);
  const parts: Part[] = [
    ...plan.cuts.map(cut => ({ key: 'cut:' + cut.element + ':' + cut.part, element: cut.element, name: cut.name, group: cut.group, label: cut.part, kind: 'cut' as const, cut })),
    ...plan.strips.flatMap(element => element.schedules.map((strip, index) => ({
      key: 'strip:' + element.element + ':' + index, element: element.element, name: element.name, group: element.group,
      label: (strip.contour === 'outer' ? 'Outer' : 'Counter') + ' strip ' + (index + 1), kind: 'strip' as const, strip, index,
    }))),
  ];
  const matching = parts.filter(p => (category === 'all' || p.kind === category) &&
    (p.name + ' ' + p.group + ' ' + p.element + ' ' + p.label).toLowerCase().includes(search.toLowerCase()));
  const chosen = matching.find(p => p.key === key) ?? matching.find(p => p.element === view.selected) ?? matching[0];
  return { design, plan, fab, parts: matching, chosen, search, category, segment, setSearch, setCategory, setSegment,
    choose: (part: Part) => { setKey(part.key); setSegment(null); select(part.element); if (view.mode === 'bend') setView({ mode: '3d' }); },
  };
}
const PartContext = createContext<ReturnType<typeof useParts> | null>(null);
export function FabricationProvider({ children }: { children: ReactNode }) {
  const value = useParts();
  return <PartContext.Provider value={value}>{children}</PartContext.Provider>;
}
function useFabrication() { const value = useContext(PartContext); if (!value) throw Error('Missing fabrication provider.'); return value; }

export function FabricationParts() {
  const state = useFabrication(), groups = [...new Set(state.parts.map(p => p.group))];
  return <section className="fabrication-parts"><div className="panel-heading"><span className="eyebrow">WORKSHOP / PARTS</span><h2>Outline to object.</h2></div>
    <label className="part-search"><span className="sr-only">Find a part</span><input placeholder="Find a part…" value={state.search} onChange={e => state.setSearch(e.target.value)} /></label>
    <label><span className="sr-only">Part category</span><select value={state.category} onChange={e => state.setCategory(e.target.value)}><option value="all">All parts</option><option value="cut">Cutting outlines</option><option value="strip">Return strips</option></select></label>
    <div className="part-groups">{groups.map(group => <div key={group}><h3>{group}</h3>{state.parts.filter(p => p.group === group).map(part => <button key={part.key} className={'part-row' + (state.chosen?.key === part.key ? ' selected' : '')}
      onClick={() => state.choose(part)} aria-pressed={state.chosen?.key === part.key}><span className="part-symbol">{part.kind === 'strip' ? '▱' : '◇'}</span><span>{part.name}<small>{part.label}</small></span></button>)}</div>)}</div>
    {!state.parts.length && <p className="empty-state">No parts match. Try another search or category.</p>}
    <p className="muted rail-note">{state.parts.length} parts · Dimensions in mm<br />Geometric preview, not a machine program.</p>
  </section>;
}

function Outline({ regions, toolpaths = [] }: { regions: Region[]; toolpaths?: Region[] }) {
  const points = regions.flatMap(region => region.outer);
  if (!points.length) return <p className="empty-state">No outline for this part.</p>;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x = Math.min(...xs), y = Math.max(...ys), width = Math.max(...xs) - x || 1, height = y - Math.min(...ys) || 1;
  const pad = Math.max(width,height) * .12;
  const path = (region: Region) => [region.outer, ...region.holes].map(loop => loop.map((p,i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' ') + ' Z').join(' ');
  return <svg className="part-outline" role="img" aria-label="Original outline and compensated cutting paths" viewBox={[x-pad,-y-pad,width+pad*2,height+pad*2].join(' ')}>
    <g transform="scale(1,-1)">{regions.map((region,i) => <path key={i} d={path(region)} fill="#dee7eb" stroke="#2c5367" strokeWidth={1.2} vectorEffect="non-scaling-stroke" fillRule="evenodd" />)}
    {toolpaths.map((region,i) => <path key={i} d={path(region)} fill="none" stroke="#c48746" strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeDasharray="4 3" />)}</g></svg>;
}
export function FabricationPreview() {
  const state = useFabrication(), part = state.chosen, [showPaths, setShowPaths] = useState(true);
  if (!part) return <div className="fabrication-preview empty-state"><span className="eyebrow">FABRICATION</span><h2>Select a part to inspect.</h2><p>Import artwork or clear your search to see cutting outlines and return strips.</p></div>;
  const strip = part.kind === 'strip' ? part.strip : null;
  const placed = computeLayout(state.design).elements.find(e => e.id === part.element);
  const regions = part.kind === 'cut' ? part.cut.outline : placed?.regions ?? [];
  const segments = strip?.segments.filter(s => s.kind !== 'straight') ?? [];
  const selected = state.segment !== null ? segments[state.segment] : null;
  const issues = state.plan.issues.find(issue => issue.element === part.element)?.issues ?? [];
  return <section className="fabrication-preview"><div className="fabrication-title"><div><span className="eyebrow">{part.group} / {part.label}</span><h2>{part.name}</h2></div>
    {part.kind === 'strip' && <button onClick={() => { select(part.element); setView({ mode: 'bend', bend: 100, isolate: true, selectionActive: true }); }}>Forming study ↗</button>}</div>
    <div className="outline-card"><Outline regions={regions} toolpaths={part.kind === 'cut' && showPaths ? part.cut.toolpath : []} />
      <div className="outline-meta"><b>{strip ? strip.cutLength.toFixed(1) + ' × ' + strip.height + ' mm' : part.kind === 'cut' ? part.cut.material : ''}</b>
      <span>Original artwork outline</span>{strip ? <span>{segments.length} bend features · {strip.contour} contour</span> : <label className="check"><input type="checkbox" checked={showPaths} onChange={e => setShowPaths(e.target.checked)} />Compensated paths</label>}</div></div>
    {strip ? <><div className="strip-preview"><div className="strip-heading"><h3>Developed return strip</h3><span>{strip.length.toFixed(1)} mm + joint overlap</span></div>
      <svg viewBox="0 0 800 92" role="img" aria-label="Return strip with selectable bend features"><rect x="10" y="22" width="780" height="48" fill="#e9d4b3" stroke="#9f7b4f" />
        {strip.segments.map((s,i) => s.kind === 'curve' ? <rect key={i} x={10 + s.from / strip.cutLength * 780} y="22" width={(s.to-s.from)/strip.cutLength*780} height="48" fill="#b6c9d4" opacity=".6" /> : null)}
        {strip.stations.map((s,i) => <line key={i} x1={10+s.at/strip.cutLength*780} x2={10+s.at/strip.cutLength*780} y1="22" y2="70" stroke={s.direction === 'convex' ? '#9b5c28' : '#315f7a'} strokeWidth="1.5" />)}
        {selected && (selected.kind === 'corner' ? <line x1={10+selected.at/strip.cutLength*780} x2={10+selected.at/strip.cutLength*780} y1="12" y2="80" stroke="#da5c36" strokeWidth="4"/> :
          <rect x={10+selected.from/strip.cutLength*780} y="18" width={Math.max(2,(selected.to-selected.from)/strip.cutLength*780)} height="56" fill="none" stroke="#da5c36" strokeWidth="3"/>)}
        <text x="10" y="15" fill="#687b86" fontSize="10">SEAM / 0 mm</text><text x="790" y="86" textAnchor="end" fill="#687b86" fontSize="10">{strip.cutLength.toFixed(1)} mm</text></svg>
    </div><div className="bend-table-wrap"><table className="bend-table"><thead><tr><th>Position (mm)</th><th>Feature</th><th>Direction</th><th>Angle / radius</th></tr></thead>
      <tbody>{segments.map((s,i) => <tr key={i} className={i === state.segment ? 'selected' : ''}><td><button aria-pressed={i===state.segment} onClick={() => state.setSegment(i)}>{s.kind === 'corner' ? s.at.toFixed(1) : s.from.toFixed(1)+'–'+s.to.toFixed(1)}</button></td><td>{s.kind}</td><td>{s.direction}</td><td>{s.angle.toFixed(1)}°{s.kind === 'curve' ? ' · R'+s.radius.toFixed(1) : ''}</td></tr>)}</tbody></table></div></> :
      <div className="callout">{issues.length ? issues.map((issue,i) => <p key={i}>{issue.message}</p>) : 'No geometric cutting issues at these settings.'}<p className="muted">Select a return strip from the part list to review its bend schedule. Flat letters and vinyl have no return strips.</p></div>}
    <p className="fabrication-disclaimer">Geometric preview only · No bend allowance, springback, machine calibration or nesting.</p>
  </section>;
}
function MachineNumber({ label, value, min, max, step, onCommit }: { label: string; value: number; min: number; max: number; step: number; onCommit: (value:number) => void }) {
  const [text,setText]=useState(String(value)), [error,setError]=useState('');
  useEffect(() => { setText(String(value)); },[value]);
  return <label>{label}<input type="number" min={min} max={max} step={step} value={text} aria-invalid={!!error}
    onChange={e=>{setText(e.target.value);setError('');}} onKeyDown={e=>{if(e.key==='Enter') e.currentTarget.blur(); if(e.key==='Escape'){setText(String(value));setError('');e.preventDefault();e.stopPropagation();}}}
    onBlur={()=>{const n=Number(text); if(!text.trim()||!Number.isFinite(n)||n<min||n>max){setError('Use '+min+'–'+max);return;} onCommit(n);}} />{error&&<small className="field-error">{error}</small>}</label>;
}
export function FabricationSettings() {
  const {design, plan, fab} = useFabrication();
  return <section className="fabrication-settings"><span className="eyebrow">FABRICATION SETTINGS</span><h2>Cutting</h2>
    <label>Method<select value={fab.cut.method} onChange={e=>{const method=e.target.value as 'router'|'laser';setFabrication(f=>({...f,cut:{...f.cut,method}}));}}><option value="router">CNC router</option><option value="laser">Laser</option></select></label>
    <div className="pair">{fab.cut.method==='router'?<MachineNumber label="Tool diameter · mm" value={fab.cut.toolDiameter} min={.5} max={25} step={.5} onCommit={v=>setFabrication(f=>({...f,cut:{...f.cut,toolDiameter:v}}))}/>:
      <MachineNumber label="Kerf · mm" value={fab.cut.kerf} min={0} max={2} step={.05} onCommit={v=>setFabrication(f=>({...f,cut:{...f.cut,kerf:v}}))}/>}
      <MachineNumber label="Min. stroke · mm" value={fab.cut.minStroke} min={0} max={20} step={.5} onCommit={v=>setFabrication(f=>({...f,cut:{...f.cut,minStroke:v}}))}/></div>
    <div className="sectionlabel">REVIEW STATUS</div><div className="review-status"><span className={design.artwork?.approved?'status-good':'status-pending'}>{design.artwork?.approved?'✓ Artwork reviewed':'Artwork review pending'}</span><p>{plan.issues.length?plan.issues.length+' shapes with cutting issues':'✓ No geometric cutting issues'}</p><small>Machine calibration is not modelled.<br/>Parts are not nested.</small></div>
    <details className="property-details"><summary>Return-strip settings</summary><MachineNumber label="Ignore bends below · °" value={fab.bend.minAngle} min={.5} max={20} step={.5} onCommit={v=>setFabrication(f=>({...f,bend:{...f.bend,minAngle:v}}))}/>
      <MachineNumber label="Joint overlap · mm" value={fab.bend.overlap} min={0} max={100} step={1} onCommit={v=>setFabrication(f=>({...f,bend:{...f.bend,overlap:v}}))}/>
      <MachineNumber label="Group bends within · mm" value={fab.bend.curveSpacing} min={1} max={100} step={1} onCommit={v=>setFabrication(f=>({...f,bend:{...f.bend,curveSpacing:v}}))}/>
      <MachineNumber label="Corner from · °" value={fab.bend.cornerAngle} min={5} max={90} step={1} onCommit={v=>setFabrication(f=>({...f,bend:{...f.bend,cornerAngle:v}}))}/></details>
    {!!plan.issues.length && <details className="property-details"><summary>Cutting issues ({plan.issues.length})</summary>{plan.issues.map(issue=><div className="callout warn" key={issue.element}><b>{issue.name}</b>{issue.issues.map((i,n)=><p key={n}>{i.message}</p>)}</div>)}</details>}
    <div className="fabrication-exports"><button className="accent full" disabled={!design.artwork} onClick={exportCutFiles}>Download cut files · DXF ↓</button><button className="full" disabled={!design.artwork} onClick={exportBendSchedule}>Bend schedule · CSV ↓</button></div>
  </section>;
}
