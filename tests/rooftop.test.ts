import test from 'node:test';
import assert from 'node:assert/strict';
import { rooftopStructure, memberLength } from '../src/domain/rooftop.ts';
import { computeLayout } from '../src/domain/layout.ts';
import { bom } from '../src/domain/bom.ts';
import { assemblySteps } from '../src/domain/assembly.ts';
import {
  checkSettings,
  defaultRooftop,
  defaultSettings,
  type ArtworkElement,
  type DesignState,
  type Mounting,
} from '../src/domain/project.ts';

type Box = [number, number, number, number];
const settings = () => ({ ...defaultSettings(), frame: 40 });
const mounting = (patch: Partial<Mounting> = {}): Mounting => ({ ...defaultRooftop(), ...patch });

// Two 100 px square letters, traced image 300×100 px, in one group.
const letter = (id: string, x0: number, type: ArtworkElement['type'] = 'front'): ArtworkElement => ({
  id,
  name: id,
  type,
  group: 'g1',
  override: false,
  pixels: 10000,
  bounds: [x0, 0, x0 + 100, 100],
  color: '#ffffff',
  regions: [{ outer: [[x0, 0], [x0 + 100, 0], [x0 + 100, 100], [x0, 100]], holes: [] }],
});
const design = (m: Mounting | undefined, type: ArtworkElement['type'] = 'front'): DesignState => ({
  settings: { ...settings(), mounting: m },
  artwork: {
    elements: [letter('a', 0, type), letter('b', 200, type)],
    groups: [{ id: 'g1', name: 'Group 1', type }],
    bounds: [0, 0, 300, 100],
    imageWidth: 300,
    imageHeight: 100,
    imageData: '',
    approved: false,
  },
});

test('test_rooftop_beam_letters_stand_on_rail_with_legs_to_roof', () => {
  // Arrange
  const letters: Box[] = [[0, 0, 500, 600], [600, 0, 1100, 600]];
  // Act
  const r = rooftopStructure(settings(), mounting({ structure: 'beam', clearance: 300 }), letters);
  // Assert
  const rail = r.members.find((m) => m.name === 'Box beam')!;
  assert.equal(r.roofY, -300);
  assert.equal(rail.a[1], -20, 'rail top is at the letter bottom');
  assert.ok(rail.a[0] <= 0 && rail.b[0] >= 1100, 'rail spans every letter');
  assert.equal(r.members.filter((m) => m.name === 'Letter upright').length, 2);
  assert.equal(r.members.filter((m) => m.name === 'Rear kicker').length, 2);
  assert.ok(r.members.filter((m) => m.name === 'Beam leg').every((m) => m.a[1] === -300 && m.b[1] === -40));
});

test('test_rooftop_braced_wide_letter_gets_post_per_spacing', () => {
  // Arrange
  const letters: Box[] = [[0, 0, 2500, 800]];
  // Act
  const r = rooftopStructure(settings(), mounting({ structure: 'braced', spacing: 1200 }), letters);
  // Assert
  const posts = r.members.filter((m) => m.name === 'Post');
  assert.equal(posts.length, 3, '2500 mm needs three posts at ≤1200 mm');
  assert.equal(r.members.filter((m) => m.name === 'Diagonal brace').length, 3);
  assert.ok(posts.every((p) => p.b[1] === 560), 'posts reach 70% up the letter');
  assert.equal(r.feet.length, 6, 'a base plate under every post and brace');
});

test('test_rooftop_lattice_no_bay_wider_than_spacing', () => {
  // Arrange
  const letters: Box[] = [[0, 0, 3000, 1500]];
  // Act
  const r = rooftopStructure(settings(), mounting({ structure: 'lattice', spacing: 1000, clearance: 500 }), letters);
  // Assert
  const xs = r.members.filter((m) => m.name === 'Lattice vertical').map((m) => m.a[0]).sort((a, b) => a - b);
  const chords = r.members.filter((m) => m.name === 'Lattice chord').length;
  assert.ok(xs.slice(1).every((x, i) => x - xs[i] <= 1000 + 1e-9));
  assert.equal(r.members.filter((m) => m.name === 'Lattice diagonal').length, (xs.length - 1) * (chords - 1));
  assert.ok(r.members.every((m) => memberLength(m) > 1));
});

test('test_layout_rooftop_has_no_board_and_letters_on_structure', () => {
  // Arrange
  const d = design(mounting());
  // Act
  const L = computeLayout(d);
  // Assert
  assert.deepEqual(L.board, []);
  assert.deepEqual(L.frame, []);
  assert.equal(L.letterBase, 20, 'letter backs on the front face of 40 mm members');
  assert.ok(L.structure.length > 0 && L.roofY! < Math.min(...L.elements.map((e) => e.bounds[1])));
  assert.match(L.power.warnings[0], /engineer/);
  assert.ok(L.power.psus.every((p) => p[2] < 0), 'PSUs sit on the roof behind the sign');
});

test('test_layout_rooftop_halo_letters_warned_as_needing_fascia', () => {
  // Arrange
  const d = design(mounting(), 'halo');
  // Act
  const L = computeLayout(d);
  // Assert
  assert.ok(L.power.warnings.some((w) => /Halo-lit need a fascia/.test(w)));
});

test('test_bom_rooftop_lists_structure_not_acp', () => {
  // Arrange
  const d = design(mounting({ structure: 'braced' }));
  // Act
  const rows = bom(d);
  // Assert
  assert.ok(!rows.some((r) => r.layer === 'acp' || r.layer === 'gi'));
  assert.ok(rows.some((r) => r.item === 'Rooftop structure · Post' && r.qty > 0));
  assert.ok(rows.some((r) => r.item === 'Base plates and roof anchors'));
});

test('test_assembly_rooftop_skips_board_steps', () => {
  // Arrange
  const d = design(mounting());
  // Act
  const ids = assemblySteps(d).map((s) => s.id);
  // Assert
  assert.ok(!ids.includes('acp') && !ids.includes('gi'));
  assert.ok(ids.includes('frame') && ids.includes('mount'));
});

test('test_settings_rooftop_out_of_range_rejected', () => {
  // Arrange
  const bad = { ...settings(), mounting: mounting({ spacing: 50 }) };
  const good = { ...settings(), mounting: mounting() };
  // Act / Assert
  assert.match(checkSettings(bad)!, /Post spacing/);
  assert.equal(checkSettings(good), null);
});
