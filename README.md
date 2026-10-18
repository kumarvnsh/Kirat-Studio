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
| `src/domain/project.ts` | Data model: `DesignState` / `ViewState` / `FabricationState`, settings table (ranges, defaults), `sceneInput()` |
| `src/app/` | React UI (`App`, `ToolsPanel`, `Viewport`, `Inspector`), store (`store.ts`), cross-panel actions (`actions.ts`), styles |
| `src/artwork/` | Contour tracing (`contours.js`), dot attachment and grouping (`grouping.js`), raster import pipeline (`import.ts`) |
| `src/editor/history.ts` | Immutable undo/redo over designs |
| `src/storage/project.ts` | Project file format v3, v1/v2 migration, validation, browser autosave |
| `src/scene/scene.js` | Three.js scene, sign geometry, lighting (still plain JS) |
| `public/` | Static assets served at `/` (Kirat sample logo, not yet added) |
| `tests/` | `node --test` checks (`.js` and `.ts`; Node 22 strips types natively) |
| `reference/prototype/` | Byte-exact copy of the original ChatGPT-hosted prototype (v02). Do not edit. |

Further folders from the roadmap (`geometry/`, `assembly/`, `fabrication/`, `catalog/`, `digital/`) get created when their first module lands.

## State rules

- **Design** (`design.present`): settings and artwork. Every edit goes through `editDesign()` and is one undo step. Saved and autosaved.
- **View**: mode, selection, isolation, stage, explode, day/night, lights, presentation. Changed with `setView()`. Never saved into the design, never undone.
- **Fabrication**: reserved slot in the file format (Milestone E).
- The renderer only reads `sceneInput(design, view)`; it never writes back.

## Status

Milestones A and B are done, except for the Kirat sample logo: artwork groups with per-element overrides, i-dots attached to their letters, undo/redo (including retrace), autosave plus previous-session backup, project format v3 (v1/v2 files migrate on open), React UI. Still open: name the Kirat groups Symbol / Main wordmark / Tagline once `public/kirat-reference.png` is added. `scene.js` is still plain JS; port it to TypeScript as it gets reworked in Milestone C.

Units: settings and saved projects use millimetres; `scene.js` converts to metres at the rendering boundary.

## Reference prototype

`reference/prototype/` imports `./vendor/...` files that were not copied (they are stock three r180 and Clipper 6.4.2). It is kept for side-by-side comparison, not to run directly.
