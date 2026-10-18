// Artwork organisation: attach detached details (i-dots, accents) to their letter,
// then group elements so a whole group (symbol, wordmark, tagline) shares one construction.
// All coordinates are traced image pixels, y pointing down.

const height = (c) => c.bounds[3] - c.bounds[1];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const width = (c) => c.bounds[2] - c.bounds[0];
const vOverlap = (a, b) => Math.min(a.bounds[3], b.bounds[3]) - Math.max(a.bounds[1], b.bounds[1]);
const hGap = (a, b) => Math.max(a.bounds[0], b.bounds[0]) - Math.min(a.bounds[2], b.bounds[2]); // < 0 = overlap
const ratio = (a, b) => Math.max(a, b) / Math.max(1e-9, Math.min(a, b));

const rgb = (hex) =>
  /^#[0-9a-f]{6}$/i.test(hex || '') ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : null;
// Clearly different fill colours (e.g. a green icon beside black lettering). Unknown colour = similar.
function differentColour(a, b) {
  const p = rgb(a.color),
    q = rgb(b.color);
  return !!p && !!q && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 110;
}

// Two shapes sit on the same text line: similar height and colour, overlapping vertically, close horizontally.
function sameLine(a, b) {
  const ha = height(a),
    hb = height(b);
  return (
    ratio(ha, hb) <= 1.8 &&
    vOverlap(a, b) >= 0.5 * Math.min(ha, hb) &&
    hGap(a, b) <= Math.min(ha, hb) &&
    !differentColour(a, b)
  );
}

// Merge true detached details (i/j dots, accents) into the letter below them.
// A dot sits above its letter, is small in both directions, and has no same-size neighbours on its
// own line (shapes with those are letters of a smaller line, e.g. a tagline, not dots).
// ponytail: geometric heuristic only; the 2D review is still where the user confirms it.
export function attachDetails(components) {
  const merged = new Set(),
    out = components.map((c) => ({ ...c, regions: [...c.regions], bounds: [...c.bounds] }));
  const bySize = [...out].sort((a, b) => b.pixels - a.pixels);
  for (const d of [...bySize].reverse()) {
    if (out.some((m) => m !== d && !merged.has(m) && sameLine(d, m))) continue;
    const cx = (d.bounds[0] + d.bounds[2]) / 2;
    let host = null,
      best = Infinity;
    for (const h of bySize) {
      if (h === d || merged.has(h) || height(d) >= height(h) * 0.5 || width(d) > width(h) * 1.5) continue;
      if (cx < h.bounds[0] || cx > h.bounds[2]) continue;
      const gap = h.bounds[1] - d.bounds[3]; // dot above the letter: positive gap
      if (gap > -0.1 * height(h) && gap < height(h) * 0.6 && gap < best) {
        best = gap;
        host = h;
      }
    }
    if (!host) continue;
    host.regions.push(...d.regions);
    host.pixels += d.pixels;
    host.bounds = [
      Math.min(host.bounds[0], d.bounds[0]),
      Math.min(host.bounds[1], d.bounds[1]),
      Math.max(host.bounds[2], d.bounds[2]),
      Math.max(host.bounds[3], d.bounds[3]),
    ];
    merged.add(d);
  }
  return out.filter((c) => !merged.has(c));
}

const band = (cl) => {
  const y0 = Math.min(...cl.map((c) => c.bounds[1])),
    y1 = Math.max(...cl.map((c) => c.bounds[3])),
    x0 = Math.min(...cl.map((c) => c.bounds[0])),
    x1 = Math.max(...cl.map((c) => c.bounds[2]));
  return { x0, y0, x1, y1, h: median(cl.map(height)) };
};

// Group by text lines, not by rows: shapes link only to similar-height neighbours, so a tall symbol
// can't pull the wordmark and tagline into one group. Then:
//   - punctuation and bullets (short single shapes) join the line they sit inside;
//   - same-height fragments merge: words of one line with wide spacing (e.g. "A • B • C"),
//     and stacked lines of a two-line wordmark.
export function autoGroup(components) {
  const n = components.length,
    parent = [...Array(n).keys()];
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) if (sameLine(components[i], components[j])) parent[find(i)] = find(j);
  let clusters = [...new Set(components.map((_, i) => find(i)))].map((r) =>
    components.filter((_, i) => find(i) === r),
  );

  for (const single of clusters.filter((cl) => cl.length === 1)) {
    const c = single[0],
      cy = (c.bounds[1] + c.bounds[3]) / 2;
    const home = clusters
      .filter((cl) => cl !== single && cl.length > 1)
      .map((cl) => ({ cl, b: band(cl) }))
      .filter(
        ({ b }) =>
          height(c) < 0.6 * b.h &&
          cy >= b.y0 &&
          cy <= b.y1 &&
          c.bounds[0] <= b.x1 + b.h &&
          c.bounds[2] >= b.x0 - b.h,
      )
      .sort((p, q) => Math.abs(cy - (p.b.y0 + p.b.y1) / 2) - Math.abs(cy - (q.b.y0 + q.b.y1) / 2))[0];
    if (home) {
      home.cl.push(c);
      clusters = clusters.filter((cl) => cl !== single);
    }
  }

  // Merge clusters pairwise while `join(a, b)` holds for some pair.
  const mergeWhile = (list, join) => {
    for (let merged = true; merged; ) {
      merged = false;
      outer: for (const a of list)
        for (const b of list)
          if (a !== b && join(a, b)) {
            a.push(...b);
            list.splice(list.indexOf(b), 1);
            merged = true;
            break outer;
          }
    }
    return list;
  };

  // 1. Words of one line: same band, similar height, up to 3 letter-heights apart (wide spacing,
  //    separators). Words can differ in median height (ascenders, descenders): looser match.
  //    Single shapes (e.g. letters split off by colour) rejoin only at nearly the same height and
  //    letter spacing, so an icon beside the text stays separate.
  mergeWhile(clusters, (a, b) => {
    const single = a.length < 2 || b.length < 2,
      A = band(a),
      B = band(b);
    return (
      ratio(A.h, B.h) <= (single ? 1.25 : 1.6) &&
      Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) >= 0.5 * Math.min(A.y1 - A.y0, B.y1 - B.y0) &&
      Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1) <= (single ? 1 : 3) * Math.max(A.h, B.h)
    );
  });

  // 2. Text lines are rows of 3+ shapes sitting side by side; everything else is graphic (symbol
  //    pieces, icons). Letters rarely overlap horizontally; pieces of a mark are stacked over each other.
  const stacked = (c, cl) => cl.some((d) => d !== c && -hGap(c, d) >= 0.5 * Math.min(width(c), width(d)));
  const isText = (cl) => {
    const b = band(cl);
    return (
      cl.length >= 3 &&
      b.x1 - b.x0 >= 2.5 * b.h &&
      b.y1 - b.y0 <= 2.2 * b.h &&
      cl.filter((c) => stacked(c, cl)).length <= 0.25 * cl.length
    );
  };
  const text = clusters.filter(isText),
    graphic = clusters.filter((cl) => !isText(cl));

  // 3. Stacked text lines of the same size (a two-line wordmark) are one group.
  mergeWhile(text, (a, b) => {
    const A = band(a),
      B = band(b),
      vgap = Math.max(A.y0, B.y0) - Math.min(A.y1, B.y1);
    return (
      ratio(A.h, B.h) <= 1.25 && vgap < Math.max(A.h, B.h) && Math.min(A.x1, B.x1) > Math.max(A.x0, B.x0)
    );
  });

  // 4. Graphic pieces that touch or nearly touch form one symbol (multi-colour, multi-piece marks).
  mergeWhile(graphic, (a, b) => {
    const A = band(a),
      B = band(b),
      dist = Math.max(
        0,
        Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1),
        Math.max(A.y0, B.y0) - Math.min(A.y1, B.y1),
      );
    return dist < 0.5 * Math.min(A.y1 - A.y0, B.y1 - B.y0);
  });

  clusters = [...text, ...graphic].sort((a, b) => band(a).y0 - band(b).y0 || band(a).x0 - band(b).x0);
  const { names, types } = nameClusters(clusters, new Set(text));
  return groupClusters(components, clusters, names, types);
}

// Main wordmark = the text line with the most area; text lines much shorter than it are taglines
// (vinyl by default); large graphics are symbols. Everything else stays "Group n".
function nameClusters(clusters, text) {
  const area = (cl) => cl.reduce((s, c) => s + c.pixels, 0),
    main = [...text].sort((a, b) => area(b) - area(a))[0];
  if (!main) return { names: [], types: undefined };
  const h = band(main).h,
    counts = {};
  const label = (base) => ((counts[base] = (counts[base] || 0) + 1) > 1 ? `${base} ${counts[base]}` : base);
  const names = clusters.map((cl) => {
    const b = band(cl);
    if (cl === main) return 'Main wordmark';
    if (!text.has(cl)) return b.y1 - b.y0 >= 0.9 * h ? label('Symbol') : '';
    return b.h < 0.5 * h ? label('Tagline') : '';
  });
  return { names, types: names.map((n) => (n.startsWith('Tagline') ? 'vinyl' : 'front')) };
}

// Build groups from clusters of components (each component in exactly one cluster).
// Compare against text-like groups only, so a tall single-shape symbol doesn't make the wordmark "small".
export function groupClusters(components, clusters, names = [], types) {
  const heights = clusters.map((cl) => median(cl.map(height))),
    text = heights.filter((_, i) => clusters[i].length > 1),
    tallest = Math.max(...(text.length ? text : heights));
  const groups = clusters.map((cl, i) => ({
    id: 'g' + (i + 1),
    name: names[i] || 'Group ' + (i + 1),
    type: types?.[i] ?? (heights[i] < tallest * 0.5 ? 'vinyl' : 'front'),
  }));
  const groupOf = new Map();
  clusters.forEach((cl, i) => cl.forEach((c) => groupOf.set(c, groups[i])));
  return {
    groups,
    components: components.map((c) => ({
      ...c,
      group: groupOf.get(c).id,
      type: groupOf.get(c).type,
      override: false,
    })),
  };
}

// Set a group's construction; elements with a per-element override keep theirs.
export function applyGroupType(groups, components, groupId, type) {
  const g = groups.find((g) => g.id === groupId);
  if (!g) return;
  // Recipe params belong to the old construction; a new construction starts from its defaults.
  if (g.type !== type) delete g.params;
  g.type = type;
  for (const c of components) if (c.group === groupId && !c.override) c.type = type;
}
