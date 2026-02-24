/**
 * Orbital Path Rendering — constellation-colored gradient trails
 *
 * Draws orbital paths with colors matching their constellation.
 * Gradient fades along the path for a comet-trail effect.
 */

import * as THREE from 'three';

const CONSTELLATION_ORBIT_COLORS: Record<string, THREE.Color> = {
  'GPS (USA)': new THREE.Color(0x00ff88),
  'GLONASS (Russia)': new THREE.Color(0xff8800),
  'Galileo (EU)': new THREE.Color(0xaa66ff),
  'BeiDou (China)': new THREE.Color(0xffdd00),
  'Unknown': new THREE.Color(0x00d4ff),
};

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

  drawOrbit(id: string, points: THREE.Vector3[], constellation?: string): void {
    this.removeOrbit(id);
    if (points.length < 2) return;

    const count = points.length;
    const positions = new Float32Array(count * 3);
    const alphas = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = points[i].z;
      alphas[i] = 1.0 - (i / (count - 1)) * 0.7;
    }

    const color = constellation && CONSTELLATION_ORBIT_COLORS[constellation]
      ? CONSTELLATION_ORBIT_COLORS[constellation]
      : CONSTELLATION_ORBIT_COLORS['Unknown'];

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color },
        uOpacity: { value: 0.35 },
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

  removeOrbit(id: string): void {
    const entry = this.orbits.get(id);
    if (entry) {
      entry.line.geometry.dispose();
      (entry.line.material as THREE.Material).dispose();
      this.scene.remove(entry.line);
      this.orbits.delete(id);
    }
  }

  clearAll(): void {
    const ids = Array.from(this.orbits.keys());
    for (const id of ids) {
      this.removeOrbit(id);
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const [, entry] of this.orbits) {
      entry.line.visible = visible;
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.clearAll();
  }
}
