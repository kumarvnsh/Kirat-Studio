import test from 'node:test';
import assert from 'node:assert/strict';
import { returnContours } from '../src/fabrication/forming.ts';
import type { Region } from '../src/domain/project.ts';

test('forming chooses the same outer/counter contour order as strip schedules', () => {
  const regions: Region[] = [{ outer: [[0,0],[10,0],[0,10]], holes: [[[1,1],[2,1],[1,2]]] }, { outer: [[20,0],[30,0],[20,10]], holes: [] }];
  assert.equal(returnContours(regions).length, 3);
  assert.deepEqual(returnContours(regions, 1), [regions[0].holes[0]]);
  assert.deepEqual(returnContours(regions, 2), [regions[1].outer]);
  assert.deepEqual(returnContours(regions, 9), []);
});
