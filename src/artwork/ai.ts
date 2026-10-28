// Adobe Illustrator import. Modern .ai files carry a full PDF copy ("Create PDF Compatible File"),
// so each artboard is a PDF page. Filled paths become an SVG (fed to the normal vector import) and
// the artboard and artwork sizes come back in mm so the board can be sized to match.
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFString,
  PDFHexString,
  decodePDFRawStream,
  type PDFPage,
} from 'pdf-lib';

export type AiPath = {
  layer: string;
  fill: string;
  d: string; // SVG path data
  evenodd: boolean;
  bounds: [number, number, number, number];
};
export type AiArtboard = {
  index: number;
  widthMm: number;
  heightMm: number;
  paths: AiPath[]; // filled shapes in mm, artboard top-left origin
  strokes: number; // stroked lines (often dimension lines), not imported
  background?: string; // fill of a board rectangle drawn behind the artwork (the ACP colour)
  skipped: number; // text and images the import can't use
};

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
};

// Content stream → operands/operator pairs. Strings, arrays and dicts are kept as opaque operands.
function* operations(src: string): Generator<[string, (number | string)[]]> {
  const stack: (number | string)[] = [];
  let i = 0;
  const ws = /[\s\0]/;
  while (i < src.length) {
    const ch = src[i];
    if (ws.test(ch)) i++;
    else if (ch === '%') while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i++;
    else if (ch === '(') {
      let depth = 0;
      for (; i < src.length; i++) {
        if (src[i] === '\\') i++;
        else if (src[i] === '(') depth++;
        else if (src[i] === ')' && --depth === 0) break;
      }
      i++;
      stack.push('(string)');
    } else if (ch === '<' && src[i + 1] === '<') {
      let depth = 0;
      for (; i < src.length; i++) {
        if (src.startsWith('<<', i)) (depth++, i++);
        else if (src.startsWith('>>', i) && (i++, --depth === 0)) break;
      }
      i++;
      stack.push('(dict)');
    } else if (ch === '<') {
      i = src.indexOf('>', i) + 1 || src.length;
      stack.push('(string)');
    } else if (ch === '[' || ch === ']' || ch === '{' || ch === '}') i++; // array contents stay on the stack
    else if (ch === '/') {
      let j = i + 1;
      while (j < src.length && !/[\s\0/[\]()<>{}%]/.test(src[j])) j++;
      stack.push(src.slice(i, j));
      i = j;
    } else {
      let j = i;
      while (j < src.length && !/[\s\0/[\]()<>{}%]/.test(src[j])) j++;
      if (j === i) j++;
      const word = src.slice(i, j);
      i = j;
      const n = Number(word);
      if (word !== '' && Number.isFinite(n)) stack.push(n);
      else {
        if (word === 'BI') {
          // Inline image: skip its binary data up to EI.
          const end = src.slice(i).search(/\sEI(?=[\s\0]|$)/);
          i = end < 0 ? src.length : i + end + 3;
        }
        yield [word, stack.splice(0)];
      }
    }
  }
}

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
// ponytail: naive CMYK and 1-component = gray; spot (Separation) tints read as gray. Use the alternate space if spot colours matter.
function colour(ns: number[]): string | null {
  if (ns.length === 1) return hex(ns[0], ns[0], ns[0]);
  if (ns.length === 3) return hex(ns[0], ns[1], ns[2]);
  if (ns.length === 4) {
    const [c, m, y, k] = ns;
    return hex((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k));
  }
  return null;
}

const name = (v: unknown) => (v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : '');

function artboard(doc: PDFDocument, page: PDFPage, index: number, hiddenLayers: Set<PDFDict>): AiArtboard {
  const ctx = doc.context,
    look = (v: unknown) => (v instanceof PDFRef ? ctx.lookup(v) : v),
    unit = (page.node.get(PDFName.of('UserUnit')) as PDFNumber | undefined)?.asNumber() ?? 1,
    mm = (unit * 25.4) / 72,
    box = page.getTrimBox(),
    // PDF (y up, points) → SVG in mm (y down) relative to the artboard's top-left.
    base: M = [mm, 0, 0, -mm, -box.x * mm, (box.y + box.height) * mm];
  const paths: AiPath[] = [];
  let skipped = 0,
    strokes = 0;

  const run = (src: string, resources: PDFDict | undefined, start: M, depth: number) => {
    type G = { ctm: M; fill: string };
    let g: G = { ctm: start, fill: '#000000' };
    const saved: G[] = [],
      marks: { layer?: string; hidden: boolean }[] = [];
    let d = '',
      pathBounds: number[] = [],
      cur: [number, number] = [0, 0],
      text = false;
    const T = (x: number, y: number) => {
      const m = g.ctm;
      return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
    };
    const fmt = ([X, Y]: number[]) => `${+X.toFixed(3)} ${+Y.toFixed(3)}`;
    const P = (x: number, y: number) => {
      const p = T(x, y);
      pathBounds.push(p[0], p[1]);
      return fmt(p);
    };
    // Cubic from the current point; bounds come from points on the curve, not its control handles.
    const C = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
      const [a, b, c, e] = [T(cur[0], cur[1]), T(x1, y1), T(x2, y2), T(x3, y3)];
      for (let t = 0.125; t <= 1; t += 0.125) {
        const u = 1 - t,
          w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
        pathBounds.push(
          w[0] * a[0] + w[1] * b[0] + w[2] * c[0] + w[3] * e[0],
          w[0] * a[1] + w[1] * b[1] + w[2] * c[1] + w[3] * e[1],
        );
      }
      cur = [x3, y3];
      return `C${fmt(b)} ${fmt(c)} ${fmt(e)}`;
    };
    const res = (kind: string, key: string) => {
      const dict = look(resources?.get(PDFName.of(kind)));
      return dict instanceof PDFDict ? look(dict.get(PDFName.of(key.slice(1)))) : undefined;
    };
    const hidden = () => marks.some((m) => m.hidden);
    const layer = () => [...marks].reverse().find((m) => m.layer)?.layer ?? '';
    const paint = (fill: boolean, evenodd = false) => {
      if (fill && d && !hidden()) {
        const xs = pathBounds.filter((_, k) => k % 2 === 0),
          ys = pathBounds.filter((_, k) => k % 2 === 1);
        paths.push({
          layer: layer(),
          fill: g.fill,
          d,
          evenodd,
          bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        });
      } else if (d && !fill) strokes++;
      d = '';
      pathBounds = [];
    };
    for (const [op, a] of operations(src)) {
      const n = a.filter((v): v is number => typeof v === 'number');
      if (text && op !== 'ET') continue;
      switch (op) {
        case 'q': saved.push({ ...g }); break;
        case 'Q': g = saved.pop() ?? g; break;
        case 'cm': if (n.length === 6) g.ctm = mul(n as M, g.ctm); break;
        case 'm': d += `M${P(n[0], n[1])}`; cur = [n[0], n[1]]; break;
        case 'l': d += `L${P(n[0], n[1])}`; cur = [n[0], n[1]]; break;
        case 'c': d += C(n[0], n[1], n[2], n[3], n[4], n[5]); break;
        case 'v': d += C(cur[0], cur[1], n[0], n[1], n[2], n[3]); break;
        case 'y': d += C(n[0], n[1], n[2], n[3], n[2], n[3]); break;
        case 'h': d += 'Z'; break;
        case 're': {
          const [x, y, w, h] = n;
          d += `M${P(x, y)}L${P(x + w, y)}L${P(x + w, y + h)}L${P(x, y + h)}Z`;
          cur = [x, y];
          break;
        }
        case 'f': case 'F': case 'B': paint(true); break;
        case 'f*': case 'B*': paint(true, true); break;
        case 'b': d += 'Z'; paint(true); break;
        case 'b*': d += 'Z'; paint(true, true); break;
        case 'S': case 's': paint(false); break;
        case 'n': d = ''; pathBounds = []; break; // clip-only path; ponytail: clipping ignored, shapes import uncropped
        case 'g': case 'rg': case 'k': case 'sc': case 'scn':
          g.fill = colour(n) ?? g.fill;
          break;
        case 'BT': text = true; break;
        case 'ET': if (text) skipped++; text = false; break;
        case 'BI': skipped++; break;
        case 'BDC': case 'BMC': {
          const ocg = a[0] === '/OC' && typeof a[1] === 'string' ? res('Properties', a[1]) : undefined;
          marks.push(
            ocg instanceof PDFDict
              ? { layer: name(ocg.get(PDFName.of('Name'))), hidden: hiddenLayers.has(ocg) }
              : { hidden: false },
          );
          break;
        }
        case 'EMC': marks.pop(); break;
        case 'Do': {
          const xo = typeof a[0] === 'string' ? res('XObject', a[0]) : undefined;
          if (!(xo instanceof PDFRawStream)) break;
          if (xo.dict.get(PDFName.of('Subtype'))?.toString() !== '/Form' || depth > 8) {
            skipped++;
            break;
          }
          const fm = look(xo.dict.get(PDFName.of('Matrix')));
          const matrix = fm instanceof PDFArray ? (fm.asArray().map((v) => (look(v) as PDFNumber).asNumber()) as M) : null;
          const fr = look(xo.dict.get(PDFName.of('Resources')));
          run(
            latin1(decodePDFRawStream(xo).decode()),
            fr instanceof PDFDict ? fr : resources,
            matrix ? mul(matrix, g.ctm) : g.ctm,
            depth + 1,
          );
          break;
        }
      }
    }
  };

  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map(look) : [contents];
  const src = streams
    .filter((s): s is PDFRawStream => s instanceof PDFRawStream)
    .map((s) => latin1(decodePDFRawStream(s).decode()))
    .join('\n');
  run(src, page.node.Resources(), base, 0);

  // A board drawn behind the logo: the first shape, enclosing nearly all the others. It gives the
  // ACP colour and is not imported as a shape.
  const [first, ...rest] = paths,
    inside = (b: AiPath['bounds']) =>
      b[0] >= first.bounds[0] - 0.5 && b[1] >= first.bounds[1] - 0.5 && b[2] <= first.bounds[2] + 0.5 && b[3] <= first.bounds[3] + 0.5;
  const board = rest.length >= 2 && rest.filter((p) => inside(p.bounds)).length >= rest.length * 0.9;
  return {
    index,
    widthMm: box.width * mm,
    heightMm: box.height * mm,
    paths: board ? rest : paths,
    strokes,
    skipped,
    ...(board ? { background: first.fill } : {}),
  };
}

export const boardColours = (b: AiArtboard) => [...new Set(b.paths.map((p) => p.fill))];

// Sign files carry dimension callouts: measuring lines (strokes) with small outlined labels such as
// "4175mm". When a board has measuring lines, a colour used only by small shapes (under a third of
// the tallest shape) is taken as callout text and starts excluded. Returns path indices.
export function suggestedExclude(b: AiArtboard): number[] {
  if (!b.strokes || boardColours(b).length < 2) return [];
  const h = (p: AiPath) => p.bounds[3] - p.bounds[1],
    tallest = Math.max(...b.paths.map(h));
  const callout = boardColours(b).filter((c) => b.paths.every((p) => p.fill !== c || h(p) < tallest / 3));
  if (callout.length === boardColours(b).length) return [];
  return b.paths.flatMap((p, i) => (callout.includes(p.fill) ? [i] : []));
}

const pathSvg = (p: AiPath) => `<path d="${p.d}" fill="${p.fill}"${p.evenodd ? ' fill-rule="evenodd"' : ''}/>`;

// The artboard as SVG (layers as named groups) plus the size of what's kept, in mm.
export function boardArt(b: AiArtboard, exclude: number[] = []) {
  const kept = b.paths.filter((_, i) => !exclude.includes(i)),
    layers = new Map<string, string[]>();
  for (const p of kept) layers.set(p.layer, [...(layers.get(p.layer) ?? []), pathSvg(p)]);
  const groups = [...layers]
    .map(([l, ps]) => `<g data-name="${l.replace(/[<>&"]/g, '')}">${ps.join('')}</g>`)
    .join('');
  const [W, H] = [b.widthMm, b.heightMm];
  const edge = (k: number, f: (...n: number[]) => number) => f(...kept.map((p) => p.bounds[k]));
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm">${groups}</svg>`,
    shapes: kept.length,
    artWidthMm: kept.length ? edge(2, Math.max) - edge(0, Math.min) : 0,
    artHeightMm: kept.length ? edge(3, Math.max) - edge(1, Math.min) : 0,
  };
}

// The artboard Illustrator reports as the document size (XMP MaxPageSize), else the first.
function preferredBoard(raw: string, boards: AiArtboard[]): number {
  const m = /<xmpTPg:MaxPageSize[^>]*?stDim:w="([\d.]+)"[^>]*?stDim:h="([\d.]+)"[^>]*?stDim:unit="(\w+)"/.exec(raw);
  if (!m) return 0;
  const per = { Inches: 25.4, Millimeters: 1, Centimeters: 10, Points: 25.4 / 72, Pixels: 25.4 / 72 }[m[3]];
  if (!per) return 0;
  const [w, h] = [+m[1] * per, +m[2] * per];
  const i = boards.findIndex((b) => Math.abs(b.widthMm - w) < 1 && Math.abs(b.heightMm - h) < 1);
  return Math.max(0, i);
}

export async function readAi(bytes: Uint8Array): Promise<{ boards: AiArtboard[]; preferred: number }> {
  if (latin1(bytes.subarray(0, 5)) !== '%PDF-')
    throw Error('This .ai file has no PDF copy inside. In Illustrator, Save As .ai with "Create PDF Compatible File" ticked.');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const ctx = doc.context,
    props = ctx.lookup(doc.catalog.get(PDFName.of('OCProperties'))),
    d = props instanceof PDFDict ? ctx.lookup(props.get(PDFName.of('D'))) : undefined,
    off = d instanceof PDFDict ? ctx.lookup(d.get(PDFName.of('OFF'))) : undefined,
    hidden = new Set(off instanceof PDFArray ? off.asArray().map((r) => ctx.lookup(r) as PDFDict) : []);
  const boards = doc.getPages().map((p, i) => artboard(doc, p, i, hidden)).filter((b) => b.paths.length);
  if (!boards.length) throw Error('No filled shapes found in the .ai file. Convert text and strokes to outlines.');
  return { boards, preferred: preferredBoard(latin1(bytes.subarray(0, 600000)), boards) };
}
