/**
 * Inter-Satellite Link Network — glowing connection lines between nearby satellites
 *
 * Draws faint, pulsing lines between satellites in the same constellation
 * that are within a certain angular distance, creating a network mesh effect.
 */

import * as THREE from 'three';

const MAX_CONNECTIONS = 80;
const MAX_DISTANCE = 4.0; // scene units
const SAME_CONSTELLATION_ONLY = true;

const CONSTELLATION_COLORS: Record<string, THREE.Color> = {
  'GPS (USA)': new THREE.Color(0x00ff88),
  'GLONASS (Russia)': new THREE.Color(0xff8800),
  'Galileo (EU)': new THREE.Color(0xaa66ff),
  'BeiDou (China)': new THREE.Color(0xffdd00),
  'Unknown': new THREE.Color(0x00d4ff),
};

interface SatNode {
  id: string;
  pos: THREE.Vector3;
  constellation: string;
}

export class NetworkRenderer {
  private scene: THREE.Scene;
  private lineMesh: THREE.LineSegments | null = null;
  private visible = true;
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  updateNetwork(satellites: SatNode[]): void {
    this.dispose();
    if (satellites.length < 2) return;

    const pairs: { a: SatNode; b: SatNode; dist: number }[] = [];

    for (let i = 0; i < satellites.length; i++) {
      for (let j = i + 1; j < satellites.length; j++) {
        const a = satellites[i], b = satellites[j];
        if (SAME_CONSTELLATION_ONLY && a.constellation !== b.constellation) continue;
        const dist = a.pos.distanceTo(b.pos);
        if (dist < MAX_DISTANCE) {
          pairs.push({ a, b, dist });
        }
      }
    }

    // Sort by distance, take closest
    pairs.sort((x, y) => x.dist - y.dist);
    const selected = pairs.slice(0, MAX_CONNECTIONS);
    if (selected.length === 0) return;

    const positions = new Float32Array(selected.length * 6);
    const colors = new Float32Array(selected.length * 6);
    const alphas = new Float32Array(selected.length * 2);

    for (let i = 0; i < selected.length; i++) {
      const { a, b, dist } = selected[i];
      const idx = i * 6;
      positions[idx] = a.pos.x; positions[idx + 1] = a.pos.y; positions[idx + 2] = a.pos.z;
      positions[idx + 3] = b.pos.x; positions[idx + 4] = b.pos.y; positions[idx + 5] = b.pos.z;

      const color = CONSTELLATION_COLORS[a.constellation] || CONSTELLATION_COLORS['Unknown'];
      colors[idx] = color.r; colors[idx + 1] = color.g; colors[idx + 2] = color.b;
      colors[idx + 3] = color.r; colors[idx + 4] = color.g; colors[idx + 5] = color.b;

      const alpha = 1.0 - (dist / MAX_DISTANCE);
      alphas[i * 2] = alpha;
      alphas[i * 2 + 1] = alpha;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float alpha;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = alpha;
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float pulse = 0.5 + 0.5 * sin(uTime * 2.0 + vAlpha * 6.28);
          float a = vAlpha * 0.12 * (0.7 + pulse * 0.3);
          gl_FragColor = vec4(vColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.lineMesh = new THREE.LineSegments(geo, mat);
    this.lineMesh.name = 'satellite-network';
    this.lineMesh.visible = this.visible;
    this.lineMesh.frustumCulled = false;
    this.scene.add(this.lineMesh);
  }

  update(delta: number): void {
    this.time += delta;
    if (this.lineMesh) {
      (this.lineMesh.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;
    }
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (this.lineMesh) this.lineMesh.visible = v;
  }

  dispose(): void {
    if (this.lineMesh) {
      this.lineMesh.geometry.dispose();
      (this.lineMesh.material as THREE.Material).dispose();
      this.scene.remove(this.lineMesh);
      this.lineMesh = null;
    }
  }
}
