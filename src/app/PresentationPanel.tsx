import { useEffect, useState } from 'react';
import { recipes } from '../domain/recipes.ts';
import { viewer } from './actions.ts';
import { useDesign, useView } from './store.ts';

export function PresentationPanel() {
  const design = useDesign(), view = useView();
  const [compare, setCompare] = useState(false), [summary, setSummary] = useState(false);
  const [images, setImages] = useState<string[] | null>(null), [error, setError] = useState('');
  useEffect(() => {
    if (!compare) { setImages(null); return; }
    let live = true;
    setError(''); setImages(null);
    const timer = requestAnimationFrame(() => {
      try {
        if (!viewer.current?.state) throw Error('3D preview is not ready. Try again.');
        const shots = (['day','night'] as const).map(env => viewer.current!.renderStill(1400,700,env));
        if (live) setImages(shots);
      } catch (err) { if (live) setError((err as Error).message); }
    });
    return () => { live = false; cancelAnimationFrame(timer); };
  },[compare, design, view.lights, view.dimming, view.exposure, view.scenePreset]);
  return <div className={'presentation-panel' + (compare ? ' comparing' : '')}>
    <div className="presentation-toolbar"><div><span className="eyebrow">SIGN CONCEPT</span><h1>Kirat Creations</h1></div>
      <div className="row"><button aria-pressed={compare} onClick={() => setCompare(!compare)}>{compare ? 'Single view' : 'Compare day / night'}</button><button aria-expanded={summary} onClick={() => setSummary(!summary)}>Construction summary</button></div></div>
    {compare && <div className="presentation-comparison">{images ? images.map((url,i) => <figure key={i}><img src={url} alt={(i===0?'Day':'Night')+' sign concept'} /><figcaption>{i===0?'DAY':'NIGHT'}</figcaption></figure>) :
      <div className="empty-state">{error || 'Preparing comparison…'}{error && <button onClick={()=>{setCompare(false);}}>Return to single view</button>}</div>}</div>}
    {summary && <div className="presentation-summary"><h3>Construction</h3>{design.artwork?.groups.map(group=><p key={group.id}><b>{group.name}</b><span>{recipes[group.type].name}</span></p>)}<small>{design.settings.width} × {design.settings.height} mm · {design.settings.ledTemp} K white LED default</small></div>}
    <p className="presentation-note">Concept visualisation · Lighting not calibrated · Not for fabrication</p>
  </div>;
}
