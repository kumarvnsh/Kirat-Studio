import * as T from 'three';
import { LAYERS, type LayerId } from '../domain/project.ts';
import { loadBookletFont } from './bookletFont.ts';
export type ExplodedLabel = { text: string; x: number; y: number };
export function explodedLabels(layers: Map<LayerId, T.Group>, camera: T.Camera): ExplodedLabel[] {
  const result: ExplodedLabel[] = [];
  for (const layer of LAYERS) {
    const group = layers.get(layer.id);
    if (!group?.visible || !group.children.length) continue;
    const point = new T.Box3().setFromObject(group).getCenter(new T.Vector3()).project(camera);
    result.push({
      text: layer.name + (layer.id === 'leds' || layer.id === 'power' ? ' (schematic)' : ''),
      x: (point.x + 1) / 2,
      y: (1 - point.y) / 2,
    });
  }
  return result;
}
export async function labelledExplodedCanvas(source: HTMLCanvasElement, labels: ExplodedLabel[]) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  const font = await loadBookletFont();
  const size = canvas.width * 0.0105;
  const write = (text: string, x: number, y: number, s = size) => {
    ctx.save();
    ctx.translate(x, y + s);
    ctx.scale(s / font.unitsPerEm, -s / font.unitsPerEm);
    ctx.fillStyle = '#203e49';
    for (const g of font.shape(text)) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.fill(new Path2D(g.path));
      ctx.restore();
    }
    ctx.restore();
  };
  const sorted = [...labels].sort((a, b) => a.x - b.x),
    half = Math.ceil(sorted.length / 2);
  for (const [side, subset] of [
    [0, sorted.slice(0, half)],
    [1, sorted.slice(half)],
  ] as const) {
    subset.sort((a, b) => a.y - b.y);
    subset.forEach((label, i) => {
      const x = canvas.width * (side ? 0.745 : 0.015),
        y =
          canvas.height * (0.07 + (subset.length === 1 ? 0.35 : (i / (subset.length - 1)) * 0.78)),
        w = canvas.width * 0.24,
        h = size * 1.8;
      ctx.strokeStyle = '#7e929c';
      ctx.lineWidth = Math.max(1, canvas.width / 1600);
      ctx.beginPath();
      ctx.moveTo(label.x * canvas.width, label.y * canvas.height);
      ctx.lineTo(side ? x : x + w, y + h / 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffffed';
      ctx.fillRect(x, y, w, h);
      write(
        label.text,
        x + size * 0.35,
        y + size * 0.2,
        Math.min(size, (w - size * 0.7) / font.measure(label.text, 1)),
      );
    });
  }
  ctx.fillStyle = '#ffffffdc';
  ctx.fillRect(0, canvas.height - size * 2, canvas.width, size * 2);
  write(
    'Construction illustration · LED and power placement schematic · Not for fabrication',
    size * 0.7,
    canvas.height - size * 1.8,
    size * 0.7,
  );
  return canvas;
}
