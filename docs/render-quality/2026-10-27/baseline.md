# Baseline captures

27 October 2026. Chrome 155, macOS, ANGLE Metal Apple M4; Node 26.12.0. Existing checks: 111 tests pass, TypeScript passes, Vite production build passes (existing large-bundle advisory).

Five deterministic fixtures in `tests/fixtures/presentation.ts`, studio scene, sign power on, default dimming/exposure, `fit('perspective')`, 2400 × 1200 output. Face override #c74c36, returns #283d46, board #243b46. Captures named `<construction>-<day|night>-baseline.png`.

Capture times (ms; GPU readback included; not universal performance promises):

```json
[
  {
    "type": "front",
    "env": "day",
    "ms": 158.39999985694885
  },
  {
    "type": "front",
    "env": "night",
    "ms": 39.60000014305115
  },
  {
    "type": "halo",
    "env": "day",
    "ms": 75
  },
  {
    "type": "halo",
    "env": "night",
    "ms": 40.40000009536743
  },
  {
    "type": "fronthalo",
    "env": "day",
    "ms": 65
  },
  {
    "type": "fronthalo",
    "env": "night",
    "ms": 38.90000009536743
  },
  {
    "type": "fullacrylic",
    "env": "day",
    "ms": 61.799999952316284
  },
  {
    "type": "fullacrylic",
    "env": "night",
    "ms": 37.90000009536743
  },
  {
    "type": "metal",
    "env": "day",
    "ms": 63.19999980926514
  },
  {
    "type": "metal",
    "env": "night",
    "ms": 40.40000009536743
  }
]
```

The existing halo is a blurred 256-pixel canvas contour projected onto the fascia with an unlit transparent material. It is not physical wall spill and must not be mistaken for an emissive surface in a path tracer. Existing acrylic represents opal faces with glossy opaque materials, not transparent glass. Geometry preserves physical layout while the preview adds small z-fighting offsets.
