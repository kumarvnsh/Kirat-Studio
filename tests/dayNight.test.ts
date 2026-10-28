import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout } from '../src/domain/layout.ts';
import { bom } from '../src/domain/bom.ts';
import { dayNightShow } from '../src/domain/lighting.ts';
import { setGroup } from '../src/editor/artworkOps.ts';
import {
  DAY_NIGHT_COLOUR,
  defaultSettings,
  type ArtworkElement,
  type ConstructionType,
  type DesignState,
} from '../src/domain/project.ts';

const letter = (type: ConstructionType): ArtworkElement => ({
  id: 'a',
  name: 'a',
  type,
  group: 'g1',
  override: false,
  pixels: 10000,
  bounds: [0, 0, 100, 100],
  color: '#ffffff',
  regions: [{ outer: [[0, 0], [100, 0], [100, 100], [0, 100]], holes: [] }],
});
const design = (type: ConstructionType, dayNight: boolean, faceColor?: string): DesignState => ({
  settings: defaultSettings(),
  artwork: {
    elements: [letter(type)],
    groups: [{ id: 'g1', name: 'Group 1', type, dayNight, faceColor }],
    bounds: [0, 0, 100, 100],
    imageWidth: 100,
    imageHeight: 100,
    imageData: '',
    approved: false,
  },
});

test('test_layout_daynight_front_lit_face_defaults_to_black_film', () => {
  // Arrange
  const d = design('front', true);
  // Act
  const [e] = computeLayout(d).elements;
  // Assert
  assert.equal(e.dayNight, true);
  assert.equal(e.faceColor, DAY_NIGHT_COLOUR);
  assert.match(e.parts.find((p) => p.kind === 'face')!.material, /day\/night film/);
});

test('test_layout_daynight_keeps_chosen_day_colour', () => {
  // Arrange
  const d = design('fullacrylic', true, '#203040');
  // Act
  const [e] = computeLayout(d).elements;
  // Assert
  assert.equal(e.faceColor, '#203040');
});

test('test_layout_daynight_ignored_on_halo_letters', () => {
  // Arrange
  const d = design('halo', true);
  // Act
  const [e] = computeLayout(d).elements;
  // Assert
  assert.equal(e.dayNight, undefined);
  assert.equal(e.faceColor, undefined);
});

test('test_bom_daynight_film_listed_with_face', () => {
  // Arrange
  const d = design('front', true);
  // Act
  const rows = bom(d);
  // Assert
  assert.ok(rows.some((r) => /day\/night film/.test(r.material)));
});

test('test_lighting_daynight_light_shows_most_after_dark', () => {
  // Arrange / Act
  const { day, dusk, night } = dayNightShow;
  // Assert
  assert.ok(day < 0.1 && day < dusk && dusk < night && night === 1);
});

test('test_artworkops_daynight_toggle_sets_and_clears', () => {
  // Arrange
  const a = design('front', false).artwork!;
  // Act
  const on = setGroup(a, 'g1', { dayNight: true }),
    off = setGroup(on, 'g1', { dayNight: false });
  // Assert
  assert.equal(on.groups[0].dayNight, true);
  assert.equal('dayNight' in off.groups[0], false);
});
