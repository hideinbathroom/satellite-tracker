/**
 * Post-Processing — bloom/glow pipeline
 *
 * Sets up EffectComposer with UnrealBloomPass for the neon glow aesthetic.
 * Bloom makes emissive satellites and atmosphere pop against the dark background.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export interface PostProcessingConfig {
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
}

const DEFAULTS: Required<PostProcessingConfig> = {
  bloomStrength: 0.8,
  bloomRadius: 0.5,
  bloomThreshold: 0.2,
};

export function setupPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  config: PostProcessingConfig = {},
): EffectComposer {
  const { bloomStrength, bloomRadius, bloomThreshold } = { ...DEFAULTS, ...config };

  const size = renderer.getSize(new THREE.Vector2());
  const pixelRatio = renderer.getPixelRatio();

  const composer = new EffectComposer(renderer);

  // Base render pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom pass for neon glow
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x * pixelRatio, size.y * pixelRatio),
    bloomStrength,
    bloomRadius,
    bloomThreshold,
  );
  composer.addPass(bloomPass);

  // Output pass for correct color space
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return composer;
}

/** Call on window resize to update composer buffer sizes */
export function resizePostProcessing(
  composer: EffectComposer,
  width: number,
  height: number,
  _pixelRatio: number,
): void {
  // EffectComposer.setSize expects logical (CSS) pixels — it applies
  // the renderer's pixelRatio internally. Passing physical pixels here
  // would double-multiply the ratio, causing oversized render targets
  // and wasted GPU memory.
  composer.setSize(width, height);
}
