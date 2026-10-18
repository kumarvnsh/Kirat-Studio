import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { assemblySteps, ALL_STEPS } from '../domain/assembly.ts';
import { bom } from '../domain/bom.ts';
import { LAYERS } from '../domain/project.ts';
import { assemblyFrame } from './assemblyState.ts';
import { getState, setView, showAll, useDesign, useView } from './store.ts';
import { PartsList, PowerSummary } from './ToolsPanel.tsx';

function useAssembly(active: boolean) {
  const design = useDesign(), view = useView(), steps = assemblySteps(design);
  const count = steps.length, current = Math.min(count, view.step);
  const [playing, setPlaying] = useState(false), [custom, setCustom] = useState(false);
  const choose = (index: number) => {
    setCustom(false);
    setView({ ...assemblyFrame(steps, index), mode: '3d', isolate: false });
  };
  useEffect(() => { if (!active) setPlaying(false); }, [active]);
  useEffect(() => { if (view.step === ALL_STEPS && view.layers.every(Boolean)) setCustom(false); }, [view.step,view.layers]);
  useEffect(() => {
    if (!playing || !active) return;
    const timer = setInterval(() => {
      const next = Math.min(count, getState().view.step + 1);
      choose(next);
      if (next >= count) setPlaying(false);
    }, 1400);
    return () => clearInterval(timer);
  }, [playing, active, count, design]);
  return { steps, current, playing, custom, choose, setCustom,
    togglePlay: () => {
      if (!playing && current >= count) choose(1);
      setPlaying(!playing);
    },
    complete: () => { setPlaying(false); setCustom(false); showAll(); },
  };
}
const AssemblyContext = createContext<ReturnType<typeof useAssembly> | null>(null);
export function AssemblyProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const value = useAssembly(active);
  return <AssemblyContext.Provider value={value}>{children}</AssemblyContext.Provider>;
}
function useAssemblyContext() {
  const value = useContext(AssemblyContext);
  if (!value) throw Error('Assembly provider is missing.');
  return value;
}
export function AssemblySteps() {
  const { steps, current, choose } = useAssemblyContext();
  return <section className="assembly-steps"><div className="panel-heading"><span className="eyebrow">BUILD SEQUENCE</span><h2>From frame to finish.</h2></div>
    <ol>{steps.map((step, i) => <li key={step.id}><button aria-current={current === i + 1 ? 'step' : undefined}
      onClick={() => choose(i + 1)}><span className="step-number">{String(i + 1).padStart(2, '0')}</span>{step.title}</button></li>)}</ol>
    <p className="muted rail-note">An explanatory sequence, not an approved workshop procedure.</p></section>;
}
export function AssemblyControls() {
  const { steps, current, choose, playing, togglePlay, complete, custom } = useAssemblyContext();
  const view = useView();
  return <div className="assembly-controls">
    <div className="assembly-transport"><button disabled={current <= 1} onClick={() => choose(current - 1)} aria-label="Previous assembly step">←</button>
      <button className="transport-play" onClick={togglePlay}>{playing ? 'Ⅱ Pause' : current >= steps.length ? '↻ Replay assembly' : '▶ Play assembly'}</button>
      <button disabled={current >= steps.length} onClick={() => choose(current + 1)} aria-label="Next assembly step">→</button>
      <span className="muted">{custom ? 'Custom layers' : current + ' / ' + steps.length}</span>
    </div>
    <label className="timeline-slider"><span className="sr-only">Assembly step</span><input type="range" min={1} max={steps.length} value={current} onChange={e => choose(+e.target.value)} /></label>
    <div className="assembly-bottom"><label>Explode <input type="range" min={0} max={100} value={view.explode} onChange={e => setView({ explode: +e.target.value })} /><output>{view.explode}%</output></label>
      <button className="text-button" onClick={complete}>Show complete assembly</button></div>
  </div>;
}
export function AssemblyDetails() {
  const { steps, current, custom, setCustom } = useAssemblyContext(), design = useDesign(), view = useView();
  const step = steps[current - 1], parts = bom(design).filter(row => step.adds.includes(row.layer));
  return <section className="assembly-details"><span className="eyebrow">CURRENT STEP · {current} / {steps.length}</span>
    <h2>{step.title}</h2><p className="muted">{step.description}</p>
    {!!parts.length && <><h3>Parts at this step</h3><table className="stack"><tbody>{parts.map((part,i) => <tr key={i}><td>{part.item}<small>{part.material}</small></td><td>{part.estimate ? '≈ ' : ''}{part.qty.toFixed(part.unit === 'pcs' ? 0 : 2)} {part.unit}</td></tr>)}</tbody></table></>}
    <div className="sectionlabel">VISIBLE LAYERS {custom && '· CUSTOM'}</div><div className="layer-list">{LAYERS.filter(layer => layer.id !== 'backing' || design.settings.backing > 0).map(layer => {
      const i = LAYERS.indexOf(layer);
      return <label className="check" key={layer.id}><input type="checkbox" checked={view.layers[i] !== false}
        onChange={e => { const value = e.target.checked; setCustom(true); setView({ step: ALL_STEPS, layers: view.layers.map((x,j) => j === i ? value : x) }); }} />{layer.name}</label>;
    })}</div><details className="property-details"><summary>Quantities & power estimates</summary><PowerSummary /><PartsList /></details>
  </section>;
}
