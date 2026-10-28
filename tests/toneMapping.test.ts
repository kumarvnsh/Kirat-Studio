import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RENDER_VERSION } from '../src/presentation/fingerprints.ts';

// AgX lifted dark colours and desaturated faces, so signs looked faded in presentation renders and
// beside site photos. Both renderers must use Khronos PBR Neutral, which keeps material colours true.
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('test_tonemapping_presentation_renderer_uses_neutral', () => {
  // Arrange
  const code = source('../src/presentation/finalRenderer.ts');
  // Act
  const neutral = /toneMapping = T\.NeutralToneMapping/.test(code),
    agx = /AgXToneMapping/.test(code);
  // Assert
  assert.ok(neutral && !agx);
});

test('test_tonemapping_editor_view_uses_neutral', () => {
  // Arrange
  const code = source('../src/scene/scene.ts');
  // Act
  const neutral = /ToneMappingMode\.NEUTRAL/.test(code),
    agx = /ToneMappingMode\.AGX/.test(code);
  // Assert
  assert.ok(neutral && !agx);
});

test('test_tonemapping_render_version_invalidates_faded_cache', () => {
  // Arrange / Act
  const version = RENDER_VERSION;
  // Assert
  assert.notEqual(version, 'sign-final-v5', 'renders cached with AgX must count as outdated');
});
