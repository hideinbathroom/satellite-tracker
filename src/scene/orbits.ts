/**
 * Orbital Path Rendering — gradient trail lines
 *
 * Draws orbital paths as lines with a custom shader that fades opacity
 * along the path length, giving a comet-trail effect. Uses BufferGeometry
 * with per-vertex alpha for GPU-efficient gradient rendering.
 */

import * as THREE from 'three';

interface OrbitEntry {
  line: THREE.Line;
  id: string;
}

export class OrbitRenderer {
  private scene: THREE.Scene;
  private orbits: Map<string, OrbitEntry> = new Map();
  private visible = true;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Draw or update an orbital path */
  drawOrbit(id: string, points: THREE.Vector3[]): void {
    // Remove existing orbit with this ID
    this.removeOrbit(id);

    if (points.length < 2) return;

    const count = points.length;
    const positions = new Float32Array(count * 3);
    const alphas = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = points[i].z;

      // Gradient: full opacity at start, fading toward end
      alphas[i] = 1.0 - (i / (count - 1)) * 0.7;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x00d4ff) },
        uOpacity: { value: 0.4 },
      },
      vertexShader: /* glsl */ `
        attribute float alpha;
        varying float vAlpha;

        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;

        void main() {
          gl_FragColor = vec4(uColor, vAlpha * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const line = new THREE.Line(geometry, material);
    line.name = `orbit-${id}`;
    line.visible = this.visible;
    line.frustumCulled = false;

    this.scene.add(line);
    this.orbits.set(id, { line, id });
  }

  /** Remove a specific orbit path */
  removeOrbit(id: string): void {
    const entry = this.orbits.get(id);
    if (entry) {
      entry.line.geometry.dispose();
      (entry.line.material as THREE.Material).dispose();
      this.scene.remove(entry.line);
      this.orbits.delete(id);
    }
  }

  /** Remove all orbit paths */
  clearAll(): void {
    // Collect IDs first to avoid mutating the map during iteration
    const ids = Array.from(this.orbits.keys());
    for (const id of ids) {
      this.removeOrbit(id);
    }
  }

  /** Toggle visibility of all orbits */
  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const [, entry] of this.orbits) {
      entry.line.visible = visible;
    }
  }

  /** Check if orbits are currently visible */
  isVisible(): boolean {
    return this.visible;
  }

  /** Clean up all GPU resources */
  dispose(): void {
    this.clearAll();
  }
}
