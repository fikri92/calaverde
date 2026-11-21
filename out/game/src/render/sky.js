// The sky: a gradient dome with a warm sun, soft procedural clouds and haze that meets the
// fog. One large inverted sphere, one shader, no textures and no image files.

import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform vec3 uSunDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunColor;
  uniform float uTime;
  uniform float uCloud;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;
    float up = smoothstep(-0.06, 0.55, h);
    vec3 col = mix(uHorizon, uZenith, pow(up, 0.85));
    col = mix(col, uGround, smoothstep(0.02, -0.18, h));

    // Sun disc and wide bloom.
    float sunDot = max(dot(dir, uSunDir), 0.0);
    float disc = smoothstep(0.9993, 0.99965, sunDot);
    float glow = pow(sunDot, 18.0) * 0.55 + pow(sunDot, 120.0) * 0.9;
    col += uSunColor * (disc * 5.0 + glow);

    // Warm haze thickening toward the horizon opposite the sun.
    float haze = pow(1.0 - clamp(h, 0.0, 1.0), 5.0);
    col = mix(col, uHorizon * 1.06, haze * 0.65);

    // Clouds: projected onto a plane above the camera, drifting slowly.
    if (h > 0.01) {
      vec2 uv = dir.xz / (h + 0.16) * 1.25;
      uv += vec2(uTime * 0.004, uTime * 0.0016);
      float cloud = fbm(uv * 1.4 + 4.0);
      cloud = smoothstep(0.52, 0.78, cloud) * smoothstep(0.0, 0.22, h);
      float shade = fbm(uv * 2.6 + 9.0);
      vec3 cloudCol = mix(vec3(0.98, 0.94, 0.90), vec3(0.80, 0.83, 0.88), shade * 0.7);
      cloudCol += uSunColor * pow(sunDot, 6.0) * 0.35;
      col = mix(col, cloudCol, cloud * uCloud);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export const PALETTES = {
  afternoon: {
    zenith: 0x2b6ec0,
    horizon: 0xf6d0a4,
    ground: 0xc0a888,
    sun: 0xfff0cc,
    sunDir: [0.42, 0.62, -0.66],
    fog: 0xe4cfb4,
    ambient: 0x9db4cc,
    light: 0xfff1d6,
    lightIntensity: 3.1,
  },
  golden: {
    zenith: 0x3a6ea8,
    horizon: 0xffb87a,
    ground: 0xa8886a,
    sun: 0xffd08a,
    sunDir: [0.72, 0.14, -0.68],
    fog: 0xe9b98d,
    ambient: 0x7d90ad,
    light: 0xffcb8a,
    lightIntensity: 2.4,
  },
};

export function createSky(scene, paletteName = 'afternoon') {
  const palette = PALETTES[paletteName] ?? PALETTES.afternoon;
  const sunDir = new THREE.Vector3(...palette.sunDir).normalize();
  const uniforms = {
    uSunDir: { value: sunDir },
    uZenith: { value: new THREE.Color(palette.zenith) },
    uHorizon: { value: new THREE.Color(palette.horizon) },
    uGround: { value: new THREE.Color(palette.ground) },
    uSunColor: { value: new THREE.Color(palette.sun) },
    uTime: { value: 0 },
    uCloud: { value: 0.85 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1400, 40, 24), material);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  scene.fog = new THREE.FogExp2(palette.fog, 0.0016);

  const hemi = new THREE.HemisphereLight(palette.ambient, 0x6d5a44, 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(palette.light, palette.lightIntensity);
  sun.position.copy(sunDir).multiplyScalar(220);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 520;
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.06;
  // The orthographic frustum above only takes effect once the projection matrix is rebuilt;
  // without this the shadow camera keeps its default 10 m box and nothing casts a shadow.
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  // A soft fill from the sea to keep shaded facades from going black.
  const fill = new THREE.DirectionalLight(0x9fc6d8, 0.35);
  fill.position.set(-80, 60, 140);
  scene.add(fill);

  return {
    dome,
    sun,
    palette,
    sunDir,
    update(dt, focus) {
      uniforms.uTime.value += dt;
      dome.position.set(focus.x, 0, focus.z);
      sun.target.position.set(focus.x, 0, focus.z);
      sun.position.set(focus.x + sunDir.x * 220, sunDir.y * 220, focus.z + sunDir.z * 220);
    },
  };
}
