// Border consensus is deliberately conservative; a preview and manual override remain available.
export function detectBackground(data, w, h, mode = 'auto', custom = '#ffffff') {
  if (mode === 'alpha') return { mode: 'alpha', color: null, rgb: null, confidence: 1 };
  if (mode === 'white' || mode === 'black' || mode === 'corner' || mode === 'custom') {
    const rgb =
      mode === 'white'
        ? [255, 255, 255]
        : mode === 'black'
          ? [0, 0, 0]
          : mode === 'corner'
            ? [data[0], data[1], data[2]]
            : [1, 3, 5].map((i) => parseInt(custom.slice(i, i + 2), 16));
    return {
      mode,
      rgb,
      color: '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join(''),
      confidence: 1,
    };
  }
  const indices = [];
  const step = Math.max(1, Math.floor(Math.max(w, h) / 256));
  for (let x = 0; x < w; x += step) indices.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y += step) indices.push(y * w, y * w + w - 1);
  const transparent = indices.filter((i) => data[i * 4 + 3] <= 80).length;
  if (transparent / indices.length > 0.2)
    return { mode: 'alpha', color: null, rgb: null, confidence: transparent / indices.length };
  const buckets = new Map();
  for (const i of indices) {
    if (data[i * 4 + 3] <= 80) continue;
    const rgb = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]],
      key = rgb.map((v) => Math.floor(v / 16)).join(',');
    const b = buckets.get(key) ?? [];
    b.push(rgb);
    buckets.set(key, b);
  }
  const samples = [...buckets.values()].sort((a, b) => b.length - a.length)[0] ?? [[255, 255, 255]];
  const rgb = [0, 1, 2].map(
    (k) => samples.map((v) => v[k]).sort((a, b) => a - b)[Math.floor(samples.length / 2)],
  );
  return {
    mode: 'auto',
    rgb,
    color: '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join(''),
    confidence: samples.length / Math.max(1, indices.length - transparent),
  };
}
