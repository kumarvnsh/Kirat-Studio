import { panelIntegrated } from '../domain/recipes.ts';
import * as T from 'three';
import { WebGLPathTracer, GradientEquirectTexture } from 'three-gpu-pathtracer';
import { SignScene } from '../scene/scene.ts';
import { addHaloEmitters, prepareFinalCoatings } from '../scene/signMaterials.ts';
import { preparePresentationEnvironment } from '../scene/presentationEnvironment.ts';
import { presentationCamera } from './cameras.ts';
import { accumulateSamples, renderDimensions, type RenderOptions } from './renderAdapter.ts';
import { canvasBlob } from './pageCanvas.ts';
import { loadImage } from '../artwork/import.ts';
import { explodedLabels, labelledExplodedCanvas } from './explodedLabels.ts';
import type { PresentationSnapshot } from './snapshot.ts';
export class FinalRenderer {
  private scene: SignScene | null = null;
  private host: HTMLDivElement | null = null;
  private active = false;
  dispose() {
    this.scene?.dispose();
    this.scene = null;
    this.host?.remove();
    this.host = null;
  }
  async render(
    snapshot: PresentationSnapshot,
    options: RenderOptions,
    quality: 'preview' | 'final' = 'final',
  ) {
    if (this.active) throw Error('Another render is running. Wait or cancel it.');
    this.active = true;
    let tracer: WebGLPathTracer | undefined, environment: T.Texture | undefined;
    const { signal, onProgress } = options,
      { shot, input, design } = snapshot;
    try {
      signal.throwIfAborted();
      onProgress({ label: 'Preparing geometry and materials…' });
      if (!this.scene) {
        this.host = document.createElement('div');
        this.scene = new SignScene(
          this.host,
          () => {},
          (message) => {
            throw Error(message);
          },
          { offscreen: true },
        );
      }
      const v = this.scene;
      // Every job owns and releases its WebGL context, geometry and materials.
      let art: HTMLCanvasElement | null = null;
      if (design.artwork?.imageData) {
        const image = await loadImage(design.artwork.imageData);
        signal.throwIfAborted();
        art = document.createElement('canvas');
        art.width = design.artwork.imageWidth;
        art.height = design.artwork.imageHeight;
        art.getContext('2d')!.drawImage(image, 0, 0);
      }
      v.build(input, art);
      v.highlight(false);
      if (quality === 'final') prepareFinalCoatings(v.group);
      const remove: T.Mesh[] = [];
      v.group.traverse((o) => {
        if (!(o instanceof T.Mesh)) return;
        if (o.userData.extraTexture) {
          if (quality === 'final') remove.push(o);
          return;
        }
        const materials = [o.material].flat();
        for (const m of materials) {
          if (!(m instanceof T.MeshStandardMaterial)) continue;
          if (m.transparent) {
            m.transparent = false;
            m.opacity = 1;
            if (m instanceof T.MeshPhysicalMaterial) {
              m.transmission = 0.85;
              m.ior = 1.49;
            } else {
              const glass = new T.MeshPhysicalMaterial({
                color: m.color,
                roughness: 0.12,
                transmission: 0.85,
                ior: 1.49,
                thickness: 0.005,
              });
              o.material = glass;
              m.dispose();
            }
          }
        }
      });
      for (const m of remove) {
        m.removeFromParent();
        m.geometry.dispose();
        for (const mat of [m.material].flat()) mat.dispose();
        (m.userData.extraTexture as T.Texture).dispose();
      }
      if (quality === 'final' && shot.camera.preset !== 'exploded') addHaloEmitters(v.group, input);
      preparePresentationEnvironment(v, shot.scene, shot);
      const isNight = shot.environment === 'night',
        isDusk = shot.environment === 'dusk';
      const env = new GradientEquirectTexture(256);
      env.topColor.set(isNight ? '#9eacbf' : isDusk ? '#d9b4a0' : '#dce8f7');
      env.bottomColor.set(isNight ? '#647387' : '#8d969e');
      env.update();
      environment = env;
      const daylightScale = isNight ? 1 : isDusk ? 1.6 : 6;
      v.scene.environment = env;
      v.scene.environmentIntensity = (isNight ? 0.4 : isDusk ? 0.7 : 1.4) * daylightScale;
      v.scene.background = new T.Color(
        shot.scene.kind === 'studio' || shot.camera.preset === 'exploded'
          ? isNight
            ? '#202c3b'
            : '#e0e4e5'
          : isNight
            ? '#192531'
            : isDusk
              ? '#777483'
              : '#c9d8e3',
      );
      v.sun.visible = v.hemi.visible = v.fill.visible = false;
      v.scenery!.roomLight.visible = false;
      const key = new T.RectAreaLight(
        isDusk ? '#ffd4a0' : '#fff1dc',
        (isNight ? 2.5 : isDusk ? 4 : 7) * daylightScale,
        4,
        3,
      );
      key.position.set(-2, 4, 4);
      key.lookAt(0, 0, 0);
      v.scene.add(key);
      const fill = new T.RectAreaLight('#d5e4f5', (isNight ? 0.5 : 2) * daylightScale, 3, 4);
      fill.position.set(4, 1, 3);
      fill.lookAt(0, 0, 0);
      v.scene.add(fill);
      const bounds =
        shot.scene.kind === 'studio'
          ? new T.Box3().setFromObject(v.group)
          : v.scenery!.frameBounds.clone();
      const camera = presentationCamera(bounds, shot.camera, shot.aspect);
      const { width, height } = renderDimensions(
        quality === 'final' ? shot.width : 1000,
        shot.aspect,
      );
      const renderer = v.renderer;
      if (Math.max(width, height) > renderer.capabilities.maxTextureSize)
        throw Error('This device cannot render that size. Choose 2400 px or a wider frame.');
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      renderer.toneMapping = T.AgXToneMapping;
      renderer.toneMappingExposure =
        ((isNight ? 1.3 : isDusk ? 1 : 0.75) * 2 ** shot.exposureEV) / daylightScale;
      signal.throwIfAborted();
      if (quality === 'preview') {
        onProgress({ label: 'Rendering preview…' });
        renderer.render(v.scene, camera);
      } else {
        tracer = new WebGLPathTracer(renderer);
        tracer.tiles.set(3, 3);
        tracer.bounces = 6;
        tracer.filterGlossyFactor = 0.5;
        tracer.renderDelay = 0;
        tracer.fadeDuration = 0;
        tracer.minSamples = 1;
        tracer.rasterizeScene = false;
        tracer.setScene(v.scene, camera);
        await accumulateSamples(
          {
            get samples() {
              return tracer!.samples;
            },
            renderSample: () => tracer!.renderSample(),
            isContextLost: () => renderer.getContext().isContextLost(),
          },
          512,
          signal,
          onProgress,
        );
        // A complete sample fills every tile; render once more to present the current target.
        tracer.pausePathTracing = true;
        tracer.renderSample();
      }
      signal.throwIfAborted();
      onProgress({ fraction: 1, label: 'Encoding image…' });
      const output =
        shot.camera.preset === 'exploded'
          ? await labelledExplodedCanvas(
              renderer.domElement,
              explodedLabels(
                v.layers,
                camera,
                input.layout.elements.some((e) => panelIntegrated(e.type)),
              ),
            )
          : renderer.domElement;
      const blob = await canvasBlob(output);
      signal.throwIfAborted();
      return { blob, width, height };
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') this.dispose();
      throw error;
    } finally {
      tracer?.dispose();
      environment?.dispose();
      this.dispose();
      this.active = false;
    }
  }
}
