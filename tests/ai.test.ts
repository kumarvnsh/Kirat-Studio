import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFNumber, rgb } from 'pdf-lib';
import { boardArt, readAi, suggestedExclude } from '../src/artwork/ai.ts';

// Two artboards like Illustrator writes them: a page each, UserUnit 10, XMP naming the second as the document size.
async function twoBoards() {
  const doc = await PDFDocument.create();
  const big = doc.addPage([720, 360]);
  big.drawRectangle({ x: 72, y: 72, width: 144, height: 72, color: rgb(1, 0, 0) });
  const small = doc.addPage([360, 72]);
  small.node.set(PDFName.of('UserUnit'), PDFNumber.of(10));
  small.drawRectangle({ x: 36, y: 18, width: 288, height: 36, color: rgb(0, 0, 1) });
  const bytes = await doc.save({ useObjectStreams: false });
  const xmp = '<xmpTPg:MaxPageSize stDim:w="50" stDim:h="10" stDim:unit="Inches"/>';
  const out = new Uint8Array(bytes.length + xmp.length);
  out.set(bytes);
  out.set(new TextEncoder().encode(xmp), bytes.length); // raw XMP text after %%EOF, where the search finds it
  return out;
}

test('every artboard is read with its size in mm, and the XMP document size is preferred', async () => {
  const { boards, preferred } = await readAi(await twoBoards());
  assert.equal(boards.length, 2);
  assert.equal(Math.round(boards[0].widthMm), 254); // 720 pt
  assert.equal(Math.round(boards[1].widthMm), 1270); // 360 pt × UserUnit 10 = 50 in
  assert.equal(Math.round(boards[1].heightMm), 254);
  const art = boardArt(boards[1]);
  assert.equal(Math.round(art.artWidthMm), 1016); // 288 pt × 10
  assert.equal(Math.round(art.artHeightMm), 127);
  assert.equal(preferred, 1);
  assert.match(art.svg, /fill="#0000ff"/);
  assert.doesNotMatch(art.svg, /#ff0000/, 'artboards stay separate');
});

test('a legacy .ai without a PDF copy explains how to re-save', async () => {
  await assert.rejects(readAi(new TextEncoder().encode('%!PS-Adobe-3.0')), /PDF Compatible/);
});

test('black dimension labels beside stroked lines are excluded from the artwork size', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1000, 400]);
  page.drawRectangle({ x: 100, y: 100, width: 600, height: 200, color: rgb(0, 0, 1) }); // the logo
  page.drawRectangle({ x: 800, y: 100, width: 50, height: 60, color: rgb(0, 0, 0) }); // "650mm" label
  page.drawLine({ start: { x: 760, y: 100 }, end: { x: 760, y: 300 }, thickness: 1 }); // dimension line
  const [b] = (await readAi(await doc.save())).boards;
  assert.deepEqual(suggestedExclude(b), [1]); // the label, by path index
  const all = boardArt(b),
    logo = boardArt(b, suggestedExclude(b));
  assert.equal(all.shapes, 2);
  assert.equal(logo.shapes, 1);
  assert.equal(Math.round(logo.artWidthMm / ((25.4 / 72) * 600)), 1);
  assert.doesNotMatch(logo.svg, /#000000/);
});

test('callout labels in any colour are caught, but a logo with only small shapes is left alone', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1000, 400]);
  page.drawRectangle({ x: 100, y: 100, width: 600, height: 200, color: rgb(0, 0, 1) });
  page.drawRectangle({ x: 800, y: 100, width: 30, height: 40, color: rgb(1, 0, 1) }); // magenta "8inch"
  page.drawLine({ start: { x: 760, y: 100 }, end: { x: 760, y: 300 }, thickness: 1 });
  const [b] = (await readAi(await doc.save())).boards;
  assert.deepEqual(suggestedExclude(b), [1]);

  const plain = await PDFDocument.create();
  plain.addPage([1000, 400]).drawRectangle({ x: 100, y: 100, width: 600, height: 200, color: rgb(0, 0, 0) });
  assert.deepEqual(suggestedExclude((await readAi(await plain.save())).boards[0]), [], 'no lines, no guess');
});
