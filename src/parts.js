// Reusable horological primitives: wheels, pinions, arbors, jewels, screws,
// and the two coiled springs. Everything is built lying in XY, centred on the
// origin and centred in Z, so a part is placed with position.set(x, y, z).
import * as THREE from 'three';
import {
  TAU, polar, v2, shapeFrom, pathFrom, circlePath, circlePoints,
  toothedOutline, pinionOutline, clubToothOutline, crossingPoints,
  roundCorners, lerp, clamp,
} from './shapes.js';

/**
 * Extrude a shape symmetrically about z = 0, with a polished chamfer.
 *
 * ExtrudeGeometry runs its bevels from -bevelThickness to depth+bevelThickness,
 * so the solid ends up 2*bevel thicker than asked for. That is taken off here,
 * which means `depth` is the real finished thickness — the z-layout of the
 * movement depends on it.
 */
export function extrude(shape, depth, mat, bevel = 0.02, curveSegments = 14) {
  const b = Math.min(bevel, depth * 0.4);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(depth - 2 * b, depth * 0.2),
    bevelEnabled: b > 0,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: b > 0.05 ? 3 : 1,
    curveSegments,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(0, 0, -(bb.min.z + bb.max.z) / 2);
  return new THREE.Mesh(geo, mat);
}

/**
 * Subdivide long straight runs of a profile. LatheGeometry averages the
 * adjacent segment normals at every profile point, so a flat face defined by
 * two points gets smoothly curved normals and a screw head renders as a glass
 * bead. Extra collinear points pin the normals flat and confine the blending to
 * the corners, where it belongs.
 */
function densify(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push(a.clone());
    const n = Math.floor(a.distanceTo(b) / step);
    for (let k = 1; k < n; k++) out.push(a.clone().lerp(b, k / n));
  }
  return out;
}

/** A rotationally swept solid from a closed (r, z) profile. */
export function lathe(profile, mat, segments = 96, phiStart = 0, phiLength = TAU) {
  let pts = profile.map((p) => (p.isVector2 ? p : v2(p[0], p[1])));
  let per = 0;
  for (let i = 0; i < pts.length; i++) per += pts[i].distanceTo(pts[(i + 1) % pts.length]);
  pts = densify(pts, clamp(per / 120, 0.06, 0.6));
  const closed = pts.concat([pts[0].clone()]);
  const geo = new THREE.LatheGeometry(closed, segments, phiStart, phiLength);
  geo.rotateX(-Math.PI / 2);       // lathe spins about +Y; we want +Z
  return new THREE.Mesh(geo, mat);
}

export function cylinder(r, h, mat, seg = 32, rTop = null) {
  const geo = new THREE.CylinderGeometry(rTop ?? r, r, h, seg);
  geo.rotateX(Math.PI / 2);
  return new THREE.Mesh(geo, mat);
}

export function ring(rIn, rOut, h, mat, seg = 64) {
  const shape = shapeFrom(circlePoints(rOut, 0, 0, seg));
  shape.holes.push(circlePath(rIn, 0, 0, seg));
  return extrude(shape, h, mat, 0.012);
}

/**
 * A watch wheel: cycloidal teeth, crossings cut between hub and rim, chamfered
 * edges. `phase` rotates the tooth pattern so meshes can be lined up.
 */
export function wheel(o) {
  const {
    teeth, pitchR, thickness = 0.16, crossings = 5, material,
    phase = 0, hubR = Math.max(0.42, pitchR * 0.135),
    boreR = Math.max(0.18, pitchR * 0.055), rimW = Math.max(0.34, pitchR * 0.085),
    crossingSpread = 0.76, hubCollar = true,
  } = o;
  const out = toothedOutline(teeth, pitchR, { phase });
  const shape = shapeFrom(out.points);
  if (boreR > 0) shape.holes.push(circlePath(boreR, 0, 0, 28));
  const rimInner = out.rootR - rimW;
  if (crossings > 0 && rimInner > hubR + 0.5) {
    for (let i = 0; i < crossings; i++) {
      const a = (i / crossings) * TAU + (o.crossingPhase ?? 0);
      shape.holes.push(pathFrom(crossingPoints(
        hubR + 0.22, rimInner - 0.06, a, (TAU / crossings) * crossingSpread, 64)));
    }
  }
  const g = new THREE.Group();
  const disc = extrude(shape, thickness, material, Math.min(0.022, thickness * 0.2));
  g.add(disc);
  if (hubCollar) {
    const collar = ring(boreR, hubR * 1.15, thickness * 1.9, material, 28);
    g.add(collar);
  }
  g.userData.tipR = out.tipR;
  return g;
}

/** A pinion: 6-12 leaves, tall, with polished collars at each end. */
export function pinion(o) {
  const { leaves, pitchR, height, material, phase = 0, boreR = 0 } = o;
  const out = pinionOutline(leaves, pitchR, { phase });
  const shape = shapeFrom(out.points);
  if (boreR > 0) shape.holes.push(circlePath(boreR, 0, 0, 20));
  return extrude(shape, height, material, 0.012, 10);
}

/** Arbor with turned-down pivots at each end. */
export function arbor(o) {
  const { r, length, material, pivotR = r * 0.34, pivotLen = 0.28 } = o;
  const h = length / 2;
  const prof = [
    v2(0, -h), v2(pivotR, -h), v2(pivotR, -h + pivotLen * 0.7),
    v2(r * 0.62, -h + pivotLen), v2(r, -h + pivotLen + 0.12),
    v2(r, h - pivotLen - 0.12), v2(r * 0.62, h - pivotLen),
    v2(pivotR, h - pivotLen * 0.7), v2(pivotR, h), v2(0, h),
  ];
  return lathe(prof, material, 20);
}

/** Ruby bearing jewel, with its oil sink turned into the top face. */
export function jewel(o = {}) {
  const { r = 0.42, h = 0.2, holeR = 0.11, material } = o;
  const prof = [
    v2(holeR, -h / 2), v2(holeR, h * 0.06),
    v2(holeR * 1.7, h * 0.32), v2(holeR * 2.6, h / 2),
    v2(r, h / 2), v2(r, -h / 2),
  ];
  const m = lathe(prof, material, 28);
  m.userData.isJewel = true;
  return m;
}

/** Gold chaton: the ring a jewel is set into, plus its three tiny screws. */
export function chaton(o = {}) {
  const { rIn = 0.42, rOut = 0.72, h = 0.24, material, screwMat } = o;
  const g = new THREE.Group();
  const prof = [
    v2(rIn, -h / 2), v2(rIn, h * 0.3), v2(rIn * 1.15, h / 2),
    v2(rOut, h / 2), v2(rOut, -h / 2),
  ];
  g.add(lathe(prof, material, 30));
  if (screwMat) {
    for (let i = 0; i < 3; i++) {
      const s = screw({ r: 0.16, material: screwMat });
      const a = (i / 3) * TAU + 0.5;
      s.position.set(Math.cos(a) * (rOut + 0.16), Math.sin(a) * (rOut + 0.16), h / 2 - 0.03);
      g.add(s);
    }
  }
  return g;
}

/** Blued screw: chamfered head with a slot, and a shank below it. */
export function screw(o = {}) {
  const { r = 0.4, material, headH = 0.15, shank = 0.5, slotMat } = o;
  const g = new THREE.Group();
  // flat polished head with a turned bevel — this is a screw, not a bead
  const prof = [
    v2(0, -headH / 2), v2(r, -headH / 2), v2(r, headH * 0.05),
    v2(r * 0.90, headH * 0.42), v2(r * 0.80, headH / 2), v2(0, headH / 2),
  ];
  const head = lathe(prof, material, 26);
  g.add(head);
  if (shank > 0) {
    const sh = cylinder(r * 0.6, shank, material, 14);
    sh.position.z = -headH / 2 - shank / 2;
    g.add(sh);
  }
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(r * 1.75, r * 0.30, headH * 0.55),
    slotMat ?? material);
  slot.position.z = headH / 2 - headH * 0.30;
  g.add(slot);
  g.rotation.z = Math.random() * TAU;
  return g;
}

/** Escape wheel — club teeth, three crossings, very thin. */
export function escapeWheel(o) {
  const { teeth = 15, tipR = 2.0, thickness = 0.14, material, hubR = 0.44, boreR = 0.2 } = o;
  const out = clubToothOutline(teeth, tipR);
  const shape = shapeFrom(out.points);
  shape.holes.push(circlePath(boreR, 0, 0, 24));
  for (let i = 0; i < 3; i++) {
    shape.holes.push(pathFrom(crossingPoints(hubR + 0.2, out.rimR - 0.16,
      (i / 3) * TAU, (TAU / 3) * 0.74, 60)));
  }
  const g = new THREE.Group();
  g.add(extrude(shape, thickness, material, 0.01, 8));
  g.add(ring(boreR, hubR * 1.1, thickness * 2.4, material, 24));
  return g;
}

/**
 * A flat spiral of rectangular section — mainspring or hairspring. The geometry
 * is allocated once and rewritten in place by update(), because the hairspring
 * has to breathe with the balance 6 times a second.
 */
export class Spiral {
  constructor(o) {
    const {
      turns = 12, rInner = 0.6, rOuter = 2.4, width = 0.5, thickness = 0.05,
      segments = 480, radial = 6, material, startAngle = 0,
    } = o;
    Object.assign(this, { turns, rInner, rOuter, width, thickness, segments, radial, startAngle });

    const geo = new THREE.BufferGeometry();
    const vcount = (segments + 1) * radial;
    this.pos = new Float32Array(vcount * 3);
    this.nrm = new Float32Array(vcount * 3);
    const uv = new Float32Array(vcount * 2);
    const idx = [];
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * radial + j;
        const b = i * radial + ((j + 1) % radial);
        const c = (i + 1) * radial + ((j + 1) % radial);
        const d = (i + 1) * radial + j;
        idx.push(a, b, d, b, c, d);
      }
    }
    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j < radial; j++) {
        const k = (i * radial + j) * 2;
        uv[k] = i / segments;
        uv[k + 1] = j / radial;
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.update(0);
  }

  /**
   * `wind` is the extra rotation of the inner end, in radians. The outer end
   * stays pinned — which is exactly how a hairspring is stud-mounted, so the
   * coil genuinely opens and closes rather than just spinning.
   */
  update(wind) {
    const { segments, radial, rInner, rOuter, width, thickness, startAngle } = this;
    const total = this.turns * TAU + wind;
    const pos = this.pos, nrm = this.nrm;
    for (let i = 0; i <= segments; i++) {
      const s = i / segments;
      const th = startAngle + total * s;
      const r = lerp(rOuter, rInner, s);
      const ca = Math.cos(th), sa = Math.sin(th);
      const px = ca * r, py = sa * r;
      // tangent of an Archimedean-ish spiral: d/ds (r*cos, r*sin)
      const drds = (rInner - rOuter);
      const tx = drds * ca - r * total * sa;
      const ty = drds * sa + r * total * ca;
      const tl = Math.hypot(tx, ty) || 1;
      const ux = -ty / tl, uy = tx / tl;      // in-plane normal
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * TAU;
        const cx = Math.cos(a) * thickness * 0.5;
        const cz = Math.sin(a) * width * 0.5;
        const k = (i * radial + j) * 3;
        pos[k] = px + ux * cx;
        pos[k + 1] = py + uy * cx;
        pos[k + 2] = cz;
        // normal of the elliptical section
        const nx = Math.cos(a) / (thickness * 0.5);
        const nz = Math.sin(a) / (width * 0.5);
        const nl = Math.hypot(nx, nz) || 1;
        nrm[k] = (ux * nx) / nl;
        nrm[k + 1] = (uy * nx) / nl;
        nrm[k + 2] = nz / nl;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }
}

/**
 * Sweep a closed 2D profile along a 3D curve with an optional taper. Used for
 * the strap; ExtrudeGeometry's extrudePath can't taper.
 */
export function sweep(profile, curve, steps, material, scaleFn = null) {
  const n = profile.length;
  const frames = curve.computeFrenetFrames(steps, false);
  const pos = [], nrm = [], uv = [], idx = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const P = curve.getPointAt(t);
    const N = frames.normals[i], B = frames.binormals[i];
    const sc = scaleFn ? scaleFn(t) : { x: 1, y: 1 };
    for (let j = 0; j < n; j++) {
      const p = profile[j];
      const x = P.x + N.x * p.x * sc.x + B.x * p.y * sc.y;
      const y = P.y + N.y * p.x * sc.x + B.y * p.y * sc.y;
      const z = P.z + N.z * p.x * sc.x + B.z * p.y * sc.y;
      pos.push(x, y, z);
      const pl = Math.hypot(p.x, p.y) || 1;
      const nx = p.x / pl, ny = p.y / pl;
      nrm.push(N.x * nx + B.x * ny, N.y * nx + B.y * ny, N.z * nx + B.z * ny);
      uv.push(j / n, t);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j, b = i * n + ((j + 1) % n);
      const c = (i + 1) * n + ((j + 1) % n), d = (i + 1) * n + j;
      idx.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

export { circlePoints, roundCorners, clamp, lerp };
