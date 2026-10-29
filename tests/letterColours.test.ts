import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout } from '../src/domain/layout.ts';
import { bom } from '../src/domain/bom.ts';
import { setGroup } from '../src/editor/artworkOps.ts';
import {
  defaultSettings,
  type ArtworkElement,
  type ArtworkGroup,
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
const design = (type: ConstructionType, group: Partial<ArtworkGroup>): DesignState => ({
  settings: defaultSettings(),
  artwork: {
    elements: [letter(type)],
    groups: [{ id: 'g1', name: 'Group 1', type, ...group }],
    bounds: [0, 0, 100, 100],
    imageWidth: 100,
    imageHeight: 100,
    imageData: '',
    approved: false,
  },
});
const part = (d: DesignState, kind: string) => computeLayout(d).elements[0].parts.find((p) => p.kind === kind)!;

test('test_layout_front_lit_face_side_trim_back_colours_resolved', () => {
  // Arrange
  const d = design('front', {
    faceColor: '#d62828',
    returnColor: '#111111',
    trimColor: '#ffffff',
    backColor: '#003049',
    params: { trimcap: 19 },
  });
  // Act
  const [e] = computeLayout(d).elements;
  // Assert
  assert.equal(e.faceColor, '#d62828');
  assert.equal(e.returnColor, '#111111');
  assert.equal(e.trimColor, '#ffffff');
  assert.equal(e.backColor, '#003049');
  assert.match(part(d, 'returns').material, /painted #111111/);
  assert.match(part(d, 'trim').material, /#ffffff/);
  assert.match(part(d, 'back').material, /painted #003049/);
});

test('test_layout_full_acrylic_side_colour_is_translucent_vinyl', () => {
  // Arrange
  const d = design('fullacrylic', { faceColor: '#ffffff', returnColor: '#e63946' });
  // Act
  const material = part(d, 'returns').material;
  // Assert
  assert.match(material, /#e63946 translucent vinyl/);
});

test('test_layout_halo_back_stays_clear_without_paint', () => {
  // Arrange
  const d = design('halo', { backColor: '#003049' });
  // Act
  const [e] = computeLayout(d).elements;
  // Assert
  assert.equal(e.backColor, undefined, 'halo light leaves through a clear back');
  assert.doesNotMatch(part(d, 'back').material, /painted/);
});

test('test_bom_lists_painted_back_and_side_vinyl', () => {
  // Arrange
  const d = design('fullacrylic', { returnColor: '#e63946', backColor: '#222222' });
  // Act
  const materials = bom(d).map((r) => r.material).join(' | ');
  // Assert
  assert.match(materials, /translucent vinyl/);
  assert.match(materials, /painted #222222/);
});

test('test_artworkops_trim_and_back_colours_set_and_clear', () => {
  // Arrange
  const a = design('front', {}).artwork!;
  // Act
  const set = setGroup(a, 'g1', { trimColor: '#ffffff', backColor: '#000000' }),
    cleared = setGroup(set, 'g1', { trimColor: null, backColor: null });
  // Assert
  assert.equal(set.groups[0].trimColor, '#ffffff');
  assert.equal(set.groups[0].backColor, '#000000');
  assert.ok(!('trimColor' in cleared.groups[0]) && !('backColor' in cleared.groups[0]));
  assert.throws(() => setGroup(a, 'g1', { backColor: 'red' }), /#rrggbb/);
});

test('test_layout_rooftop_lit_back_glows_with_opal_back_and_double_sided_leds', () => {
  // Arrange
  const d = design('front', { backLit: true, backColor: '#ffd166' });
  d.settings.mounting = { kind: 'rooftop', structure: 'beam', clearance: 300, spacing: 1200 };
  // Act
  const [e] = computeLayout(d).elements;
  // Assert
  assert.equal(e.backLit, true);
  assert.match(part(d, 'back').material, /Opal acrylic back .*lit \+ #ffd166 translucent vinyl/);
  assert.match(part(d, 'leds').material, /double-sided/);
});

test('test_layout_lit_back_ignored_on_fascia_board', () => {
  // Arrange
  const d = design('front', { backLit: true });
  // Act
  const [e] = computeLayout(d).elements;
  // Assert
  assert.equal(e.backLit, undefined, 'a back against the fascia is never seen');
  assert.doesNotMatch(part(d, 'back').material, /Opal/);
});

test('test_artworkops_lit_back_toggle_sets_and_clears', () => {
  // Arrange
  const a = design('front', {}).artwork!;
  // Act
  const on = setGroup(a, 'g1', { backLit: true }),
    off = setGroup(on, 'g1', { backLit: false });
  // Assert
  assert.equal(on.groups[0].backLit, true);
  assert.ok(!('backLit' in off.groups[0]));
});
