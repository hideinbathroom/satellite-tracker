/**
 * Post-Processing — bloom + vignette pipeline
 *
 * Enhanced with vignette for cinematic depth and tuned bloom.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export interface PostProcessingConfig {
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
  vignetteIntensity?: number;
  vignetteSmoothness?: number;
}

const DEFAULTS: Required<PostProcessingConfig> = {
  bloomStrength: 0.9,
  bloomRadius: 0.6,
  bloomThreshold: 0.15,
  vignetteIntensity: 0.35,
  vignetteSmoothness: 0.9,
};

/** Custom vignette shader */
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0.35 },
    uSmoothness: { value: 0.9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uSmoothness;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float vignette = smoothstep(0.5, 0.5 - uSmoothness * 0.5, dist) ;
      vignette = mix(1.0, vignette, uIntensity);
      color.rgb *= vignette;
      gl_FragColor = color;
    }
  `,
};

export function setupPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  config: PostProcessingConfig = {},
): EffectComposer {
  const cfg = { ...DEFAULTS, ...config };
  const size = renderer.getSize(new THREE.Vector2());
  const pixelRatio = renderer.getPixelRatio();
  const composer = new EffectComposer(renderer);

  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x * pixelRatio, size.y * pixelRatio),
    cfg.bloomStrength,
    cfg.bloomRadius,
    cfg.bloomThreshold,
  );
  composer.addPass(bloomPass);

  // Vignette pass
  const vignettePass = new ShaderPass(VignetteShader);
  vignettePass.uniforms.uIntensity.value = cfg.vignetteIntensity;
  vignettePass.uniforms.uSmoothness.value = cfg.vignetteSmoothness;
  composer.addPass(vignettePass);

  composer.addPass(new OutputPass());

  return composer;
}

export function resizePostProcessing(
  composer: EffectComposer,
  width: number,
  height: number,
  _pixelRatio: number,
): void {
  composer.setSize(width, height);
}
