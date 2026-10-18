// Operations that span panels: importing artwork, opening/saving projects, mode changes, export.
import { loadImage, sampleCrop, traceImage } from '../artwork/import.ts';
import { svgArtwork } from '../artwork/svg.ts';
import type { Artwork } from '../domain/project.ts';
import { constructionNames, type ConstructionType, type ViewMode } from '../domain/project.ts';
import { AUTOSAVE, BACKUP, parseProject, readStore, serialise, writeStore } from '../storage/project.ts';
import { applyGroupType } from '../artwork/grouping.js';
import { computeLayout } from '../domain/layout.ts';
import { recipes } from '../domain/recipes.ts';
import { kelvinToHex } from '../domain/lighting.ts';
import { editDesign, getState, loadDesign, say, setTrace, setView, subscribe } from './store.ts';
import type { SignScene } from '../scene/scene.ts';

// The renderer, set by <Viewport>. Null when WebGL is unavailable.
export const viewer: { current: SignScene | null } = { current: null };
// What the current artwork came from, so Trace & rebuild can redo it.
let source: { image: HTMLImageElement } | { svg: string } | null = null;

const fullCrop = { x: 0, y: 0, w: 100, h: 100 };
const reportError = (e: unknown) => say(e instanceof Error ? e.message : String(e));

export async function importImage(url: string, sample = false) {
  try {
    source = { image: await loadImage(url) };
    setTrace({ crop: sample ? sampleCrop : fullCrop, background: 'white', threshold: 45 });
    retrace();
  } catch (e) {
    reportError(e);
  }
}

export function importSvg(text: string) {
  source = { svg: text };
  retrace();
}

// Re-importing replaces the artwork as one undoable design edit.
export function retrace() {
  if (!source) {
    const vector = getState().design.present.artwork?.origin === 'vector';
    return say(
      vector
        ? 'Vector artwork has nothing to retrace. Upload the SVG again to re-import it.'
        : 'Upload artwork or load the Kirat sample first.',
    );
  }
  try {
    let artwork: Artwork, note: string;
    if ('svg' in source) {
      const r = svgArtwork(source.svg);
      artwork = r.artwork;
      note =
        `Vector artwork: exact outlines from the SVG${r.total > artwork.elements.length ? ` (${r.total} shapes, smallest merged or capped at 100)` : ''}. ` +
        (artwork.groups.some((g) => !/^Group \d+$/.test(g.name))
          ? 'Groups come from the file. '
          : 'The file has no groups, so elements are grouped by row and spacing. ');
    } else {
      const r = traceImage(source.image, getState().trace);
      artwork = r.artwork;
      note =
        (r.truncated ? 'Smallest shapes capped at 100. ' : '') +
        'Traced from pixels: review outlines. Elements are grouped by row and spacing; groups much smaller than the main lettering default to vinyl. ';
    }
    const holes = artwork.elements.reduce((n, e) => n + e.regions.reduce((m, r) => m + r.holes.length, 0), 0);
    editDesign(
      (d) => ({ ...d, artwork }),
      `${artwork.elements.length} shapes · ${holes} holes · ${artwork.groups.length} groups. ${note}Review groups in the inspector.`,
    );
    setView({
      selected: artwork.elements[0].id,
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
  loadDesign(p.design, note);
}

export function projectText() {
  const s = getState(),
    t = s.trace;
  return serialise({
    design: s.design.present,
    fabrication: s.fabrication,
    traceSettings: { background: t.background, threshold: t.threshold, minpixels: t.minpixels },
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

export type ApplyScope = 'group' | 'selected' | 'all';
export function applyConstruction(type: ConstructionType, scope: ApplyScope) {
  const { design, view } = getState();
  const a = design.present.artwork,
    sel = a?.elements.find((e) => e.id === view.selected);
  if (!a || !sel) return;
  const groups = a.groups.map((g) => ({ ...g })),
    elements = a.elements.map((e) => ({ ...e }));
  if (scope === 'selected') {
    const e = elements.find((e) => e.id === sel.id)!;
    e.type = type;
    e.override = type !== groups.find((g) => g.id === e.group)?.type;
  } else
    for (const g of scope === 'all' ? groups : groups.filter((g) => g.id === sel.group)) {
      elements.forEach((e) => e.group === g.id && (e.override = false));
      applyGroupType(groups, elements, g.id, type);
    }
  const groupName = a.groups.find((g) => g.id === sel.group)?.name;
  editDesign(
    (d) => ({ ...d, artwork: { ...a, groups, elements } }),
    scope === 'selected'
      ? `${sel.name} set to ${constructionNames[type]} as an override.`
      : `${scope === 'all' ? 'All groups' : groupName} set to ${constructionNames[type]}.`,
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
    timer: ReturnType<typeof setTimeout>,
    warned = false;
  subscribe(() => {
    const d = getState().design.present;
    if (d === last) return;
    last = d;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (d.artwork && !writeStore(AUTOSAVE, projectText()) && !warned) {
        warned = true;
        say('Autosave failed (browser storage full or blocked). Use Save project to keep a copy.');
      }
    }, 400);
  });
  const sample = () => importImage('kirat-reference.png', true);
  if (previous) openProject(previous, 'Last session restored from autosave.').catch(sample);
  else sample();
}

export const hasBackup = () => !!readStore(BACKUP);
export function restoreBackup() {
  const text = readStore(BACKUP);
  if (text && confirm('Replace the current design with the previous session backup?'))
    openProject(text, 'Previous session restored. Undo history starts here.').catch(reportError);
}

// Customer presentation sheet: day and night stills from the current camera, title block and
// a construction summary. Presentation lighting, labelled as such.
export async function exportPresentation() {
  const v = viewer.current,
    { design, view } = getState();
  const d = design.present,
    a = d.artwork;
  if (!v || !a) return say('Load artwork and open the 3D view to export a presentation.');
  if (view.mode !== '3d') return say('Switch to 3D assembly to export a presentation.');
  say('Rendering day and night views…');
  await new Promise((r) => setTimeout(r, 30));
  const W = 2400,
    shotH = 1050,
    head = 150,
    foot = 260;
  const shots = (['day', 'night'] as const).map((env) => ({ env, url: v.renderStill(W, shotH, env) }));
  const images = await Promise.all(shots.map((s) => loadImage(s.url)));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = head + shotH * 2 + foot;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4f4ee';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#1d3440';
  ctx.font = '600 54px Georgia, serif';
  ctx.fillText('Kirat Creations — sign concept', 60, 92);
  ctx.font = '26px Arial';
  ctx.fillStyle = '#5e6f74';
  const s = d.settings;
  ctx.fillText(
    `${s.width} × ${s.height} mm board · LED ${s.ledTemp} K · ${new Date().toLocaleDateString()}`,
    60,
    132,
  );
  images.forEach((img, i) => {
    const y = head + i * shotH;
    ctx.drawImage(img, 0, y, W, shotH);
    ctx.fillStyle = 'rgba(20,30,38,.72)';
    ctx.fillRect(40, y + 30, 170, 54);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 28px Arial';
    ctx.fillText(shots[i].env === 'day' ? 'DAY' : 'NIGHT', 62, y + 67);
  });
  // Construction summary per group.
  const L = computeLayout(d),
    y0 = head + shotH * 2 + 56;
  ctx.font = '600 26px Arial';
  ctx.fillStyle = '#1d3440';
  ctx.fillText('Construction', 60, y0);
  ctx.font = '24px Arial';
  ctx.fillStyle = '#3e5157';
  a.groups.forEach((g, i) => {
    const els = L.elements.filter((e) => e.group === g.id && e.type === g.type),
      proj = els.length ? Math.max(...els.flatMap((e) => e.parts.map((p) => p.z1 - e.base))) : 0;
    ctx.fillText(
      `${g.name}: ${recipes[g.type].name}${proj >= 1 ? ` · ${Math.round(proj)} mm projection` : proj > 0 ? ' · surface applied' : ''}`,
      60 + (i % 2) * 1100,
      y0 + 44 + Math.floor(i / 2) * 36,
    );
  });
  ctx.fillStyle = kelvinToHex(s.ledTemp);
  ctx.fillRect(W - 360, y0 - 24, 26, 26);
  ctx.fillStyle = '#5e6f74';
  ctx.font = '22px Arial';
  ctx.fillText(`LED colour ${s.ledTemp} K`, W - 320, y0);
  ctx.fillText(
    'Concept visualisation. Presentation lighting, not calibrated against photographs. Not for fabrication.',
    60,
    c.height - 36,
  );
  download(c.toDataURL('image/png'), 'kirat-presentation.png');
  say('Presentation sheet exported: day and night views from the current camera.');
}
