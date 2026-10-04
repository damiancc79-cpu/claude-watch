// Case, bezel, sapphire crystals, lugs, fluted crown and an alligator strap.
// The case is a single lathed cross-section with filleted corners, so the
// highlights run round it in one unbroken band the way a polished case does.
import * as THREE from 'three';
import { TAU, D2R, v2, polar, shapeFrom, circlePath, circlePoints, roundCorners, smoothShape, toothedOutline, lerp } from './shapes.js';
import { extrude, lathe, cylinder, ring, sweep } from './parts.js';

export const CASE = {
  rOuter: 18.30,
  crystalTop: 4.45,
  backZ: -5.10,
  stemZ: -3.00,
  lugSpan: 10.40,      // 19 mm between the lug faces, for a 19 mm strap
};

/** Case cross-section in the (radius, z) half-plane, walked as a closed loop. */
function caseProfile() {
  const p = [
    v2(15.90, 3.70),   // crystal seat, inner lip of the bezel
    v2(17.15, 3.70),   // bezel top, polished flat
    v2(17.62, 3.28),   // bezel bevel
    v2(18.30, 2.05),   // widest point of the bezel
    v2(18.02, 1.25),   // step down onto the band
    v2(17.52, -0.40),  // the band is waisted: it slims the case and catches
    v2(17.98, -2.35),  // one long highlight down the flank
    v2(17.70, -3.65),
    v2(16.40, -4.72),
    v2(13.60, -5.10),  // caseback flat
    v2(12.10, -5.10),  // display opening
    v2(11.85, -4.66),  // sapphire seat
    v2(12.35, -4.42),
    v2(13.55, -4.24),
    v2(13.95, -3.86),
    v2(13.95, 2.05),   // cavity wall
    v2(15.90, 2.30),   // rehaut
  ];
  return roundCorners(p, [
    0.20, 0.18, 0.22, 0.40, 0.35, 1.60, 1.20, 0.55, 0.55, 0.35,
    0.12, 0.12, 0.12, 0.20, 0.25, 0.30, 0.25,
  ], 6);
}

function domedCrystal(rOuter, zBottom, zEdge, zTop, M) {
  const sag = zTop - zEdge;
  const R = (rOuter * rOuter + sag * sag) / (2 * sag);   // sphere through edge and apex
  const base = Math.sqrt(R * R - rOuter * rOuter);
  const loop = [v2(0, zBottom), v2(rOuter, zBottom)];
  const N = 30;
  for (let i = N; i >= 0; i--) {                          // dome, edge back to centre
    const r = (i / N) * rOuter;
    loop.push(v2(r, zEdge + (Math.sqrt(R * R - r * r) - base)));
  }
  const m = lathe(loop, M.sapphire, 112);
  m.renderOrder = 3;
  return m;
}

/**
 * One lug. The outline is drawn in the (y, z) plane and then cycled into place
 * so that the extrusion runs across X: shape-x -> world Y, shape-y -> world Z.
 */
function lugMesh(M) {
  // Enough control points to stop the spline bellying out past them: the lug
  // is a horn 4.7 mm deep where it leaves the band, 1.6 mm at the tip, with a
  // hollow underside for the spring bar.
  const ctrl = [
    v2(13.0, 1.30), v2(16.2, 1.10), v2(18.9, 0.35), v2(20.7, -1.05),
    v2(21.5, -2.30), v2(21.05, -3.20),
    v2(19.8, -3.00), v2(18.0, -2.55), v2(15.8, -2.95), v2(13.0, -3.40),
  ];
  const m = extrude(smoothShape(ctrl, 160), 3.00, M.caseSteel, 0.62, 14);
  m.geometry.rotateX(Math.PI / 2);
  m.geometry.rotateZ(Math.PI / 2);
  // taper it toward the tip: a lug that keeps its full thickness all the way
  // out reads as a bracket bolted to the case rather than as part of it
  const pos = m.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = Math.min(1, Math.max(0, (y - 15.0) / 6.5));
    pos.setX(i, pos.getX(i) * (1 - 0.30 * t * t));
  }
  pos.needsUpdate = true;
  m.geometry.computeVertexNormals();
  return m;
}

function flutedCrown(M) {
  const g = new THREE.Group();
  const out = toothedOutline(26, 2.05, {
    addendum: 0.95, dedendum: 0.95, halfThick: 0.30, tipFlat: 0.14, per: 12,
  });
  const body = extrude(shapeFrom(out.points), 1.62, M.caseSteel, 0.04, 8);
  g.add(body);
  // domed outer face, standing slightly proud of the flutes
  const cap = lathe([
    v2(0, 0.80), v2(1.35, 0.80), v2(1.80, 1.02), v2(1.94, 1.24),
    v2(1.10, 1.38), v2(0, 1.40),
  ], M.caseSteel, 56);
  g.add(cap);
  const backFace = lathe([
    v2(0, -0.81), v2(1.94, -0.81), v2(1.60, -1.10), v2(0, -1.10),
  ], M.caseSteel, 48);
  g.add(backFace);
  const tube = cylinder(0.62, 1.9, M.caseSteel, 24);
  tube.position.z = -1.9;
  g.add(tube);
  g.rotation.y = Math.PI / 2;        // axis along X
  return g;
}

function strapHalf(sign, M) {
  const g = new THREE.Group();
  const pts = [
    [20.6, -3.05], [22.6, -3.95], [24.9, -4.80], [28.2, -5.18],
    [33.0, -5.26], [40.0, -5.22], [47.5, -5.05],
  ].map(([y, z]) => new THREE.Vector3(0, y * sign, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);

  // computeFrenetFrames puts the normal along X for a curve in the YZ plane,
  // so profile x is the strap's WIDTH and profile y its thickness.
  const prof = roundCorners([
    v2(-9.20, -0.50), v2(9.20, -0.50),         // flat against the wrist
    v2(9.20, 0.28), v2(5.20, 0.60), v2(0, 0.70), v2(-5.20, 0.60), v2(-9.20, 0.28),
  ], 0.40, 4);                                  // crowned top, like real leather
  const taper = (t) => ({ x: lerp(1, 0.82, t), y: lerp(1, 0.86, t * t) });
  const body = sweep(prof, curve, 90, M.leather, taper);
  body.castShadow = body.receiveShadow = true;
  g.add(body);

  // hand stitching along both edges
  const stitchGeo = new THREE.CapsuleGeometry(0.085, 0.34, 3, 7);
  const up = new THREE.Vector3(0, 1, 0);
  const frames = curve.computeFrenetFrames(64, false);
  for (let i = 2; i <= 62; i++) {
    if (i % 2) continue;
    const t = i / 64;
    const P = curve.getPointAt(t);
    const N = frames.normals[i], B = frames.binormals[i], T = frames.tangents[i];
    const sc = taper(t);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(stitchGeo, M.thread);
      m.position.copy(P)
        .addScaledVector(N, s * 8.30 * sc.x)
        .addScaledVector(B, 0.56 * sc.y);
      m.quaternion.setFromUnitVectors(up, T);
      g.add(m);
    }
  }

  // keeper on the 12 side, buckle on the 6 side
  if (sign > 0) {
    // keeper loop: squash the ring in what becomes Z, then lay its axis along
    // the strap (Y) so it wraps the band rather than standing across it
    const kp = curve.getPointAt(0.60);
    const keeper = ring(8.9, 9.75, 2.4, M.leather, 34);
    keeper.geometry.scale(1, 0.30, 1);
    keeper.geometry.rotateX(Math.PI / 2);
    keeper.position.copy(kp);
    g.add(keeper);
  } else {
    const bp = curve.getPointAt(0.94);
    const frame = new THREE.Group();
    const outer = shapeFrom(roundCorners(
      [v2(-9.6, -3.4), v2(9.6, -3.4), v2(9.6, 3.4), v2(-9.6, 3.4)], 1.3, 5));
    const hole = new THREE.Path();
    const inner = roundCorners(
      [v2(-8.30, -2.20), v2(8.30, -2.20), v2(8.30, 2.20), v2(-8.30, 2.20)], 0.9, 5);
    hole.moveTo(inner[0].x, inner[0].y);
    for (const q of inner.slice(1)) hole.lineTo(q.x, q.y);
    hole.closePath();
    outer.holes.push(hole);

    // extruded in XY already lies flat on the table, which is what a buckle does
    const fr = extrude(outer, 0.85, M.caseSteel, 0.14, 8);
    fr.position.copy(bp);
    frame.add(fr);
    const bar = cylinder(0.30, 17.6, M.caseSteel, 14);
    bar.rotation.y = Math.PI / 2;
    bar.position.copy(bp);
    frame.add(bar);
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 6.2, 0.32), M.caseSteel);
    tongue.position.copy(bp).add(new THREE.Vector3(0, -2.4, 0.42));
    tongue.rotation.x = -0.12;
    frame.add(tongue);
    g.add(frame);
  }
  return g;
}

export function buildCase(M) {
  const group = new THREE.Group();
  const parts = {};

  const body = lathe(caseProfile(), M.caseSteel, 128);
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  parts.body = body;

  // lugs at 12 and 6, mirrored across the case
  const lugGroup = new THREE.Group();
  for (const sy of [1, -1]) {
    for (const sx of [1, -1]) {
      const l = lugMesh(M);
      l.position.x = sx * CASE.lugSpan;
      l.scale.y = sy;
      l.castShadow = true;
      lugGroup.add(l);
    }
    const bar = cylinder(0.55, 2 * CASE.lugSpan + 1.2, M.steel, 16);
    bar.rotation.y = Math.PI / 2;
    bar.position.set(0, sy * 20.60, -3.05);
    lugGroup.add(bar);
  }
  group.add(lugGroup);
  parts.lugs = lugGroup;

  // crown, on the 3 o'clock axis
  const crown = flutedCrown(M);
  crown.position.set(19.35, 0, CASE.stemZ);
  crown.castShadow = true;
  group.add(crown);
  parts.crown = crown;

  // sapphires
  const crystal = domedCrystal(15.85, 3.52, 3.74, CASE.crystalTop, M);
  group.add(crystal);
  parts.crystal = crystal;

  const back = lathe([
    v2(0, -4.98), v2(11.90, -4.98), v2(11.90, -4.62), v2(0, -4.62),
  ], M.sapphire, 72);
  back.renderOrder = 3;
  group.add(back);
  parts.caseback = back;

  // strap
  const strap = new THREE.Group();
  strap.add(strapHalf(1, M), strapHalf(-1, M));
  group.add(strap);
  parts.strap = strap;

  return { group, parts };
}
