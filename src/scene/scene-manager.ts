/**
 * Scene Manager — main 3D orchestrator
 *
 * Owns the WebGL renderer, camera, controls, lighting, and animation loop.
 * Composes Earth, satellites, orbits, background, and post-processing into
 * a single cohesive scene. Provides public API for the UI layer.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { createEarth, updateEarth, setGridVisible, setAtmosphereVisible } from './earth.js';
import { SatelliteRenderer } from './satellites.js';
import type { SatellitePositionData } from './satellites.js';
import { OrbitRenderer } from './orbits.js';
import { createBackground, updateBackground } from './background.js';
import { setupPostProcessing, resizePostProcessing } from './post-processing.js';
import { LabelManager } from './labels.js';
import { CoverageRenderer } from './coverage.js';
import { NetworkRenderer } from './network.js';

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 8, 18);
const CAMERA_FOV = 45;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 500;
const MIN_DISTANCE = 2.0;
const MAX_DISTANCE = 20.0;

export class SceneManager {
  private container: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private composer!: EffectComposer;
  private clock = new THREE.Clock();
  private animationId: number | null = null;

  // Scene components
  private earthGroup!: THREE.Group;
  private starfield!: THREE.Points;
  private _satelliteRenderer!: SatelliteRenderer;
  private _orbitRenderer!: OrbitRenderer;
  private _labelManager!: LabelManager;
  private _coverageRenderer!: CoverageRenderer;
  private _networkRenderer!: NetworkRenderer;

  // Camera animation state
  private cameraTarget: THREE.Vector3 | null = null;
  private cameraLookTarget: THREE.Vector3 | null = null;
  private cameraAnimating = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /** Initialize the full 3D scene */
  init(): void {
    const { width, height } = this.getSize();

    // --- Renderer ---
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0a0a1a, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    // Accessibility: canvas description
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D visualization of GPS satellites orbiting Earth',
    );
    this.renderer.domElement.tabIndex = 0;

    // --- Scene ---
    this.scene = new THREE.Scene();

    // --- Camera ---
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
    this.camera.position.copy(DEFAULT_CAMERA_POSITION);

    // --- Controls ---
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = MIN_DISTANCE;
    this.controls.maxDistance = MAX_DISTANCE;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.8;

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0x334466, 0.6);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(5, 3, 5);
    this.scene.add(sunLight);

    // Subtle fill light from opposite side
    const fillLight = new THREE.DirectionalLight(0x4488aa, 0.3);
    fillLight.position.set(-3, -1, -3);
    this.scene.add(fillLight);

    // --- Scene components ---
    this.earthGroup = createEarth();
    this.scene.add(this.earthGroup);

    this.starfield = createBackground(this.scene);

    this._satelliteRenderer = new SatelliteRenderer(this.scene);
    this._orbitRenderer = new OrbitRenderer(this.scene);
    this._labelManager = new LabelManager(this.container, this.camera);
    this._coverageRenderer = new CoverageRenderer(this.scene);
    this._networkRenderer = new NetworkRenderer(this.scene);

    // --- Post-processing ---
    this.composer = setupPostProcessing(this.renderer, this.scene, this.camera);

    // --- Resize handler ---
    window.addEventListener('resize', this.onResize);
  }

  // --- Public accessors ---

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  get satelliteRenderer(): SatelliteRenderer {
    return this._satelliteRenderer;
  }

  get orbitRenderer(): OrbitRenderer {
    return this._orbitRenderer;
  }

  get labelManager(): LabelManager {
    return this._labelManager;
  }

  get coverageRenderer(): CoverageRenderer {
    return this._coverageRenderer;
  }

  get networkRenderer(): NetworkRenderer {
    return this._networkRenderer;
  }

  // --- Satellite management pass-through ---

  updateSatellites(positions: SatellitePositionData[]): void {
    this._satelliteRenderer.updateSatellites(positions);
  }

  // --- Camera controls ---

  /** Smooth camera transition to focus on a satellite position */
  focusOnSatellite(position: THREE.Vector3): void {
    // Calculate camera position: offset from satellite toward current camera direction
    const direction = new THREE.Vector3()
      .subVectors(this.camera.position, this.controls.target)
      .normalize();
    const distance = 1.5;

    this.cameraTarget = new THREE.Vector3().addVectors(
      position,
      direction.multiplyScalar(distance),
    );
    this.cameraLookTarget = position.clone();
    this.cameraAnimating = true;
  }

  /** Return camera to default overview position */
  resetCamera(): void {
    this.cameraTarget = DEFAULT_CAMERA_POSITION.clone();
    this.cameraLookTarget = new THREE.Vector3(0, 0, 0);
    this.cameraAnimating = true;
  }

  /** Toggle Earth grid lines */
  setGridVisible(visible: boolean): void {
    setGridVisible(this.earthGroup, visible);
  }

  /** Toggle atmosphere layers + clouds */
  setAtmosphereVisible(visible: boolean): void {
    setAtmosphereVisible(this.earthGroup, visible);
  }

  // --- Render loop ---

  /** Single frame render with post-processing */
  render(): void {
    this.composer.render();
  }

  /** Start the internal clock (call before using update() from an external loop) */
  startClock(): void {
    this.clock.start();
  }

  /** Update scene components for one frame (call from external animation loop) */
  update(): void {
    const delta = this.clock.getDelta();

    // Update scene components
    updateEarth(this.earthGroup, delta);
    updateBackground(this.starfield, delta);
    this._satelliteRenderer.update(delta);
    this._orbitRenderer.update(delta);
    this._networkRenderer.update(delta);

    // Smooth camera animation
    if (this.cameraAnimating && this.cameraTarget && this.cameraLookTarget) {
      const lerpFactor = 1.0 - Math.pow(0.01, delta);
      this.camera.position.lerp(this.cameraTarget, lerpFactor);
      this.controls.target.lerp(this.cameraLookTarget, lerpFactor);

      // Stop animating when close enough
      if (
        this.camera.position.distanceTo(this.cameraTarget) < 0.01 &&
        this.controls.target.distanceTo(this.cameraLookTarget) < 0.01
      ) {
        this.cameraAnimating = false;
      }
    }

    // Update controls
    this.controls.update();

    // Render with post-processing
    this.render();

    // Render CSS2D labels on top
    this._labelManager.resolveOverlaps(this.scene);
    this._labelManager.render(this.scene, this.camera);
  }

  /** Start the animation loop */
  animate(): void {
    const loop = (): void => {
      this.animationId = requestAnimationFrame(loop);
      this.update();
    };

    this.clock.start();
    loop();
  }

  /** Stop the animation loop */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /** Handle window resize */
  onResize = (): void => {
    const { width, height } = this.getSize();

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    const pixelRatio = this.renderer.getPixelRatio();
    resizePostProcessing(this.composer, width, height, pixelRatio);
    this._labelManager.resize(width, height);
  };

  /** Full cleanup of all GPU resources */
  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);

    this._satelliteRenderer.dispose();
    this._orbitRenderer.dispose();
    this._labelManager.dispose(this.scene);
    this._coverageRenderer.dispose();
    this._networkRenderer.dispose();

    // Dispose starfield
    this.starfield.geometry.dispose();
    (this.starfield.material as THREE.Material).dispose();

    // Dispose earth group
    this.earthGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    this.controls.dispose();
    this.renderer.dispose();

    // Remove canvas from DOM
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }

  // --- Private helpers ---

  private getSize(): { width: number; height: number } {
    return {
      width: this.container.clientWidth || window.innerWidth,
      height: this.container.clientHeight || window.innerHeight,
    };
  }
}
