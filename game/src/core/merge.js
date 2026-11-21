// A tiny geometry merger: accumulates triangles with positions, normals, uvs and vertex colours,
// then hands back one BufferGeometry. The city is built from a few hundred boxes, so merging by
// material keeps the draw calls low without pulling in three's example utilities.
//
// Winding convention: quad(a, b, c, d) takes its corners counter-clockwise as seen from the side
// the normal points toward, so every face survives back-face culling. Each helper below was
// checked against that rule; keep it when adding new shapes.

import * as THREE from 'three';

export class GeometryBuilder {
  constructor({ uv = true, color = false } = {}) {
    this.positions = [];
    this.normals = [];
    this.uvs = uv ? [] : null;
    this.colors = color ? [] : null;
    this.useUV = uv;
    this.useColor = color;
  }

  triangle(a, b, c, normal, uva, uvb, uvc, color) {
    this.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) this.normals.push(normal[0], normal[1], normal[2]);
    if (this.useUV) {
      this.uvs.push(uva[0], uva[1], uvb[0], uvb[1], uvc[0], uvc[1]);
    }
    if (this.useColor) {
      const r = color[0];
      const g = color[1];
      const b2 = color[2];
      this.colors.push(r, g, b2, r, g, b2, r, g, b2);
    }
  }

  quad(a, b, c, d, normal, uva, uvb, uvc, uvd, color) {
    this.triangle(a, b, c, normal, uva, uvb, uvc, color);
    this.triangle(a, c, d, normal, uva, uvc, uvd, color);
  }

  // Four vertical walls of a box, with uv density given in metres per texture tile. Corners run
  // bottom-left, bottom-right, top-right, top-left on each face.
  walls(cx, cz, w, d, y0, y1, tileW = 24, tileH = 19.2, uOffset = 0, vOffset = 0) {
    const hw = w / 2;
    const hd = d / 2;
    const uW = w / tileW;
    const uD = d / tileW;
    const v0 = y0 / tileH + vOffset;
    const v1 = y1 / tileH + vOffset;
    const u0 = uOffset;

    // south (+z)
    this.quad(
      [cx - hw, y0, cz + hd],
      [cx + hw, y0, cz + hd],
      [cx + hw, y1, cz + hd],
      [cx - hw, y1, cz + hd],
      [0, 0, 1],
      [u0, v0],
      [u0 + uW, v0],
      [u0 + uW, v1],
      [u0, v1],
    );
    // north (-z)
    this.quad(
      [cx + hw, y0, cz - hd],
      [cx - hw, y0, cz - hd],
      [cx - hw, y1, cz - hd],
      [cx + hw, y1, cz - hd],
      [0, 0, -1],
      [u0, v0],
      [u0 + uW, v0],
      [u0 + uW, v1],
      [u0, v1],
    );
    // east (+x)
    this.quad(
      [cx + hw, y0, cz + hd],
      [cx + hw, y0, cz - hd],
      [cx + hw, y1, cz - hd],
      [cx + hw, y1, cz + hd],
      [1, 0, 0],
      [u0, v0],
      [u0 + uD, v0],
      [u0 + uD, v1],
      [u0, v1],
    );
    // west (-x)
    this.quad(
      [cx - hw, y0, cz - hd],
      [cx - hw, y0, cz + hd],
      [cx - hw, y1, cz + hd],
      [cx - hw, y1, cz - hd],
      [-1, 0, 0],
      [u0, v0],
      [u0 + uD, v0],
      [u0 + uD, v1],
      [u0, v1],
    );
  }

  roof(cx, cz, w, d, y, uScale = 0.25, color = [1, 1, 1]) {
    const hw = w / 2;
    const hd = d / 2;
    this.quad(
      [cx - hw, y, cz + hd],
      [cx + hw, y, cz + hd],
      [cx + hw, y, cz - hd],
      [cx - hw, y, cz - hd],
      [0, 1, 0],
      [0, 0],
      [w * uScale, 0],
      [w * uScale, d * uScale],
      [0, d * uScale],
      color,
    );
  }

  // An axis-aligned box with six faces, used for props, curbs and vehicle bodies.
  box(cx, cy, cz, w, h, d, color, uScale = 0.5) {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const y0 = cy - h / 2;
    const y1 = cy + h / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    const uW = w * uScale;
    const uH = h * uScale;
    const uD = d * uScale;
    // +z
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1],
      [0, 0], [uW, 0], [uW, uH], [0, uH], color);
    // -z
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1],
      [0, 0], [uW, 0], [uW, uH], [0, uH], color);
    // +x
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0],
      [0, 0], [uD, 0], [uD, uH], [0, uH], color);
    // -x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0],
      [0, 0], [uD, 0], [uD, uH], [0, uH], color);
    // +y
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0],
      [0, 0], [0, uD], [uW, uD], [uW, 0], color);
    // -y
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0],
      [0, 0], [uW, 0], [uW, uD], [0, uD], color);
  }

  // A flat, horizontal quad (decals, road markings, water strips), y up.
  slab(cx, y, cz, w, d, color, uScale = 0.1) {
    const hw = w / 2;
    const hd = d / 2;
    this.quad(
      [cx - hw, y, cz + hd],
      [cx + hw, y, cz + hd],
      [cx + hw, y, cz - hd],
      [cx - hw, y, cz - hd],
      [0, 1, 0],
      [0, 0],
      [w * uScale, 0],
      [w * uScale, d * uScale],
      [0, d * uScale],
      color,
    );
  }

  cylinder(cx, cy, cz, radius, height, segments, color, axis = 'y') {
    const y0 = -height / 2;
    const y1 = height / 2;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const p0 = [Math.cos(a0) * radius, Math.sin(a0) * radius];
      const p1 = [Math.cos(a1) * radius, Math.sin(a1) * radius];
      const n0 = [Math.cos(a0), Math.sin(a0)];
      const n1 = [Math.cos(a1), Math.sin(a1)];
      if (axis !== 'y') continue;
      this.quad(
        [cx + p0[0], cy + y0, cz + p0[1]],
        [cx + p1[0], cy + y0, cz + p1[1]],
        [cx + p1[0], cy + y1, cz + p1[1]],
        [cx + p0[0], cy + y1, cz + p0[1]],
        [(n0[0] + n1[0]) / 2, 0, (n0[1] + n1[1]) / 2],
        [i / segments, 0],
        [(i + 1) / segments, 0],
        [(i + 1) / segments, 1],
        [i / segments, 1],
        color,
      );
      const capY = cy + y1;
      this.triangle([cx, capY, cz], [cx + p1[0], capY, cz + p1[1]], [cx + p0[0], capY, cz + p0[1]],
        [0, 1, 0], [0.5, 0.5], [1, 0], [0, 0], color);
    }
  }

  // A cylinder lying on its side, for wheels, barrels and light bars. `axis` is the axis the
  // cylinder runs along ('x' or 'z'), so a wheel on a car has its axle across the car.
  disc(cx, cy, cz, radius, width, segments, color, axis = 'x') {
    const hw = width / 2;
    const ax = axis === 'x' ? [1, 0, 0] : axis === 'z' ? [0, 0, 1] : [0, 1, 0];
    const e1 = axis === 'y' ? [1, 0, 0] : [0, 1, 0];
    const e2 = axis === 'x' ? [0, 0, 1] : axis === 'z' ? [1, 0, 0] : [0, 0, 1];
    const P = (a, off) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      return [
        cx + ax[0] * off + e1[0] * c * radius + e2[0] * s * radius,
        cy + ax[1] * off + e1[1] * c * radius + e2[1] * s * radius,
        cz + ax[2] * off + e1[2] * c * radius + e2[2] * s * radius,
      ];
    };
    const N = (a) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      return [e1[0] * c + e2[0] * s, e1[1] * c + e2[1] * s, e1[2] * c + e2[2] * s];
    };
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const n0 = N(a0);
      const n1 = N(a1);
      this.quad(
        P(a0, -hw),
        P(a1, -hw),
        P(a1, hw),
        P(a0, hw),
        [(n0[0] + n1[0]) / 2, (n0[1] + n1[1]) / 2, (n0[2] + n1[2]) / 2],
        [0, 0], [1, 0], [1, 1], [0, 1],
        color,
      );
      // end caps, one facing each way along the axle
      this.triangle(P(0, hw), P(a0, hw), P(a1, hw), ax, [0.5, 0.5], [1, 0], [0, 0], color);
      this.triangle(P(0, -hw), P(a1, -hw), P(a0, -hw), [-ax[0], -ax[1], -ax[2]], [0.5, 0.5], [1, 0], [0, 0], color);
    }
  }

  isEmpty() {
    return this.positions.length === 0;
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    if (this.useUV) geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    if (this.useColor) geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geo.computeBoundingSphere();
    return geo;
  }
}

// A mesh from a builder with shadows on by default.
export function builderMesh(builder, material, { cast = true, receive = true, name = '' } = {}) {
  const mesh = new THREE.Mesh(builder.build(), material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  mesh.name = name;
  return mesh;
}
