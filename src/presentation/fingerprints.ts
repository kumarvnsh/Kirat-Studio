import type { DesignState } from '../domain/project.ts';
import type { Shot } from './model.ts';
export const RENDER_VERSION = 'sign-final-v2';
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .filter((k) => (value as any)[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical((value as any)[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
export async function shotFingerprint(
  design: DesignState,
  shot: Shot,
  version = RENDER_VERSION,
): Promise<string> {
  const d = structuredClone(design),
    s = structuredClone(shot);
  if (d.artwork) {
    d.artwork.approved = false;
    for (const g of d.artwork.groups) g.name = '';
    for (const e of d.artwork.elements) e.name = '';
  }
  const { id, name, pairId, ...appearance } = s;
  return fingerprint({ design: d, shot: appearance, version });
}
