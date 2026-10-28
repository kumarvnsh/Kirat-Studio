import { TracePreview } from './TracePreview.tsx';
import { Dialog } from './Dialog.tsx';
import { boardArt, boardColours, readAi, suggestedExclude, type AiArtboard } from '../artwork/ai.ts';
import { rasterSource } from './actions.ts';
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
import { readUpload, textArtworkURL, loadImage, defaultTrace } from '../artwork/import.ts';
import { boardStack, computeLayout, MODULE_W, PSU_LOADING, PSU_W } from '../domain/layout.ts';
import { bom } from '../domain/bom.ts';
import { kelvinToHex, LED_TEMPS } from '../domain/lighting.ts';
import {
  applySceneChanges,
  hasBackup,
  importAiBoard,
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
  const [previewOptions, setPreviewOptions] = useState(defaultTrace());
  const [previewImage, setPreviewImage] = useState<HTMLImageElement | null>(null);
  const [aiBoards, setAiBoards] = useState<{ boards: AiArtboard[]; preferred: number } | null>(null);
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
      {previewImage && (
        <TracePreview
          image={previewImage}
          initial={previewOptions}
          onClose={() => setPreviewImage(null)}
        />
      )}
      {aiBoards && (
        <AiBoardPicker
          {...aiBoards}
          onClose={() => setAiBoards(null)}
          onPick={(b, exclude, useBackground) => {
            setAiBoards(null);
            importAiBoard(b, exclude, useBackground);
          }}
        />
      )}
      <div className="eyebrow">START WITH YOUR ARTWORK</div>
      <h2>Logo to layers.</h2>
      <p className="muted">Upload artwork, review the trace, then choose how each group is made.</p>
      <div className="upload-area">
        <button className="uploadzone" onClick={() => uploadRef.current?.click()}>
          <span>＋</span>
          <b>Upload logo</b>
          <small>AI or SVG (exact vectors), PNG, JPG or WebP · up to 8 MB (AI 50 MB)</small>
        </button>
        <input
          ref={uploadRef}
          type="file"
          accept=".ai,application/postscript,application/illustrator,image/svg+xml,.svg,image/png,image/jpeg,image/webp"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const up = await readUpload(file);
              if ('ai' in up) {
                const r = await readAi(up.ai);
                // One artboard, nothing to leave out and no board colour to confirm: import straight away.
                if (r.boards.length === 1 && !suggestedExclude(r.boards[0]).length && !r.boards[0].background)
                  importAiBoard(r.boards[0]);
                else setAiBoards(r);
              } else if ('svg' in up) importSvg(up.svg);
              else {
                try {
                  setPreviewOptions(defaultTrace());
                  setPreviewImage(await loadImage(up.url));
                } finally {
                  URL.revokeObjectURL(up.url);
                }
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
      {!vectorSource && (
        <>
          <div className="sectionlabel">TRACE SETTINGS</div>
          <label>
            Background to remove
            <select
              value={trace.background}
              onChange={(e) => setTrace({ background: e.target.value })}
            >
              <option value="auto">Auto background</option>
              <option value="custom">Chosen colour (preview)</option>
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
          <button
            className="full accent"
            onClick={() => {
              const image = rasterSource();
              if (image) {
                setPreviewOptions(trace);
                setPreviewImage(image);
              } else say('Upload the original image again to review its trace.');
            }}
          >
            Trace &amp; rebuild
          </button>
        </>
      )}
      {artwork && (
        <div className="source-summary">
          <b>{vectorSource ? 'SVG · Original vectors' : 'Traced artwork'}</b>
          <p>
            {artwork.elements.length} shapes · {artwork.groups.length} groups
          </p>
          <button
            onClick={() => {
              setMode('2d');
              onReview?.();
            }}
          >
            Review outlines →
          </button>
        </div>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={!!artwork?.approved}
          disabled={!artwork}
          onChange={(e) =>
            editDesign((d) => ({
              ...d,
              artwork: d.artwork && { ...d.artwork, approved: e.target.checked },
            }))
          }
        />{' '}
        I reviewed the artwork outlines
      </label>
      <div className="callout">
        {artwork?.origin === 'vector' ? (
          <>
            <b>Vector artwork.</b> Outlines come straight from the SVG: exact curves, holes and the
            file's groups. Trace settings don't apply.
          </>
        ) : (
          <>
            <b>Traced artwork.</b> PNG/JPG/WebP are reconstructed from pixels and can't guarantee
            the original curves or font; upload an SVG when you have one. Review small details and
            holes.
          </>
        )}{' '}
        No production toolpaths or automatic fabrication approval. Re-importing is undoable.
      </div>
    </section>
  );
}

// Illustrator import: pick the artboard that becomes the board, and leave out size labels.
// Click shapes in the preview to remove or restore them before importing.
function AiBoardPicker({
  boards,
  preferred,
  onPick,
  onClose,
}: {
  boards: AiArtboard[];
  preferred: number;
  onPick: (b: AiArtboard, exclude: number[], useBackground: boolean) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState(preferred);
  const [exclude, setExclude] = useState(() => suggestedExclude(boards[preferred]));
  const [useBackground, setUseBackground] = useState(true);
  const mm = (v: number) => Math.round(v).toLocaleString();
  const board = boards[chosen],
    kept = boardArt(board, exclude),
    suggested = suggestedExclude(board);
  const choose = (i: number) => {
    setChosen(i);
    setExclude(suggestedExclude(boards[i]));
  };
  const toggle = (ids: number[], remove: boolean) =>
    setExclude(remove ? [...new Set([...exclude, ...ids])] : exclude.filter((i) => !ids.includes(i)));
  const colourIds = (c: string) => board.paths.flatMap((p, i) => (p.fill === c ? [i] : []));
  // Frame the preview on the shapes, not the whole artboard.
  const xs = board.paths.flatMap((p) => [p.bounds[0], p.bounds[2]]),
    ys = board.paths.flatMap((p) => [p.bounds[1], p.bounds[3]]),
    pad = (Math.max(...xs) - Math.min(...xs)) * 0.02,
    view = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad];
  return (
    <Dialog title="Import Illustrator artwork" onClose={onClose} wide>
      {boards.length > 1 && (
        <>
          <p className="muted">This file has {boards.length} artboards. The board is sized to the one you pick.</p>
          <div className="ai-boards" role="radiogroup" aria-label="Artboards">
            {boards.map((b, i) => (
              <button
                key={b.index}
                role="radio"
                aria-checked={i === chosen}
                className={'ai-board' + (i === chosen ? ' active' : '')}
                onClick={() => choose(i)}
              >
                <img
                  alt=""
                  src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(boardArt(b, suggestedExclude(b)).svg)}
                />
                <b>
                  Artboard {b.index + 1}
                  {i === preferred ? ' · document size' : ''}
                </b>
                <small>
                  Board {mm(b.widthMm)} × {mm(b.heightMm)} mm
                </small>
              </button>
            ))}
          </div>
        </>
      )}
      <h3 className="ai-subhead">Shapes to import</h3>
      <p className="muted">
        {suggested.length
          ? `${suggested.length} small shapes beside measuring lines look like size labels and are left out (shown faded). `
          : ''}
        Click any shape to remove it or bring it back.
      </p>
      <svg className="ai-pick" viewBox={view.join(' ')} role="group" aria-label="Artwork shapes">
        {board.paths.map((p, i) => {
          const out = exclude.includes(i);
          return (
            <path
              key={i}
              d={p.d}
              fill={p.fill}
              fillRule={p.evenodd ? 'evenodd' : 'nonzero'}
              className={out ? 'out' : ''}
              role="checkbox"
              aria-checked={!out}
              aria-label={`Shape ${i + 1}, ${p.fill}`}
              tabIndex={0}
              onClick={() => toggle([i], !out)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle([i], !out))}
            />
          );
        })}
      </svg>
      <div className="ai-colours">
        {boardColours(board).map((c) => {
          const ids = colourIds(c),
            on = ids.filter((i) => !exclude.includes(i)).length;
          return (
            <label key={c}>
              <input
                type="checkbox"
                checked={on === ids.length}
                ref={(el) => {
                  if (el) el.indeterminate = on > 0 && on < ids.length;
                }}
                onChange={(e) => toggle(ids, !e.target.checked)}
              />
              <span className="ai-swatch" style={{ background: c }} />
              {c} · {on}/{ids.length}
            </label>
          );
        })}
        {String([...exclude].sort((a, b) => a - b)) !== String(suggested) && (
          <button className="link" onClick={() => setExclude(suggested)}>
            Reset
          </button>
        )}
      </div>
      {board.background && (
        <label className="ai-colours">
          <input type="checkbox" checked={useBackground} onChange={(e) => setUseBackground(e.target.checked)} />
          <span className="ai-swatch" style={{ background: board.background }} />
          Use {board.background} from the file as the ACP board colour
        </label>
      )}
      <small className="muted">
        Board {mm(board.widthMm)} × {mm(board.heightMm)} mm · artwork {mm(kept.artWidthMm)} × {mm(kept.artHeightMm)} mm ·{' '}
        {kept.shapes} of {board.paths.length} shapes
      </small>
      <div className="modal-foot">
        <button onClick={onClose}>Cancel</button>
        <button className="accent" disabled={!kept.shapes} onClick={() => onPick(board, exclude, useBackground)}>
          Import artboard {board.index + 1}
        </button>
      </div>
    </Dialog>
  );
}
