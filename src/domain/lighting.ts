// Lighting model. Four independent things, never mixed:
//   environment (time of day) — sky, sun, ambient, background;
//   sign power + dimming     — whether and how strongly the LEDs emit;
//   LED colour               — a design choice (settings.ledTemp), tints all emission;
//   exposure                 — the camera, applied after rendering.
// Emission does not depend on the environment: a lit sign looks dimmer by day only because the
// surroundings are brighter and the camera exposes for them.
// Presentation preview only: values are tuned by eye, not calibrated against photographs.

import type { ArtworkElement, ArtworkGroup, LightMode } from './project.ts';

export type Environment = 'day' | 'dusk' | 'night';

export type EnvironmentPreset = {
  label: string;
  background: string;
  wall: string;
  ambient: number; // image-based environment intensity
  hemi: number;
  sun: number;
  sunColor: string;
  sunPosition: [number, number, number];
  fill: number;
  exposure: number; // the "auto exposure" a camera would pick for this scene
};

// How much brighter the surroundings are than the night baseline (relative to a fixed LED emission).
const DAYLIGHT = 6;
const DUSKLIGHT = 1.6;

export const environments: Record<Environment, EnvironmentPreset> = {
  day: {
    label: 'Day',
    background: '#cdd6d8',
    wall: '#bcc7ca',
    // Daylight is far brighter than an LED face; the camera stops down to match.
    ambient: 0.7 * DAYLIGHT,
    hemi: 0.9 * DAYLIGHT,
    sun: 2.6 * DAYLIGHT,
    sunColor: '#fff2dc',
    sunPosition: [-3, 5, 5],
    fill: 0.7 * DAYLIGHT,
    exposure: 1 / DAYLIGHT,
  },
  dusk: {
    label: 'Dusk',
    background: '#2b3445',
    wall: '#3d434b',
    ambient: 0.16 * DUSKLIGHT,
    hemi: 0.22 * DUSKLIGHT,
    sun: 0.55 * DUSKLIGHT,
    sunColor: '#ffad74',
    sunPosition: [-6, 1.2, 4],
    fill: 0.15 * DUSKLIGHT,
    exposure: 1.15 / DUSKLIGHT,
  },
  night: {
    label: 'Night',
    background: '#0c131c',
    wall: '#141c25',
    ambient: 0.03,
    hemi: 0.05,
    sun: 0,
    sunColor: '#9fb4ff',
    sunPosition: [3, 6, 4],
    fill: 0.03,
    exposure: 1.25,
  },
};

// Scene-linear radiance of a fully powered face. Bloom (threshold ~1.1, applied after exposure)
// catches it at night; by day the camera exposes for sunlight and the face doesn't bloom.
export const FACE_EMISSION = 2.2;
export const BLOOM_THRESHOLD = 1.1;

export const emission = (power: boolean, dimming: number) => (power ? FACE_EMISSION * dimming : 0);
export const cameraExposure = (env: Environment, ev: number) => environments[env].exposure * 2 ** ev;

export const LED_TEMPS = [2700, 3000, 4000, 5000, 6500] as const;

// Colour of a black-body source at `kelvin`, as sRGB hex, normalised so the brightest channel is 255.
// Tanner Helland's fit; good to a few percent between 1000 K and 40 000 K.
export function kelvinToHex(kelvin: number): string {
  const t = kelvin / 100;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = t <= 66 ? 255 : clamp(329.698727446 * (t - 60) ** -0.1332047592);
  const g = clamp(
    t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492,
  );
  const b = t >= 66 ? 255 : t <= 19 ? 0 : clamp(138.5177312231 * Math.log(t - 10) - 305.0447927307);
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// A lit element's circuit after applying board defaults: what the LEDs emit and how strongly.
export type ResolvedLight = { mode: LightMode; on: boolean; dimming: number; color: string };

export function resolveLight(group: ArtworkGroup | undefined, e: ArtworkElement, defaultTemp: number): ResolvedLight {
  const l = group?.light ?? {},
    mode = l.mode ?? 'white';
  const color =
    mode === 'rgb' && l.color ? l.color : mode === 'artwork' ? e.color : kelvinToHex(l.temp ?? defaultTemp);
  return { mode, on: l.on ?? true, dimming: l.dimming ?? 1, color };
}

export const isRGB = (mode: LightMode) => mode !== 'white';
