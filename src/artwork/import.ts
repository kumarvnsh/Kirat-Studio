// Raster artwork import: crop → background mask → contours → attach dots → groups.
import { maskFromRGBA, traceMask } from './contours.js';
import { attachDetails, autoGroup } from './grouping.js';
import type { Artwork, ArtworkGroup } from '../domain/project.ts';

export type TraceOptions = {
  crop: { x: number; y: number; w: number; h: number }; // percent of the source image
  background: string; // 'white' | 'corner' | 'black' | 'alpha'
  threshold: number;
  minpixels: number;
};

export const defaultTrace = (): TraceOptions => ({
  crop: { x: 0, y: 0, w: 100, h: 100 },
  background: 'white',
  threshold: 45,
  minpixels: 12,
});

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const image = new Image();
    image.onload = () => res(image);
    image.onerror = () => rej(Error('Could not decode the image. Try a PNG, JPG or WebP file.'));
    image.src = url;
  });
}

export function traceImage(
  source: HTMLImageElement,
  o: TraceOptions,
): { artwork: Artwork; truncated: boolean } {
  const ix = source.naturalWidth,
    iy = source.naturalHeight;
  if (ix * iy > 25e6) throw Error('Use an image smaller than 25 megapixels.');
  const x = (o.crop.x / 100) * ix,
    y = (o.crop.y / 100) * iy,
    cw = Math.min((o.crop.w / 100) * ix, ix - x),
    ch = Math.min((o.crop.h / 100) * iy, iy - y);
  if (cw < 8 || ch < 8 || x < 0 || y < 0) throw Error('Crop is too small or outside the image.');
  const ratio = Math.min(1, 1400 / cw, 960 / ch),
    w = Math.round(cw * ratio),
    h = Math.round(ch * ratio),
    c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, x, y, cw, ch, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h),
    mask = maskFromRGBA(image.data, w, h, o.background, o.threshold);
  const result = traceMask(mask, w, h, {
    minPixels: Math.max(3, o.minpixels || 12),
    tolerance: 0.8,
    maxComponents: 100,
    rgba: image.data as any,
  });
  if (!result.components.length)
    throw Error('No shapes found. Lower tolerance, change background mode, or check the crop.');
  for (let i = 0; i < mask.length; i++) if (!mask[i]) image.data[i * 4 + 3] = 0;
  ctx.putImageData(image, 0, 0);
  const { groups, components } = autoGroup(attachDetails(result.components));
  const elements = components.map((p: any, i: number) => ({
    ...p,
    name: 'Element ' + String(i + 1).padStart(2, '0'),
  }));
  const b = (k: number, f: (...n: number[]) => number) => f(...elements.map((p: any) => p.bounds[k]));
  return {
    truncated: result.truncated,
    artwork: {
      elements,
      groups: groups as ArtworkGroup[],
      bounds: [b(0, Math.min), b(1, Math.min), b(2, Math.max), b(3, Math.max)],
      imageWidth: w,
      imageHeight: h,
      imageData: c.toDataURL('image/png'),
      approved: false,
      origin: 'trace',
    },
  };
}

// Uploaded file → SVG text (imported as vectors) or an object URL for raster tracing.
// SVGs must be self-contained: no scripts or external resources.
export async function readUpload(file: File): Promise<{ svg: string } | { url: string }> {
  if (file.size > 8 * 1024 * 1024) throw Error('Choose artwork smaller than 8 MB.');
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  if (!isSvg && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw Error('Use SVG, PNG, JPG or WebP.');
  if (!isSvg) return { url: URL.createObjectURL(file) };
  const text = await file.text();
  if (
    /<script|foreignObject|<!ENTITY|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/)|url\s*\(\s*(?!['"]?\s*#)/i.test(
      text,
    )
  )
    throw Error(
      'SVG must be self-contained without scripts, external resources or CSS URLs. Export a plain SVG.',
    );
  return { svg: text };
}

export function textArtworkURL(text: string): string {
  const c = document.createElement('canvas');
  c.width = 1500;
  c.height = 300;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#ed982f';
  ctx.font = 'bold 120px Georgia';
  ctx.textBaseline = 'middle';
  const size = ctx.measureText(text).width;
  ctx.font = `bold ${Math.min(120, (1400 / size) * 120)}px Georgia`;
  ctx.fillText(text, 40, 150);
  return c.toDataURL();
}
