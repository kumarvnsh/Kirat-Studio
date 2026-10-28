// Site mockups: a photo of the installation wall with the sign composited onto it in perspective.
// Recce decks (.pptx) give a photo per slide, a red box where the sign goes and the wall size as text.
import { unzipSync } from 'fflate';

export type Pt = [number, number];
export type SiteSlide = {
  name: string;
  image: Uint8Array;
  mime: 'image/jpeg' | 'image/png';
  box: [number, number, number, number] | null; // x, y, w, h as fractions of the photo
  wall: [number, number] | null; // mm
};

const UNITS: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
const unitOf = (u = '') =>
  /^(inch|inches|in|"|”|″)$/i.test(u) ? 'in' : /^(ft|feet|')$/i.test(u) ? 'ft' : u.toLowerCase() || '';

// "Wall Size – 338x36 Inch", "4620 × 950 mm", "15' x 3'" → [width, height] in mm.
export function parseWallSize(text: string): [number, number] | null {
  const m =
    /(\d+(?:\.\d+)?)\s*(inch(?:es)?|in|mm|cm|ft|feet|m|["”″'])?\s*[x×X*]\s*(\d+(?:\.\d+)?)\s*(inch(?:es)?|in|mm|cm|ft|feet|m\b|["”″'])?/.exec(
      text,
    );
  if (!m) return null;
  const [w, h] = [+m[1], +m[3]];
  // ponytail: a bare "338x36" is read as inches when small, mm when large; recce decks rarely say which.
  const unit = unitOf(m[4] ?? m[2]) || (Math.max(w, h) < 600 ? 'in' : 'mm');
  return w > 0 && h > 0 ? [w * UNITS[unit], h * UNITS[unit]] : null;
}

const attr = (xml: string, tag: string, name: string) =>
  new RegExp(`<${tag}\\b[^>]*\\b${name}="(-?\\d+)"`).exec(xml)?.[1];
const xfrm = (xml: string) => {
  const off = /<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/.exec(xml),
    ext = /<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/.exec(xml);
  return off && ext ? { x: +off[1], y: +off[2], w: +ext[1], h: +ext[2] } : null;
};
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

// ponytail: slides in file-name order and shapes outside groups only; read presentation.xml order and
// group transforms if decks ever rely on them.
export function readPptx(bytes: Uint8Array): SiteSlide[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw Error('This PowerPoint file could not be opened. Save it as .pptx and try again.');
  }
  const slides = Object.keys(files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => +a.match(/\d+/)![0] - +b.match(/\d+/)![0]);
  const out: SiteSlide[] = [];
  for (const path of slides) {
    const xml = decode(files[path]),
      rels = decode(files[path.replace('slides/', 'slides/_rels/') + '.rels'] ?? new Uint8Array());
    const target = (id: string) => {
      const t = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${id}"`).exec(rels);
      const rel = t?.[1] ?? t?.[2];
      return rel ? new URL(rel, 'http://x/ppt/slides/').pathname.slice(1) : null;
    };
    // The largest JPEG/PNG picture on the slide is the site photo.
    const pics = [...xml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)].flatMap(([pic]) => {
      const id = /r:embed="([^"]+)"/.exec(pic)?.[1],
        file = id && target(id),
        frame = xfrm(pic),
        mime = file && /\.png$/i.test(file) ? 'image/png' : file && /\.jpe?g$/i.test(file) ? 'image/jpeg' : null;
      if (!file || !files[file] || !frame || !mime) return [];
      const crop = (k: string) => +(attr(pic, 'a:srcRect', k) ?? 0) / 100000;
      return [{ file, frame, mime: mime as SiteSlide['mime'], crop: { l: crop('l'), t: crop('t'), r: crop('r'), b: crop('b') } }];
    });
    if (!pics.length) continue;
    const pic = pics.reduce((a, b) => (b.frame.w * b.frame.h > a.frame.w * a.frame.h ? b : a));
    // The marker: a shape outlined in red. Its frame, relative to the picture, through any crop.
    let box: SiteSlide['box'] = null;
    for (const [sp] of xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
      const line = /<a:ln\b[\s\S]*?<\/a:ln>/.exec(sp)?.[0] ?? '',
        hex = /srgbClr val="([0-9A-Fa-f]{6})"/.exec(line)?.[1];
      const red = hex && parseInt(hex.slice(0, 2), 16) > 180 && parseInt(hex.slice(2, 4), 16) < 90 && parseInt(hex.slice(4, 6), 16) < 90;
      const f = red && xfrm(sp);
      if (!f) continue;
      const { l, t, r, b } = pic.crop,
        fx = (x: number) => l + ((x - pic.frame.x) / pic.frame.w) * (1 - l - r),
        fy = (y: number) => t + ((y - pic.frame.y) / pic.frame.h) * (1 - t - b);
      const [x0, y0, x1, y1] = [fx(f.x), fy(f.y), fx(f.x + f.w), fy(f.y + f.h)].map((v) => Math.min(1, Math.max(0, v)));
      if (x1 - x0 > 0.01 && y1 - y0 > 0.005) box = [x0, y0, x1 - x0, y1 - y0];
      break;
    }
    const text = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(' ').replace(/\s+/g, ' ').trim();
    out.push({
      name: text.slice(0, 120) || `Slide ${path.match(/\d+/)![0]}`,
      image: files[pic.file],
      mime: pic.mime,
      box,
      wall: parseWallSize(text),
    });
  }
  if (!out.length) throw Error('No photos found in this PowerPoint. Each slide needs a JPG or PNG picture.');
  return out;
}

// Projective map of the unit square (corners TL, TR, BR, BL) onto a quad, and its inverse.
type H = [number, number, number, number, number, number, number, number, number];
export function squareToQuad(q: Pt[]): H {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3,
    dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1,
    g = Math.abs(dx3) + Math.abs(dy3) < 1e-12 || !det ? 0 : (dx3 * dy2 - dx2 * dy3) / det,
    h = Math.abs(dx3) + Math.abs(dy3) < 1e-12 || !det ? 0 : (dx1 * dy3 - dx3 * dy1) / det;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
export function invert([a, b, c, d, e, f, g, h, i]: H): H {
  const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e,
    D = f * g - d * i, E = a * i - c * g, F = c * d - a * f,
    G = d * h - e * g, Hh = b * g - a * h, I = a * e - b * d,
    det = a * A + b * D + c * G;
  return [A, B, C, D, E, F, G, Hh, I].map((v) => v / det) as H;
}
export const apply = (m: H, x: number, y: number): Pt => {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
};

// Where the board sits on the photo: centred in the marked wall, in proportion to the real sizes.
export function boardCorners(wallCorners: Pt[], wall: [number, number], board: [number, number]): Pt[] {
  const m = squareToQuad(wallCorners),
    u = (1 - board[0] / wall[0]) / 2,
    v = (1 - board[1] / wall[1]) / 2;
  return ([[u, v], [1 - u, v], [1 - u, 1 - v], [u, 1 - v]] as Pt[]).map(([x, y]) => apply(m, x, y));
}

type Pixels = { data: Uint8ClampedArray; width: number; height: number };
// Paint a straight RGBA image (the board render) over dst in perspective, quad in dst pixels.
// 2×2 samples per pixel with bilinear lookup keep letter edges smooth when the render is minified.
export function composite(dst: Pixels, src: Pixels, quad: Pt[]) {
  const inv = invert(squareToQuad(quad)),
    xs = quad.map((p) => p[0]),
    ys = quad.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(dst.width, Math.ceil(Math.max(...xs))),
    y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(dst.height, Math.ceil(Math.max(...ys)));
  const s = src.data, sw = src.width, sh = src.height, d = dst.data;
  const at = (x: number, y: number, k: number) => s[(y * sw + x) * 4 + k];
  for (let py = y0; py < y1; py++)
    for (let px = x0; px < x1; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const [u, v] = apply(inv, px + ox, py + oy);
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const fx = Math.max(0, u * sw - 0.5), fy = Math.max(0, v * sh - 0.5),
          ix = Math.min(sw - 1, Math.floor(fx)), iy = Math.min(sh - 1, Math.floor(fy)),
          jx = Math.min(sw - 1, ix + 1), jy = Math.min(sh - 1, iy + 1),
          tx = fx - ix, ty = fy - iy;
        for (const [cx, cy, w] of [[ix, iy, (1 - tx) * (1 - ty)], [jx, iy, tx * (1 - ty)], [ix, jy, (1 - tx) * ty], [jx, jy, tx * ty]]) {
          const al = (at(cx, cy, 3) / 255) * w;
          r += at(cx, cy, 0) * al;
          g += at(cx, cy, 1) * al;
          b += at(cx, cy, 2) * al;
          a += al;
        }
      }
      if (a <= 0) continue;
      const i = (py * dst.width + px) * 4, cover = a / 4;
      d[i] = d[i] * (1 - cover) + (r / a) * cover;
      d[i + 1] = d[i + 1] * (1 - cover) + (g / a) * cover;
      d[i + 2] = d[i + 2] * (1 - cover) + (b / a) * cover;
    }
}
