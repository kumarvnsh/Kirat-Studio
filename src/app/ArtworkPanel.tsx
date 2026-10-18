import { useEffect, useRef, useState } from 'react';
import {
  checkSettings,
  defaultSettings,
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
import {
  applySceneChanges,
  hasBackup,
  importImage,
  importSvg,
  loadKiratSample,
  restoreBackup,
  retrace,
  setMode,
} from './actions.ts';
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
import { CrossSectionDiagram } from './ConstructionDiagram.tsx';
import { ScrubInput, UnitSelector } from './ScrubInput.tsx';
import { formatAllUnits, formatInUnit } from '../domain/units.ts';

export function ArtworkPanel({ onReview }: { onReview?: () => void } = {}) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const trace = useApp((s) => s.trace);
  const artwork = useDesign().artwork;
  const vectorSource = artwork?.origin === 'vector';
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
      <div className="upload-area"><button className="uploadzone" onClick={()=>uploadRef.current?.click()}>
        <span>＋</span>
        <b>Upload logo</b>
        <small>SVG (exact vectors), PNG, JPG or WebP · up to 8 MB</small></button>
        <input ref={uploadRef}
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
      </div>
      <div className="row">
        <button onClick={loadKiratSample}>Kirat sample</button>
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
      {!vectorSource && <>
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
      </>}
      {artwork && <div className="source-summary"><b>{vectorSource ? 'SVG · Original vectors' : 'Traced artwork'}</b><p>{artwork.elements.length} shapes · {artwork.groups.length} groups</p><button onClick={() => { setMode('2d'); onReview?.(); }}>Review outlines →</button></div>}
      <label className="check">
        <input
          type="checkbox"
          checked={!!artwork?.approved}
          disabled={!artwork}
          onChange={(e) =>
            editDesign((d) => ({ ...d, artwork: d.artwork && { ...d.artwork, approved: e.target.checked } }))
          }
        />{' '}
        I reviewed the artwork outlines
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
