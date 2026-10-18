// Artwork organisation: attach detached details (i-dots, accents) to their letter,
// then group elements so a whole group (symbol, wordmark, tagline) shares one construction.
// All coordinates are traced image pixels, y pointing down.

const height = (c) => c.bounds[3] - c.bounds[1];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// Merge small shapes sitting directly above/below a larger shape into that shape.
// ponytail: geometric heuristic only; the 2D review is still where the user confirms it.
export function attachDetails(components) {
  const merged = new Set(),
    out = components.map((c) => ({ ...c, regions: [...c.regions], bounds: [...c.bounds] }));
  const bySize = [...out].sort((a, b) => b.pixels - a.pixels);
  for (const d of [...bySize].reverse()) {
    const cx = (d.bounds[0] + d.bounds[2]) / 2;
    let host = null,
      best = Infinity;
    for (const h of bySize) {
      if (h === d || merged.has(h) || height(d) >= height(h) * 0.5) continue;
      if (cx < h.bounds[0] || cx > h.bounds[2]) continue;
      const gap = Math.max(h.bounds[1] - d.bounds[3], d.bounds[1] - h.bounds[3]);
      if (gap < height(h) * 0.6 && gap < best) {
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

// Split into rows (vertical overlap), then split rows at wide horizontal gaps.
// Groups much shorter than the tallest group default to vinyl (tagline), the rest front-lit.
export function autoGroup(components) {
  const rows = [];
  for (const c of [...components].sort((a, b) => a.bounds[1] - b.bounds[1])) {
    const row = rows.find((r) => {
      const overlap = Math.min(r.y1, c.bounds[3]) - Math.max(r.y0, c.bounds[1]);
      return overlap >= 0.5 * Math.min(height(c), r.y1 - r.y0);
    });
    if (row) {
      row.items.push(c);
      row.y0 = Math.min(row.y0, c.bounds[1]);
      row.y1 = Math.max(row.y1, c.bounds[3]);
    } else rows.push({ y0: c.bounds[1], y1: c.bounds[3], items: [c] });
  }
  const clusters = [];
  for (const row of rows) {
    const items = row.items.sort((a, b) => a.bounds[0] - b.bounds[0]),
      limit = 1.5 * median(items.map(height));
    let cur = [items[0]],
      right = items[0].bounds[2];
    for (const c of items.slice(1)) {
      if (c.bounds[0] - right > limit) {
        clusters.push(cur);
        cur = [];
      }
      cur.push(c);
      right = Math.max(right, c.bounds[2]);
    }
    clusters.push(cur);
  }
  return groupClusters(components, clusters);
}

// Build groups from clusters of components (each component in exactly one cluster).
// Compare against text-like groups only, so a tall single-shape symbol doesn't make the wordmark "small".
export function groupClusters(components, clusters, names = []) {
  const heights = clusters.map((cl) => median(cl.map(height))),
    text = heights.filter((_, i) => clusters[i].length > 1),
    tallest = Math.max(...(text.length ? text : heights));
  const groups = clusters.map((cl, i) => ({
    id: 'g' + (i + 1),
    name: names[i] || 'Group ' + (i + 1),
    type: heights[i] < tallest * 0.5 ? 'vinyl' : 'front',
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
