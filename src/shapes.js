// 2D shape helpers. Everything here works in the watch's XY plane (millimetres);
// parts.js extrudes the results along +Z. The watch is built with +Z pointing
// out of the dial, so "front" = dial side, "back" = movement / caseback side.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const D2R = Math.PI / 180;

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function polar(r, a) {
  return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
}

export function v2(x, y) { return new THREE.Vector2(x, y); }

/** Closed THREE.Shape through a list of Vector2 (already sampled — no curves). */
export function shapeFrom(points) {
  const s = new THREE.Shape();
  s.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i].x, points[i].y);
  s.closePath();
  return s;
}

/** Same, as a Path — for use as a hole. */
export function pathFrom(points) {
  const p = new THREE.Path();
  p.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) p.lineTo(points[i].x, points[i].y);
  p.closePath();
  return p;
}

export function circlePath(r, cx = 0, cy = 0, seg = 40) {
  const pts = [];
  for (let i = 0; i < seg; i++) pts.push(polar(r, (i / seg) * TAU).add(v2(cx, cy)));
  return pathFrom(pts);
}

export function circlePoints(r, cx = 0, cy = 0, seg = 48) {
  const pts = [];
  for (let i = 0; i < seg; i++) pts.push(polar(r, (i / seg) * TAU).add(v2(cx, cy)));
  return pts;
}

/**
 * Smooth closed outline through control points (centripetal Catmull-Rom).
 * This is how every bridge, cock and lever outline in the movement is drawn:
 * a handful of control points, one organic curve.
 */
export function smoothClosed(ctrl, samples = 200) {
  // centripetal Catmull-Rom divides by the knot spacing, so coincident control
  // points produce NaN. Chained arcs generate them constantly.
  const clean = [];
  for (const p of ctrl) {
    if (!clean.length || clean[clean.length - 1].distanceTo(p) > 1e-4) clean.push(p);
  }
  if (clean.length > 2 && clean[0].distanceTo(clean[clean.length - 1]) < 1e-4) clean.pop();
  ctrl = clean;
  const curve = new THREE.CatmullRomCurve3(
    ctrl.map((p) => new THREE.Vector3(p.x, p.y, 0)), true, 'centripetal', 0.5);
  const pts = curve.getPoints(samples).map((p) => v2(p.x, p.y));
  // getPoints() on a closed curve repeats the first point at the end.
  if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  return pts;
}

export function smoothShape(ctrl, samples = 200) { return shapeFrom(smoothClosed(ctrl, samples)); }
export function smoothPath(ctrl, samples = 160) { return pathFrom(smoothClosed(ctrl, samples)); }

/**
 * Fillet the corners of a polygon. Used for the case profile (in the r/z
 * half-plane) and for any outline that wants crisp straights and soft corners
 * rather than an all-over spline.
 */
export function roundCorners(pts, radius, samples = 6) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const v1 = a.clone().sub(p), v2v = b.clone().sub(p);
    const l1 = v1.length(), l2 = v2v.length();
    if (l1 < 1e-7 || l2 < 1e-7) { out.push(p.clone()); continue; }
    v1.divideScalar(l1); v2v.divideScalar(l2);
    const ang = Math.acos(clamp(v1.dot(v2v), -1, 1));
    const want = Array.isArray(radius) ? radius[i] : radius;
    if (want <= 1e-6 || ang > Math.PI - 1e-3 || ang < 1e-3) { out.push(p.clone()); continue; }
    let t = want / Math.tan(ang / 2);
    t = Math.min(t, l1 * 0.49, l2 * 0.49);
    const r = t * Math.tan(ang / 2);
    const p1 = p.clone().addScaledVector(v1, t);
    const p2 = p.clone().addScaledVector(v2v, t);
    const bis = v1.clone().add(v2v).normalize();
    const c = p.clone().addScaledVector(bis, r / Math.sin(ang / 2));
    let a1 = Math.atan2(p1.y - c.y, p1.x - c.x);
    const a2 = Math.atan2(p2.y - c.y, p2.x - c.x);
    let da = a2 - a1;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    for (let s = 0; s <= samples; s++) {
      const aa = a1 + (da * s) / samples;
      out.push(v2(c.x + Math.cos(aa) * r, c.y + Math.sin(aa) * r));
    }
  }
  return out;
}

/**
 * Gear tooth outline. Watch wheels use cycloidal teeth: tall, with an ogival
 * flank and a rounded, nearly flat tip. A smoothstep flank between root and tip
 * circles reproduces the look closely enough that a real one is hard to pick
 * out, and it can never self-intersect.
 *
 * Tooth thickness at the pitch circle works out at ~0.33 of the pitch with the
 * defaults, which is what a driving wheel actually carries.
 */
export function toothedOutline(teeth, pitchR, o = {}) {
  const m = (2 * pitchR) / teeth;               // module
  const add = o.addendum ?? 0.95;               // tip above pitch, in modules
  const ded = o.dedendum ?? 0.62;               // root below pitch
  const halfThick = o.halfThick ?? 0.30;        // half tooth width, in pitch fractions
  const tipFlat = o.tipFlat ?? 0.085;
  const per = o.per ?? clamp(Math.round(760 / teeth), 9, 22);
  const Rt = pitchR + add * m;
  const Rr = pitchR - ded * m;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    for (let j = 0; j < per; j++) {
      const u = j / per;
      const ax = Math.abs(u - 0.5);            // 0 at tooth centre, 0.5 at gap centre
      let r;
      if (ax <= tipFlat) r = Rt;
      else if (ax >= halfThick) r = Rr;
      else r = Rr + (Rt - Rr) * (1 - smoothstep(tipFlat, halfThick, ax));
      pts.push(polar(r, ((i + u) * TAU) / teeth + (o.phase ?? 0)));
    }
  }
  return { points: pts, tipR: Rt, rootR: Rr, module: m };
}

/** Pinion leaves: fewer, fatter, blunter than wheel teeth. */
export function pinionOutline(leaves, pitchR, o = {}) {
  return toothedOutline(leaves, pitchR, {
    addendum: 0.78, dedendum: 0.55, halfThick: 0.345, tipFlat: 0.115, per: 26, ...o,
  });
}

/**
 * Escape wheel club tooth. This one is drawn by hand because its shape is the
 * escapement: the flat tip is the impulse plane, the corner behind it is where
 * the pallet stone locks, and the hook underneath is the undercut that clears
 * the stone on the drop. Teeth lean into the direction of rotation (+angle).
 */
export function clubToothOutline(teeth, tipR, o = {}) {
  const rimR = o.rimR ?? tipR * 0.775;
  const pitch = TAU / teeth;
  const P = (deg, r) => polar(r, deg * D2R);
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const base = i * pitch;
    const seq = [
      [0.0, rimR], [1.4, rimR * 1.03], [3.0, tipR * 0.90], [4.4, tipR * 0.975],
      [5.6, tipR],                    // locking corner
      [9.6, tipR],                    // tip corner — the impulse plane runs between these two
      [10.1, tipR * 0.915],           // undercut
      [7.6, rimR * 1.06], [5.4, rimR], // hook back down to the rim
      [10.5, rimR], [16.0, rimR], [21.0, rimR],
    ];
    for (const [d, r] of seq) {
      const p = P(d * (pitch / (TAU / 15)), r); // keep the profile proportional for other counts
      pts.push(p.rotateAround(v2(0, 0), base));
    }
  }
  return { points: pts, tipR, rimR };
}

/**
 * Kidney-shaped opening between hub and rim — the "crossing" that turns a disc
 * into a spoked watch wheel, and the same primitive used to skeletonise plates.
 */
export function crossingPoints(rIn, rOut, aMid, spread, samples = 80) {
  const f = spread * 0.30;
  const rm = (rIn + rOut) * 0.5;
  const a0 = aMid - spread / 2, a1 = aMid + spread / 2;
  const ctrl = [
    polar(rOut, a0 + f), polar(rOut, aMid), polar(rOut, a1 - f),
    polar(rm, a1),
    polar(rIn, a1 - f), polar(rIn, aMid), polar(rIn, a0 + f),
    polar(rm, a0),
  ];
  return smoothClosed(ctrl, samples);
}

/**
 * Outline around a chain of circles — a bridge or a cock. Each node is a boss
 * (big enough to carry a jewel or a screw), the links between them are waisted,
 * and the result is the shape a bridge actually has: lobes joined by necks,
 * rather than a blob. Run it through smoothClosed to finish.
 */
export function chainOutline(nodes, waistK = 0.62, arcN = 6) {
  const n = nodes.length;
  const dir = [];
  for (let i = 0; i < n - 1; i++) {
    dir.push(Math.atan2(nodes[i + 1].c.y - nodes[i].c.y, nodes[i + 1].c.x - nodes[i].c.x));
  }
  const pts = [];
  const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const arc = (c, r, a0, sweep, steps) => {
    for (let k = 0; k <= steps; k++) pts.push(polar(r, a0 + (sweep * k) / steps).add(c.clone()));
  };
  const waist = (i, side) => {
    const mid = nodes[i].c.clone().lerp(nodes[i + 1].c, 0.5);
    const rr = Math.min(nodes[i].r, nodes[i + 1].r) * waistK;
    pts.push(polar(rr, dir[i] + side * Math.PI / 2).add(mid));
  };

  // one side, out along the chain
  for (let i = 0; i < n; i++) {
    const aIn = dir[Math.max(0, i - 1)], aOut = dir[Math.min(n - 2, i)];
    const a0 = aIn - Math.PI / 2;
    arc(nodes[i].c, nodes[i].r, a0, wrap(aOut - aIn), i === 0 || i === n - 1 ? 1 : arcN);
    if (i < n - 1) waist(i, -1);
  }
  // round the far end
  arc(nodes[n - 1].c, nodes[n - 1].r, dir[n - 2] - Math.PI / 2, Math.PI, arcN + 3);
  // and back down the other side
  for (let i = n - 1; i >= 0; i--) {
    const aIn = dir[Math.max(0, i - 1)], aOut = dir[Math.min(n - 2, i)];
    const a0 = aOut + Math.PI / 2;
    arc(nodes[i].c, nodes[i].r, a0, wrap(aIn - aOut), i === 0 || i === n - 1 ? 1 : arcN);
    if (i > 0) waist(i - 1, 1);
  }
  arc(nodes[0].c, nodes[0].r, dir[0] + Math.PI / 2, Math.PI, arcN + 3);
  return pts;
}

/** A blob: n control points on an ellipse, optionally jittered by a shape fn. */
export function blobPoints(cx, cy, rx, ry, n = 8, warp = null, samples = 120) {
  const ctrl = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = warp ? warp(a, i) : 1;
    ctrl.push(v2(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k));
  }
  return smoothClosed(ctrl, samples);
}

/** Rounded rectangle centred on the origin. */
export function roundedRect(w, h, r, seg = 5) {
  const pts = [v2(-w / 2, -h / 2), v2(w / 2, -h / 2), v2(w / 2, h / 2), v2(-w / 2, h / 2)];
  return roundCorners(pts, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4), seg);
}
