import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { apply, boardCorners, composite, invert, parseWallSize, readPptx, squareToQuad, type Pt } from '../src/presentation/site.ts';

test('wall sizes are read in the units recce decks use', () => {
  assert.deepEqual(parseWallSize('Wall Size – 338x36 Inch'), [338 * 25.4, 36 * 25.4]);
  assert.deepEqual(parseWallSize('4620 × 950 mm'), [4620, 950]);
  assert.deepEqual(parseWallSize("15' x 3'"), [15 * 304.8, 3 * 304.8]);
  assert.deepEqual(parseWallSize('Front 182 x 38'), [182 * 25.4, 38 * 25.4], 'bare small numbers are inches');
  assert.equal(parseWallSize('Ozone Academy'), null);
});

// One slide like the Ozone recce: a cropped photo, a red-outlined marker, and the wall size.
function deck() {
  const emu = (n: number) => n * 100000;
  const slide = `<p:sld><p:cSld><p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>Wall Size – 100x20 Inch</a:t></a:r></a:p></p:txBody></p:sp>
    <p:pic><p:blipFill><a:blip r:embed="rId2"/><a:srcRect l="10000" r="10000"/></p:blipFill>
      <p:spPr><a:xfrm><a:off x="${emu(10)}" y="${emu(10)}"/><a:ext cx="${emu(80)}" cy="${emu(40)}"/></a:xfrm></p:spPr></p:pic>
    <p:sp><p:spPr><a:xfrm><a:off x="${emu(30)}" y="${emu(20)}"/><a:ext cx="${emu(40)}" cy="${emu(10)}"/></a:xfrm>
      <a:prstGeom prst="rect"/><a:noFill/><a:ln w="38100"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln></p:spPr></p:sp>
  </p:spTree></p:cSld></p:sld>`;
  return zipSync({
    'ppt/slides/slide1.xml': strToU8(slide),
    'ppt/slides/_rels/slide1.xml.rels': strToU8('<Relationships><Relationship Id="rId2" Target="../media/image1.jpeg"/></Relationships>'),
    'ppt/media/image1.jpeg': new Uint8Array([1, 2, 3]),
  });
}

test('a recce slide gives its photo, the red marker inside the cropped photo, and the wall size', () => {
  const [s] = readPptx(deck());
  assert.equal(s.mime, 'image/jpeg');
  assert.deepEqual([...s.image], [1, 2, 3]);
  assert.deepEqual(s.wall, [2540, 508]);
  // Marker spans 20..60 of an 80-wide frame showing the middle 80% of the photo.
  const [x, y, w, h] = s.box!;
  assert.ok(Math.abs(x - (0.1 + 0.25 * 0.8)) < 1e-9 && Math.abs(w - 0.5 * 0.8) < 1e-9);
  assert.ok(Math.abs(y - 0.25) < 1e-9 && Math.abs(h - 0.25) < 1e-9);
});

test('perspective map hits the quad corners and inverts', () => {
  const q: Pt[] = [[10, 20], [200, 5], [220, 150], [0, 120]],
    m = squareToQuad(q),
    inv = invert(m);
  ([[0, 0], [1, 0], [1, 1], [0, 1]] as Pt[]).forEach(([u, v], i) => {
    const [x, y] = apply(m, u, v);
    assert.ok(Math.hypot(x - q[i][0], y - q[i][1]) < 1e-9);
  });
  const [u, v] = apply(inv, ...apply(m, 0.3, 0.7));
  assert.ok(Math.abs(u - 0.3) < 1e-9 && Math.abs(v - 0.7) < 1e-9);
});

test('board is centred in the wall at its real proportion', () => {
  const c = boardCorners([[0, 0], [100, 0], [100, 10], [0, 10]], [1000, 100], [500, 50]);
  assert.deepEqual(c.map((p) => p.map((v) => Math.round(v * 1e6) / 1e6)), [[25, 2.5], [75, 2.5], [75, 7.5], [25, 7.5]]);
});

test('composite paints the board inside the quad only, and respects transparency', () => {
  const dst = { width: 20, height: 10, data: new Uint8ClampedArray(20 * 10 * 4).fill(255) };
  const src = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]) }; // red | transparent
  composite(dst, src, [[2, 2], [18, 2], [18, 8], [2, 8]]);
  const px = (x: number, y: number) => [...dst.data.slice((y * 20 + x) * 4, (y * 20 + x) * 4 + 3)];
  assert.deepEqual(px(4, 5), [255, 0, 0], 'opaque half is red');
  assert.deepEqual(px(15, 5), [255, 255, 255], 'transparent half keeps the photo');
  assert.deepEqual(px(1, 5), [255, 255, 255], 'outside the quad untouched');
});

test('a project with site mockups saves and loads; a broken one resets presentation only', async () => {
  const { defaultPresentation, validatePresentation } = await import('../src/presentation/model.ts');
  const c = defaultPresentation();
  const site = {
    photo: 'data:image/jpeg;base64,AAAA',
    corners: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.3], [0.1, 0.3]] as [number, number][],
    wall: [8585, 914] as [number, number],
    board: [8585, 914] as [number, number],
  };
  c.shots.push({ ...structuredClone(c.shots[2]), id: 'site-1', name: 'Site', site });
  c.pages.push({ id: 'page-site-1', kind: 'render', included: true, shotId: 'site-1', caption: 'Site', dimensions: true, materials: false });
  const ok = validatePresentation(JSON.parse(JSON.stringify(c)));
  assert.deepEqual(ok.warnings, []);
  assert.deepEqual(ok.value.shots.at(-1)!.site, site);

  c.shots.at(-1)!.site = { ...site, board: [99999, 914] };
  assert.equal(validatePresentation(c).warnings.length, 1, 'board outside the setting limits is rejected');
});
