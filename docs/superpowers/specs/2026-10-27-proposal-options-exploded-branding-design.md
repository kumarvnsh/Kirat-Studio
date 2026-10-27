# Proposal options, exploded construction and company branding

Date: 27 October 2026. Status: design approved by the user in the named-options approval prompt.

## Approved extension

Extend the existing client booklet rather than create another proposal tool. A proposal contains named options (for example front-lit, halo-lit, mixed logo/letter constructions and different colour combinations). Each option uses the same artwork and placement while applying its own group and individual-element construction/face/return colour choices and optional fascia colour. Duplicating an option also duplicates its linked render/page set. Editing options must never change the base editor design.

Each shot belongs to one option. A day/night pair remains linked within that option. Names and descriptions are page metadata; material/colour edits invalidate only affected effective render inputs. Include an optional comparison page with option names, descriptions and actual effective constructions/colours; never invent prices or unsupported company services. Users retain control over which option pages enter the final PDF/images and their order. A comparison can be accompanied by each option's own full-size renders.

Replace technical top in the default booklet with a labelled exploded construction view. Retain the old top camera as an optional existing preset for compatibility. The exploded view uses existing assembly layers and dimensioned parts, with leaders and labels for present layers only: rear sheet, frame, fascia, mounting, letter backs, returns, LED modules, power and faces. Separate optional layers only when present. Use a wider oblique camera and clear studio surroundings; power defaults off for this explanatory view. Labels must be legible in raw render images and all exported formats. Disclose that LED/power placement is schematic and this is not a fabrication drawing.

Proposal branding uses the supplied `/Users/vnshkumar/Desktop/kirat-email-logo-hires.svg` as Kirat Creations, replacing the Kirat Studio text in proposal headers. Keep the app's Kirat Studio identity. Preserve the SVG's embedded images, masks, filters, proportions and service line. Use an appearance-preserving high-resolution PNG derivative for PDF/browser consistency, retaining the original SVG as the source asset. No scripts or external references were found in the supplied SVG. Branding remains an include/exclude choice and a user logo override remains available.

## Implementation boundaries

Add a focused proposal-option module that resolves overrides against the authoritative base design through existing artwork editing semantics. Do not duplicate layout mathematics or alter base artwork. Construction changes reset recipe-specific depth parameters; existing unrelated geometry and physical placement remain unchanged. Original, mixed and single-letter overrides are supported. Render keys use the resolved design and ignore option names/descriptions.

Save options separately in the presentation section of project format v6, migrating v1–v5. Older presentation shots map to the default option. The old default technical-top slot migrates to exploded construction; custom top shots remain available. Validate option IDs, page/shot references, colours, construction enums and bounded descriptions. Removing an option removes its own shots/pages after an explicit scoped action; the last option cannot be removed.

Use existing layer displacement for explosion, frame the actual displaced bounds and generate labelled callouts from those layer bounds projected through the capture camera. Composite callouts into PNG before caching so PDF, page images and raw images agree. The default and optional construction comparison pages resolve actual overrides and display the appropriate option labels.

## Verification

Test mixed group/letter constructions, colours, recipe resets, base immutability, option duplication/removal and render identity isolation. Test v5 migration and v6 round-trip. Test explosion uses real layers and callout positions, not fabricated components. Inspect at least two Fenesta options in one PDF, a labelled exploded render, the Kirat Creations header logo and PNG/JPG outputs. Retain original rendering, queue, recovery, cache and layout regressions.
