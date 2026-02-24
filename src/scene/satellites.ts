/**
 * Satellite Visualization — instanced glowing nodes
 *
 * Uses InstancedMesh for efficient rendering of 31+ GPS satellites.
 * Each satellite is a small icosahedron with emissive cyan glow and
 * a pulsing animation. Selection highlights in magenta.
 */

import * as THREE from 'three';

export interface SatellitePositionData {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
}

const MAX_SATELLITES = 64;
const SAT_RADIUS = 0.04;
const DEFAULT_COLOR = new THREE.Color(0x00d4ff);
const HIGHLIGHT_COLOR = new THREE.Color(0xff006e);
const LABEL_OFFSET_Y = 0.08;

export class SatelliteRenderer {
  private scene: THREE.Scene;
  private instancedMesh: THREE.InstancedMesh;
  private glowSprites: THREE.Sprite[] = [];
  private labelSprites: Map<number, THREE.Sprite> = new Map();
  private satelliteMap: Map<string, number> = new Map(); // id -> instance index
  private positionData: SatellitePositionData[] = [];
  private highlightedId: string | null = null;
  private labelsVisible = false;
  private pulseTime = 0;

  // Reusable objects to avoid GC pressure
  private _matrix = new THREE.Matrix4();
  private _position = new THREE.Vector3();
  private _quaternion = new THREE.Quaternion();
  private _scale = new THREE.Vector3(1, 1, 1);
  private _color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Instanced satellite nodes
    const geo = new THREE.IcosahedronGeometry(SAT_RADIUS, 2);
    const mat = new THREE.MeshStandardMaterial({
      color: DEFAULT_COLOR,
      emissive: DEFAULT_COLOR,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.5,
      transparent: true,
      opacity: 0.95,
    });

    this.instancedMesh = new THREE.InstancedMesh(geo, mat, MAX_SATELLITES);
    this.instancedMesh.count = 0;
    this.instancedMesh.name = 'satellites';
    this.instancedMesh.frustumCulled = false;

    // Initialize all instance colors to default
    for (let i = 0; i < MAX_SATELLITES; i++) {
      this.instancedMesh.setColorAt(i, DEFAULT_COLOR);
    }
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    scene.add(this.instancedMesh);
  }

  /** Update all satellite positions. Rebuilds instance mapping if IDs change. */
  updateSatellites(positions: SatellitePositionData[]): void {
    this.positionData = positions;
    const count = Math.min(positions.length, MAX_SATELLITES);
    this.instancedMesh.count = count;

    // Rebuild ID -> index map
    this.satelliteMap.clear();
    for (let i = 0; i < count; i++) {
      this.satelliteMap.set(positions[i].id, i);
    }

    // Update instance transforms
    for (let i = 0; i < count; i++) {
      const sat = positions[i];
      this._position.set(sat.x, sat.y, sat.z);

      const isHighlighted = sat.id === this.highlightedId;
      const scale = isHighlighted ? 1.8 : 1.0;
      this._scale.setScalar(scale);

      this._matrix.compose(this._position, this._quaternion, this._scale);
      this.instancedMesh.setMatrixAt(i, this._matrix);

      // Color
      this._color.copy(isHighlighted ? HIGHLIGHT_COLOR : DEFAULT_COLOR);
      this.instancedMesh.setColorAt(i, this._color);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    // Update glow sprites
    this.updateGlowSprites(count);

    // Update labels if visible
    if (this.labelsVisible) {
      this.rebuildLabels();
    }
  }

  /** Per-frame pulse animation */
  update(delta: number): void {
    this.pulseTime += delta;

    // Animate emissive intensity via a subtle pulse
    const mat = this.instancedMesh.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.6 + Math.sin(this.pulseTime * 2.0) * 0.3;

    // Update glow sprite positions and scale
    for (let i = 0; i < this.positionData.length && i < this.glowSprites.length; i++) {
      const sat = this.positionData[i];
      const sprite = this.glowSprites[i];
      sprite.position.set(sat.x, sat.y, sat.z);

      const isHighlighted = sat.id === this.highlightedId;
      const baseScale = isHighlighted ? 0.28 : 0.16;
      const pulse = 1.0 + Math.sin(this.pulseTime * 2.5 + i * 0.5) * 0.15;
      sprite.scale.setScalar(baseScale * pulse);
    }

    // Update label positions
    if (this.labelsVisible) {
      for (let i = 0; i < this.positionData.length; i++) {
        const label = this.labelSprites.get(i);
        if (label) {
          const sat = this.positionData[i];
          label.position.set(sat.x, sat.y + LABEL_OFFSET_Y, sat.z);
        }
      }
    }
  }

  /** Highlight a satellite by ID (magenta glow, scale up) */
  highlightSatellite(id: string): void {
    this.highlightedId = id;
    // Colors and scale will be applied in next updateSatellites call
    // For immediate visual feedback, update now
    this.applyHighlight();
  }

  /** Clear all highlights */
  clearHighlight(): void {
    this.highlightedId = null;
    this.applyHighlight();
  }

  /** Toggle satellite name labels */
  setLabelsVisible(visible: boolean): void {
    this.labelsVisible = visible;
    if (visible) {
      this.rebuildLabels();
    } else {
      this.clearLabels();
    }
  }

  /** Get satellite ID at a given instance index (for raycasting) */
  getIdAtIndex(index: number): string | null {
    if (index >= 0 && index < this.positionData.length) {
      return this.positionData[index].id;
    }
    return null;
  }

  /** Get the InstancedMesh for raycasting */
  getMesh(): THREE.InstancedMesh {
    return this.instancedMesh;
  }

  /** Get position of a satellite by ID */
  getPosition(id: string): THREE.Vector3 | null {
    const idx = this.satelliteMap.get(id);
    if (idx === undefined) return null;
    const sat = this.positionData[idx];
    return new THREE.Vector3(sat.x, sat.y, sat.z);
  }

  /** Clean up all GPU resources */
  dispose(): void {
    this.instancedMesh.geometry.dispose();
    (this.instancedMesh.material as THREE.Material).dispose();
    this.scene.remove(this.instancedMesh);

    for (const sprite of this.glowSprites) {
      sprite.material.dispose();
      this.scene.remove(sprite);
    }
    this.glowSprites = [];

    this.clearLabels();
  }

  // --- Private helpers ---

  private applyHighlight(): void {
    const count = this.instancedMesh.count;
    for (let i = 0; i < count; i++) {
      const sat = this.positionData[i];
      const isHighlighted = sat.id === this.highlightedId;

      this._color.copy(isHighlighted ? HIGHLIGHT_COLOR : DEFAULT_COLOR);
      this.instancedMesh.setColorAt(i, this._color);

      // Update scale
      this.instancedMesh.getMatrixAt(i, this._matrix);
      this._matrix.decompose(this._position, this._quaternion, this._scale);
      this._scale.setScalar(isHighlighted ? 1.8 : 1.0);
      this._matrix.compose(this._position, this._quaternion, this._scale);
      this.instancedMesh.setMatrixAt(i, this._matrix);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  private updateGlowSprites(count: number): void {
    // Add sprites if needed
    while (this.glowSprites.length < count) {
      const sprite = this.createGlowSprite();
      this.glowSprites.push(sprite);
      this.scene.add(sprite);
    }
    // Hide excess sprites
    for (let i = 0; i < this.glowSprites.length; i++) {
      this.glowSprites[i].visible = i < count;
    }
  }

  private createGlowSprite(): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(0, 212, 255, 0.8)');
    gradient.addColorStop(0.3, 'rgba(0, 212, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 212, 255, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(0.16);
    return sprite;
  }

  private rebuildLabels(): void {
    this.clearLabels();

    for (let i = 0; i < this.positionData.length; i++) {
      const sat = this.positionData[i];
      const sprite = this.createLabelSprite(sat.name);
      sprite.position.set(sat.x, sat.y + LABEL_OFFSET_Y, sat.z);
      this.labelSprites.set(i, sprite);
      this.scene.add(sprite);
    }
  }

  private createLabelSprite(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 256, 64);
    ctx.font = '24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Glow effect
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#00d4ff';
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.4, 0.1, 1);
    return sprite;
  }

  private clearLabels(): void {
    for (const [, sprite] of this.labelSprites) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      this.scene.remove(sprite);
    }
    this.labelSprites.clear();
  }
}
