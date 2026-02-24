/**
 * Space Background — enhanced starfield + nebula + milky way band
 *
 * Multi-layer depth: dense starfield, faint nebula clouds, and a
 * subtle milky way band for cosmic depth perception.
 */

import * as THREE from 'three';

const STAR_COUNT = 6000;
const STAR_SPHERE_RADIUS = 200;

/** Create a procedural nebula texture on canvas */
function createNebulaTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Dark base
  ctx.fillStyle = '#000005';
  ctx.fillRect(0, 0, size, size);

  // Nebula clouds — soft radial gradients with color
  const clouds = [
    { x: 0.3, y: 0.4, r: 0.35, color: 'rgba(20, 40, 100, 0.06)' },
    { x: 0.7, y: 0.3, r: 0.25, color: 'rgba(60, 20, 80, 0.05)' },
    { x: 0.5, y: 0.7, r: 0.3, color: 'rgba(10, 50, 80, 0.04)' },
    { x: 0.2, y: 0.6, r: 0.2, color: 'rgba(40, 10, 60, 0.04)' },
    { x: 0.8, y: 0.6, r: 0.28, color: 'rgba(15, 30, 70, 0.05)' },
  ];

  for (const c of clouds) {
    const grad = ctx.createRadialGradient(
      c.x * size, c.y * size, 0,
      c.x * size, c.y * size, c.r * size,
    );
    grad.addColorStop(0, c.color);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  // Milky way band — horizontal bright strip
  const bandGrad = ctx.createLinearGradient(0, size * 0.35, 0, size * 0.65);
  bandGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  bandGrad.addColorStop(0.3, 'rgba(20, 25, 50, 0.08)');
  bandGrad.addColorStop(0.5, 'rgba(30, 35, 70, 0.1)');
  bandGrad.addColorStop(0.7, 'rgba(20, 25, 50, 0.08)');
  bandGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bandGrad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

export function createBackground(scene: THREE.Scene): THREE.Points {
  // --- Nebula skybox sphere ---
  const nebulaGeo = new THREE.SphereGeometry(190, 32, 32);
  const nebulaMat = new THREE.MeshBasicMaterial({
    map: createNebulaTexture(),
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const nebulaSphere = new THREE.Mesh(nebulaGeo, nebulaMat);
  nebulaSphere.name = 'nebula';
  scene.add(nebulaSphere);

  // --- Starfield ---
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);

  const starColors = [
    new THREE.Color(1.0, 1.0, 1.0),
    new THREE.Color(0.8, 0.9, 1.0),
    new THREE.Color(1.0, 1.0, 0.85),
    new THREE.Color(0.7, 0.85, 1.0),
    new THREE.Color(0.9, 0.8, 1.0), // faint purple
  ];

  for (let i = 0; i < STAR_COUNT; i++) {
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

    // More variation in star sizes, some bright ones
    sizes[i] = Math.random() < 0.05 ? 1.0 + Math.random() * 0.8 : 0.2 + Math.random() * 0.6;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      varying vec3 vColor;
      varying float vSize;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vSize = size;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio * (150.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vColor;
      varying float vSize;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float alpha = 1.0 - smoothstep(0.15, 0.5, dist);
        // Subtle twinkle for bright stars
        float twinkle = vSize > 1.0 ? 0.7 + 0.3 * sin(uTime * 3.0 + vSize * 10.0) : 1.0;
        gl_FragColor = vec4(vColor, alpha * 0.9 * twinkle);
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

export function updateBackground(stars: THREE.Points, delta: number): void {
  stars.rotation.y += delta * 0.005;
  stars.rotation.x += delta * 0.002;
  const mat = stars.material as THREE.ShaderMaterial;
  mat.uniforms.uTime.value += delta;
}
