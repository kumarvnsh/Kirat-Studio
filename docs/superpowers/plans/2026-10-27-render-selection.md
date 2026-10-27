# Render and export selection implementation

Approved spec: `docs/superpowers/specs/2026-10-27-render-selection-design.md`. Execute inline.

1. Add tests for batch selection (config order, cross-option IDs, no duplicate/missing IDs) and shared page inclusion; add `src/presentation/selection.ts` helpers.
2. Extend ShotList with accessible checkboxes separate from preview buttons. Add transient selected IDs, Select all for visible option/Clear and Render selected (N) in PresentationWorkspace. Existing sequential renderer remains authoritative.
3. Add Export page selection controls that update existing config.pages inclusion; reflect option-qualified labels, all/none and resulting page count/preflight. Reuse helpers and existing shared layout.
4. Test noncontiguous views, option switching, queue sequence, cancellation and empty selection. Run full tests/typecheck/build and inspect desktop/mobile. Commit and push with rendering corrections after visual regression passes.

Completed inline. Automated selection/queue tests and production UI checks passed, including two full-resolution selected renders in order, page inclusion shared with Build booklet, and a two-page PDF matching selection. See client-booklet-verification.md.
