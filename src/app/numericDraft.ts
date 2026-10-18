export function numericDraft(raw: string, min: number, max: number, convert: (value: number) => number = n => n): { ok: true; value: number } | { ok: false; error: string } {
  const value = convert(Number(raw));
  if (!raw.trim() || !Number.isFinite(value)) return { ok: false, error: 'Enter a valid number.' };
  if (value < min || value > max) return { ok: false, error: `Enter a value between ${min} and ${max}.` };
  return { ok: true, value };
}
