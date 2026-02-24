/**
 * Satellite Visualization — constellation-colored instanced nodes
 *
 * Uses InstancedMesh for efficient rendering of 31+ satellites.
 * Each satellite is colored by constellation (GPS=green, GLONASS=orange,
 * Galileo=purple, BeiDou=yellow). Health affects size and pulse.
 * Hover tooltips and selection ring effects included.
 */

import * as THREE from 'three';

export interface SatellitePositionData {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  constellation?: string;
  health?: 'healthy' | 'degraded' | 'offline';
}

const MAX_SATELLITES = 64;
const SAT_RADIUS = 0.04;

// Constellation color palette
const CONSTELLATION_COLORS: Record<string, THREE.Color> = {
  'GPS (USA)': new THREE.Color(0x00ff88),       // Green
  'GLONASS (Russia)': new THREE.Color(0xff8800), // Orange
  'Galileo (EU)': new THREE.Color(0xaa66ff),     // Purple
  'BeiDou (China)': new THREE.Color(0xffdd00),   // Yellow
  'Unknown': new THREE.Color(0x00d4ff),          // Cyan fallback
};

const HIGHLIGHT_COLOR = new THREE.Color(0xff006e);
const LABEL_OFFSET_Y = 0.08;

export class SatelliteRenderer {
  private scene: THREE.Scene;
  private instancedMesh: THREE.InstancedMesh;
  private glowSprites: THREE.Sprite[] = [];
  private labelSprites: Map<number, THREE.Sprite> = new Map();
  private satelliteMap: Map<string, number> = new Map();
  private positionData: SatellitePositionData[] = [];
  private highlightedId: string | null = null;
  private hoveredId: string | null = null;
  private labelsVisible = false;
  private pulseTime = 0;

  // Selection ring
  private selectionRing: THREE.Mesh | null = null;
  private selectionRingTarget: THREE.Vector3 | null = null;

  // Hover tooltip
  private tooltipEl: HTMLDivElement | null = null;

  // Reusable objects
  private _matrix = new THREE.Matrix4();
  private _position = new THREE.Vector3();
  private _quaternion = new THREE.Quaternion();
  private _scale = new THREE.Vector3(1, 1, 1);
  private _color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const geo = new THREE.IcosahedronGeometry(SAT_RADIUS, 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
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

    for (let i = 0; i < MAX_SATELLITES; i++) {
      this.instancedMesh.setColorAt(i, new THREE.Color(0x00d4ff));
    }
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    scene.add(this.instancedMesh);
    this.createSelectionRing();
    this.createTooltip();
  }

  private createSelectionRing(): void {
    const ringGeo = new THREE.RingGeometry(0.06, 0.08, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: HIGHLIGHT_COLOR,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);
  }

  private createTooltip(): void {
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'satellite-tooltip';
    this.tooltipEl.style.display = 'none';
    document.body.appendChild(this.tooltipEl);
  }

  /** Get color for a constellation */
  private getConstellationColor(constellation?: string): THREE.Color {
    if (!constellation) return CONSTELLATION_COLORS['Unknown'];
    return CONSTELLATION_COLORS[constellation] || CONSTELLATION_COLORS['Unknown'];
  }

  /** Get scale based on health */
  private getHealthScale(health?: string): number {
    switch (health) {
      case 'degraded': return 0.8;
      case 'offline': return 0.5;
      default: return 1.0;
    }
  }

  /** Get opacity based on health */
  private getHealthOpacity(health?: string): number {
    switch (health) {
      case 'degraded': return 0.7;
      case 'offline': return 0.3;
      default: return 1.0;
    }
  }

  updateSatellites(positions: SatellitePositionData[]): void {
    this.positionData = positions;
    const count = Math.min(positions.length, MAX_SATELLITES);
    this.instancedMesh.count = count;

    this.satelliteMap.clear();
    for (let i = 0; i < count; i++) {
      this.satelliteMap.set(positions[i].id, i);
    }

    for (let i = 0; i < count; i++) {
      const sat = positions[i];
      this._position.set(sat.x, sat.y, sat.z);

      const isHighlighted = sat.id === this.highlightedId;
      const isHovered = sat.id === this.hoveredId;
      const healthScale = this.getHealthScale(sat.health);
      let scale = healthScale;
      if (isHighlighted) scale = 2.0;
      else if (isHovered) scale = 1.5;
      this._scale.setScalar(scale);

      this._matrix.compose(this._position, this._quaternion, this._scale);
      this.instancedMesh.setMatrixAt(i, this._matrix);

      // Color by constellation, highlight overrides
      if (isHighlighted) {
        this._color.copy(HIGHLIGHT_COLOR);
      } else {
        this._color.copy(this.getConstellationColor(sat.constellation));
        if (sat.health === 'offline') {
          this._color.multiplyScalar(0.3);
        } else if (sat.health === 'degraded') {
          this._color.multiplyScalar(0.7);
        }
      }
      this.instancedMesh.setColorAt(i, this._color);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    this.updateGlowSprites(count);
    this.updateSelectionRing();

    if (this.labelsVisible) {
      this.rebuildLabels();
    }
  }

  update(delta: number): void {
    this.pulseTime += delta;

    // Pulse emissive — healthy=slow, degraded=fast blink
    const mat = this.instancedMesh.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.6 + Math.sin(this.pulseTime * 2.0) * 0.3;

    for (let i = 0; i < this.positionData.length && i < this.glowSprites.length; i++) {
      const sat = this.positionData[i];
      const sprite = this.glowSprites[i];
      sprite.position.set(sat.x, sat.y, sat.z);

      const isHighlighted = sat.id === this.highlightedId;
      const isHovered = sat.id === this.hoveredId;
      let baseScale = 0.16;
      if (isHighlighted) baseScale = 0.32;
      else if (isHovered) baseScale = 0.24;

      // Health-based pulse
      let pulseSpeed = 2.5;
      let pulseAmp = 0.15;
      if (sat.health === 'degraded') { pulseSpeed = 6.0; pulseAmp = 0.3; }
      if (sat.health === 'offline') { pulseSpeed = 1.0; pulseAmp = 0.05; baseScale = 0.08; }

      const pulse = 1.0 + Math.sin(this.pulseTime * pulseSpeed + i * 0.5) * pulseAmp;
      sprite.scale.setScalar(baseScale * pulse);

      // Update glow color to match constellation
      const color = this.getConstellationColor(sat.constellation);
      (sprite.material as THREE.SpriteMaterial).color.copy(
        isHighlighted ? HIGHLIGHT_COLOR : color
      );
    }

    // Animate selection ring
    if (this.selectionRing && this.selectionRing.visible && this.selectionRingTarget) {
      this.selectionRing.position.lerp(this.selectionRingTarget, 0.1);
      this.selectionRing.rotation.z += delta * 1.5;
      const ringScale = 1.0 + Math.sin(this.pulseTime * 3.0) * 0.15;
      this.selectionRing.scale.setScalar(ringScale);
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

  /** Show tooltip for hovered satellite */
  showTooltip(id: string, screenX: number, screenY: number): void {
    this.hoveredId = id;
    if (!this.tooltipEl) return;

    const sat = this.positionData.find(s => s.id === id);
    if (!sat) return;

    const healthDot = sat.health === 'healthy' ? '🟢' :
                      sat.health === 'degraded' ? '🟡' : '🔴';

    this.tooltipEl.innerHTML = `
      <div class="tooltip-name">${healthDot} ${sat.name}</div>
      <div class="tooltip-meta">${sat.constellation || 'Unknown'}</div>
    `;
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.style.left = `${screenX + 16}px`;
    this.tooltipEl.style.top = `${screenY - 10}px`;
  }

  hideTooltip(): void {
    this.hoveredId = null;
    if (this.tooltipEl) {
      this.tooltipEl.style.display = 'none';
    }
  }

  highlightSatellite(id: string): void {
    this.highlightedId = id;
    this.updateSelectionRing();
    this.applyHighlight();
  }

  clearHighlight(): void {
    this.highlightedId = null;
    if (this.selectionRing) this.selectionRing.visible = false;
    this.applyHighlight();
  }

  private updateSelectionRing(): void {
    if (!this.selectionRing || !this.highlightedId) return;
    const idx = this.satelliteMap.get(this.highlightedId);
    if (idx === undefined) return;
    const sat = this.positionData[idx];
    this.selectionRingTarget = new THREE.Vector3(sat.x, sat.y, sat.z);
    this.selectionRing.position.set(sat.x, sat.y, sat.z);
    this.selectionRing.visible = true;
    // Face camera (billboard)
    this.selectionRing.lookAt(0, 0, 0);
  }

  setLabelsVisible(visible: boolean): void {
    this.labelsVisible = visible;
    if (visible) this.rebuildLabels();
    else this.clearLabels();
  }

  getIdAtIndex(index: number): string | null {
    if (index >= 0 && index < this.positionData.length) {
      return this.positionData[index].id;
    }
    return null;
  }

  getMesh(): THREE.InstancedMesh {
    return this.instancedMesh;
  }

  getPosition(id: string): THREE.Vector3 | null {
    const idx = this.satelliteMap.get(id);
    if (idx === undefined) return null;
    const sat = this.positionData[idx];
    return new THREE.Vector3(sat.x, sat.y, sat.z);
  }

  dispose(): void {
    this.instancedMesh.geometry.dispose();
    (this.instancedMesh.material as THREE.Material).dispose();
    this.scene.remove(this.instancedMesh);

    for (const sprite of this.glowSprites) {
      sprite.material.dispose();
      this.scene.remove(sprite);
    }
    this.glowSprites = [];

    if (this.selectionRing) {
      this.selectionRing.geometry.dispose();
      (this.selectionRing.material as THREE.Material).dispose();
      this.scene.remove(this.selectionRing);
    }

    if (this.tooltipEl && this.tooltipEl.parentElement) {
      this.tooltipEl.parentElement.removeChild(this.tooltipEl);
    }

    this.clearLabels();
  }

  private applyHighlight(): void {
    const count = this.instancedMesh.count;
    for (let i = 0; i < count; i++) {
      const sat = this.positionData[i];
      const isHighlighted = sat.id === this.highlightedId;

      if (isHighlighted) {
        this._color.copy(HIGHLIGHT_COLOR);
      } else {
        this._color.copy(this.getConstellationColor(sat.constellation));
      }
      this.instancedMesh.setColorAt(i, this._color);

      this.instancedMesh.getMatrixAt(i, this._matrix);
      this._matrix.decompose(this._position, this._quaternion, this._scale);
      const healthScale = this.getHealthScale(sat.health);
      this._scale.setScalar(isHighlighted ? 2.0 : healthScale);
      this._matrix.compose(this._position, this._quaternion, this._scale);
      this.instancedMesh.setMatrixAt(i, this._matrix);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  private updateGlowSprites(count: number): void {
    while (this.glowSprites.length < count) {
      const sprite = this.createGlowSprite();
      this.glowSprites.push(sprite);
      this.scene.add(sprite);
    }
    for (let i = 0; i < this.glowSprites.length; i++) {
      this.glowSprites[i].visible = i < count;
    }
  }

  // Shared glow texture (created once, reused by all sprites)
  private static _sharedGlowTexture: THREE.CanvasTexture | null = null;

  private static getSharedGlowTexture(): THREE.CanvasTexture {
    if (!SatelliteRenderer._sharedGlowTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.3)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      SatelliteRenderer._sharedGlowTexture = new THREE.CanvasTexture(canvas);
    }
    return SatelliteRenderer._sharedGlowTexture;
  }

  private createGlowSprite(): THREE.Sprite {
    const material = new THREE.SpriteMaterial({
      map: SatelliteRenderer.getSharedGlowTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: new THREE.Color(0x00d4ff),
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(0.16);
    return sprite;
  }

  private rebuildLabels(): void {
    this.clearLabels();
    for (let i = 0; i < this.positionData.length; i++) {
      const sat = this.positionData[i];
      const color = this.getConstellationColor(sat.constellation);
      const sprite = this.createLabelSprite(sat.name, `#${color.getHexString()}`);
      sprite.position.set(sat.x, sat.y + LABEL_OFFSET_Y, sat.z);
      this.labelSprites.set(i, sprite);
      this.scene.add(sprite);
    }
  }

  private createLabelSprite(text: string, color: string = '#00d4ff'): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 256, 64);
    ctx.font = '24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
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
