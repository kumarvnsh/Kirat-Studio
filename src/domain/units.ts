// Length unit conversions and multi-unit formatting (mm, inch, foot).
// Internal domain math always uses millimetres (mm); UI controls convert at the boundary.

export type LengthUnit = 'mm' | 'in' | 'ft';

export const MM_PER_IN = 25.4;
export const MM_PER_FT = 304.8;

export const LENGTH_UNITS: { id: LengthUnit; label: string; short: string; factor: number }[] = [
  { id: 'mm', label: 'mm', short: 'mm', factor: 1 },
  { id: 'in', label: 'inch', short: 'in', factor: MM_PER_IN },
  { id: 'ft', label: 'foot', short: 'ft', factor: MM_PER_FT },
];

export function mmToUnit(mm: number, unit: LengthUnit): number {
  if (!Number.isFinite(mm)) return 0;
  if (unit === 'in') return +(mm / MM_PER_IN).toFixed(2);
  if (unit === 'ft') return +(mm / MM_PER_FT).toFixed(3);
  return Math.abs(mm) >= 10 && Number.isInteger(Math.round(mm * 10) / 10)
    ? +mm.toFixed(1)
    : +mm.toFixed(2);
}

export function unitToMm(value: number, unit: LengthUnit): number {
  if (!Number.isFinite(value)) return 0;
  if (unit === 'in') return +(value * MM_PER_IN).toFixed(2);
  if (unit === 'ft') return +(value * MM_PER_FT).toFixed(2);
  return +value.toFixed(2);
}

export function stepForUnit(mmStep: number, unit: LengthUnit): number {
  if (unit === 'mm') return mmStep;
  if (unit === 'in') return mmStep >= 10 ? 0.25 : mmStep >= 1 ? 0.05 : 0.01;
  return mmStep >= 10 ? 0.05 : mmStep >= 1 ? 0.01 : 0.005;
}

export function formatInUnit(mm: number, unit: LengthUnit): string {
  if (!Number.isFinite(mm)) return '—';
  if (unit === 'in') return `${+(mm / MM_PER_IN).toFixed(2)} in`;
  if (unit === 'ft') return `${+(mm / MM_PER_FT).toFixed(2)} ft`;
  return `${+mm.toFixed(mm % 1 === 0 ? 0 : 1)} mm`;
}

export function formatAllUnits(mm: number): string {
  if (!Number.isFinite(mm)) return '—';
  const m = +mm.toFixed(Math.abs(mm) < 1 ? 2 : mm % 1 === 0 ? 0 : 1);
  const i = +(mm / MM_PER_IN).toFixed(2);
  const f = +(mm / MM_PER_FT).toFixed(2);
  return `${m} mm · ${i} in · ${f} ft`;
}

export function formatDimsInUnit(wMm: number, hMm: number, unit: LengthUnit): string {
  if (unit === 'in') return `${+(wMm / MM_PER_IN).toFixed(1)} × ${+(hMm / MM_PER_IN).toFixed(1)} in`;
  if (unit === 'ft') return `${+(wMm / MM_PER_FT).toFixed(2)} × ${+(hMm / MM_PER_FT).toFixed(2)} ft`;
  return `${Math.round(wMm)} × ${Math.round(hMm)} mm`;
}

export function formatDimsAllUnits(wMm: number, hMm: number): string {
  const mmStr = `${Math.round(wMm)}×${Math.round(hMm)} mm`;
  const inStr = `${+(wMm / MM_PER_IN).toFixed(1)}×${+(hMm / MM_PER_IN).toFixed(1)} in`;
  const ftStr = `${+(wMm / MM_PER_FT).toFixed(2)}×${+(hMm / MM_PER_FT).toFixed(2)} ft`;
  return `${mmStr} · ${inStr} · ${ftStr}`;
}
