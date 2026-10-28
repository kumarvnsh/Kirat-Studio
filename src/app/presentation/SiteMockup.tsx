// Site mockups: import site photos (or a recce .pptx), set each place's board size, and drag the
// wall corners onto the photo. Each place is a shot with `site`, so it renders, caches and exports
// like any other view.
import { useEffect, useMemo, useRef, useState } from 'react';
import { numericSettings, type DesignState } from '../../domain/project.ts';
import type { BookletPage, PresentationConfig, Shot, SitePlacement } from '../../presentation/model.ts';
import { boardCorners, readPptx, type Pt, type SiteSlide } from '../../presentation/site.ts';
import { Dialog } from '../Dialog.tsx';
import { loadImage } from '../../artwork/import.ts';

const clamp = (k: 'width' | 'height', v: number) =>
  Math.round(Math.min(numericSettings[k].max, Math.max(numericSettings[k].min, v)));

// Photos are stored in the project, so keep them modest: long side 1600 px, JPEG.
async function jpegData(bytes: Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  try {
    const image = await loadImage(url),
      k = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight)),
      c = document.createElement('canvas');
    c.width = Math.round(image.naturalWidth * k);
    c.height = Math.round(image.naturalHeight * k);
    c.getContext('2d')!.drawImage(image, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/jpeg', 0.85), aspect: c.width / c.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readSiteFile(file: File): Promise<SiteSlide[]> {
  if (file.size > 60 * 1024 * 1024) throw Error('Choose a file smaller than 60 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.pptx$/i.test(file.name)) return readPptx(bytes);
  if (file.type === 'image/jpeg' || file.type === 'image/png')
    return [{ name: file.name.replace(/\.[^.]+$/, ''), image: bytes, mime: file.type, box: null, wall: null }];
  throw Error('Use a recce PowerPoint (.pptx) or a JPG/PNG photo of the site.');
}

export async function addSiteSlides(
  slides: SiteSlide[],
  config: PresentationConfig,
  design: DesignState,
  optionId: string,
): Promise<{ next: PresentationConfig; first: string; note: string }> {
  if (config.shots.length + slides.length > 100 || config.pages.length + slides.length > 100)
    throw Error('This proposal already has too many views. Remove some first.');
  const shots: Shot[] = [],
    pages: BookletPage[] = [];
  for (const s of slides) {
    const { data, aspect } = await jpegData(s.image, s.mime);
    // No marker: start with a band across the middle of the photo for the user to drag.
    const [x, y, w, h] = s.box ?? [0.2, 0.35, 0.6, 0.15];
    const wall = s.wall ?? [design.settings.width, design.settings.height];
    const site: SitePlacement = {
      photo: data,
      corners: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
      wall,
      board: [clamp('width', wall[0]), clamp('height', wall[1])],
    };
    const id = crypto.randomUUID();
    shots.push({
      id,
      name: `Site · ${s.name}`.slice(0, 200),
      optionId,
      site,
      camera: { preset: 'front' },
      scene: { kind: 'studio', wallFinish: 'plaster', groundFinish: 'paving' },
      environment: 'day',
      power: true,
      dimming: 1,
      exposureEV: 0,
      width: 2400,
      aspect: Math.min(4, Math.max(0.25, aspect)),
    });
    pages.push({ id: `page-${id}`, kind: 'render', included: true, shotId: id, caption: shots.at(-1)!.name, dimensions: false, materials: false });
  }
  const marked = slides.filter((s) => s.box).length,
    sized = slides.filter((s) => s.wall).length;
  return {
    next: { ...config, shots: [...config.shots, ...shots], pages: [...config.pages, ...pages] },
    first: shots[0].id,
    note:
      `${slides.length} site view(s) added. ` +
      (marked < slides.length ? `${slides.length - marked} had no red marker: drag the corners onto the wall. ` : '') +
      (sized < slides.length ? `${slides.length - sized} had no wall size: enter it in the panel. ` : ''),
  };
}

export function SiteSetup({
  shot,
  onChange,
  onRemove,
}: {
  shot: Shot;
  onChange: (p: Partial<Shot>) => void;
  onRemove: () => void;
}) {
  const site = shot.site!;
  const set = (patch: Partial<SitePlacement>) => onChange({ site: { ...site, ...patch } });
  const size = (
    label: string,
    value: [number, number],
    apply: (v: [number, number]) => void,
    limits?: { w: [number, number]; h: [number, number] },
  ) => (
    <fieldset className="site-size">
      <legend>{label}</legend>
      {(['Width', 'Height'] as const).map((k, i) => (
        <label key={k}>
          {k} · mm
          <input
            type="number"
            min={limits ? limits[i ? 'h' : 'w'][0] : 100}
            max={limits ? limits[i ? 'h' : 'w'][1] : 50000}
            value={Math.round(value[i])}
            onChange={(e) => {
              const v = +e.target.value,
                [lo, hi] = limits ? limits[i ? 'h' : 'w'] : [100, 50000];
              if (Number.isFinite(v) && v >= lo && v <= hi)
                apply(i ? [value[0], v] : [v, value[1]]);
            }}
          />
          <small>{(value[i] / 25.4).toFixed(1)} in</small>
        </label>
      ))}
    </fieldset>
  );
  return (
    <section className="render-settings">
      <div className="booklet-section-label">SITE MOCKUP</div>
      <h2>{shot.name}</h2>
      <label>
        Name
        <input value={shot.name} maxLength={200} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      {size('Wall (the marked area)', site.wall, (wall) => set({ wall }))}
      {size(
        'Sign board for this place',
        site.board,
        (board) => set({ board }),
        {
          w: [numericSettings.width.min, numericSettings.width.max],
          h: [numericSettings.height.min, numericSettings.height.max],
        },
      )}
      <button
        onClick={() => set({ board: [clamp('width', site.wall[0]), clamp('height', site.wall[1])] })}
      >
        Board fills the wall
      </button>
      <label>
        Time of day
        <select
          value={shot.environment === 'night' ? 'night' : 'day'}
          onChange={(e) =>
            onChange({ environment: e.target.value as 'day' | 'night', power: e.target.value === 'night' || shot.power })
          }
        >
          <option value="day">Day</option>
          <option value="night">Night (photo darkened)</option>
        </select>
      </label>
      <label className="booklet-check">
        <input type="checkbox" checked={shot.power} onChange={(e) => onChange({ power: e.target.checked })} />
        Sign lights on
      </label>
      <p className="booklet-hint">
        Drag the four corners on the photo onto the wall edges. The board sits centred in the wall at
        its real size; letters keep this design's style and fit the board as usual.
      </p>
      <button onClick={onRemove}>Remove this site view</button>
    </section>
  );
}

// The photo (or its latest mockup) with the wall outline, the board outline and draggable corners.
export function SiteStage({
  shot,
  image,
  onCorners,
}: {
  shot: Shot;
  image?: string;
  onCorners: (corners: [number, number][]) => void;
}) {
  const site = shot.site!;
  const [draft, setDraft] = useState<[number, number][] | null>(null),
    drag = useRef<number | null>(null),
    svg = useRef<SVGSVGElement>(null);
  const corners = draft ?? site.corners,
    board = boardCorners(corners as Pt[], site.wall, site.board);
  const at = (e: React.PointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [
      Math.min(1.5, Math.max(-0.5, (e.clientX - r.left) / r.width)),
      Math.min(1.5, Math.max(-0.5, (e.clientY - r.top) / r.height)),
    ];
  };
  const pts = (c: number[][]) => c.map((p) => p.join(',')).join(' ');
  return (
    <div className="site-stage">
      <img src={image ?? site.photo} alt={`${shot.name} mockup`} />
      <svg
        ref={svg}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        onPointerMove={(e) => {
          if (drag.current === null) return;
          const next = corners.map((c) => [...c]) as [number, number][];
          next[drag.current] = at(e);
          setDraft(next);
        }}
        onPointerUp={() => {
          if (drag.current !== null && draft) onCorners(draft);
          drag.current = null;
          setDraft(null);
        }}
      >
        <polygon className="site-wall" points={pts(corners)} />
        <polygon className="site-board" points={pts(board)} />
      </svg>
      {corners.map(([x, y], i) => (
        <button
          key={i}
          className="site-handle"
          style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          aria-label={`Wall corner ${['top left', 'top right', 'bottom right', 'bottom left'][i]}. Arrow keys move it.`}
          onPointerDown={(e) => {
            drag.current = i;
            svg.current!.setPointerCapture(e.pointerId);
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.01 : 0.002,
              d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
            if (!d) return;
            e.preventDefault();
            const next = corners.map((c) => [...c]) as [number, number][];
            next[i] = [x + d[0], y + d[1]];
            onCorners(next);
          }}
        />
      ))}
    </div>
  );
}

// Choose which slides of a recce deck become site views.
export function SlidePicker({
  slides,
  onAdd,
  onClose,
}: {
  slides: SiteSlide[];
  onAdd: (chosen: SiteSlide[]) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState(() => slides.map(() => true));
  const urls = useMemo(
    () => slides.map((s) => URL.createObjectURL(new Blob([s.image as BlobPart], { type: s.mime }))),
    [slides],
  );
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls]);
  const count = chosen.filter(Boolean).length;
  const inches = (mm: number) => Math.round(mm / 25.4);
  return (
    <Dialog title="Choose slides to show on site" onClose={onClose} wide>
      <p className="booklet-hint">
        Each chosen slide becomes a site view and a booklet page. The red box on the slide marks where
        the sign goes.
      </p>
      <div className="site-slides">
        {slides.map((s, i) => (
          <label key={i} className={'site-slide' + (chosen[i] ? ' active' : '')}>
            <span className="site-slide-photo">
              <img src={urls[i]} alt="" />
              {s.box && (
                <span
                  className="site-slide-box"
                  style={{
                    left: `${s.box[0] * 100}%`,
                    top: `${s.box[1] * 100}%`,
                    width: `${s.box[2] * 100}%`,
                    height: `${s.box[3] * 100}%`,
                  }}
                />
              )}
            </span>
            <span className="site-slide-text">
              <input
                type="checkbox"
                checked={chosen[i]}
                onChange={(e) => setChosen(chosen.map((c, j) => (j === i ? e.target.checked : c)))}
              />
              <b>{s.name}</b>
            </span>
            <small>
              {s.wall ? `Wall ${inches(s.wall[0])} × ${inches(s.wall[1])} in` : 'No wall size: enter it after adding'}
              {s.box ? '' : ' · no red box: place it after adding'}
            </small>
          </label>
        ))}
      </div>
      <div className="modal-foot">
        <button onClick={onClose}>Cancel</button>
        <button
          className="booklet-primary"
          disabled={!count}
          onClick={() => onAdd(slides.filter((_, i) => chosen[i]))}
        >
          Add {count} site view{count === 1 ? '' : 's'}
        </button>
      </div>
    </Dialog>
  );
}
