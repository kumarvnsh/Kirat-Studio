export function numericDraft(raw: string, min: number, max: number, convert: (value: number) => number = n => n): { ok: true; value: number } | { ok: false; error: string } {
  const parsed = Number(raw);
  if (!raw.trim() || !Number.isFinite(parsed)) return { ok: false, error: 'Enter a valid number.' };
  const value = convert(parsed);
  if (!raw.trim() || !Number.isFinite(value)) return { ok: false, error: 'Enter a valid number.' };
  if (value < min || value > max) return { ok: false, error: `Enter a value between ${min} and ${max}.` };
  return { ok: true, value };
}

// Display unit formatting is lossy. Only a user-edited draft may replace an exact model value.
export function numericDraftCommit(raw: string, currentValue: number, dirty: boolean, min: number, max: number, convert: (value: number) => number = n => n): ReturnType<typeof numericDraft> {
  return dirty ? numericDraft(raw, min, max, convert) : { ok: true, value: currentValue };
}
