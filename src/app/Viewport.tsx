import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { SignScene } from '../scene/scene.ts';
import { inside } from '../artwork/contours.js';
import { loadImage } from '../artwork/import.ts';
import { constructionNames } from '../domain/project.ts';
import { environments, type Environment } from '../domain/lighting.ts';
import { computeLayout, sceneInput } from '../domain/layout.ts';
import { fabricationPlan } from '../fabrication/plan.ts';
import { setMode, viewer } from './actions.ts';
import {
  getState,
  say,
  select,
  setView,
  toggleSelect,
  showAll,
  useApp,
  useDesign,
  useView,
} from './store.ts';

export function Viewport({ traceCanvas }: { traceCanvas: RefObject<HTMLCanvasElement | null> }) {
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
      viewer.current = new SignScene(host.current!, (id: string, add: boolean) =>
        add ? toggleSelect(id) : select(id),
      );
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
      if (live) setArt({ data: artwork.imageData, canvas });
    });
    return () => {
      live = false;
    };
  }, [artwork?.imageData]);

  // Full rebuild: design changes and view options that change geometry or lighting.
  const bendTarget = view.mode === 'bend' ? view.selected : null;
  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready) return;
    v.build(sceneInput(design, getState().view), art!.canvas);
  }, [design, ready, art, view.environment, view.lights, view.dimming, view.mode, view.bend, bendTarget]);

  // Exposure is a camera setting: no rebuild.
  useEffect(() => {
    if (ready && viewer.current?.state) viewer.current.setEnvironment(sceneInput(design, view));
  }, [ready, view.exposure]);

  // Cheap visibility pass: stage, layers, explode, isolation, selection.
  useEffect(() => {
    const v = viewer.current;
    if (!v?.state || !ready) return;
    v.state = sceneInput(design, view);
    v.setVisibility(v.state);
  }, [
    ready,
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

  const selected = artwork?.elements.find((e) => e.id === view.selected);
  const group = selected && artwork?.groups.find((g) => g.id === selected.group);
  const s = design.settings,
    layout = computeLayout(design);

  return (
    <main>
      <div className="viewportbar">
        <div className="viewtabs">
          {(
            [
              ['3d', '3D assembly'],
              ['2d', '2D trace'],
              ['bend', 'Forming study'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} className={view.mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
        <div className="lightingbuttons">
          <button
            className={view.lights ? 'poweron' : ''}
            onClick={() => {
              setView({ lights: !view.lights });
              say(
                !view.lights
                  ? 'Illumination on. Glow and spill are visual approximations.'
                  : 'Illumination off. Day/night environment remains unchanged.',
              );
            }}
          >
            {view.lights ? '● Lights on' : '○ Lights off'}
          </button>
          {(Object.keys(environments) as Environment[]).map((env) => (
            <button
              key={env}
              className={view.environment === env ? 'envon' : ''}
              onClick={() => setView({ environment: env })}
            >
              {environments[env].label}
            </button>
          ))}
        </div>
      </div>
      <div id="viewport">
        <div id="threehost" ref={host} hidden={view.mode === '2d'} />
        <TraceView canvasRef={traceCanvas} art={ready ? art!.canvas : null} hidden={view.mode !== '2d'} />
        {!artwork && <div id="loading">Preparing your signage workspace…</div>}
        {no3d && (
          <div id="fallback">
            3D rendering is unavailable on this device. The 2D contour review is still available.
          </div>
        )}
        <div className="viewbadge">
          <span>
            {view.mode === '2d'
              ? 'ARTWORK / TRACED CONTOURS'
              : view.mode === 'bend'
                ? 'GEOMETRIC FORMING / NO PROCESS COMPENSATION'
                : `${environments[view.environment].label.toUpperCase()} / PRESENTATION PREVIEW (NOT CALIBRATED)`}
          </span>
          <b>{artwork?.approved ? 'ARTWORK REVIEWED / CONCEPT MODEL' : 'ARTWORK REVIEW PENDING'}</b>
        </div>
        {selected && (
          <div id="selectionbadge">
            {selected.name} / {group?.name} / {constructionNames[selected.type]}
            {selected.override ? ' (override)' : ''}
          </div>
        )}
        {view.isolate && (
          <div id="isolationbar">
            <span>Isolated: {selected?.name ?? 'element'}</span>
            <button id="exit-isolate" onClick={() => showAll()}>
              Show all · Esc
            </button>
          </div>
        )}
        <div className="camera" hidden={view.mode === '2d'}>
          {(['front', 'perspective', 'rear'] as const).map((k) => (
            <button key={k} onClick={() => viewer.current?.fit(k)}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
          <button onClick={() => viewer.current?.fit()}>Fit view</button>
          <button id="showall" onClick={() => showAll()}>
            Show all
          </button>
        </div>
        <div className="viewhint">Drag to orbit · scroll / pinch to zoom · click a part to inspect</div>
      </div>
      {view.mode === 'bend' && <BendControls />}
      <div className="statusbar">
        <div>
          <b>{artwork ? artwork.elements.filter((e) => e.type !== 'omit').length : '—'}</b>
          <small>artwork shapes</small>
        </div>
        <div>
          <b>{artwork ? (layout.returnLength / 1000).toFixed(2) + ' m' : '—'}</b>
          <small>lit return length</small>
        </div>
        <div>
          <b>{artwork ? layout.ledcount : '—'}</b>
          <small>symbolic LED positions</small>
        </div>
        <div>
          <b>
            {s.width} × {s.height}
          </b>
          <small>board / mm</small>
        </div>
      </div>
      <div id="message" role="status" aria-live="polite">
        {message}
      </div>
    </main>
  );
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
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  art: HTMLCanvasElement | null;
  hidden: boolean;
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
    const scale = Math.min((W - 60) / art.width, (H - 120) / art.height),
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
  ]);

  return (
    <canvas
      id="tracecanvas"
      ref={canvasRef}
      hidden={hidden}
      onClick={(e) => {
        if (!artwork) return;
        const rect = e.currentTarget.getBoundingClientRect(),
          { scale, tx, ty } = xf.current,
          pt = [(e.clientX - rect.left - tx) / scale, (e.clientY - rect.top - ty) / scale];
        const hit = [...artwork.elements]
          .reverse()
          .find((p) => p.regions.some((r) => inside(pt, r.outer) && !r.holes.some((h) => inside(pt, h))));
        if (hit) (e.shiftKey || e.metaKey || e.ctrlKey ? toggleSelect : select)(hit.id);
      }}
    />
  );
}
