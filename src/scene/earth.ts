/**
 * Earth Globe — enhanced data-visualization style
 *
 * Multi-layer atmosphere (inner glow + outer haze + light scattering),
 * procedural cloud layer, and city lights on the night side.
 */

import * as THREE from 'three';

const EARTH_RADIUS = 1.0;
const EARTH_SEGMENTS = 64;

/** Creates the full Earth group: globe + clouds + 3-layer atmosphere */
export function createEarth(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'earth';

  // --- Globe sphere with procedural shader (enhanced with city lights) ---
  const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, EARTH_SEGMENTS, EARTH_SEGMENTS);
  const earthMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uGridOpacity: { value: 0.3 },
      uSunDirection: { value: new THREE.Vector3(1, 0.3, 0.5).normalize() },
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
      uniform vec3 uSunDirection;

      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;

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
        vec2 sphereCoord = vUv * vec2(4.0, 2.0);

        // Continent mask
        float continentNoise = fbm(sphereCoord * 3.0 + vec2(1.5, 0.8));
        float landMask = smoothstep(0.45, 0.55, continentNoise);

        // Day/night factor
        vec3 worldNormal = normalize(vPosition);
        float sunDot = dot(worldNormal, uSunDirection);
        float dayFactor = smoothstep(-0.15, 0.25, sunDot);

        // Day colors
        vec3 oceanDay = vec3(0.02, 0.05, 0.15);
        vec3 landDay = vec3(0.03, 0.12, 0.08);
        vec3 dayColor = mix(oceanDay, landDay, landMask);

        // Night colors (darker)
        vec3 oceanNight = vec3(0.005, 0.01, 0.04);
        vec3 landNight = vec3(0.008, 0.02, 0.015);
        vec3 nightColor = mix(oceanNight, landNight, landMask);

        vec3 baseColor = mix(nightColor, dayColor, dayFactor);

        // City lights on night side (land only)
        float cityNoise = fbm(sphereCoord * 12.0 + vec2(3.7, 1.2));
        float cityMask = smoothstep(0.52, 0.62, cityNoise) * landMask;
        float cityFlicker = 0.8 + 0.2 * sin(uTime * 1.5 + cityNoise * 20.0);
        vec3 cityColor = vec3(1.0, 0.85, 0.5) * cityMask * cityFlicker * (1.0 - dayFactor) * 0.6;
        baseColor += cityColor;

        // Coastline glow
        float coastline = 1.0 - smoothstep(0.0, 0.08, abs(continentNoise - 0.5));
        baseColor += vec3(0.0, 0.3, 0.4) * coastline * 0.3;

        // Grid lines
        float latLines = 1.0 - smoothstep(0.0, 0.015, abs(fract(vUv.y * 18.0) - 0.5) - 0.48);
        float lonLines = 1.0 - smoothstep(0.0, 0.015, abs(fract(vUv.x * 36.0) - 0.5) - 0.48);
        float grid = max(latLines, lonLines);
        vec3 gridColor = vec3(0.0, 0.5, 0.7);
        baseColor = mix(baseColor, gridColor, grid * uGridOpacity);

        // Fresnel rim
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

  // --- Cloud layer (semi-transparent rotating sphere) ---
  const cloudGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.015, 48, 48);
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPos;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPos;

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
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 uv = vUv * vec2(6.0, 3.0);
        float drift = uTime * 0.01;
        float cloud = fbm(uv + vec2(drift, 0.0));
        float cloudMask = smoothstep(0.42, 0.65, cloud);

        // Fresnel fade at edges
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.0);
        cloudMask *= (1.0 - fresnel * 0.6);

        vec3 cloudColor = vec3(0.7, 0.75, 0.85);
        float alpha = cloudMask * 0.18;

        gl_FragColor = vec4(cloudColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
  });

  const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
  cloudMesh.name = 'clouds';
  group.add(cloudMesh);

  // --- Atmosphere Layer 1: Inner glow (tight Fresnel, cyan) ---
  const innerAtmosGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.06, 48, 48);
  const innerAtmosMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x00d4ff) },
      uIntensity: { value: 0.7 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 4.0);
        gl_FragColor = vec4(uColor, fresnel * uIntensity);
      }
    `,
    transparent: true, side: THREE.BackSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const innerAtmos = new THREE.Mesh(innerAtmosGeo, innerAtmosMat);
  innerAtmos.name = 'atmosphere-inner';
  group.add(innerAtmos);

  // --- Atmosphere Layer 2: Outer haze (wider, softer, blue-purple) ---
  const outerAtmosGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.18, 48, 48);
  const outerAtmosMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x4466cc) },
      uIntensity: { value: 0.35 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.5);
        gl_FragColor = vec4(uColor, fresnel * uIntensity);
      }
    `,
    transparent: true, side: THREE.BackSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const outerAtmos = new THREE.Mesh(outerAtmosGeo, outerAtmosMat);
  outerAtmos.name = 'atmosphere-outer';
  group.add(outerAtmos);

  // --- Atmosphere Layer 3: Light scattering rim (sun-facing, warm tint) ---
  const scatterGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.12, 48, 48);
  const scatterMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(1, 0.3, 0.5).normalize() },
      uIntensity: { value: 0.4 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);
        // Stronger on sun-facing side
        vec3 worldNormal = normalize(vWorldPos);
        float sunFacing = max(dot(worldNormal, uSunDir), 0.0);
        sunFacing = pow(sunFacing, 1.5);
        vec3 warmColor = mix(vec3(0.1, 0.3, 0.8), vec3(0.4, 0.6, 1.0), sunFacing);
        float alpha = fresnel * sunFacing * uIntensity;
        gl_FragColor = vec4(warmColor, alpha);
      }
    `,
    transparent: true, side: THREE.BackSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const scatterMesh = new THREE.Mesh(scatterGeo, scatterMat);
  scatterMesh.name = 'atmosphere-scatter';
  group.add(scatterMesh);

  return group;
}

/** Call each frame to rotate Earth, clouds, and update uniforms */
export function updateEarth(
  earthGroup: THREE.Group,
  delta: number,
  rotationSpeed = 0.03,
): void {
  earthGroup.rotation.y += delta * rotationSpeed;

  const globe = earthGroup.getObjectByName('earth-globe') as THREE.Mesh | undefined;
  if (globe) {
    const mat = globe.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value += delta;
  }

  // Clouds rotate slightly faster than Earth for parallax
  const clouds = earthGroup.getObjectByName('clouds') as THREE.Mesh | undefined;
  if (clouds) {
    clouds.rotation.y += delta * 0.008;
    const mat = clouds.material as THREE.ShaderMaterial;
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

/** Toggle atmosphere visibility (all 3 layers + clouds) */
export function setAtmosphereVisible(earthGroup: THREE.Group, visible: boolean): void {
  const names = ['atmosphere-inner', 'atmosphere-outer', 'atmosphere-scatter', 'clouds'];
  for (const name of names) {
    const obj = earthGroup.getObjectByName(name);
    if (obj) obj.visible = visible;
  }
}
