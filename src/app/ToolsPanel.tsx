import { useEffect, useState } from 'react';
import {
  checkSettings,
  LAYER_COUNT,
  LAYERS,
  numericSettings,
  type DesignSettings,
  type NumericKey,
} from '../domain/project.ts';
import { readUpload, textArtworkURL } from '../artwork/import.ts';
import { boardStack, computeLayout, MODULE_W, PSU_LOADING, PSU_W } from '../domain/layout.ts';
import { bom } from '../domain/bom.ts';
import { kelvinToHex, LED_TEMPS } from '../domain/lighting.ts';
import { hasBackup, importImage, importSvg, restoreBackup, retrace, setMode } from './actions.ts';
import {
  editDesign,
  getState,
  say,
  setTrace,
  setView,
  showAll,
  useApp,
  useDesign,
  useView,
} from './store.ts';
import { assemblySteps } from '../domain/assembly.ts';
import { MakePanel } from './MakePanel.tsx';

export function ToolsPanel() {
  const [tab, setTab] = useState<'art' | 'board' | 'build' | 'make'>('art');
  const [backup] = useState(hasBackup);
  return (
    <aside className="tools">
      <div className="tabs">
        {(
          [
            ['art', '01 Artwork'],
            ['board', '02 Board'],
            ['build', '03 Build'],
            ['make', '04 Make'],
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
      {tab === 'make' && <MakePanel />}
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
        <small>SVG (exact vectors), PNG, JPG or WebP · up to 8 MB</small>
        <input
          type="file"
          accept="image/svg+xml,.svg,image/png,image/jpeg,image/webp"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const up = await readUpload(file);
              if ('svg' in up) importSvg(up.svg);
              else {
                await importImage(up.url);
                URL.revokeObjectURL(up.url);
              }
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
        {artwork?.origin === 'vector' ? (
          <>
            <b>Vector artwork.</b> Outlines come straight from the SVG: exact curves, holes and the file's
            groups. Trace settings don't apply.
          </>
        ) : (
          <>
            <b>Traced artwork.</b> PNG/JPG/WebP are reconstructed from pixels and can't guarantee the original
            curves or font; upload an SVG when you have one. Review small details and holes.
          </>
        )}{' '}
        No production toolpaths or automatic fabrication approval. Re-importing is undoable.
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
      <div className="pair">{(['acp', 'gi', 'frame', 'framewall'] as const).map(num)}</div>
      {num('backing')}
      <StackTable settings={draft} />
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
        Board layers only. Letter depths, gauges and standoffs belong to each artwork group's construction —
        edit them in the inspector. Dimensions are nominal; structure, face retention, bend allowance and
        electrical loading are not engineered here.
      </div>
    </section>
  );
}

function BuildPanel() {
  const view = useView(),
    design = useDesign(),
    steps = assemblySteps(design),
    n = steps.length,
    current = Math.min(view.step, n),
    st = steps[current - 1];
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const next = Math.min(n, Math.min(getState().view.step, n) + 1);
      setView({ step: next });
      if (next >= n) setPlaying(false);
    }, 1400);
    return () => clearInterval(t);
  }, [playing, n]);
  const step = (k: number) => setView({ step: Math.max(1, Math.min(n, k)) });
  const parts = bom(design).filter((r) => st.adds.includes(r.layer));
  return (
    <section className="panel active">
      <div className="eyebrow">INSPECT THE ASSEMBLY</div>
      <h2>Piece by piece.</h2>
      <LightingControls />
      <div className="sectionlabel">ASSEMBLY STEPS</div>
      <label>
        Step{' '}
        <output>
          {current} / {n}
        </output>
        <input type="range" min={1} max={n} value={current} onChange={(e) => step(+e.target.value)} />
      </label>
      <div className="row">
        <button onClick={() => step(current - 1)}>← Previous</button>
        <button onClick={() => step(current + 1)}>Next →</button>
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
        {playing ? 'Pause assembly' : current >= n ? 'Replay assembly' : 'Play assembly'}
      </button>
      <div className="callout">
        <b>
          {current}. {st.title}.
        </b>{' '}
        {st.description}
        {st.dependsOn.length > 0 && (
          <small className="deps">
            After: {st.dependsOn.map((d) => steps.find((x) => x.id === d)?.title).join(', ')}
          </small>
        )}
        {parts.length > 0 && (
          <table className="stack">
            <tbody>
              {parts.map((r, i) => (
                <tr key={i}>
                  <td>
                    {r.item}
                    <small>{r.material}</small>
                  </td>
                  <td>
                    {r.estimate ? '≈ ' : ''}
                    {r.unit === 'pcs' ? r.qty : r.qty.toFixed(2)} {r.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
      <div className="sectionlabel">LAYERS</div>
      <div id="layertoggles">
        {LAYERS.map(({ name: n }, i) => (
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
      <p className="muted">Rear to front. An explanatory sequence, not an approved workshop procedure.</p>
      <PowerSummary />
      <PartsList />
    </section>
  );
}

// Board layers with z positions; z = 0 is the centre of the steel frame.
function StackTable({ settings }: { settings: DesignSettings }) {
  const { layers, front } = boardStack(settings);
  return (
    <table className="stack">
      <tbody>
        {layers.map((l) => (
          <tr key={l.layer}>
            <td>{l.name}</td>
            <td>{+(l.z1 - l.z0).toFixed(2)} mm</td>
          </tr>
        ))}
        <tr>
          <td>
            <b>Board depth</b>
          </td>
          <td>
            <b>{+(front - layers[0].z0).toFixed(2)} mm</b>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// Independent controls: LED colour is part of the design (undoable); dimming and exposure are view only.
function LightingControls() {
  const view = useView(),
    ledTemp = useDesign().settings.ledTemp;
  return (
    <>
      <div className="sectionlabel">LIGHTING</div>
      <label>
        LED colour
        <select
          value={ledTemp}
          onChange={(e) =>
            editDesign(
              (d) => ({ ...d, settings: { ...d.settings, ledTemp: +e.target.value } }),
              `LED colour set to ${e.target.value} K.`,
            )
          }
        >
          {(LED_TEMPS as readonly number[]).includes(ledTemp) ? null : (
            <option value={ledTemp}>{ledTemp} K</option>
          )}
          {LED_TEMPS.map((k) => (
            <option key={k} value={k}>
              {k} K {k <= 3000 ? 'warm white' : k <= 4000 ? 'neutral white' : 'cool white'}
            </option>
          ))}
        </select>
        <i className="swatch" style={{ background: kelvinToHex(ledTemp) }} />
      </label>
      <label>
        Dimming <output>{Math.round(view.dimming * 100)}%</output>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={view.dimming}
          onChange={(e) => setView({ dimming: +e.target.value })}
        />
      </label>
      <label>
        Camera exposure{' '}
        <output>
          {view.exposure > 0 ? '+' : ''}
          {view.exposure} EV
        </output>
        <input
          type="range"
          min={-2}
          max={2}
          step={0.25}
          value={view.exposure}
          onChange={(e) => setView({ exposure: +e.target.value })}
        />
      </label>
      <p className="muted">
        Time of day and sign power are above the scene. Emission doesn't change with time of day; the camera
        exposes for the surroundings, as a photo would. Presentation preview, not calibrated against photos.
      </p>
    </>
  );
}

function PowerSummary() {
  const p = computeLayout(useDesign()).power;
  if (!p.cables.length) return null;
  return (
    <>
      <div className="sectionlabel">POWER (PLACEHOLDER RATINGS)</div>
      <table className="stack">
        <tbody>
          <tr>
            <td>
              Connected load
              <small>{MODULE_W} W per module</small>
            </td>
            <td>≈ {p.loadW.toFixed(0)} W</td>
          </tr>
          <tr>
            <td>
              Power supplies
              <small>
                {PSU_W} W each, ≤ {PSU_LOADING * 100}% loading
              </small>
            </td>
            <td>{p.psus.length}</td>
          </tr>
          <tr>
            <td>Cable runs</td>
            <td>{p.cables.length}</td>
          </tr>
        </tbody>
      </table>
      {p.warnings.map((w) => (
        <div key={w} className="callout warn">
          {w}
        </div>
      ))}
    </>
  );
}

function PartsList() {
  const design = useDesign();
  const rows = bom(design);
  const fmt = (q: number, unit: string) => (unit === 'pcs' ? q : q.toFixed(2)) + ' ' + unit;
  return (
    <>
      <div className="sectionlabel">PARTS (PRELIMINARY)</div>
      <table className="stack parts">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} title={r.material + ' · ' + r.note}>
              <td>
                {r.item}
                <small>{r.material}</small>
              </td>
              <td>
                {r.estimate ? '≈ ' : ''}
                {fmt(r.qty, r.unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Nominal quantities: no waste, seams, joining allowances or nesting. ≈ marks placeholder rules (LED
        grid, fixings, returns without allowance).
      </p>
    </>
  );
}
