// Vector artwork import. SVG paths keep their exact curves (flattened finely), holes and transforms;
// top-level <g> groups in the file become artwork groups. Nothing is rasterised for geometry.
import * as T from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { area, simplify } from './contours.js';
import { attachDetails, autoGroup, groupClusters } from './grouping.js';
import type { Artwork, ArtworkElement, ArtworkGroup, Point, Region } from '../domain/project.ts';

export const SVG_SIZE = 1400; // longest side after normalising, same scale as the raster trace grid
const MAX_ELEMENTS = 100;
const POINT_BUDGET = 40000; // stays under the project validator's 50 000

export type SvgShape = { shape: T.Shape; color: string; group: string | null };

const toPoints = (vs: T.Vector2[]): Point[] => {
  const pts = vs.map((v): Point => [v.x, v.y]);
  const [a, b] = [pts[0], pts[pts.length - 1]];
  if (pts.length > 1 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) pts.pop(); // closing duplicate
  return pts;
};

// Pure core: shapes in SVG user units (y down) → elements and groups, normalised to SVG_SIZE.
export function shapesToArtwork(input: SvgShape[]) {
  // Flatten curves finely, normalise, then simplify to a tolerance (in normalised units) that fits the budget.
  const raw = input
    .map(({ shape, color, group }) => {
      const p = shape.extractPoints(48);
      return {
        outer: toPoints(p.shape),
        holes: p.holes.map(toPoints).filter((h) => h.length >= 3),
        color,
        group,
      };
    })
    .filter((f) => f.outer.length >= 3 && Math.abs(area(f.outer)) > 1e-9);
  if (!raw.length)
    throw Error('No filled shapes found in the SVG. Convert strokes and text to filled paths.');
  const xs = raw.flatMap((f) => f.outer.map((p) => p[0])),
    ys = raw.flatMap((f) => f.outer.map((p) => p[1])),
    [x0, y0] = [Math.min(...xs), Math.min(...ys)],
    k = SVG_SIZE / Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0);
  const norm = (pts: Point[]): Point[] => pts.map(([x, y]) => [(x - x0) * k, (y - y0) * k]);
  let flat: { region: Region; color: string; group: string | null }[] = [];
  for (let tol = 0.1; ; tol *= 2) {
    const fit = (pts: Point[]) => simplify(norm(pts), tol) as Point[];
    flat = raw.map((f) => ({
      region: { outer: fit(f.outer), holes: f.holes.map(fit) },
      color: f.color,
      group: f.group,
    }));
    const total = flat.reduce(
      (n, f) => n + f.region.outer.length + f.region.holes.reduce((m, h) => m + h.length, 0),
      0,
    );
    if (total <= POINT_BUDGET || tol > 8) break;
  }

  const all = flat.map((f, i) => {
    const { outer, holes } = f.region,
      ox = outer.map((p) => p[0]),
      oy = outer.map((p) => p[1]);
    return {
      id: 'shape-' + (i + 1),
      name: '',
      type: 'front' as const,
      pixels: Math.abs(area(outer)) - holes.reduce((n, h) => n + Math.abs(area(h)), 0),
      bounds: [Math.min(...ox), Math.min(...oy), Math.max(...ox), Math.max(...oy)] as [
        number,
        number,
        number,
        number,
      ],
      color: f.color,
      regions: [{ outer, holes }],
      svgGroup: f.group,
    };
  });
  const kept = all.filter((c) =>
    [...all]
      .sort((a, b) => b.pixels - a.pixels)
      .slice(0, MAX_ELEMENTS)
      .includes(c),
  );

  // Use the file's own groups when it has at least two; otherwise group by layout.
  // Dots attach to letters only within the same file group.
  const key = (c: { svgGroup: string | null }) => c.svgGroup ?? 'Ungrouped',
    labels = [...new Set(kept.map(key))],
    components =
      labels.length >= 2
        ? labels.flatMap((l) => attachDetails(kept.filter((c) => key(c) === l)))
        : attachDetails(kept);
  const grouped =
    labels.length >= 2
      ? groupClusters(
          components,
          labels.map((l) => components.filter((c: any) => key(c) === l)),
          labels,
        )
      : autoGroup(components);
  const elements: ArtworkElement[] = grouped.components.map(({ svgGroup, ...c }: any, i: number) => ({
    ...c,
    name: 'Element ' + String(i + 1).padStart(2, '0'),
  }));
  const bx = elements.flatMap((e) => [e.bounds[0], e.bounds[2]]),
    by = elements.flatMap((e) => [e.bounds[1], e.bounds[3]]);
  return {
    elements,
    groups: grouped.groups as ArtworkGroup[],
    bounds: [Math.min(...bx), Math.min(...by), Math.max(...bx), Math.max(...by)] as [
      number,
      number,
      number,
      number,
    ],
    width: Math.ceil(Math.max(...bx)),
    height: Math.ceil(Math.max(...by)),
    total: all.length,
  };
}

// Replace <use href="#id"> with a <g> holding a copy of the target, so reused shapes keep the
// group they're placed in (SVGLoader would otherwise parse them where they're defined, e.g. <defs>).
function inlineUses(text: string): string {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  for (let pass = 0; pass < 5; pass++) {
    const uses = [...doc.getElementsByTagName('use')];
    if (!uses.length) break;
    for (const use of uses) {
      const id = (
          use.getAttribute('href') ||
          use.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
          ''
        ).slice(1),
        target = id && doc.getElementById(id);
      const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
      for (const at of [...use.attributes])
        if (!/^(x|y|width|height|href|xlink:href|id)$/.test(at.name)) g.setAttribute(at.name, at.value);
      const [x, y] = [use.getAttribute('x') || '0', use.getAttribute('y') || '0'];
      g.setAttribute('transform', `${use.getAttribute('transform') ?? ''} translate(${x},${y})`);
      if (target) {
        const copy = target.cloneNode(true) as Element;
        copy.removeAttribute('id');
        g.appendChild(copy);
      }
      use.replaceWith(g);
    }
  }
  return new XMLSerializer().serializeToString(doc);
}

// Browser: parse SVG text into filled shapes, each tagged with its top-level <g>.
export function parseSvg(text: string): SvgShape[] {
  const data = new SVGLoader().parse(inlineUses(text)),
    names = new Map<Element, string>(),
    out: SvgShape[] = [];
  const topGroup = (node: Element): string | null => {
    let top: Element | null = null;
    for (let n = node.parentElement; n && n.nodeName !== 'svg'; n = n.parentElement)
      if (n.nodeName === 'g') top = n;
    if (!top) return null;
    if (!names.has(top))
      names.set(
        top,
        top.getAttribute('inkscape:label') ||
          top.getAttribute('data-name') ||
          top.id ||
          'Group ' + (names.size + 1),
      );
    return names.get(top)!;
  };
  for (const path of data.paths) {
    const style = path.userData?.style;
    if (!style || style.fill === 'none' || style.fillOpacity === 0 || style.opacity === 0) continue;
    const group = topGroup(path.userData!.node);
    for (const shape of SVGLoader.createShapes(path))
      out.push({ shape, color: '#' + path.color.getHexString(), group });
  }
  return out;
}

// Face artwork texture drawn from the parsed shapes (never from the raw SVG).
function renderPNG(elements: ArtworkElement[], w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  for (const e of elements) {
    const p = new Path2D();
    for (const r of e.regions)
      for (const loop of [r.outer, ...r.holes]) {
        loop.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
        p.closePath();
      }
    ctx.fillStyle = e.color;
    ctx.fill(p, 'evenodd');
  }
  return c.toDataURL('image/png');
}

export function svgArtwork(text: string): { artwork: Artwork; total: number } {
  const a = shapesToArtwork(parseSvg(text));
  return {
    total: a.total,
    artwork: {
      elements: a.elements,
      groups: a.groups,
      bounds: a.bounds,
      imageWidth: a.width,
      imageHeight: a.height,
      imageData: renderPNG(a.elements, a.width, a.height),
      approved: false,
      origin: 'vector',
    },
  };
}
