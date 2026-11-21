// The sea, sand and marina: a shader sea with animated swell and sun glints, a beach with a
// shoreline foam band, a boardwalk railing, and a marina of pontoons, moored sailboats and a
// lighthouse. Water is one large plane displaced in the vertex shader, not a simulation.

import * as THREE from 'three';
import { GeometryBuilder } from '../core/merge.js';
import { makeRng } from '../core/random.js';
import { sandTexture, waterNormalTexture } from '../render/textures.js';
import { addBoxCollider } from './colliders.js';

const SEA_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vec3 pos = position;
    // Three crossed swells: enough movement to read at speed, cheap enough to fill half the screen.
    float w1 = sin(pos.x * 0.055 + uTime * 0.9) * 0.20;
    float w2 = sin(pos.y * 0.083 - uTime * 1.25) * 0.15;
    float w3 = sin((pos.x - pos.y) * 0.19 + uTime * 2.1) * 0.05;
    pos.z += w1 + w2 + w3;
    float dx = cos(pos.x * 0.055 + uTime * 0.9) * 0.011 + cos((pos.x - pos.y) * 0.19 + uTime * 2.1) * 0.0095;
    float dy = cos(pos.y * 0.083 - uTime * 1.25) * 0.012 - cos((pos.x - pos.y) * 0.19 + uTime * 2.1) * 0.0095;
    vNormalW = normalize(vec3(-dx, -dy, 1.0));
    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SEA_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uShoreX;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform vec3 uSky;
  uniform sampler2D uNormals;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  void main() {
    vec2 flowA = vUv * 7.0 + vec2(uTime * 0.020, uTime * 0.013);
    vec2 flowB = vUv * 13.0 - vec2(uTime * 0.014, uTime * 0.024);
    vec3 n1 = texture2D(uNormals, flowA).xyz * 2.0 - 1.0;
    vec3 n2 = texture2D(uNormals, flowB).xyz * 2.0 - 1.0;
    vec3 nrm = normalize(vNormalW + vec3(n1.x + n2.x, n1.y + n2.y, 0.0) * 0.55);

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(viewDir, nrm), 0.0), 3.0);

    // Turquoise in the shallows by the sand, deep blue out to sea.
    float inland = vWorld.x - uShoreX;
    float shallow = smoothstep(190.0, 6.0, inland) * 0.42;
    vec3 water = mix(uDeep, uShallow, clamp(shallow + fres * 0.45, 0.0, 1.0));
    water = mix(water, uSky, fres * 0.5);

    // Sun glitter and a broad specular streak.
    vec3 halfV = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(nrm, halfV), 0.0), 220.0);
    float streak = pow(max(dot(nrm, halfV), 0.0), 16.0) * 0.14;
    water += uSun * (spec * 2.2 + streak);

    // Scalloped foam lines rolling toward the beach, thickest right at the sand.
    float foamPhase = inland * 0.16 - uTime * 1.1;
    float foam = smoothstep(0.55, 0.95, sin(foamPhase + n1.x * 3.2) * 0.5 + 0.5);
    float swash = smoothstep(34.0, 0.0, inland);
    foam = max(foam * smoothstep(150.0, 8.0, inland) * 0.55, swash * 0.92);
    water = mix(water, vec3(1.0, 0.985, 0.95), foam);

    gl_FragColor = vec4(water, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildWater(layout, scene, colliders) {
  const normalTex = waterNormalTexture();
  normalTex.wrapS = THREE.RepeatWrapping;
  normalTex.wrapT = THREE.RepeatWrapping;
  const uniforms = {
    uTime: { value: 0 },
    uShoreX: { value: layout.seaEdge },
    uShallow: { value: new THREE.Color(0x35c9bd) },
    uDeep: { value: new THREE.Color(0x0a4c78) },
    uSun: { value: new THREE.Color(0xfff0c8) },
    uSunDir: { value: new THREE.Vector3(0.46, 0.30, -0.83).normalize() },
    uSky: { value: new THREE.Color(0xa8d8e8) },
    uNormals: { value: normalTex },
  };
  const geo = new THREE.PlaneGeometry(2600, 2000, 200, 160);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG });
  const sea = new THREE.Mesh(geo, mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(layout.seaEdge + 1290, 0.06, (layout.minZ + layout.maxZ) / 2);
  sea.name = 'sea';
  scene.add(sea);

  // Beached sand, a wet strip at the waterline, and the boardwalk deck at the back of the sand.
  const sand = sandTexture();
  sand.repeat.set(1, 1);
  const sandMat = new THREE.MeshStandardMaterial({ map: sand, color: 0xf6d3a0, roughness: 1 });
  const sb = new GeometryBuilder({ uv: true });
  const bx0 = layout.beach.x0;
  const bx1 = layout.beach.x1;
  const bz0 = layout.beach.z0;
  const bz1 = layout.beach.z1;
  const bCz = (bz0 + bz1) / 2;
  const bDepth = bz1 - bz0;
  sb.slab((bx0 + bx1) / 2, 0.09, bCz, bx1 - bx0, bDepth, [1, 1, 1], 1 / 9);
  sb.slab(bx1 - 5, 0.085, bCz, 10, bDepth, [0.88, 0.82, 0.72], 1 / 9);
  sb.slab(bx0 + 4.5, 0.2, bCz, 9, bDepth, [0.7, 0.55, 0.39], 1 / 4.5);
  const beach = new THREE.Mesh(sb.build(), sandMat);
  beach.receiveShadow = true;
  beach.name = 'beach';
  scene.add(beach);

  // Boardwalk railing between the promenade and the sand.
  const railB = new GeometryBuilder({ uv: false, color: true });
  const boardX = bx0 + 9.1;
  for (let z = bz0 + 6; z < bz1 - 6; z += 3.4) {
    const m = layout.marina;
    if (z > m.z0 - 3 && z < m.z1 + 3) continue;
    railB.cylinder(boardX, 0.75, z, 0.07, 1.15, 5, [0.66, 0.6, 0.5], 'y');
  }
  railB.box(boardX, 1.3, bz0 + 30, 0.12, 0.12, 50, [0.66, 0.6, 0.5]);
  railB.box(boardX, 1.3, bz1 - 30, 0.12, 0.12, 50, [0.66, 0.6, 0.5]);
  const rail = new THREE.Mesh(railB.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  rail.castShadow = true;
  scene.add(rail);

  const marina = buildMarina(layout, scene, colliders);
  return {
    sea,
    beach,
    uniforms,
    marina,
    update(dt) {
      uniforms.uTime.value += dt;
    },
  };
}

// The harbour where the coastal road meets the water: a quay, finger pontoons, moored
// sailboats, a container crane and the lighthouse at the point.
function buildMarina(layout, scene, colliders) {
  const group = new THREE.Group();
  group.name = 'marina';
  const rng = makeRng(3117);
  const b = new GeometryBuilder({ uv: false, color: true });
  const m = layout.marina;
  const quayX = m.x0 + 10; // where the deck meets the water

  // Quay deck and seawall.
  b.box((m.x0 + quayX) / 2, 0.42, m.cz, quayX - m.x0, 0.9, 118, [0.74, 0.69, 0.6]);
  b.box(quayX, 0.2, m.cz, 1.6, 1.5, 118, [0.62, 0.57, 0.5]);
  addBoxCollider(colliders, quayX, m.cz, 1.8, 118, 1.5, 'quay');

  // Four finger pontoons reaching east into the sea, with mooring posts.
  for (let i = 0; i < 4; i++) {
    const z = m.cz - 21 + i * 14;
    b.box(quayX + 26, 0.3, z, 52, 0.42, 3.0, [0.58, 0.5, 0.42]);
    for (let x = quayX + 6; x < quayX + 52; x += 9) {
      b.cylinder(x, 0.6, z + 1.9, 0.2, 1.6, 6, [0.34, 0.29, 0.25], 'y');
      b.cylinder(x + 4.5, 0.6, z - 1.9, 0.2, 1.6, 6, [0.34, 0.29, 0.25], 'y');
    }
  }

  // Moored sailboats, bows to the pontoons.
  const hullCols = [
    [0.95, 0.95, 0.92],
    [0.85, 0.3, 0.26],
    [0.2, 0.5, 0.68],
    [0.95, 0.75, 0.3],
    [0.32, 0.55, 0.4],
  ];
  for (let i = 0; i < 9; i++) {
    const z = m.cz - 21 + (i % 4) * 14 + 5.1;
    const x = quayX + 14 + Math.floor(i / 4) * 22 + rng.range(-2.5, 2.5);
    const hull = hullCols[i % hullCols.length];
    // hull with a tapered bow
    b.box(x, 0.52, z, 7.2, 0.85, 2.5, hull);
    b.box(x + 3.9, 0.52, z, 1.6, 0.7, 1.7, hull);
    b.box(x - 1.4, 1.05, z, 3.0, 0.55, 1.9, [0.93, 0.92, 0.88]);
    b.cylinder(x + 0.6, 4.9, z, 0.075, 7.6, 5, [0.86, 0.85, 0.81], 'y');
    b.box(x + 2.4, 4.3, z, 3.6, 0.09, 0.1, [0.86, 0.85, 0.81]);
  }

  // Container crane on the quay.
  const craneX = m.x0 + 5;
  const craneZ = m.cz - 46;
  b.box(craneX, 0.9, craneZ, 5, 1.4, 5, [0.74, 0.7, 0.62]);
  b.box(craneX, 9, craneZ, 1.3, 17, 1.3, [0.93, 0.71, 0.24]);
  b.box(craneX + 8, 17.4, craneZ, 18, 0.9, 1.1, [0.93, 0.71, 0.24]);
  b.box(craneX - 3, 8.0, craneZ, 7, 0.7, 0.9, [0.93, 0.71, 0.24]);
  addBoxCollider(colliders, craneX, craneZ, 5.4, 5.4, 18, 'crane');

  // Shipping containers stacked on the quay.
  const boxCols = [
    [0.78, 0.29, 0.22],
    [0.16, 0.4, 0.5],
    [0.85, 0.62, 0.2],
    [0.3, 0.44, 0.3],
  ];
  for (let i = 0; i < 7; i++) {
    const cz = m.cz + 32 + (i % 3) * 7;
    const cx = m.x0 + 3 + (i % 2) * 4;
    b.box(cx, 1.2 + Math.floor(i / 5) * 2.5, cz, 2.4, 2.4, 6.0, boxCols[i % boxCols.length]);
  }

  // Lighthouse out on the point.
  const lx = quayX + 34;
  const lz = m.cz - 74;
  b.cylinder(lx, 1.4, lz, 3.0, 1.6, 12, [0.9, 0.86, 0.78], 'y');
  for (let i = 0; i < 5; i++) {
    b.cylinder(lx, 2.6 + i * 2.5, lz, 2.5 - i * 0.36, 2.5, 12, i % 2 === 0 ? [0.96, 0.94, 0.88] : [0.84, 0.27, 0.21], 'y');
  }
  b.cylinder(lx, 15.2, lz, 1.7, 1.6, 10, [0.3, 0.38, 0.42], 'y');
  b.cylinder(lx, 16.4, lz, 1.9, 0.9, 10, [0.92, 0.87, 0.62], 'y');

  const mesh = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  scene.add(group);
  return { group, lighthouse: new THREE.Vector3(lx, 16, lz) };
}
