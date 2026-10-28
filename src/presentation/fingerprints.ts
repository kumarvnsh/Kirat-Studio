import type { DesignState } from '../domain/project.ts';
import type { Shot } from './model.ts';
import { applyOption, type ProposalOption } from './options.ts';
export const RENDER_VERSION = 'sign-final-v6'; // v6: neutral tone mapping
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
  option?: ProposalOption,
): Promise<string> {
  const d = applyOption(design, option),
    s = structuredClone(shot);
  if (s.camera.preset === 'exploded') s.scene.kind = 'studio';
  // Same overrides as createPresentationSnapshot, so a rendered mockup's key matches its live key.
  if (s.site) {
    [d.settings.width, d.settings.height] = s.site.board;
    s.scene.kind = 'studio';
  }
  if (d.artwork) {
    d.artwork.approved = false;
    for (const g of d.artwork.groups) g.name = '';
    for (const e of d.artwork.elements) e.name = '';
  }
  const { id, name, pairId, optionId, ...appearance } = s;
  return fingerprint({ design: d, shot: appearance, version });
}
