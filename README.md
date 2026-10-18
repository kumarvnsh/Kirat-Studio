# Kirat Studio

Signage design and assembly app: upload artwork, assign constructions, configure materials, assemble the sign, preview day/night, and produce customer presentations and fabrication information.

First target: one accurate **Kirat Creations** board. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # geometry regression checks
npm run build      # production build -> dist/
```

Requires Node 20+.

## Layout

| Path | Contents |
|---|---|
| `src/app/` | Page wiring, editor controls, project state, styles (`app.js`, `style.css`) |
| `src/artwork/` | Raster masking, contour tracing (`contours.js`); dot attachment and grouping (`grouping.js`) |
| `src/scene/` | Three.js scene, sign geometry, lighting (`scene.js`) |
| `src/editor/` | View-only state (`view-state.js`), undo/redo snapshots (`history.js`) |
| `public/` | Static assets served at `/` (Kirat sample logo) |
| `tests/` | `node --test` regression checks |
| `reference/prototype/` | Byte-exact copy of the original ChatGPT-hosted prototype (v02). Do not edit. |

Further folders from the roadmap (`domain/`, `geometry/`, `assembly/`, `fabrication/`, `catalog/`, `digital/`, `storage/`) get created when their first module lands.

## Status

Milestone A done. Milestone B in progress: artwork groups with one construction per group (plus per-element overrides), detached dots attached to their letter, undo/redo (Ctrl/Cmd+Z, Shift+Z), browser autosave with a previous-session backup, project format v2 (v1 files still open). The prototype code is ported as-is: same behaviour, now built with Vite and using npm `three@0.180.0` and `clipper-lib@6.4.2` instead of vendored copies. It is still plain JS; new modules can be TypeScript (`allowJs` is on). Still to do for B: groups not yet named Symbol/Wordmark/Tagline for the Kirat sample (needs the logo in `public/`), and the React UI plus the design/view/fabrication state split.

Units: the UI and saved project use millimetres; `scene.js` converts to metres at the rendering boundary.

## Reference prototype

`reference/prototype/` imports `./vendor/...` files that were not copied (they are stock three r180 and Clipper 6.4.2). It is kept for side-by-side comparison, not to run directly.
