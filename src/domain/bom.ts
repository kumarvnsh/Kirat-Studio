import { panelIntegrated } from './recipes.ts';
// Preliminary bill of materials from the layout. Nominal quantities: no waste, seams, joining
// allowances or nesting. Rows marked `estimate` depend on placeholder rules (LED grid, fixings).
import { area } from '../artwork/contours.js';
import { computeLayout, MODULE_W, PSU_LOADING, PSU_W, type PartKind } from './layout.ts';
import type { DesignState, LayerId } from './project.ts';

export type BomRow = {
  layer: LayerId;
  item: string;
  material: string;
  qty: number;
  unit: 'pcs' | 'm' | 'm²';
  note: string;
  estimate: boolean;
};

const m2 = (mm2: number) => mm2 / 1e6;

export function bom(design: DesignState): BomRow[] {
  const L = computeLayout(design),
    s = design.settings,
    rows: BomRow[] = [];
  for (const b of L.board) {
    if (b.layer === 'frame') {
      const total = L.frame.reduce((n, f) => n + f.length, 0);
      rows.push({
        layer: 'frame',
        item: 'MS frame',
        material: b.material,
        qty: total / 1000,
        unit: 'm',
        note: `${L.frame.filter((f) => f.axis === 'x').length} rails + ${L.frame.filter((f) => f.axis === 'y').length} verticals`,
        estimate: false,
      });
    } else
      rows.push({
        layer: b.layer,
        item: b.name,
        material: b.material,
        qty: m2(s.width * s.height),
        unit: 'm²',
        note: `${s.width} × ${s.height} mm`,
        estimate: false,
      });
  }
  const groups = design.artwork?.groups ?? [];
  const agg = new Map<string, BomRow>();
  const addTo = (key: string, base: Omit<BomRow, 'qty'>, qty: number) => {
    const row = agg.get(key) ?? { ...base, qty: 0 };
    row.qty += qty;
    agg.set(key, row);
  };
  for (const e of L.elements) {
    const gname = groups.find((g) => g.id === e.group)?.name ?? '',
      faceArea = e.regions.reduce(
        (n, r) => n + Math.abs(area(r.outer)) - r.holes.reduce((m, h) => m + Math.abs(area(h)), 0),
        0,
      );
    for (const p of e.parts) {
      const key = `${e.group}|${p.kind}|${p.material}`,
        base = {
          layer: p.layer,
          item: `${gname} · ${panelIntegrated(e.type) && p.kind === 'back' ? 'Acrylic retainer' : label[p.kind]}`,
          material: p.material,
        };
      if (p.kind === 'stud')
        addTo(
          key,
          { ...base, unit: 'pcs', note: 'one per fixing point', estimate: true },
          e.fixings.length,
        );
      else if (p.kind === 'trim')
        addTo(
          key,
          {
            ...base,
            unit: 'm',
            note: 'outer and inner contours, no joining allowance',
            estimate: true,
          },
          e.perimeter / 1000,
        );
      else if (p.kind === 'standoff')
        addTo(
          key,
          { ...base, unit: 'pcs', note: `${e.params.standoff} mm long`, estimate: true },
          e.fixings.length,
        );
      else if (p.kind === 'leds')
        addTo(key, { ...base, unit: 'pcs', note: 'symbolic grid', estimate: true }, e.leds.length);
      else if (p.kind === 'returns')
        addTo(
          key,
          {
            ...base,
            unit: 'm',
            note: `${e.params.depth} mm high, no joining allowance`,
            estimate: true,
          },
          e.perimeter / 1000,
        );
      else
        addTo(
          key,
          { ...base, unit: 'm²', note: 'net outline area, no nesting', estimate: false },
          m2(
            p.regions
              ? p.regions.reduce(
                  (n, r) =>
                    n +
                    Math.abs(area(r.outer)) -
                    r.holes.reduce((n, h) => n + Math.abs(area(h)), 0),
                  0,
                )
              : faceArea,
          ),
        );
    }
  }
  const pw = L.power;
  if (pw.psus.length)
    rows.push(
      {
        layer: 'power',
        item: 'LED power supply',
        material: `${PSU_W} W 12 V PSU (placeholder rating)`,
        qty: pw.psus.length,
        unit: 'pcs',
        note: `load ≈ ${pw.loadW.toFixed(0)} W at ${MODULE_W} W/module, ≤ ${PSU_LOADING * 100}% loading`,
        estimate: true,
      },
      {
        layer: 'power',
        item: 'Secondary cable',
        material: 'Twin-core cable (placeholder)',
        qty: pw.cables.reduce((n, c) => n + c.length, 0) / 1000,
        unit: 'm',
        note: 'routed length, no slack or terminations',
        estimate: true,
      },
      {
        layer: 'power',
        item: 'Cable penetrations',
        material: 'Grommet / gland through fascia',
        qty: pw.cables.length,
        unit: 'pcs',
        note: 'one per lit element',
        estimate: true,
      },
    );
  return [...rows, ...agg.values()];
}

const label: Record<PartKind, string> = {
  stud: 'Fixing studs',
  standoff: 'Standoffs',
  back: 'Letter backs',
  returns: 'Return strip',
  leds: 'LED modules',
  face: 'Faces',
  trim: 'Trim cap',
  flat: 'Flat letters',
};
