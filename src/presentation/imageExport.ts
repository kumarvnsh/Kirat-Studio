import { Zip, ZipPassThrough } from 'fflate';
import { pageCanvas, canvasBlob } from './pageCanvas.ts';
import { fileName } from './exportPackage.ts';
import type { LayoutPage } from './pageLayout.ts';
import type { BookletFont } from './bookletFont.ts';
export async function imageExport(
  pages: LayoutPage[],
  font: BookletFont,
  images: Record<string, string>,
  format: 'png' | 'jpg',
  raw: boolean,
  draft: boolean,
  signal: AbortSignal,
  onProgress: (n: number) => void,
) {
  if (raw) {
    const seen = new Set<string>();
    pages = pages.flatMap((p) =>
      p.items.flatMap((i) => {
        if (i.kind !== 'image' || seen.has(i.shotId)) return [];
        seen.add(i.shotId);
        return [{ ...p, id: i.shotId, shotId: i.shotId, title: `${p.title} ${i.shotId}` }];
      }),
    );
  }
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let failure: Error | undefined;
  const zip = new Zip((err, data) => {
    if (err) failure = err;
    else chunks.push(new Uint8Array(data));
  });
  try {
    for (let i = 0; i < pages.length; i++) {
      signal.throwIfAborted();
      const p = pages[i];
      if (raw && !p.shotId) continue;
      let blob: Blob;
      if (raw && !draft && format === 'png') {
        const r = await fetch(images[p.shotId!], { signal });
        if (!r.ok) throw Error('Render image is unavailable.');
        blob = await r.blob();
      } else {
        let canvas: HTMLCanvasElement;
        if (raw) {
          const image = new Image();
          image.src = images[p.shotId!];
          await image.decode();
          canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0);
          image.src = '';
          if (draft) {
            ctx.fillStyle = '#a54724';
            ctx.font = `bold ${canvas.width / 20}px sans-serif`;
            ctx.fillText('DRAFT', canvas.width * 0.04, canvas.height * 0.12);
          }
        } else canvas = await pageCanvas(p, font, images, draft, 3508, signal);
        blob = await canvasBlob(canvas, format === 'png' ? 'image/png' : 'image/jpeg');
        canvas.width = canvas.height = 1;
      }
      signal.throwIfAborted();
      const entry = new ZipPassThrough(fileName(i + 1, p.title, format));
      zip.add(entry);
      entry.push(new Uint8Array(await blob.arrayBuffer()), true);
      onProgress((i + 1) / pages.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    zip.end();
    if (failure) throw failure;
    signal.throwIfAborted();
    return new Blob(chunks, { type: 'application/zip' });
  } catch (e) {
    zip.terminate();
    throw e;
  }
}
