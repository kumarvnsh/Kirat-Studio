# Signage Scene Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preview the current sign in automatically sized Shopfront and Interior settings, with Studio as the default, and include those settings in existing presentation exports.

**Architecture:** Keep the installation setting in transient view state, independently of time of day. A small scene module builds and disposes scenery outside the selectable sign layers and supplies framing bounds. `SignScene` connects that module to the existing lighting, camera and capture paths; the viewport supplies one native selector.

**Tech Stack:** TypeScript, React 19, Three.js 0.180, existing postprocessing, Vite, Node's built-in test runner. No new dependencies or downloaded assets.

---

## Context and working rules

- Approved spec: `docs/superpowers/specs/2026-10-18-signage-scene-presets-design.md`.
- Repository: `/Users/vnshkumar/Documents/Kirat-Studio`.
- Reuse this checkout unless isolation becomes necessary; no implementation worktree was created during brainstorming.
- Keep commits local. **Do not push.** Stage exact task files and leave the pre-existing untracked `.superpowers/` directory out of commits.
- Preserve commit `918293d`: composer multisampling stays `0`, renderer antialiasing stays disabled, and the existing dirty-frame render loop remains intact.
- Coordinates: the layout uses millimetres; Three.js uses metres; x is right, y is up, and +z faces the viewer. The sign remains centered at its existing origin.
- `src/storage/project.ts` deliberately excludes view state from project files. Do not change the project format or introduce scene persistence.
- Run tests before implementing nontrivial behavior. A browser check is required for appearance and GPU behavior; source-pattern assertions are not visual regression tests.

## File responsibilities

| File | Responsibility |
| --- | --- |
| `src/domain/scenePresets.ts` (new) | Preset names, normalization and automatic scenery dimensions |
| `src/domain/project.ts` | Optional transient preset field and Studio default |
| `src/domain/layout.ts` | Normalize the preset at the existing scene-input boundary |
| `src/scene/scenery.ts` (new) | Build/dispose scenery, hold its wall and room-light references, calculate contextual camera framing |
| `src/scene/scene.ts` | Own scenery, connect lighting and camera framing, restore capture state |
| `src/app/Viewport.tsx` | Scene selector, scene-update effect and reframe dependencies |
| `src/app/PresentationPanel.tsx` | Refresh Day/Night comparison after a scene change |
| `src/app/style.css` | Let the viewport toolbar wrap at compact widths |
| `tests/scenePresets.test.ts` (new) | Defaults, dimensions, framing, scene construction and disposal |
| `tests/workspace.test.ts` | Scene changes stay outside design history and project serialization |
| `docs/scene-presets-verification.md` (new) | Record actual browser verification results and remaining limitations |

## Task 1: Add transient scene state and dimension calculations

**Files:** Create `src/domain/scenePresets.ts`, create `tests/scenePresets.test.ts`, modify `src/domain/project.ts`, `src/domain/layout.ts`, `tests/workspace.test.ts`.

- [ ] **Step 1: Write failing tests for normalization, dimensions and defaults.** Start the new test file with:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, defaultView } from '../src/domain/project.ts';
import { sceneInput } from '../src/domain/layout.ts';
import { normalizeScenePreset, sceneryDimensions } from '../src/domain/scenePresets.ts';

test('scene defaults and invalid values resolve to Studio independently of time of day', () => {
  assert.equal(defaultView().scenePreset, 'studio');
  for (const value of [undefined, null, '', 'unknown']) {
    assert.equal(normalizeScenePreset(value), 'studio');
  }
  assert.equal(normalizeScenePreset('interior'), 'interior');
  const design = { settings: defaultSettings(), artwork: null };
  assert.equal(sceneInput(design, { ...defaultView(), scenePreset: undefined }).scenePreset, 'studio');
  const input = sceneInput(design, { ...defaultView(), scenePreset: 'shopfront', environment: 'night' });
  assert.equal(input.scenePreset, 'shopfront');
  assert.equal(input.environment, 'night');
});

test('scenery surrounds small, wide and tall signs without changing sign dimensions', () => {
  for (const [width, height] of [[150, 150], [3600, 1200], [24000, 500], [600, 6000]]) {
    const d = sceneryDimensions(width, height);
    assert.ok(d.facadeWidth > width / 1000);
    assert.ok(d.wallTop > height / 2000);
    assert.ok(d.floorY + d.entranceHeight < -height / 2000);
    assert.ok(d.floorY + d.counterHeight < -height / 2000);
    assert.ok(Object.values(d).every(Number.isFinite));
  }
});
```

- [ ] **Step 2: Run the new tests and confirm a missing-module/export failure.** Run `node --test tests/scenePresets.test.ts` from the repository root. Do not change existing passing tests to accommodate missing behavior.

- [ ] **Step 3: Implement the independent preset/dimension module.** Use these exports:

```ts
export const scenePresets = {
  studio: 'Studio',
  shopfront: 'Shopfront',
  interior: 'Interior',
} as const;
export type ScenePreset = keyof typeof scenePresets;

export function normalizeScenePreset(value: unknown): ScenePreset {
  return value === 'shopfront' || value === 'interior' ? value : 'studio';
}

export function sceneryDimensions(widthMm: number, heightMm: number) {
  const width = widthMm / 1000, height = heightMm / 1000;
  const clearance = Math.max(2.6, height * 0.75);
  return {
    width,
    height,
    facadeWidth: Math.max(4.2, width * 1.2),
    wallTop: height / 2 + Math.max(0.35, height * 0.12),
    floorY: -height / 2 - clearance,
    entranceHeight: Math.min(2.2, clearance - 0.3),
    counterHeight: Math.min(1.05, clearance - 0.5),
  };
}
```

Inputs come from validated design dimensions. Do not add another dimension-validation framework here.

- [ ] **Step 4: Wire the type, default and normalized scene input.** In `project.ts`, import `ScenePreset` as a type, add `scenePreset?: ScenePreset` beside `environment`, and add `scenePreset: 'studio'` in `defaultView()`. In `layout.ts`, import `normalizeScenePreset` and insert the following immediately after `...view` in `sceneInput`:

```ts
scenePreset: normalizeScenePreset(view.scenePreset),
```

Optionality preserves existing callers and supports missing view values; renderer input is always normalized.

- [ ] **Step 5: Test state isolation.** Add imports for `setView`, `serialise` and `parseProject` to `tests/workspace.test.ts`, then add:

```ts
test('scene selection is view-only and opening a project restores Studio', () => {
  const design = { settings: defaultSettings(), artwork: null };
  loadDesign(design, 'Loaded');
  const before = getState().design;
  setView({ scenePreset: 'interior' });
  assert.equal(getState().design, before);
  assert.equal(getState().view.environment, 'day');
  const text = serialise({ design, fabrication: getState().fabrication });
  assert.equal(text.includes('scenePreset'), false);
  loadDesign(parseProject(text).design, 'Reopened');
  assert.equal(getState().view.scenePreset, 'studio');
});
```

- [ ] **Step 6: Verify and commit.** Run `node --test tests/scenePresets.test.ts tests/workspace.test.ts` and `npm run typecheck`. Expect all tests and typecheck to pass. Commit only the five task files with `feat: add transient signage scene presets`.

## Task 2: Build lightweight scenery with explicit ownership

**Files:** Create `src/scene/scenery.ts`, extend `tests/scenePresets.test.ts`.

- [ ] **Step 1: Add failing geometry tests.** Import Three.js, `buildScenery` and `disposeScenery` in the new test file. Cover all presets and the wall's position behind the supplied rear board:

```ts
test('context geometry is separate from sign selection and has one mounting wall', () => {
  for (const preset of ['studio', 'shopfront', 'interior'] as const) {
    const scene = buildScenery(preset, 3.6, 1.2, -0.13);
    assert.equal(scene.wall.position.z, -0.13);
    assert.equal(scene.group.children.filter(o => o.name === 'mounting-wall').length, 1);
    scene.group.traverse(o => assert.equal(o.userData.part, undefined));
    assert.equal(scene.roomLight.intensity > 0, preset === 'interior');
    assert.equal(scene.frameBounds.isEmpty(), preset === 'studio');
    disposeScenery(scene);
    assert.equal(scene.group.children.length, 0);
  }
});

test('disposal releases owned geometry and materials once', () => {
  const scene = buildScenery('interior', 3.6, 1.2, -0.13);
  let geometryCount = 0, materialCount = 0, disposedGeometry = 0, disposedMaterial = 0;
  scene.group.traverse(object => {
    if (!(object instanceof T.Mesh)) return;
    geometryCount++;
    object.geometry.addEventListener('dispose', () => disposedGeometry++);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materialCount++;
      material.addEventListener('dispose', () => disposedMaterial++);
    }
  });
  disposeScenery(scene);
  assert.equal(disposedGeometry, geometryCount);
  assert.equal(disposedMaterial, materialCount);
});
```

- [ ] **Step 2: Run `node --test tests/scenePresets.test.ts` and confirm missing scenery exports fail.**

- [ ] **Step 3: Implement the scenery module.** The dimensions in this builder are metres. Allocate a separate material per mesh so ownership is unambiguous:

```ts
import * as T from 'three';
import { sceneryDimensions, type ScenePreset } from '../domain/scenePresets.ts';

export type Scenery = {
  group: T.Group;
  wall: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  roomLight: T.DirectionalLight;
  frameBounds: T.Box3;
};

export function disposeScenery(scenery: Scenery) {
  scenery.group.removeFromParent();
  scenery.group.traverse(object => {
    if (!(object instanceof T.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.dispose();
    }
  });
  scenery.group.clear();
}

export function buildScenery(preset: ScenePreset, width: number, height: number, wallZ: number): Scenery {
  const d = sceneryDimensions(width * 1000, height * 1000);
  const group = new T.Group();
  group.name = 'installation-scenery';
  const contextual = preset !== 'studio';
  const wallWidth = contextual ? d.facadeWidth : Math.max(width * 2, 10);
  const wallHeight = contextual ? d.wallTop - d.floorY : Math.max(height * 3, 5);
  const wall = new T.Mesh(
    new T.PlaneGeometry(wallWidth, wallHeight),
    new T.MeshStandardMaterial({ color: '#bcc7ca', roughness: 0.95 }),
  );
  wall.name = 'mounting-wall';
  wall.position.set(0, contextual ? (d.wallTop + d.floorY) / 2 : 0, wallZ);
  wall.receiveShadow = true;
  group.add(wall);
  const roomLight = new T.DirectionalLight('#fff0d8', preset === 'interior' ? 2.2 : 0);
  roomLight.position.set(-width * 0.25, height / 2 + 1, 3);
  group.add(roomLight, roomLight.target);
  const frameBounds = contextual
    ? new T.Box3(new T.Vector3(-wallWidth / 2, d.floorY, wallZ),
        new T.Vector3(wallWidth / 2, d.wallTop, 1.2))
    : new T.Box3();
  const result = { group, wall, roomLight, frameBounds };
  const box = (name: string, w: number, h: number, depth: number,
    x: number, y: number, z: number, color: string, metalness = 0) => {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, depth),
      new T.MeshStandardMaterial({ color, metalness, roughness: 0.65 }));
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  try {
    if (contextual) {
      const floor = new T.Mesh(new T.PlaneGeometry(wallWidth * 2, 8),
        new T.MeshStandardMaterial({ color: preset === 'interior' ? '#b9a78c' : '#a9aaa4', roughness: 1 }));
      floor.name = 'floor';
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, d.floorY, wallZ + 4);
      floor.receiveShadow = true;
      group.add(floor);
    }
    if (preset === 'shopfront') {
      const glazingWidth = wallWidth * 0.88;
      const doorWidth = Math.min(1.1, glazingWidth * 0.3);
      const entranceY = d.floorY + d.entranceHeight / 2;
      box('glazing', glazingWidth, d.entranceHeight, 0.025, 0, entranceY, wallZ + 0.025, '#213d49', 0.3);
      box('door', doorWidth, d.entranceHeight, 0.045, 0, entranceY, wallZ + 0.055, '#344c54', 0.3);
      for (const x of [-doorWidth / 2, doorWidth / 2]) {
        box('door-frame', 0.035, d.entranceHeight, 0.055, x, entranceY, wallZ + 0.09, '#aab2b1', 0.6);
      }
      box('door-handle', 0.025, 0.32, 0.045, doorWidth * 0.3,
        d.floorY + 1.1, wallZ + 0.12, '#c3c9c7', 0.8);
    }
    if (preset === 'interior') {
      const counterWidth = Math.min(wallWidth * 0.65, Math.max(1.8, width * 0.8));
      box('counter', counterWidth, d.counterHeight, 0.65, 0,
        d.floorY + d.counterHeight / 2, wallZ + 0.7, '#927353');
      box('counter-top', counterWidth + 0.08, 0.06, 0.73, 0,
        d.floorY + d.counterHeight + 0.03, wallZ + 0.7, '#e5dfd2');
    }
    return result;
  } catch (error) {
    disposeScenery(result);
    throw error;
  }
}
```

Keep the existing sign board as the fascia above the entrance. Do not add a second panel over it. The floor is not included in full when framing. Ensure any browser-driven visual refinements retain the tested clearance and ownership rules.

- [ ] **Step 4: Verify and commit.** Run `node --test tests/scenePresets.test.ts` and `npm run typecheck`. Commit the module and test with `feat: build automatic shopfront and interior scenery`.

## Task 3: Integrate scenery updates, lighting and fallback

**Files:** Modify `src/scene/scene.ts`, `src/app/Viewport.tsx`, `tests/scenePresets.test.ts`.

- [ ] **Step 1: Add a renderer integration test without constructing WebGL.** Import `SignScene`, build a lightweight prototype instance with the fields `setScene` needs, and verify scene reuse and replacement:

```ts
test('scene updates reuse scenery until preset or sign dimensions change', () => {
  const v = Object.create(SignScene.prototype) as SignScene;
  Object.assign(v, { scene: new T.Scene(), scenery: null, sceneryKey: '', dirty: false,
    onSceneError: () => {}, state: null });
  const design = { settings: defaultSettings(), artwork: null };
  const input = sceneInput(design, { ...defaultView(), scenePreset: 'shopfront' });
  v.setScene(input);
  const first = v.scenery;
  v.setScene({ ...input, exposure: 1, selected: 'example' });
  assert.equal(v.scenery, first);
  v.setScene({ ...input, scenePreset: 'interior' });
  assert.notEqual(v.scenery, first);
  assert.equal(first!.group.parent, null);
  assert.equal(v.scene.children.filter(o => o.name === 'installation-scenery').length, 1);
  v.setScene({ ...input, mode: 'bend' });
  assert.equal(v.scenery!.group.visible, false);
  disposeScenery(v.scenery!);
});
```

- [ ] **Step 2: Run the new test and confirm `setScene` is missing.**

- [ ] **Step 3: Add scenery ownership to `SignScene`.** Import the scenery module and preset normalizer; add fields `scenery: Scenery | null = null`, `sceneryKey = ''`, `onSceneError: (message: string) => void`. Add an optional third constructor argument `onSceneError = (_message: string) => {}` and assign it. Implement:

```ts
setScene(s: SceneInput) {
  this.state = s;
  const preset = normalizeScenePreset(s.scenePreset);
  const wallZ = s.layout.board[0].z0 * M - 0.1;
  const key = [preset, s.settings.width, s.settings.height, wallZ].join(':');
  if (this.sceneryKey !== key || !this.scenery) {
    let next: Scenery;
    try {
      next = buildScenery(preset, s.settings.width * M, s.settings.height * M, wallZ);
    } catch (error) {
      console.error('Unable to build signage scenery', error);
      next = buildScenery('studio', s.settings.width * M, s.settings.height * M, wallZ);
      this.onSceneError('Scene unavailable. Showing the Studio setting.');
    }
    if (this.scenery) disposeScenery(this.scenery);
    this.scenery = next;
    this.sceneryKey = key;
    this.scene.add(next.group);
    this.wall = next.wall;
  }
  this.scenery.group.visible = s.mode === '3d';
  this.draw();
}
```

The fallback has empty contextual framing bounds, so framing must consult those bounds rather than only the requested preset string. A failed requested preset is cached until a relevant input changes, preventing repeated error messages on every lighting update.

- [ ] **Step 4: Replace the current wall block in `build`.** Remove the local `new T.Mesh(new T.PlaneGeometry(...))` wall creation and its insertion into `this.group`; insert `this.setScene(s)` at that location. Keep the existing `wall` field because environment updates already use it. `clear()` continues to clear only the sign group; the separately owned scenery is replaced only by `setScene`.

- [ ] **Step 5: Connect lighting and visibility.** Immediately after obtaining the environment preset in `setEnvironment`, call `this.setScene(s)`. Keep the existing daylight/sky, sign emission and exposure calculations. After setting fill intensity, assign:

```ts
if (this.scenery) {
  this.scenery.roomLight.intensity = s.scenePreset === 'interior' && !this.scenery.frameBounds.isEmpty() ? 2.2 : 0;
}
```

At the start of `setVisibility`, before its forming-study early return, add:

```ts
if (this.scenery) this.scenery.group.visible = s.mode === '3d';
```

Picking remains restricted to the existing sign-layer targets. Do not put scenery into `this.layers`, `worldParts`, or the sign group.

- [ ] **Step 6: Connect the viewport scene effect and error feedback.** Pass `message => say(message)` as the third constructor argument in `Viewport`. Add a scene effect after the full-build effect:

```tsx
useEffect(() => {
  const v = viewer.current;
  if (!v?.state || (!ready && artwork)) return;
  const input = sceneInput(design, getState().view);
  v.setScene(input);
  v.setEnvironment(input);
}, [ready, design, view.scenePreset, view.mode]);
```

Add `view.scenePreset` to the existing reframe effect's dependency list. This causes a preset switch to frame after React has updated the scene. Do not add the preset to the sign geometry rebuild effect.

- [ ] **Step 7: Verify fallback deliberately.** In a browser development session, temporarily make the contextual `buildScenery` branch throw, select that scene and check the Studio wall/status message and continued sign selection. Remove that temporary fault before committing. Verify the fallback doesn't repeat on dimming changes.

- [ ] **Step 8: Verify and commit.** Run `node --test tests/scenePresets.test.ts`, `npm run typecheck` and `npm test`. Commit the three task files with `feat: integrate scene scenery with preview lighting`.

## Task 4: Add safe contextual camera framing and export restoration

**Files:** Modify `src/scene/scenery.ts`, `src/scene/scene.ts`, `src/app/PresentationPanel.tsx`, `tests/scenePresets.test.ts`.

- [ ] **Step 1: Write a failing framing test.** Add the following test and import `contextFrame` from the scenery module:

```ts
test('context framing contains all bounds corners at portrait and landscape aspects', () => {
  const bounds = new T.Box3(new T.Vector3(-4, -4, -0.2), new T.Vector3(4, 1, 1.2));
  for (const aspect of [0.6, 1, 2.4]) {
    for (const direction of [new T.Vector3(0.17, 0.115, 1), new T.Vector3(1, 0.08, 0.38)]) {
      const frame = contextFrame(bounds, aspect, 35, direction);
      const camera = new T.PerspectiveCamera(35, aspect, frame.near, frame.far);
      camera.position.copy(frame.position);
      camera.lookAt(frame.center);
      camera.updateMatrixWorld(true);
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const projected = new T.Vector3(x, y, z).project(camera);
            assert.ok(Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1);
            assert.ok(projected.z >= -1 && projected.z <= 1);
          }
    }
  }
});
```

- [ ] **Step 2: Run `node --test tests/scenePresets.test.ts` and confirm `contextFrame` is missing.**

- [ ] **Step 3: Implement exact box-corner framing.** Add this helper to `scenery.ts`:

```ts
export function contextFrame(bounds: T.Box3, aspect: number, fov: number, direction: T.Vector3) {
  const center = bounds.getCenter(new T.Vector3());
  const dir = direction.clone().normalize();
  if (dir.lengthSq() < 0.5) dir.set(0.17, 0.115, 1).normalize();
  const right = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), dir);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  const up = new T.Vector3().crossVectors(dir, right).normalize();
  const tanV = Math.tan(fov * Math.PI / 360), tanH = tanV * aspect;
  let distance = 0;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const offset = new T.Vector3(x, y, z).sub(center);
        distance = Math.max(distance, offset.dot(dir) +
          Math.max(Math.abs(offset.dot(right)) / tanH, Math.abs(offset.dot(up)) / tanV) * 1.12);
      }
  const radius = bounds.getSize(new T.Vector3()).length() / 2;
  return { center, position: center.clone().addScaledVector(dir, distance),
    distance, near: 0.05, far: Math.max(35, distance + radius * 3) };
}
```

- [ ] **Step 4: Add a contextual framing method to `SignScene`.** Import `contextFrame` and add:

```ts
private frameContext(direction: T.Vector3): boolean {
  const bounds = this.scenery?.frameBounds;
  if (!this.scenery?.group.visible || !bounds || bounds.isEmpty() || this.state?.isolate) return false;
  const frame = contextFrame(bounds, this.camera.aspect, this.camera.fov, direction);
  this.camera.position.copy(frame.position);
  this.controls.target.copy(frame.center);
  this.camera.near = frame.near;
  this.camera.far = frame.far;
  this.controls.maxDistance = Math.max(30, frame.distance * 2);
  this.camera.updateProjectionMatrix();
  this.camera.lookAt(frame.center);
  this.controls.update();
  this.draw();
  return true;
}
```

At the start of `fit`, after the existing state guard, define and use the chosen view direction:

```ts
const contextDirection = kind === 'front' ? new T.Vector3(0, 0, 1)
  : kind === 'rear' ? new T.Vector3(-0.12, 0.12, -1)
  : kind === 'side' ? new T.Vector3(0.92, 0.08, 0.38)
  : kind === 'top' ? new T.Vector3(0, 0.9, 0.42)
  : new T.Vector3(0.17, 0.115, 1);
if (s.mode === '3d' && this.frameContext(contextDirection)) return;
this.controls.maxDistance = 30;
this.camera.near = 0.05;
this.camera.far = 35;
this.camera.updateProjectionMatrix();
```

Then retain the existing Studio, forming and isolated-selection framing code. Keep `focusSelection` focused exclusively on actual selected sign objects.

- [ ] **Step 5: Adapt `renderStill` while retaining Studio behavior.** Snapshot these additional camera/controls values with the existing position, target, renderer size and ratio:

```ts
const aspect = this.camera.aspect, near = this.camera.near, far = this.camera.far;
const maxDistance = this.controls.maxDistance;
```

After setting the export aspect and obtaining the existing camera direction, replace the original board-only framing statements with:

```ts
if (!this.frameContext(direction)) {
  const need = Math.max((state.settings.width * M) / this.camera.aspect, state.settings.height * M);
  const distance = need / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) * 1.12 + 0.1;
  this.camera.position.copy(target).addScaledVector(direction, distance);
  this.camera.lookAt(target);
}
```

Do not change exposure or sign-light calculations. In `finally`, restore near/far and maxDistance before restoring the original camera/target and renderer dimensions. Finish by restoring the saved aspect, calling `updateProjectionMatrix()` and rendering the restored frame after `resize(true)`. This explicit aspect restoration handles export failures as well as unusual intermediate viewport sizes.

The final restoration tail is:

```ts
this.camera.near = near;
this.camera.far = far;
this.controls.maxDistance = maxDistance;
this.camera.position.copy(position);
this.controls.target.copy(target);
this.camera.lookAt(target);
this.renderer.setPixelRatio(ratio);
this.renderer.setSize(size.x, size.y, false);
this.setEnvironment(state);
this.highlight();
this.resize(true);
this.camera.aspect = aspect;
this.camera.updateProjectionMatrix();
this.renderNow();
```

- [ ] **Step 6: Refresh comparisons when the setting changes.** Add `view.scenePreset` to the comparison effect dependency array in `PresentationPanel.tsx`. `exportView` and `exportPresentation` already call renderer capture methods, so they inherit the selected scenery without another export path. The existing presentation snapshot spreads the entire view, so no extra preset-copy code is needed in `App.tsx`.

- [ ] **Step 7: Verify and commit.** Run `node --test tests/scenePresets.test.ts`, `npm run typecheck` and `npm test`. In the browser, check Fit and image capture at two viewport aspects. Commit task files with `feat: frame installation scenes in preview and exports`.

## Task 5: Expose the selector and verify the full user flow

**Files:** Modify `src/app/Viewport.tsx`, `src/app/style.css`; create `docs/scene-presets-verification.md`.

- [ ] **Step 1: Add the native Scene selector.** Import `scenePresets` and `normalizeScenePreset` in `Viewport`. In `.lightingbuttons`, immediately before the time-of-day selector, add:

```tsx
{view.mode === '3d' && <select aria-label="Scene" value={normalizeScenePreset(view.scenePreset)}
  onChange={event => setView({ scenePreset: normalizeScenePreset(event.target.value) })}>
  {Object.entries(scenePresets).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
</select>}
```

This sits inside the existing `!overlay` guard, remains available during presentation, and is absent from 2D/forming. Native option text displays the current setting. Retain existing toolbar button names and keyboard behavior.

- [ ] **Step 2: Permit the toolbar to wrap.** Add:

```css
.viewportbar { flex-wrap: wrap; }
.lightingbuttons { flex-wrap: wrap; justify-content: flex-end; }
```

Check existing media queries before adjusting any smaller-screen spacing. The new select must remain reachable at narrow widths; do not hide it behind a desktop-only class.

- [ ] **Step 3: Run full automated verification.** Run `npm run typecheck`, `npm test`, `npm run build` and `git diff --check`. Expect exit code 0 and all tests passing. The existing large-bundle warning may remain; do not expand scope into bundle restructuring.

- [ ] **Step 4: Check all acceptance flows in a browser.** Start Vite with `npm run dev -- --host 127.0.0.1` if no server is running. Use CUA browser controls, hard reload the actual localhost page after renderer code changes, and record the browser and URL tested. Check:

  1. Studio default; mouse and keyboard scene switching; no new undo entry.
  2. Shopfront entrance below the sign; Interior counter below the sign; scenery retains adequate space for wide/tall dimensions.
  3. Orbit and zoom, then stop interaction for at least 10 seconds in each preset. Test in the user's affected Brave localhost tab as well as any separate test browser. Do not claim the blackout is fixed from unit tests or a single screenshot.
  4. Day/Dusk/Night and LED on/off/dimming in all three scenes, including visible interior room lighting with LEDs off.
  5. Select a sign element, Frame selection, hide/isolate, change assembly layers, and return to the complete assembly. Scenery never becomes a selected part or contributes quantities.
  6. Switch to 2D and forming; return to 3D and confirm the scene preference remains.
  7. Present, change scene, compare Day/Night, and exit Present. Verify the saved editor scene and camera return.
  8. Export the current-view PNG and the presentation sheet for each contextual preset. Inspect the actual images for setting visibility, aspect, clipping and disclosures. Confirm the live view is restored.
  9. Exercise the `renderStill` error path using a temporary development-only throw after export sizing; remove the throw and confirm camera, lighting, target, size and highlight restoration. Do not retain fault injection in application code.
  10. Switch presets repeatedly; inspect `scene.children` for exactly one `installation-scenery` group and confirm GPU geometry counts stabilize rather than growing on each cycle.
  11. Save/reopen a project and confirm Studio returns while design and fabrication settings remain intact.
  12. Check compact/tablet/mobile toolbar layouts with the panel controls and presentation controls visible.

- [ ] **Step 5: Record results and commit.** Write the actual commands/results, screenshots or their paths, browser/version where available, verified flows and any unverified cases in `docs/scene-presets-verification.md`. Do not mark a check passed unless it was performed. Commit the selector, styles and verification record with `feat: expose signage installation scene presets`. Report commit IDs and limitations to the user; do not push.

## Self-review coverage

- Spec interaction/state: Tasks 1, 3 and 5.
- Geometry, sizing, ownership and failure recovery: Tasks 2 and 3.
- Lighting and preservation of the blackout fix: Tasks 3 and 5.
- Camera framing, aspect/clipping and exports: Task 4, with browser verification in Task 5.
- Existing 2D/forming, selection, assembly and project-file behavior: Tasks 1, 3 and 5.
- Local-only delivery and deferred customization/photo workflows: working rules and all commit steps.
