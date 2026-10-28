// Rooftop support structures: steel members that hold free-standing letters above a roof.
// Sign coordinates (mm): x right, y up, z out of the sign; members are centred on z = 0 and the
// letter backs sit on their front face. A layout guide only: wind load, roof fixing and the
// structural design are for an engineer to check.
import type { DesignSettings, Mounting } from './project.ts';

type P3 = [number, number, number];
export type StructureMember = { name: string; a: P3; b: P3 };
export type RooftopStructure = { members: StructureMember[]; roofY: number; feet: P3[] };
type Box = [number, number, number, number]; // x0, y0, x1, y1

const MEMBER_LIMIT = 600;

// n evenly spaced positions from a to b, no gap wider than `spacing`, always both ends.
function columns(a: number, b: number, spacing: number): number[] {
  const n = Math.max(2, Math.ceil((b - a) / spacing) + 1);
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

// Posts behind each letter (more across wide letters), merged where letters nearly touch.
// Each post reaches 70% up its letter so the letter back can be fixed to it.
function letterPosts(letters: Box[], spacing: number, merge: number) {
  const posts = letters
    .flatMap(([x0, y0, x1, y1]) => {
      const k = Math.max(1, Math.ceil((x1 - x0) / spacing));
      return Array.from({ length: k }, (_, i) => ({ x: x0 + ((x1 - x0) * (i + 0.5)) / k, top: y0 + (y1 - y0) * 0.7 }));
    })
    .sort((p, q) => p.x - q.x);
  const out: typeof posts = [];
  for (const p of posts) {
    const last = out.at(-1);
    if (last && p.x - last.x < merge) last.top = Math.max(last.top, p.top);
    else out.push({ ...p });
  }
  return out;
}

export function rooftopStructure(s: DesignSettings, m: Mounting, letters: Box[]): RooftopStructure {
  const F = s.frame;
  const boxes: Box[] = letters.length ? letters : [[-s.width / 2, -s.height * 0.375, s.width / 2, s.height * 0.375]];
  const x0 = Math.min(...boxes.map((b) => b[0])),
    y0 = Math.min(...boxes.map((b) => b[1])),
    x1 = Math.max(...boxes.map((b) => b[2])),
    y1 = Math.max(...boxes.map((b) => b[3]));
  // A beam needs its own depth under the letters, whatever the clearance.
  const roofY = m.structure === 'beam' ? Math.min(y0 - m.clearance, y0 - F) : y0 - m.clearance;
  const members: StructureMember[] = [];
  const add = (name: string, a: P3, b: P3) => {
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1) members.push({ name, a, b });
  };
  // Rear kicker from a point on an upright back down to the roof.
  const kicker = (x: number, y: number, name = 'Rear kicker') => add(name, [x, y, 0], [x, roofY, -Math.max(300, (y - roofY) * 0.6)]);

  if (m.structure === 'beam') {
    add('Box beam', [x0 - 50, y0 - F / 2, 0], [x1 + 50, y0 - F / 2, 0]);
    if (y0 - F - roofY > 1) for (const x of columns(x0, x1, m.spacing)) add('Beam leg', [x, roofY, 0], [x, y0 - F, 0]);
    for (const p of letterPosts(boxes, m.spacing, F * 2)) {
      add('Letter upright', [p.x, y0, 0], [p.x, p.top, 0]);
      kicker(p.x, p.top);
    }
  } else if (m.structure === 'braced') {
    for (const p of letterPosts(boxes, m.spacing, F * 2)) {
      add('Post', [p.x, roofY, 0], [p.x, p.top, 0]);
      add('Diagonal brace', [p.x, roofY + (p.top - roofY) * 0.65, 0], [p.x, roofY, -Math.max(300, (p.top - roofY) * 0.55)]);
    }
  } else {
    const xa = x0 - 100, xb = x1 + 100, top = y1 + 50;
    const xs = columns(xa, xb, m.spacing),
      ys = columns(roofY + F / 2, top - F / 2, m.spacing);
    for (const x of xs) add('Lattice vertical', [x, roofY, 0], [x, top, 0]);
    for (const y of ys) add('Lattice chord', [xa, y, 0], [xb, y, 0]);
    for (let i = 0; i + 1 < xs.length; i++)
      for (let j = 0; j + 1 < ys.length; j++) {
        const up = (i + j) % 2 === 0;
        add('Lattice diagonal', [xs[i], up ? ys[j] : ys[j + 1], 0], [xs[i + 1], up ? ys[j + 1] : ys[j], 0]);
      }
    for (const x of xs) kicker(x, roofY + (top - roofY) * 0.66);
  }

  const feet: P3[] = [];
  for (const mb of members)
    for (const p of [mb.a, mb.b])
      if (Math.abs(p[1] - roofY) < 1 && !feet.some((f) => Math.hypot(f[0] - p[0], f[2] - p[2]) < F)) feet.push(p);
  return { members: members.slice(0, MEMBER_LIMIT), roofY, feet };
}

export const memberLength = (mb: StructureMember) =>
  Math.hypot(mb.a[0] - mb.b[0], mb.a[1] - mb.b[1], mb.a[2] - mb.b[2]);
