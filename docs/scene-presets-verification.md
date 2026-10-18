# Scene preset verification

Date: 2026-10-18  
Local branch: `codex/signage-scene-presets`  
Local browser target: `http://localhost:5173/` (browser verification pending)

The 3D viewport exposes native Scene options Studio, Shopfront, and Interior before the independent Time of day control. The Scene selector is guarded by 3D mode and absence of an overlay, and remains available in presentation mode. Toolbar and lighting controls can wrap; the existing mobile rules do not hide the Scene selector.

## Automated checks

Run locally on 2026-10-18 after the selector and layout changes:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm test` | Passed, 110 tests; 0 failures, skipped, or cancelled |
| `npm run build` | Passed, exit 0; existing bundle size warning remains |
| `git diff --check` | Passed, exit 0 |

Source review confirms the existing HDR composer uses `HalfFloatType` with `multisampling: 0`, renderer `antialias: false`, and the dirty-driven render loop remains unchanged. No renderer changes are included in this UI task.

## Browser verification

Pending verification by the coordinating agent. No browser interactions, screenshots, downloads, or actual Brave checks were performed by the implementer.

- Scene switching, independent Day/Dusk/Night lighting, and repeated switching.
- Scene selector visibility in ordinary 3D and Present; absence in 2D and forming.
- Assembly behavior and export output.
- Responsive control reachability and rendered scene appearance.
- Actual Brave rendering, including absence of WebGL errors or a black viewport.

Browser results and evidence must be added after those checks are performed.
