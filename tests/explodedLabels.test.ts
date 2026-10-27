import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { explodedLabels } from '../src/presentation/explodedLabels.ts';
import { presentationCamera } from '../src/presentation/cameras.ts';
import { defaultPresentation } from '../src/presentation/model.ts';
import { createPresentationSnapshot } from '../src/presentation/snapshot.ts';
import { presentationFixture } from './fixtures/presentation.ts';
test('exploded default separates actual layers and powers off', () => {
  const shot = defaultPresentation().shots.find((s) => s.camera.preset === 'exploded')!;
  assert.ok(shot);
  assert.equal(shot.power, false);
  assert.ok(createPresentationSnapshot(presentationFixture('front'), shot).input.explode > 0);
});
test('callouts only describe visible populated layers and project within the frame', () => {
  const g = new T.Group();
  g.add(new T.Mesh(new T.BoxGeometry(3.6, 1.2, 0.03)));
  const empty = new T.Group();
  const camera = presentationCamera(new T.Box3().setFromObject(g), { preset: 'exploded' }, 2);
  const labels = explodedLabels(
    new Map([
      ['acp', g],
      ['backs', empty],
    ]) as any,
    camera,
  );
  assert.equal(labels.length, 1);
  assert.match(labels[0].text, /ACP/);
  assert.ok(labels[0].x > 0 && labels[0].x < 1 && labels[0].y > 0 && labels[0].y < 1);
});
