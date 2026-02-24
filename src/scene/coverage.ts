/**
 * Satellite Coverage Footprint — translucent cone beams from satellites to Earth surface
 *
 * Shows the ground coverage area of each satellite as a soft cone/disc
 * projected onto the Earth's surface. Only shown for the selected satellite.
 */

import * as THREE from 'three';

const EARTH_RADIUS = 1.0;

const CONSTELLATION_COLORS: Record<string, THREE.Color> = {
  'GPS (USA)': new THREE.Color(0x00ff88),
  'GLONASS (Russia)': new THREE.Color(0xff8800),
  'Galileo (EU)': new THREE.Color(0xaa66ff),
  'BeiDou (China)': new THREE.Color(0xffdd00),
  'Unknown': new THREE.Color(0x00d4ff),
};

export class CoverageRenderer {
  private scene: THREE.Scene;
  private cone: THREE.Mesh | null = null;
  private footprint: THREE.Mesh | null = null;
  private beam: THREE.Line | null = null;
  private visible = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Show coverage for a satellite at given position */
  show(satPosition: THREE.Vector3, constellation?: string): void {
    this.hide();

    const color = CONSTELLATION_COLORS[constellation || 'Unknown'] || CONSTELLATION_COLORS['Unknown'];
    const satDist = satPosition.length();
    const dir = satPosition.clone().normalize();

    // Coverage half-angle (approx 21° for GPS at ~20,200km)
    const halfAngle = Math.acos(EARTH_RADIUS / satDist);
    const footprintRadius = Math.sin(halfAngle) * EARTH_RADIUS * 0.8;

    // Footprint disc on Earth surface
    const discGeo = new THREE.CircleGeometry(footprintRadius, 32);
    const discMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float alpha = (1.0 - smoothstep(0.3, 1.0, d)) * 0.15;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    this.footprint = new THREE.Mesh(discGeo, discMat);
    // Position on Earth surface, facing outward
    const surfacePoint = dir.clone().multiplyScalar(EARTH_RADIUS * 1.005);
    this.footprint.position.copy(surfacePoint);
    this.footprint.lookAt(dir.clone().multiplyScalar(2));
    this.footprint.name = 'coverage-footprint';
    this.scene.add(this.footprint);

    // Beam line from satellite to surface
    const beamGeo = new THREE.BufferGeometry().setFromPoints([
      satPosition.clone(),
      surfacePoint,
    ]);
    const beamMat = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.beam = new THREE.Line(beamGeo, beamMat);
    this.beam.name = 'coverage-beam';
    this.scene.add(this.beam);

    this.visible = true;
  }

  hide(): void {
    if (this.footprint) {
      this.footprint.geometry.dispose();
      (this.footprint.material as THREE.Material).dispose();
      this.scene.remove(this.footprint);
      this.footprint = null;
    }
    if (this.beam) {
      this.beam.geometry.dispose();
      (this.beam.material as THREE.Material).dispose();
      this.scene.remove(this.beam);
      this.beam = null;
    }
    if (this.cone) {
      this.cone.geometry.dispose();
      (this.cone.material as THREE.Material).dispose();
      this.scene.remove(this.cone);
      this.cone = null;
    }
    this.visible = false;
  }

  isVisible(): boolean { return this.visible; }

  dispose(): void { this.hide(); }
}
