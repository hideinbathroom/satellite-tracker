/**
 * Space Background — starfield + dark gradient
 *
 * Creates a large sphere of randomized star points with subtle color variation
 * and a slow rotation for parallax depth. Background color set on the renderer
 * via a dark gradient feel (#0a0a1a).
 */

import * as THREE from 'three';

const STAR_COUNT = 4000;
const STAR_SPHERE_RADIUS = 200;

export function createBackground(scene: THREE.Scene): THREE.Points {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);

  // Palette: white, light blue, light yellow
  const starColors = [
    new THREE.Color(1.0, 1.0, 1.0),
    new THREE.Color(0.8, 0.9, 1.0),
    new THREE.Color(1.0, 1.0, 0.85),
    new THREE.Color(0.7, 0.85, 1.0),
  ];

  for (let i = 0; i < STAR_COUNT; i++) {
    // Uniform distribution on sphere surface
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = STAR_SPHERE_RADIUS * (0.9 + Math.random() * 0.1);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const color = starColors[Math.floor(Math.random() * starColors.length)];
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    sizes[i] = 0.3 + Math.random() * 0.7;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      varying vec3 vColor;

      uniform float uPixelRatio;

      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio * (150.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;

      void main() {
        // Soft circular point
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
        gl_FragColor = vec4(vColor, alpha * 0.9);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const stars = new THREE.Points(geometry, material);
  stars.name = 'starfield';
  stars.frustumCulled = false;
  scene.add(stars);

  return stars;
}

/** Call each frame for slow parallax rotation */
export function updateBackground(stars: THREE.Points, delta: number): void {
  stars.rotation.y += delta * 0.005;
  stars.rotation.x += delta * 0.002;
}
