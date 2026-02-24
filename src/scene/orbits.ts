/**
 * Orbital Path Rendering — constellation-colored gradient trails
 * with animated particle flow along the orbit path.
 */

import * as THREE from 'three';

const CONSTELLATION_ORBIT_COLORS: Record<string, THREE.Color> = {
  'GPS (USA)': new THREE.Color(0x00ff88),
  'GLONASS (Russia)': new THREE.Color(0xff8800),
  'Galileo (EU)': new THREE.Color(0xaa66ff),
  'BeiDou (China)': new THREE.Color(0xffdd00),
  'Unknown': new THREE.Color(0x00d4ff),
};

const PARTICLES_PER_ORBIT = 12;

interface OrbitEntry {
  line: THREE.Line;
  particles: THREE.Points;
  pathPoints: THREE.Vector3[];
  id: string;
}

export class OrbitRenderer {
  private scene: THREE.Scene;
  private orbits: Map<string, OrbitEntry> = new Map();
  private visible = true;
  private time = 0;

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

    // --- Orbit line with animated flow ---
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color },
        uOpacity: { value: 0.35 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float alpha;
        varying float vAlpha;
        varying float vIndex;
        void main() {
          vAlpha = alpha;
          vIndex = float(gl_VertexID) / ${count.toFixed(1)};
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        varying float vAlpha;
        varying float vIndex;
        void main() {
          // Animated pulse traveling along the orbit
          float pulse = sin((vIndex - uTime * 0.3) * 12.566) * 0.5 + 0.5;
          pulse = pow(pulse, 4.0) * 0.4;
          float finalAlpha = vAlpha * uOpacity + pulse;
          gl_FragColor = vec4(uColor, finalAlpha);
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

    // --- Particle trail along orbit ---
    const particlePositions = new Float32Array(PARTICLES_PER_ORBIT * 3);
    const particleSizes = new Float32Array(PARTICLES_PER_ORBIT);
    for (let i = 0; i < PARTICLES_PER_ORBIT; i++) {
      const t = i / PARTICLES_PER_ORBIT;
      const idx = Math.floor(t * (count - 1));
      particlePositions[i * 3] = points[idx].x;
      particlePositions[i * 3 + 1] = points[idx].y;
      particlePositions[i * 3 + 2] = points[idx].z;
      particleSizes[i] = 0.5 + Math.random() * 0.5;
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    pGeo.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));

    const pMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        varying vec3 vColor;
        uniform float uPixelRatio;
        uniform vec3 uColor;
        void main() {
          vColor = uColor;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uPixelRatio * (80.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float a = 1.0 - smoothstep(0.1, 0.5, d);
          gl_FragColor = vec4(vColor, a * 0.7);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(pGeo, pMat);
    particles.name = `orbit-particles-${id}`;
    particles.visible = this.visible;
    particles.frustumCulled = false;
    this.scene.add(particles);

    this.orbits.set(id, { line, particles, pathPoints: points, id });
  }

  /** Animate particles along orbit paths */
  update(delta: number): void {
    this.time += delta;
    for (const [, entry] of this.orbits) {
      // Update orbit line time uniform
      const lineMat = entry.line.material as THREE.ShaderMaterial;
      lineMat.uniforms.uTime.value = this.time;

      // Move particles along path
      const pts = entry.pathPoints;
      const count = pts.length;
      if (count < 2) continue;
      const posAttr = entry.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < PARTICLES_PER_ORBIT; i++) {
        const t = ((i / PARTICLES_PER_ORBIT) + this.time * 0.08) % 1.0;
        const idx = t * (count - 1);
        const lo = Math.floor(idx);
        const hi = Math.min(lo + 1, count - 1);
        const frac = idx - lo;
        posAttr.setXYZ(i,
          pts[lo].x + (pts[hi].x - pts[lo].x) * frac,
          pts[lo].y + (pts[hi].y - pts[lo].y) * frac,
          pts[lo].z + (pts[hi].z - pts[lo].z) * frac,
        );
      }
      posAttr.needsUpdate = true;
    }
  }

  removeOrbit(id: string): void {
    const entry = this.orbits.get(id);
    if (entry) {
      entry.line.geometry.dispose();
      (entry.line.material as THREE.Material).dispose();
      this.scene.remove(entry.line);
      entry.particles.geometry.dispose();
      (entry.particles.material as THREE.Material).dispose();
      this.scene.remove(entry.particles);
      this.orbits.delete(id);
    }
  }

  clearAll(): void {
    for (const id of Array.from(this.orbits.keys())) this.removeOrbit(id);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const [, entry] of this.orbits) {
      entry.line.visible = visible;
      entry.particles.visible = visible;
    }
  }

  isVisible(): boolean { return this.visible; }
  dispose(): void { this.clearAll(); }
}
