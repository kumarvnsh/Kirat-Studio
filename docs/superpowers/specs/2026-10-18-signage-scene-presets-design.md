# Signage scene presets — design specification

Date: 18 October 2026
Status: design and written specification approved by the user on 18 October 2026.

## Objective

Let a designer see the current sign installed above a shop entrance or on an interior shop wall. Provide enough surrounding geometry to judge scale, placement and illumination while retaining the existing interactive 3D sign.

The user chose built-in 3D settings over customer-photo placement, selected simple presets over customization, and approved the design described below.

## Scope and interaction

Add a labelled **Scene** dropdown beside the time-of-day control in the 3D viewport:

- **Studio:** the current neutral preview and the default on startup.
- **Shopfront:** the sign above a glazed shop entrance, with a fascia, building wall and pavement.
- **Interior:** the sign on a wall behind a simple reception counter, with soft room lighting.

The scene selection is available in the standard 3D preview and presentation view. Scene controls are omitted in 2D outlines and the forming study. Returning to 3D restores the selected scene for the current session. Existing compact/mobile layouts must keep the selector usable without covering the canvas controls.

Switching a scene automatically frames that setting. Orbit, zoom and Fit remain available. Fit frames the sign and a useful amount of surroundings; Frame selection continues to focus on the selected sign elements. Manual camera changes persist until the user changes scene, requests framing, or triggers an existing reframing action.

Use a native select with an accessible name and keyboard support. No additional settings dialog is needed.

## Appearance and automatic sizing

Each setting is a fixed visual preset. There are no controls for wall colour, mounting height, furniture or building dimensions in this version.

Scenery derives its proportions from the sign's board width and height. The sign assembly retains its actual dimensions, finishes, layers and construction; the surroundings adapt around it. In Interior, the existing designed sign assembly mounts on the wall, including its backing board. This feature does not introduce a board-free construction mode.

Shopfront uses a restrained neutral facade, dark glazing, a simple entrance below the sign, and a pavement plane. Interior uses a neutral wall, a floor plane and a reception counter placed below the sign. Keep the surrounding forms simple and the sign visually dominant. All scenery uses built-in geometry and materials, with no required model, texture or network downloads.

Place mounting surfaces behind the sign, with enough clearance to prevent coplanar surfaces and z-fighting. Keep furniture and door geometry clear of the sign. Size and frame the presets for very wide, tall and small valid sign dimensions; automatic sizing is illustrative and does not assert a surveyed real-world shop size.

The approved visual companion provided schematic layout references at `.superpowers/brainstorm/62787-1792344486/content/signage-contexts.html`. These sketches establish the composition, not a photorealism target or a runtime dependency.

## Lighting

Scene and time of day are independent viewing controls. Studio, Shopfront and Interior all support Day, Dusk and Night. Sign power, dimming, LED colour and camera exposure retain their existing meanings.

Shopfront responds to the existing outdoor time-of-day lighting. Interior adds soft, constant room illumination while its ambient/window contribution changes with time of day. Interior light must permit viewing the room at night without making the sign appear powered when its LEDs are off. Preset illumination remains illustrative, consistent with the current lighting disclosure.

Retain the verified blackout fix from commit `918293d`: HDR composer multisampling remains disabled. Continuous rendering is not part of this change.

## State and data flow

Add a typed scene preference to view state, separate from the existing `environment` field that represents time of day. Use Studio when the preference is missing or unrecognized.

The scene is a temporary viewing preference. It does not enter design history, affect quantities or fabrication outputs, or change the version 4 project-file format. The application currently excludes view state from saved projects; maintain that behavior. Returning from presentation restores the existing editor view and scene using the established presentation-state flow.

Pass the selected scene through the existing scene-input boundary. Geometry and fabrication calculations continue to use the existing design layout. Changing only the scene does not edit the design or create an undo entry.

## Renderer architecture and lifecycle

Keep scenery construction in a small dedicated module rather than adding shop and room builders throughout `SignScene`. Its inputs are the scene preset and current sign bounds; its outputs are a scenery group, relevant light references, the mounting-wall reference and framing bounds.

`SignScene` owns the scenery group and its GPU resources. Keep that group separate from the sign's selectable assembly layers. Scenery must not intercept sign selection, appear in the layer tree, or disappear when the user toggles an assembly layer. In 2D and forming views the scenery is hidden; sign-specific isolate behavior continues to operate on sign objects.

Replace or reuse the current neutral wall through the scenery builder so there is one intended mounting wall, rather than overlapping old and new walls. Keep wall-colour and time-of-day updates pointed at the active scene's wall and lights.

Rebuild scenery when its preset or required sign dimensions change. Camera movement, selection changes, exposure and dimming must not rebuild scenery. Dispose superseded scenery geometry and materials, and remove its lights, when rebuilding. Repeated preset switching must not accumulate GPU resources or event handlers.

Provide scene framing bounds that prioritize the installation area rather than including an unnecessarily large ground or background plane. Use those bounds for scene changes and Fit, and account for the active viewport aspect ratio and camera clipping/distance limits. Preserve selection-specific framing.

## Presentation and export

The current-view PNG captures the selected scene and camera view. Presentation view, its Day/Night comparison and the existing presentation export all use the selected scene.

Adapt still-image framing to the chosen setting and output aspect ratio. The current `renderStill` implementation frames only board dimensions, so it must use scene framing bounds when a contextual preset is active. Studio retains its current composition.

Day/Night captures change time of day while holding the scene and sign design constant. After capture, restore the live camera, orbit target, viewport size, lighting, selection highlight and selected scene, including when export fails. Existing concept-preview disclosures remain present.

## Failure behavior

An absent or invalid preset resolves to Studio. If contextual scenery cannot be constructed, dispose partial scenery, retain the sign and restore the Studio surroundings; report the fallback through the existing status-message mechanism. Preserve the existing WebGL-unavailable path to 2D outlines.

## Verification and acceptance criteria

1. Startup shows Studio. All three presets can be selected using mouse and keyboard.
2. Shopfront visibly mounts the current sign above an entrance; Interior mounts it on a wall above a counter.
3. Scenery fits small, wide and tall valid sign dimensions without covering the sign or placing the camera outside usable clipping/distance limits.
4. Scene selection leaves design data, undo history, BOM and fabrication output unchanged. Existing projects open without migration.
5. Orbit, zoom, Fit, Frame selection, hide/isolate and assembly-layer visibility continue to work. Scenery cannot be selected as a sign part.
6. Day/Dusk/Night, LED power and dimming behave consistently in every scene; scenery geometry is reused for lighting and camera changes.
7. 2D outlines and forming remain usable, and returning to 3D restores the selected scene.
8. Current-view PNG, presentation comparison and presentation export include the chosen setting with suitable framing. Capture restores the live view on success and failure.
9. Repeated scene switches dispose old resources. Missing presets and construction failures recover to Studio.
10. Typecheck, existing tests and production build pass. Add focused tests for sizing/framing calculations, view-state defaults and renderer integration where practical. Perform browser checks for visual composition, repeated switching, responsive controls, orbiting and idle stability; unit tests alone cannot establish that GPU blackouts are absent.

## Deferred work

Customer-photo placement, perspective calibration, editable shop/room dimensions, material selectors, mounting-height controls, furniture libraries, photorealistic assets, calibrated lighting and saved scene preferences are outside this version.

## Delivery

After written-spec approval, create the implementation plan using the writing-plans workflow. Keep changes and commits local; do not push without a later user instruction.
