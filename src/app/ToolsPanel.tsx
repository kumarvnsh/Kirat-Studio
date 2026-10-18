import { useEffect, useState } from 'react';
import {
  checkSettings,
  LAYER_COUNT,
  numericSettings,
  type DesignSettings,
  type NumericKey,
} from '../domain/project.ts';
import { textArtworkURL, uploadURL } from '../artwork/import.ts';
import { layerNames } from '../scene/scene.js';
import { hasBackup, importImage, restoreBackup, retrace, setMode } from './actions.ts';
import { editDesign, say, setTrace, setView, showAll, useApp, useDesign, useView } from './store.ts';

const stepDescriptions = [
  'GI panels close the rear of the steel frame. The 0.8 mm starting thickness is an editable assumption.',
  'Hollow steel profiles form the support. Section and wall thickness need project engineering.',
  'The ACP fascia sits in front of the frame. Panel seams and fixings are not detailed in this prototype.',
  'Individual letter backs follow the reviewed outlines, including counters.',
  'Outer and inner return walls use nominal depth and gauge; no profile-lock or joining compensation.',
  'LED bodies are symbolic positions—not a manufacturer layout or electrical calculation.',
  'Faces and graphics complete the sign. Day/night illumination is a visual approximation.',
];

export function ToolsPanel() {
  const [tab, setTab] = useState<'art' | 'board' | 'build'>('art');
  const [backup] = useState(hasBackup);
  return (
    <aside className="tools">
      <div className="tabs">
        {(
          [
            ['art', '01 Artwork'],
            ['board', '02 Board'],
            ['build', '03 Build'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'art' && <ArtworkPanel />}
      {tab === 'board' && <BoardPanel />}
      {tab === 'build' && <BuildPanel />}
      <div className="toolfooter">
        <a href="https://kirat-signage-atlas.kumarvnsh.chatgpt.site" target="_blank" rel="noopener">
          Open research atlas ↗
        </a>
        <small>Projects autosave in this browser. Save a file to keep a copy.</small>
        {backup && (
          <button className="full" onClick={restoreBackup}>
            Restore previous session
          </button>
        )}
      </div>
    </aside>
  );
}

function ArtworkPanel() {
  const trace = useApp((s) => s.trace);
  const artwork = useDesign().artwork;
  const [text, setText] = useState('Kirat Creations');
  const [showText, setShowText] = useState(false);
  const crop = (k: keyof typeof trace.crop, label: string, min: number) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={k === 'w' || k === 'h' ? 100 : 95}
        value={trace.crop[k]}
        onChange={(e) => setTrace({ crop: { ...trace.crop, [k]: +e.target.value } })}
      />
    </label>
  );
  return (
    <section className="panel active">
      <div className="eyebrow">START WITH YOUR ARTWORK</div>
      <h2>Logo to layers.</h2>
      <p className="muted">Upload artwork, review the trace, then choose how each group is made.</p>
      <label className="uploadzone">
        <span>＋</span>
        <b>Upload logo</b>
        <small>PNG, JPG, WebP or SVG · up to 8 MB</small>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const url = await uploadURL(file);
              await importImage(url);
              URL.revokeObjectURL(url);
            } catch (err) {
              say((err as Error).message);
            }
          }}
        />
      </label>
      <div className="row">
        <button onClick={() => importImage('kirat-reference.png', true)}>Kirat sample</button>
        <button onClick={() => setShowText(!showText)}>Type text</button>
      </div>
      {showText && (
        <div>
          <label>
            Sample text
            <input value={text} maxLength={40} onChange={(e) => setText(e.target.value)} />
          </label>
          <button onClick={() => importImage(textArtworkURL(text || 'Kirat Creations'))}>
            Generate text artwork
          </button>
        </div>
      )}
      <div className="sectionlabel">TRACE SETTINGS</div>
      <label>
        Background to remove
        <select value={trace.background} onChange={(e) => setTrace({ background: e.target.value })}>
          <option value="white">White / near-white</option>
          <option value="corner">Colour at top-left pixel</option>
          <option value="black">Black / near-black</option>
          <option value="alpha">Keep all opaque pixels</option>
        </select>
      </label>
      <label>
        Background tolerance <output>{trace.threshold}</output>
        <input
          type="range"
          min={5}
          max={150}
          value={trace.threshold}
          onChange={(e) => setTrace({ threshold: +e.target.value })}
        />
      </label>
      <label>
        Small-shape filter (pixels)
        <input
          type="number"
          min={3}
          max={500}
          value={trace.minpixels}
          onChange={(e) => setTrace({ minpixels: +e.target.value })}
        />
      </label>
      <details>
        <summary>Crop artwork (%)</summary>
        <div className="pair">
          {crop('x', 'Left', 0)}
          {crop('y', 'Top', 0)}
          {crop('w', 'Width', 5)}
          {crop('h', 'Height', 5)}
        </div>
      </details>
      <button className="full accent" onClick={retrace}>
        Trace &amp; rebuild
      </button>
      <label className="check">
        <input
          type="checkbox"
          checked={!!artwork?.approved}
          disabled={!artwork}
          onChange={(e) =>
            editDesign((d) => ({ ...d, artwork: d.artwork && { ...d.artwork, approved: e.target.checked } }))
          }
        />{' '}
        I reviewed the traced shapes
      </label>
      <div className="callout">
        Raster and SVG uploads use a raster-to-contour draft in this version. Review small details and holes.
        No OCR, production toolpaths or automatic fabrication approval. Retracing is undoable.
      </div>
    </section>
  );
}

function BoardPanel() {
  const settings = useDesign().settings;
  const [draft, setDraft] = useState<DesignSettings>(settings);
  useEffect(() => setDraft(settings), [settings]); // undo/redo/open refresh the form
  const set = <K extends keyof DesignSettings>(k: K, v: DesignSettings[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const num = (k: NumericKey) => {
    const r = numericSettings[k];
    return (
      <label key={k}>
        {r.label}
        <input
          type="number"
          min={r.min}
          max={r.max}
          step={r.step}
          value={draft[k]}
          onChange={(e) => set(k, +e.target.value)}
        />
      </label>
    );
  };
  const update = () => {
    const bad = checkSettings(draft);
    if (bad) return say(bad);
    editDesign(
      (d) => ({ ...d, settings: draft }),
      'Geometry updated using nominal dimensions. Review fit and construction before production.',
    );
  };
  return (
    <section className="panel active">
      <div className="eyebrow">ASSEMBLY SETTINGS / mm</div>
      <h2>The supporting structure.</h2>
      <div className="pair">{(['width', 'height'] as const).map(num)}</div>
      <label>
        {numericSettings.artscale.label} <output>{draft.artscale}%</output>
        <input
          type="range"
          min={20}
          max={94}
          value={draft.artscale}
          onChange={(e) => set('artscale', +e.target.value)}
        />
      </label>
      <div className="pair">
        {(['acp', 'gi', 'frame', 'framewall', 'depth', 'gauge', 'face', 'back'] as const).map(num)}
      </div>
      <label>
        ACP finish
        <input type="color" value={draft.boardcolor} onChange={(e) => set('boardcolor', e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={draft.keepart} onChange={(e) => set('keepart', e.target.checked)} />{' '}
        Preserve artwork colours on faces
      </label>
      <label>
        Uniform face colour
        <input type="color" value={draft.facecolor} onChange={(e) => set('facecolor', e.target.value)} />
      </label>
      <button className="full accent" onClick={update}>
        Update geometry
      </button>
      <div className="callout">
        Frame section, GI gauge and other starting values are editable assumptions. Dimensions are nominal;
        this prototype does not engineer structure, face retention, bend allowance or electrical loading.
      </div>
    </section>
  );
}

function BuildPanel() {
  const view = useView();
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setView((v) => {
        if (v.step >= LAYER_COUNT) setPlaying(false);
        return { step: Math.min(LAYER_COUNT, v.step + 1) };
      });
    }, 1100);
    return () => clearInterval(t);
  }, [playing]);
  const step = (n: number) => setView({ step: Math.max(1, Math.min(LAYER_COUNT, n)) });
  return (
    <section className="panel active">
      <div className="eyebrow">INSPECT THE ASSEMBLY</div>
      <h2>Piece by piece.</h2>
      <label>
        Illumination preview <output>{Math.round(view.brightness * 100)}%</output>
        <input
          type="range"
          min={0.3}
          max={2}
          step={0.05}
          value={view.brightness}
          onChange={(e) => setView({ brightness: +e.target.value })}
        />
      </label>
      <p className="muted">
        Relative visual brightness. This does not change module wattage or calculate light output.
      </p>
      <label>
        Assembly stage{' '}
        <output>
          {view.step} / {LAYER_COUNT}
        </output>
        <input
          type="range"
          min={1}
          max={LAYER_COUNT}
          value={view.step}
          onChange={(e) => step(+e.target.value)}
        />
      </label>
      <div className="row">
        <button onClick={() => step(view.step - 1)}>← Previous</button>
        <button onClick={() => step(view.step + 1)}>Next →</button>
      </div>
      <button
        className="full accent"
        onClick={() => {
          if (!playing) {
            setMode('3d');
            step(1);
          }
          setPlaying(!playing);
        }}
      >
        {playing ? 'Pause assembly' : 'Play assembly'}
      </button>
      <label>
        Exploded view <output>{view.explode}%</output>
        <input
          type="range"
          min={0}
          max={100}
          value={view.explode}
          onChange={(e) => setView({ explode: +e.target.value })}
        />
      </label>
      <div className="callout">{stepDescriptions[view.step - 1]}</div>
      <div className="sectionlabel">LAYERS</div>
      <div id="layertoggles">
        {layerNames.map((n: string, i: number) => (
          <label key={n}>
            <input
              type="checkbox"
              checked={view.layers[i] !== false}
              onChange={(e) =>
                setView((v) => ({ layers: v.layers.map((x, j) => (j === i ? e.target.checked : x)) }))
              }
            />
            {n}
          </label>
        ))}
      </div>
      <button
        className="full"
        onClick={() => {
          setPlaying(false);
          showAll();
        }}
      >
        Show complete assembly
      </button>
      <p className="muted">
        GI rear cover → steel frame → ACP → letter backs → returns → symbolic LEDs → faces. This is an
        explanatory sequence, not an approved workshop procedure.
      </p>
    </section>
  );
}
