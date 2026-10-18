import { selectionScope } from './selection.ts';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject, type ReactNode } from 'react';
import { SignScene } from '../scene/scene.ts';
import { inside } from '../artwork/contours.js';
import { loadImage } from '../artwork/import.ts';
import { constructionNames } from '../domain/project.ts';
import { environments, type Environment } from '../domain/lighting.ts';
import { computeLayout, sceneInput } from '../domain/layout.ts';
import { formatAllUnits, formatDimsAllUnits, formatDimsInUnit } from '../domain/units.ts';
import { fabricationPlan } from '../fabrication/plan.ts';
import { activeArtCanvas, setMode, viewer } from './actions.ts';
import { UnitSelector } from './ScrubInput.tsx';
import {
  clearSelection,
  getState,
  isolate,
  say,
  select,
  setView,
  toggleHidden,
  toggleSelect,
  showAll,
  useApp,
  useDesign,
  useView,
} from './store.ts';

export function Viewport({
  traceCanvas,
  leftOpen = true,
  rightOpen = true,
  onToggleLeft,
  onToggleRight,
  overlay, footer, taskMode = 'design', onPreviewSettings, onBackToFabrication,
}: {
  traceCanvas: RefObject<HTMLCanvasElement | null>;
  leftOpen?: boolean;
  rightOpen?: boolean;
  onToggleLeft?: () => void;
  onToggleRight?: () => void;
  overlay?: ReactNode; footer?: ReactNode; taskMode?: string; onPreviewSettings?: () => void; onBackToFabrication?: () => void;
}) {
  const design = useDesign(),
    view = useView(),
    message = useApp((s) => s.message);
  const host = useRef<HTMLDivElement>(null);
  const [no3d, setNo3d] = useState(false);
  // Decoded face artwork, tagged with the data URL it came from so we never build with a stale image.
  const [art, setArt] = useState<{ data: string; canvas: HTMLCanvasElement } | null>(null);
  const artwork = design.artwork;
  const ready = !!artwork && art?.data === artwork.imageData;

  useEffect(() => {
    try {
      viewer.current = new SignScene(host.current!, (id: string | null, add: boolean) => {
        if (!id) clearSelection();
        else if (add) toggleSelect(id);
        else select(id);
      });
    } catch (e) {
      console.error(e);
      setNo3d(true);
      setView({ mode: '2d' });
      say('3D unavailable. Use 2D trace review on this device.');
    }
  }, []);

  useEffect(() => {
    if (!artwork) return;
    let live = true;
    loadImage(artwork.imageData).then((img) => {
      const canvas = document.createElement('canvas');
      canvas.width = artwork.imageWidth;
      canvas.height = artwork.imageHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      if (live) {
        activeArtCanvas.current = canvas;
        setArt({ data: artwork.imageData, canvas });
      }
    });
    return () => {
      live = false;
    };
  }, [artwork?.imageData]);

  // Full rebuild when design geometry, artwork texture, or 3D/bend mode changes.
  const bendTarget = view.mode === 'bend' ? view.selected : null;
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    if (!ready && artwork) return;
    v.build(sceneInput(design, getState().view), ready ? art!.canvas : null);
  }, [design, ready, art, artwork, view.mode, bendTarget]);

  // Fast environment & camera exposure update (no geometry rebuild).
  useEffect(() => {
    if (viewer.current?.state) viewer.current.setEnvironment(sceneInput(design, view));
  }, [ready, design, view.environment, view.exposure]);

  // Fast master lighting & dimming update (no geometry rebuild).
  useEffect(() => {
    if (viewer.current?.state) viewer.current.setLighting(sceneInput(design, view));
  }, [ready, design, view.lights, view.dimming]);

  // Fast forming study strip update when scrubbing bend progress (no full board rebuild).
  useEffect(() => {
    if (ready && view.mode === 'bend' && viewer.current?.state) {
      viewer.current.buildBend(sceneInput(design, view));
    }
  }, [ready, design, view.mode, view.bend, view.bendStrip]);

  // Cheap visibility pass: stage, layers, explode, isolation, selection.
  useEffect(() => {
    const v = viewer.current;
    if (!v?.state) return;
    v.state = sceneInput(design, view);
    v.setVisibility(v.state);
  }, [
    ready,
    design,
    view.step,
    view.layers,
    view.explode,
    view.isolate,
    view.selected,
    view.selectionActive,
    view.presentation,
    view.selection,
    view.hidden,
  ]);

  // Reframe when what's on screen changes shape.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      viewer.current?.resize();
      viewer.current?.fit();
    }, 60);
    return () => clearTimeout(t);
  }, [ready, art, view.mode, view.isolate, view.presentation]);

  const [traceZoom, setTraceZoom] = useState(1);
  const scope = selectionScope(artwork, view);
  const selected = artwork?.elements.find((e) => e.id === view.selected);
  const group = selected && artwork?.groups.find((g) => g.id === selected.group);
  const s = design.settings,
    unit = view.unit ?? 'mm',
    layout = computeLayout(design),
    placed = selected ? layout.elements.find((e) => e.id === selected.id) : undefined,
    placedW = placed ? placed.bounds[2] - placed.bounds[0] : 0,
    placedH = placed ? placed.bounds[3] - placed.bounds[1] : 0,
    placedD = placed && placed.parts.length ? Math.max(...placed.parts.map((p) => p.z1)) - placed.base : 0,
    placedDims =
      placed && placed.parts.length
        ? `${formatDimsAllUnits(placedW, placedH)} · Depth ${formatAllUnits(placedD)}`
        : null;

  return <main className="studio-canvas">
      <div className="viewportbar">
        <div className="viewbar-left">
          {onToggleLeft && !view.presentation && <button className="panel-toggle" aria-label="Toggle layers panel" onClick={onToggleLeft}>◧</button>}
          {view.mode === 'bend' ? <button onClick={onBackToFabrication}>← Back to fabrication</button> : !overlay && <div className="viewtabs">
            <button className={view.mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}>3D view</button>
            {!view.presentation && <button className={view.mode === '2d' ? 'active' : ''} onClick={() => setMode('2d')}>2D outlines</button>}
          </div>}
        </div>
        <div className="lightingbuttons">
          {!overlay && <>
          <select aria-label="Time of day" value={view.environment} onChange={e => setView({ environment: e.target.value as Environment })}>
            {(Object.keys(environments) as Environment[]).map(env => <option key={env} value={env}>{environments[env].label}</option>)}
          </select>
          <button aria-pressed={view.lights} className={view.lights ? 'poweron' : ''} onClick={() => setView({ lights: !view.lights })}>{view.lights ? '● Lights on' : '○ Lights off'}</button>
          {!view.presentation && <button className="preview-settings-button" aria-label="Preview settings" onClick={onPreviewSettings}>⚙</button>}
          </>}
          {onToggleRight && !view.presentation && <button className="panel-toggle" aria-label="Toggle properties panel" onClick={onToggleRight}>◨</button>}
        </div>
      </div>
      <div id="viewport" className={overlay ? 'has-workspace-overlay' : ''}>
        <div id="threehost" ref={host} hidden={view.mode === '2d' || !!overlay} />
        <TraceView canvasRef={traceCanvas} art={ready ? art!.canvas : null} hidden={view.mode !== '2d' || !!overlay} zoom={traceZoom} />
        {overlay ? <div className="workspace-overlay">{overlay}</div> : <>
        {!artwork && <div id="loading"><h2>Your next sign starts here.</h2><p>Import artwork or load the Kirat sample.</p></div>}
        {no3d && view.mode !== '2d' && <div id="fallback">3D is unavailable. Switch to 2D outlines to continue.</div>}
        {!view.presentation && <div className="viewbadge"><span>{view.mode === '2d' ? (artwork?.origin === 'vector' ? 'ORIGINAL VECTOR OUTLINES' : 'TRACED ARTWORK OUTLINES') : view.mode === 'bend' ? 'GEOMETRIC FORMING STUDY' : 'SIGN PREVIEW'}</span></div>}
        {scope.ids.length > 0 && view.selectionActive && !view.presentation && <div id="selectionbadge"><b>{scope.label}</b><span>{scope.kind === 'group' ? 'Group · ' + scope.ids.length + ' shapes' : scope.kind === 'multiple' ? 'Multiple selection' : group?.name}</span>
          <button title="Frame selection" onClick={() => viewer.current?.focusSelection()}>Frame</button></div>}
        {view.isolate && !view.presentation && <div id="isolationbar"><span>Isolated: {scope.label}</span><button onClick={() => showAll()}>Show all · Esc</button></div>}
        <div className="camera">
          {view.mode !== '2d' && <select aria-label="Camera view" defaultValue="perspective" onChange={e => viewer.current?.fit(e.target.value as 'front' | 'perspective' | 'rear' | 'side' | 'top')}>
            <option value="front">Front</option><option value="perspective">Perspective</option><option value="side">Side</option><option value="top">Top</option><option value="rear">Rear</option></select>}
          <button aria-label="Zoom out" onClick={() => view.mode === '2d' ? setTraceZoom(z => Math.max(.25,z/1.25)) : viewer.current?.zoom(1.25)}>−</button>
          <button onClick={() => view.mode === '2d' ? setTraceZoom(1) : viewer.current?.fit()}>Fit</button>
          <button aria-label="Zoom in" onClick={() => view.mode === '2d' ? setTraceZoom(z => Math.min(8,z*1.25)) : viewer.current?.zoom(.8)}>＋</button>
          {scope.ids.length > 0 && !view.presentation && <button onClick={() => view.isolate ? showAll() : isolate(scope.ids[0])}>{view.isolate ? 'Show all' : 'Isolate ' + (scope.kind === 'group' ? 'group' : 'selection')}</button>}
        </div>
        <div className="viewhint">{view.mode === '2d' ? 'Click an outline to inspect · + / − to zoom · Fit to reset' : 'Drag to orbit · Scroll to zoom · Click a part to inspect'}</div>
        {!view.presentation && <div className="canvas-disclosure">{view.mode === 'bend' ? 'No process compensation' : 'Visual preview · Lighting not calibrated'}</div>}
        </>}
      </div>
      {view.mode === 'bend' && !overlay && <BendControls />}
      {footer}
    </main>;
}

function BendControls() {
  const bend = useApp((s) => s.view.bend);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const next = Math.min(100, getState().view.bend + 4);
      setView({ bend: next });
      if (next >= 100) setPlaying(false);
    }, 120);
    return () => clearInterval(t);
  }, [playing]);
  return (
    <div id="bendcontrols">
      <div>
        <b>Geometric forming study</b>
        <small>Constant edge lengths; no springback, machine compensation or tool-force model.</small>
      </div>
      <label>
        Straight strip
        <input
          type="range"
          min={0}
          max={100}
          value={bend}
          onChange={(e) => setView({ bend: +e.target.value })}
        />
        Formed contour
      </label>
      <button
        onClick={() => {
          if (!playing) setView({ bend: 0 });
          setPlaying(!playing);
        }}
      >
        {playing ? 'Pause forming' : 'Animate forming'}
      </button>
    </div>
  );
}

// 2D contour review: artwork underlay plus traced outlines; click selects an element.
function TraceView({
  canvasRef,
  art,
  hidden,
  zoom = 1,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  art: HTMLCanvasElement | null;
  hidden: boolean;
  zoom?: number;
}) {
  const design = useDesign(),
    artwork = design.artwork,
    view = useView(),
    fab = useApp((s) => s.fabrication);
  const xf = useRef({ scale: 1, tx: 0, ty: 0 });
  const [size, setSize] = useState(0);

  useEffect(() => {
    const ro = new ResizeObserver(() => setSize((n) => n + 1));
    ro.observe(canvasRef.current!.parentElement!);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current!,
      box = canvas.parentElement!;
    if (hidden || !art || !artwork) return;
    const ratio = Math.min(devicePixelRatio, 2),
      W = box.clientWidth,
      H = box.clientHeight;
    if (!W || !H) return;
    canvas.width = W * ratio;
    canvas.height = H * ratio;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = view.environment === 'day' ? '#e4e9e0' : '#12232c';
    ctx.fillRect(0, 0, W, H);
    const scale = Math.min((W - 60) / art.width, (H - 120) / art.height) * zoom,
      tx = (W - art.width * scale) / 2,
      ty = (H - art.height * scale) / 2;
    xf.current = { scale, tx, ty };
    ctx.globalAlpha = 0.45;
    ctx.drawImage(art, tx, ty, art.width * scale, art.height * scale);
    ctx.globalAlpha = 1;
    // Compensated tool paths (mm, y up) mapped back onto the traced artwork.
    if (view.toolpaths) {
      const L = computeLayout(design),
        toPx = ([x, y]: [number, number]) => [
          tx + (x / L.scale + L.cx) * scale,
          ty + (L.cy - y / L.scale) * scale,
        ];
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      for (const c of fabricationPlan(design, fab).cuts) {
        if (c.part === 'face') continue; // same outline as the back
        ctx.strokeStyle = c.part === 'vinyl' ? '#8d7bd6' : '#e2574c';
        for (const r of c.toolpath)
          for (const loop of [r.outer, ...r.holes]) {
            ctx.beginPath();
            loop.forEach((p, i) => {
              const [x, y] = toPx(p);
              if (i) ctx.lineTo(x, y);
              else ctx.moveTo(x, y);
            });
            ctx.closePath();
            ctx.stroke();
          }
      }
      ctx.setLineDash([]);
    }
    const sel = new Set(view.selection.length ? view.selection : view.selected ? [view.selected] : []),
      hiddenIds = new Set(view.hidden);
    for (const p of artwork.elements) {
      ctx.globalAlpha = hiddenIds.has(p.id) ? 0.25 : 1;
      ctx.strokeStyle = sel.has(p.id) ? '#e58c3b' : p.type === 'omit' ? '#aab3aa' : '#3d8d87';
      ctx.lineWidth = sel.has(p.id) ? 2 : 1;
      for (const r of p.regions)
        for (const loop of [r.outer, ...r.holes]) {
          ctx.beginPath();
          loop.forEach(([x, y], i) =>
            i ? ctx.lineTo(tx + x * scale, ty + y * scale) : ctx.moveTo(tx + x * scale, ty + y * scale),
          );
          ctx.closePath();
          ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;
  }, [
    hidden,
    art,
    design,
    fab,
    view.selected,
    view.selection,
    view.hidden,
    view.environment,
    view.toolpaths,
    size,
    zoom,
  ]);

  const hitAt = (clientX: number, clientY: number, el: HTMLCanvasElement) => {
    if (!artwork) return undefined;
    const rect = el.getBoundingClientRect(),
      { scale, tx, ty } = xf.current,
      pt = [(clientX - rect.left - tx) / scale, (clientY - rect.top - ty) / scale];
    return [...artwork.elements]
      .reverse()
      .find((p) => p.regions.some((r) => inside(pt, r.outer) && !r.holes.some((h) => inside(pt, h))));
  };

  return (
    <canvas
      id="tracecanvas"
      ref={canvasRef}
      hidden={hidden}
      onMouseMove={(e) => {
        e.currentTarget.style.cursor = hitAt(e.clientX, e.clientY, e.currentTarget) ? 'pointer' : 'default';
      }}
      onClick={(e) => {
        if (!artwork) return;
        const hit = hitAt(e.clientX, e.clientY, e.currentTarget);
        const add = e.shiftKey || e.metaKey || e.ctrlKey;
        if (hit) (add ? toggleSelect : select)(hit.id);
        else if (!add) clearSelection();
      }}
    />
  );
}
