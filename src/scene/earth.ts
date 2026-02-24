/**
 * Earth Globe — data-visualization style
 *
 * A unit sphere (radius 1.0) with a procedural "digital earth" shader:
 * dark blue oceans, subtle continent outlines via noise, and a lat/lon grid.
 * Wrapped in a Fresnel-based atmosphere glow for that network-graph aesthetic.
 */

import * as THREE from 'three';

const EARTH_RADIUS = 1.0;
const EARTH_SEGMENTS = 64;
const ATMOSPHERE_SCALE = 1.12;

/** Creates the full Earth group: globe + atmosphere + grid */
export function createEarth(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'earth';

  // --- Globe sphere with procedural shader ---
  const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, EARTH_SEGMENTS, EARTH_SEGMENTS);
  const earthMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uGridOpacity: { value: 0.3 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uGridOpacity;

      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;

      // Simple hash-based noise for continent shapes
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        // Convert UV to spherical for noise sampling
        vec2 sphereCoord = vUv * vec2(4.0, 2.0);

        // Continent mask via FBM noise
        float continentNoise = fbm(sphereCoord * 3.0 + vec2(1.5, 0.8));
        float landMask = smoothstep(0.45, 0.55, continentNoise);

        // Ocean: deep dark blue; Land: dark teal/green
        vec3 oceanColor = vec3(0.02, 0.04, 0.12);
        vec3 landColor = vec3(0.03, 0.10, 0.08);
        vec3 baseColor = mix(oceanColor, landColor, landMask);

        // Subtle coastline glow
        float coastline = 1.0 - smoothstep(0.0, 0.08, abs(continentNoise - 0.5));
        baseColor += vec3(0.0, 0.3, 0.4) * coastline * 0.3;

        // Lat/lon grid lines
        float lat = vUv.y * 3.14159;
        float lon = vUv.x * 6.28318;

        float latLines = 1.0 - smoothstep(0.0, 0.015, abs(fract(vUv.y * 18.0) - 0.5) - 0.48);
        float lonLines = 1.0 - smoothstep(0.0, 0.015, abs(fract(vUv.x * 36.0) - 0.5) - 0.48);
        float grid = max(latLines, lonLines);

        vec3 gridColor = vec3(0.0, 0.5, 0.7);
        baseColor = mix(baseColor, gridColor, grid * uGridOpacity);

        // Fresnel rim for subtle edge highlight
        vec3 viewDir = normalize(cameraPosition - vPosition);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);
        baseColor += vec3(0.0, 0.3, 0.5) * fresnel * 0.4;

        gl_FragColor = vec4(baseColor, 1.0);
      }
    `,
  });

  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthMesh.name = 'earth-globe';
  group.add(earthMesh);

  // --- Atmosphere glow (Fresnel shell) ---
  const atmosGeo = new THREE.SphereGeometry(EARTH_RADIUS * ATMOSPHERE_SCALE, 64, 64);
  const atmosMat = new THREE.ShaderMaterial({
    uniforms: {
      uGlowColor: { value: new THREE.Color(0x00d4ff) },
      uIntensity: { value: 0.6 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uGlowColor;
      uniform float uIntensity;

      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.5);
        float alpha = fresnel * uIntensity;
        gl_FragColor = vec4(uGlowColor, alpha);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
  atmosMesh.name = 'atmosphere';
  group.add(atmosMesh);

  return group;
}

/** Call each frame to rotate Earth and update time uniform */
export function updateEarth(
  earthGroup: THREE.Group,
  delta: number,
  rotationSpeed = 0.03,
): void {
  earthGroup.rotation.y += delta * rotationSpeed;

  // Update time uniform on the globe shader
  const globe = earthGroup.getObjectByName('earth-globe') as THREE.Mesh | undefined;
  if (globe) {
    const mat = globe.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value += delta;
  }
}

/** Toggle grid line visibility */
export function setGridVisible(earthGroup: THREE.Group, visible: boolean): void {
  const globe = earthGroup.getObjectByName('earth-globe') as THREE.Mesh | undefined;
  if (globe) {
    const mat = globe.material as THREE.ShaderMaterial;
    mat.uniforms.uGridOpacity.value = visible ? 0.3 : 0.0;
  }
}
