// Operations that span panels: importing artwork, opening/saving projects, mode changes, export.
import { loadImage, traceImage, type TraceOptions } from '../artwork/import.ts';
import { svgArtwork } from '../artwork/svg.ts';
import { boardArt, type AiArtboard } from '../artwork/ai.ts';
import { LAYER_COUNT, numericSettings, type Artwork, type ViewMode } from '../domain/project.ts';
import { ALL_STEPS } from '../domain/assembly.ts';
import { AUTOSAVE, BACKUP, parseProject, readStore, serialise, writeStore } from '../storage/project.ts';
import { sceneInput } from '../domain/layout.ts';
import { editDesign, getState, loadDesign, say, setTrace, setView, setSaveStatus, subscribe } from './store.ts';
import type { SignScene } from '../scene/scene.ts';

// The renderer, set by <Viewport>. Null when WebGL is unavailable.
export const viewer: { current: SignScene | null } = { current: null };
export const activeArtCanvas: { current: HTMLCanvasElement | null } = { current: null };

export function applySceneChanges(note = 'All structure, dimension, and material changes applied to the 3D scene.') {
  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  const { design, view } = getState();
  if (view.step < ALL_STEPS || view.layers.some((l) => l === false)) {
    setView({ step: ALL_STEPS, layers: Array(LAYER_COUNT).fill(true) });
  }
  const nextState = getState();
  if (viewer.current) {
    viewer.current.build(sceneInput(nextState.design.present, nextState.view), activeArtCanvas.current);
  }
  say(note);
}

// What the current artwork came from, so Trace & rebuild can redo it.
let source: { image: HTMLImageElement } | { svg: string } | null = null;

const fullCrop = { x: 0, y: 0, w: 100, h: 100 };
const reportError = (e: unknown) => say(e instanceof Error ? e.message : String(e));

export async function importImage(url: string) {
  try {
    source = { image: await loadImage(url) };
    setTrace({ crop: fullCrop, background: 'auto', threshold: 45 });
    retrace();
  } catch (e) {
    reportError(e);
  }
}

export const rasterSource = () => source && 'image' in source ? source.image : null;
export async function applyRasterTrace(image: HTMLImageElement, options: TraceOptions, useBackground: boolean) {
  source = { image };
  setTrace(options);
  await retrace(useBackground);
}

export function importSvg(text: string) {
  source = { svg: text };
  retrace();
}

// Board size from an Illustrator artboard, applied once with the import (not on later retraces).
let pendingBoard: { width: number; height: number; artscale: number; note: string } | null = null;

export function importAiBoard(b: AiArtboard, exclude: number[] = []) {
  const art = boardArt(b, exclude);
  const clamp = (k: 'width' | 'height' | 'artscale', v: number) => {
    const r = numericSettings[k];
    return Math.min(r.max, Math.max(r.min, Math.round(v)));
  };
  const width = clamp('width', b.widthMm),
    height = clamp('height', b.heightMm),
    artscale = clamp('artscale', (art.artWidthMm / b.widthMm) * 100);
  const capped = width !== Math.round(b.widthMm) || height !== Math.round(b.heightMm);
  pendingBoard = {
    width,
    height,
    artscale,
    note:
      `Board set from artboard ${b.index + 1}: ${width} × ${height} mm, artwork ${Math.round(art.artWidthMm)} × ${Math.round(art.artHeightMm)} mm. ` +
      (exclude.length ? `Left out ${exclude.length} shape(s) (size labels and anything you removed). ` : '') +
      (capped ? `Artboard is ${Math.round(b.widthMm)} × ${Math.round(b.heightMm)} mm, outside the board limits, so it was capped. ` : '') +
      (art.artHeightMm > height * 0.75 ? 'Artwork is taller than 75% of the board, so it is scaled down to fit. ' : '') +
      (b.strokes + b.skipped
        ? `${b.strokes + b.skipped} stroke(s), text or image(s) skipped: outline them in Illustrator to include them. `
        : ''),
  };
  importSvg(art.svg);
}

// Re-importing replaces the artwork as one undoable design edit.
export async function retrace(useBackground = false) {
  if (!source) {
    const vector = getState().design.present.artwork?.origin === 'vector';
    return say(
      vector
        ? 'Vector artwork has nothing to retrace. Upload the SVG or AI file again to re-import it.'
        : 'Upload artwork or load the Kirat sample first.',
    );
  }
  const board = pendingBoard;
  pendingBoard = null; // a failed import must not resize the board on the next one
  try {
    let artwork: Artwork, note: string, fasciaColor: string | undefined;
    if ('svg' in source) {
      const r = await svgArtwork(source.svg);
      artwork = r.artwork;
      note =
        (r.traced
          ? `${r.traced} part(s) of this SVG are embedded pictures or text, traced from pixels; everything else is exact vector outlines. `
          : '') +
        `Vector artwork: exact outlines from the SVG${r.total > artwork.elements.length ? ` (${r.total} shapes, smallest merged or capped at 100)` : ''}. ` +
        (artwork.groups.some((g) => !/^Group \d+$/.test(g.name))
          ? 'Groups come from the file. '
          : 'The file has no groups, so elements are grouped by row and spacing. ');
    } else {
      const r = traceImage(source.image, getState().trace);
      artwork = r.artwork;
      if (useBackground && r.background.color) fasciaColor = r.background.color;
      note =
        (r.truncated ? 'Smallest shapes capped at 100. ' : '') +
        'Traced from pixels: review outlines. Elements are grouped by row and spacing; groups much smaller than the main lettering default to vinyl. ';
    }
    const holes = artwork.elements.reduce((n, e) => n + e.regions.reduce((m, r) => m + r.holes.length, 0), 0);
    editDesign(
      (d) => ({
        ...d,
        artwork,
        settings: {
          ...d.settings,
          ...(fasciaColor ? { boardcolor: fasciaColor } : {}),
          ...(board ? { width: board.width, height: board.height, artscale: board.artscale } : {}),
        },
      }),
      `${artwork.elements.length} shapes · ${holes} holes · ${artwork.groups.length} groups. ${board?.note ?? ''}${note}Review groups in the inspector.`,
    );
    setView({
      selected: null,
      selectedGroup: '__board',
      selection: [],
      isolate: false,
      selectionActive: false,
      mode: getState().view.mode === 'bend' ? '3d' : getState().view.mode,
    });
  } catch (e) {
    reportError(e);
  }
}

export async function openProject(text: string, note = 'Project opened.') {
  const p = parseProject(text);
  const a = p.design.artwork;
  source = a && a.origin !== 'vector' ? { image: await loadImage(a.imageData) } : null;
  setTrace({ ...(p.traceSettings ?? {}), crop: fullCrop });
  loadDesign(p.design, [note, ...(p.warnings ?? [])].join(' '), p.fabrication, p.presentation);
}

export function projectText() {
  const s = getState(),
    t = s.trace;
  return serialise({
    design: s.design.present,
    fabrication: s.fabrication,
    presentation: s.presentation,
    traceSettings: { background: t.background, backgroundColor: t.backgroundColor, threshold: t.threshold, minpixels: t.minpixels },
  });
}

export function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

export function saveProject() {
  const url = URL.createObjectURL(new Blob([projectText()], { type: 'application/json' }));
  download(url, 'kirat-signage-project.json');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say('Project downloaded with traced geometry, settings and face artwork.');
}

export function setMode(mode: ViewMode) {
  const { design, view } = getState();
  if (mode === 'bend') {
    const el = design.present.artwork?.elements.find((e) => e.id === view.selected);
    if (!el || el.type === 'omit') return say('Select a visible artwork shape for the forming study.');
  }
  setView({ mode, isolate: mode === 'bend' ? view.isolate : false });
  if (mode === 'bend')
    say(
      'Geometric strip study for selected contours. Notches, springback, bend allowance and machine instructions are not simulated.',
    );
  else if (mode === '2d')
    say(
      'Click a traced shape to review its construction. Use Exclude to remove background marks or unwanted details.',
    );
}

export function exportView(trace: HTMLCanvasElement | null) {
  const { view, design } = getState();
  const url = view.mode === '2d' ? trace?.toDataURL() : viewer.current?.export();
  if (!url) return say('3D export is unavailable on this device.');
  const image = new Image();
  image.onload = () => {
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height + 70;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f3f3ea';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(image, 0, 0);
    ctx.fillStyle = '#284047';
    ctx.font = Math.max(12, c.width / 80) + 'px Arial';
    ctx.fillText('KIRAT SIGNAGE STUDIO · CONCEPT PREVIEW · NOT FOR FABRICATION', 20, c.height - 40);
    ctx.font = Math.max(10, c.width / 95) + 'px Arial';
    const s = design.present.settings;
    ctx.fillText(
      `${s.width} × ${s.height} mm board · nominal geometry · lighting illustrative`,
      20,
      c.height - 18,
    );
    download(c.toDataURL(), 'kirat-signage-preview.png');
  };
  image.src = url;
}

// Startup: previous autosave becomes the backup, then is restored; otherwise load the sample.
export function startSession() {
  const previous = readStore(AUTOSAVE);
  if (previous) writeStore(BACKUP, previous);
  let last = getState().design.present,
    lastFab = getState().fabrication,
    lastPresentation = getState().presentation,
    timer: ReturnType<typeof setTimeout>,
    warned = false;
  subscribe(() => {
    const d = getState().design.present,
      f = getState().fabrication,
      p = getState().presentation;
    if (d === last && f === lastFab && p === lastPresentation) return;
    last = d;
    lastFab = f;
    lastPresentation = p;
    clearTimeout(timer);
    setSaveStatus(d.artwork ? 'saving' : 'idle');
    timer = setTimeout(() => {
      if (!d.artwork) return setSaveStatus('idle');
      const saved = writeStore(AUTOSAVE, projectText());
      setSaveStatus(saved ? 'saved' : 'error');
      if (!saved && !warned) {
        warned = true;
        say('Autosave failed (browser storage full or blocked). Use Save project copy to keep a copy.');
      }
    }, 400);
  });
  const sample = loadKiratSample;
  if (previous) openProject(previous, 'Last session restored from autosave.').catch(sample);
  else sample();
}

export const hasBackup = () => !!readStore(BACKUP);
export function restoreBackup() {
  const text = readStore(BACKUP);
  if (text && confirm('Replace the current design with the previous session backup?'))
    openProject(text, 'Previous session restored. Undo history starts here.').catch(reportError);
}

// The Kirat Creations logo shipped with the app (Canva SVG: vector letters, picture symbol).
export async function loadKiratSample() {
  try {
    importSvg(await (await fetch('kirat-logo.svg')).text());
  } catch (e) {
    reportError(e);
  }
}
