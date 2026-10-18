export function area(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    let u = p[i],
      v = p[(i + 1) % p.length];
    a += u[0] * v[1] - v[0] * u[1];
  }
  return a / 2;
}
export function inside(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function distance(p, a, b) {
  let x = b[0] - a[0],
    y = b[1] - a[1],
    t =
      x * x + y * y ? Math.max(0, Math.min(1, ((p[0] - a[0]) * x + (p[1] - a[1]) * y) / (x * x + y * y))) : 0;
  return Math.hypot(p[0] - a[0] - t * x, p[1] - a[1] - t * y);
}
function rdp(p, e) {
  if (p.length < 3) return p;
  let k = 0,
    d = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const v = distance(p[i], p[0], p[p.length - 1]);
    if (v > d) {
      d = v;
      k = i;
    }
  }
  if (d <= e) return [p[0], p[p.length - 1]];
  return [...rdp(p.slice(0, k + 1), e).slice(0, -1), ...rdp(p.slice(k), e)];
}
export function simplify(p, e = 0.7) {
  if (p.length < 5) return p;
  let k = 1,
    d = 0;
  for (let i = 1; i < p.length; i++) {
    const v = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]);
    if (v > d) {
      k = i;
      d = v;
    }
  }
  const a = rdp(p.slice(0, k + 1), e),
    b = rdp([...p.slice(k), p[0]], e);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : p;
}
export function maskFromRGBA(data, w, h, mode = 'white', threshold = 45) {
  const out = new Uint8Array(w * h),
    bg = mode === 'black' ? [0, 0, 0] : mode === 'corner' ? [data[0], data[1], data[2]] : [255, 255, 255];
  for (let i = 0; i < out.length; i++) {
    const j = i * 4;
    let d = Math.max(Math.abs(data[j] - bg[0]), Math.abs(data[j + 1] - bg[1]), Math.abs(data[j + 2] - bg[2]));
    out[i] = data[j + 3] > 80 && (mode === 'alpha' || d > threshold) ? 1 : 0;
  }
  return out;
}
export function traceMask(
  mask,
  w,
  h,
  { minPixels = 12, tolerance = 0.65, maxComponents = 120, rgba = null } = {},
) {
  const labels = new Int32Array(w * h),
    components = [];
  let id = 0;
  const stride = w + 1;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    id++;
    let queue = [start],
      head = 0;
    labels[start] = id;
    let minx = w,
      miny = h,
      maxx = 0,
      maxy = 0,
      rr = 0,
      gg = 0,
      bb = 0;
    while (head < queue.length) {
      const n = queue[head++],
        x = n % w,
        y = Math.floor(n / w);
      minx = Math.min(minx, x);
      maxx = Math.max(maxx, x);
      miny = Math.min(miny, y);
      maxy = Math.max(maxy, y);
      if (rgba) {
        rr += rgba[n * 4];
        gg += rgba[n * 4 + 1];
        bb += rgba[n * 4 + 2];
      }
      for (const v of [
        x > 0 ? n - 1 : -1,
        x < w - 1 ? n + 1 : -1,
        y > 0 ? n - w : -1,
        y < h - 1 ? n + w : -1,
      ])
        if (v >= 0 && mask[v] && !labels[v]) {
          labels[v] = id;
          queue.push(v);
        }
    }
    if (queue.length < minPixels) continue;
    const edges = new Map();
    const add = (x1, y1, x2, y2) => {
      const a = y1 * stride + x1,
        b = y2 * stride + x2;
      if (!edges.has(a)) edges.set(a, []);
      edges.get(a).push(b);
    };
    for (const n of queue) {
      const x = n % w,
        y = Math.floor(n / w);
      if (y === 0 || labels[n - w] !== id) add(x, y, x + 1, y);
      if (x === w - 1 || labels[n + 1] !== id) add(x + 1, y, x + 1, y + 1);
      if (y === h - 1 || labels[n + w] !== id) add(x + 1, y + 1, x, y + 1);
      if (x === 0 || labels[n - 1] !== id) add(x, y + 1, x, y);
    }
    let loops = [];
    while (edges.size) {
      const first = edges.keys().next().value;
      let cur = first,
        prev = null,
        path = [],
        guard = 0;
      while (guard++ < queue.length * 8 + 10) {
        path.push([cur % stride, Math.floor(cur / stride)]);
        let opts = edges.get(cur);
        if (!opts?.length) break;
        let choice = 0;
        if (opts.length > 1 && prev !== null) {
          const dx = (cur % stride) - (prev % stride),
            dy = Math.floor(cur / stride) - Math.floor(prev / stride);
          const dir = dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3;
          let score = 99;
          for (let k = 0; k < opts.length; k++) {
            const v = opts[k],
              nx = (v % stride) - (cur % stride),
              ny = Math.floor(v / stride) - Math.floor(cur / stride),
              nd = nx > 0 ? 0 : ny > 0 ? 1 : nx < 0 ? 2 : 3;
            const turn = (nd - dir + 4) % 4,
              rank = turn === 1 ? 0 : turn === 0 ? 1 : turn === 3 ? 2 : 3;
            if (rank < score) {
              score = rank;
              choice = k;
            }
          }
        }
        const next = opts.splice(choice, 1)[0];
        if (!opts.length) edges.delete(cur);
        prev = cur;
        cur = next;
        if (cur === first) break;
      }
      if (cur === first && path.length >= 4) {
        const loop = simplify(path, tolerance);
        if (Math.abs(area(loop)) >= 2) loops.push(loop);
      }
    }
    const outers = loops.filter((p) => area(p) > 0).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a))),
      holes = loops.filter((p) => area(p) < 0);
    if (!outers.length) continue;
    const count = queue.length;
    components.push({
      id: 'shape-' + id,
      name: 'Shape ' + String(components.length + 1).padStart(2, '0'),
      pixels: count,
      bounds: [minx, miny, maxx + 1, maxy + 1],
      color: rgba
        ? '#' +
          [rr, gg, bb]
            .map((v) =>
              Math.round(v / count)
                .toString(16)
                .padStart(2, '0'),
            )
            .join('')
        : '#f39c36',
      regions: outers.map((outer) => ({ outer, holes: holes.filter((hole) => inside(hole[0], outer)) })),
      type: 'front',
    });
  }
  components.sort((a, b) => b.pixels - a.pixels);
  let truncated = components.length > maxComponents;
  return { components: components.slice(0, maxComponents), truncated, total: components.length };
}
export function perimeter(p) {
  return p.reduce(
    (s, v, i) => s + Math.hypot(v[0] - p[(i + 1) % p.length][0], v[1] - p[(i + 1) % p.length][1]),
    0,
  );
}
export function bentPath(path, progress) {
  let out = [path[0].slice()],
    theta0 = Math.atan2(path[1][1] - path[0][1], path[1][0] - path[0][0]),
    prev = theta0;
  for (let i = 0; i < path.length; i++) {
    let a = path[i],
      b = path[(i + 1) % path.length],
      theta = Math.atan2(b[1] - a[1], b[0] - a[0]);
    while (theta - prev > Math.PI) theta -= 2 * Math.PI;
    while (theta - prev < -Math.PI) theta += 2 * Math.PI;
    prev = theta;
    const angle = theta0 + (theta - theta0) * progress,
      L = Math.hypot(b[0] - a[0], b[1] - a[1]),
      p = out[out.length - 1];
    out.push([p[0] + Math.cos(angle) * L, p[1] + Math.sin(angle) * L]);
  }
  return out;
}
