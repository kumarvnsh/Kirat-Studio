import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { presentationCamera } from '../src/presentation/cameras.ts';
import { createPresentationSnapshot } from '../src/presentation/snapshot.ts';
import { defaultPresentation, type CameraPreset } from '../src/presentation/model.ts';
import { presentationFixture } from './fixtures/presentation.ts';
for (const preset of [
  'front',
  'left',
  'right',
  'top',
  'elevated',
  'threeQuarter',
] as CameraPreset[])
  for (const dimensions of [
    [3.6, 1.2, 0.15],
    [12, 0.3, 0.05],
    [0.5, 4, 0.1],
  ])
    test(`${preset} fits ${dimensions}`, () => {
      const [w, h, d] = dimensions,
        b = new T.Box3(new T.Vector3(-w / 2, -h / 2, -d / 2), new T.Vector3(w / 2, h / 2, d / 2));
      const c = presentationCamera(b, { preset }, 2);
      c.updateMatrixWorld(true);
      for (const x of [b.min.x, b.max.x])
        for (const y of [b.min.y, b.max.y])
          for (const z of [b.min.z, b.max.z]) {
            const p = new T.Vector3(x, y, z).project(c);
            assert.ok(
              Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(p.z) < 1,
              JSON.stringify(p),
            );
          }
      assert.equal(
        c instanceof T.OrthographicCamera,
        ['front', 'left', 'right', 'top'].includes(preset),
      );
    });
test('snapshot includes complete assembly without changing design', () => {
  const d = presentationFixture('halo'),
    before = JSON.stringify(d),
    s = createPresentationSnapshot(d, defaultPresentation().shots[0]);
  assert.equal(s.input.explode, 0);
  assert.equal(s.input.hidden.length, 0);
  assert.equal(s.input.isolate, false);
  assert.ok(s.input.visibleLayers.has('faces'));
  d.settings.width += 100;
  assert.notEqual(s.design.settings.width, d.settings.width);
  assert.equal(JSON.stringify(s.design), before);
});

test('perspective depth precision separates thin fascia from the frame at sign scale', () => {
  for (const w of [3.6, 12, 24]) {
    const b = new T.Box3(new T.Vector3(-w / 2, -0.6, -0.05), new T.Vector3(w / 2, 0.6, 0.1));
    const c = presentationCamera(b, { preset: 'threeQuarter' }, 2);
    const a = new T.Vector3(0, 0, 0.02).project(c).z;
    const z = new T.Vector3(0, 0, 0.0208).project(c).z;
    const levels = Math.abs(a - z) * 0.5 * (2 ** 24 - 1);
    assert.ok(levels > 100, `${w} m sign has only ${levels} depth levels across 0.8 mm`);
  }
});
