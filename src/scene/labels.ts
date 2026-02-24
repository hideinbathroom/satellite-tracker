/**
 * Satellite Labels — CSS2DRenderer-based always-visible label system
 *
 * Crisp HTML labels that follow satellites in 3D space.
 * - Constellation-colored background tags with leader lines
 * - Auto-hide overlapping labels based on screen distance
 * - Zoom-adaptive label density (LOD)
 */

import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export interface LabelData {
  id: string;
  name: string;
  constellation?: string;
  health?: 'healthy' | 'degraded' | 'offline';
}

const CONSTELLATION_LABEL_COLORS: Record<string, string> = {
  'GPS (USA)': '#00ff88',
  'GLONASS (Russia)': '#ff8800',
  'Galileo (EU)': '#aa66ff',
  'BeiDou (China)': '#ffdd00',
  'Unknown': '#00d4ff',
};

const LABEL_OFFSET_Y = 0.12;
const MIN_SCREEN_DISTANCE = 40;
const MAX_VISIBLE_LABELS = 24;

export class LabelManager {
  private css2dRenderer: CSS2DRenderer;
  private labels: Map<string, CSS2DObject> = new Map();
  private camera: THREE.PerspectiveCamera;
  private visible = true;
  private container: HTMLElement;

  constructor(container: HTMLElement, camera: THREE.PerspectiveCamera) {
    this.container = container;
    this.camera = camera;
    this.css2dRenderer = new CSS2DRenderer();
    this.css2dRenderer.setSize(container.clientWidth, container.clientHeight);
    this.css2dRenderer.domElement.style.position = 'absolute';
    this.css2dRenderer.domElement.style.top = '0';
    this.css2dRenderer.domElement.style.left = '0';
    this.css2dRenderer.domElement.style.pointerEvents = 'none';
    this.css2dRenderer.domElement.style.zIndex = '1';
    this.css2dRenderer.domElement.classList.add('css2d-layer');
    container.appendChild(this.css2dRenderer.domElement);
  }

  getRenderer(): CSS2DRenderer { return this.css2dRenderer; }

  updateLabels(scene: THREE.Scene, satellites: LabelData[], positions: Map<string, THREE.Vector3>): void {
    const currentIds = new Set(satellites.map(s => s.id));
    for (const [id, label] of this.labels) {
      if (!currentIds.has(id)) {
        scene.remove(label);
        this.labels.delete(id);
      }
    }
    for (const sat of satellites) {
      const pos = positions.get(sat.id);
      if (!pos) continue;
      let label = this.labels.get(sat.id);
      if (!label) {
        label = this.createLabel(sat);
        this.labels.set(sat.id, label);
        scene.add(label);
      }
      label.position.set(pos.x, pos.y + LABEL_OFFSET_Y, pos.z);
      label.visible = this.visible;
      label.element.className = `sat-label sat-label--${sat.health || 'healthy'}`;
    }
  }

  private createLabel(sat: LabelData): CSS2DObject {
    const color = CONSTELLATION_LABEL_COLORS[sat.constellation || 'Unknown'] || '#00d4ff';
    const el = document.createElement('div');
    el.className = `sat-label sat-label--${sat.health || 'healthy'}`;
    el.innerHTML = `<span class="sat-label-line" style="--label-color:${color}"></span><span class="sat-label-tag" style="--label-color:${color}"><span class="sat-label-dot" style="background:${color}"></span><span class="sat-label-name">${this.shortName(sat.name)}</span></span>`;
    const obj = new CSS2DObject(el);
    obj.name = `label-${sat.id}`;
    return obj;
  }

  resolveOverlaps(_scene: THREE.Scene): void {
    if (!this.visible) return;
    const screenPositions: { id: string; x: number; y: number; dist: number }[] = [];
    const halfW = this.container.clientWidth / 2;
    const halfH = this.container.clientHeight / 2;
    for (const [id, label] of this.labels) {
      if (!label.visible) continue;
      const wp = label.position.clone().project(this.camera);
      if (wp.z > 1) { label.element.style.opacity = '0'; continue; }
      screenPositions.push({ id, x: (wp.x * halfW) + halfW, y: -(wp.y * halfH) + halfH, dist: this.camera.position.distanceTo(label.position) });
    }
    screenPositions.sort((a, b) => a.dist - b.dist);
    const visible: { x: number; y: number }[] = [];
    let count = 0;
    for (const sp of screenPositions) {
      const label = this.labels.get(sp.id);
      if (!label) continue;
      let overlapping = false;
      for (const vp of visible) {
        const dx = sp.x - vp.x, dy = sp.y - vp.y;
        if (Math.sqrt(dx * dx + dy * dy) < MIN_SCREEN_DISTANCE) { overlapping = true; break; }
      }
      if (overlapping || count >= MAX_VISIBLE_LABELS) {
        label.element.style.opacity = '0';
      } else {
        label.element.style.opacity = '1';
        visible.push({ x: sp.x, y: sp.y });
        count++;
      }
    }
  }

  setVisible(v: boolean): void {
    this.visible = v;
    for (const [, label] of this.labels) label.visible = v;
  }

  isVisible(): boolean { return this.visible; }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.css2dRenderer.render(scene, camera);
  }

  resize(width: number, height: number): void {
    this.css2dRenderer.setSize(width, height);
  }

  dispose(scene: THREE.Scene): void {
    for (const [, label] of this.labels) scene.remove(label);
    this.labels.clear();
    if (this.css2dRenderer.domElement.parentElement) {
      this.css2dRenderer.domElement.parentElement.removeChild(this.css2dRenderer.domElement);
    }
  }

  private shortName(name: string): string {
    return name.replace(/\(PRN \d+\)/i, '').replace(/\s+/g, ' ').trim().substring(0, 16);
  }
}
