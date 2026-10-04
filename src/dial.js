// Dial furniture: the applied chapter ring, the sunken small-seconds register
// and three blued Breguet hands. There is no dial plate — the movement is the
// dial, which is the whole point of a skeleton watch.
import * as THREE from 'three';
import { TAU, D2R, v2, polar, shapeFrom, circlePath, circlePoints, smoothShape, roundedRect } from './shapes.js';
import { extrude, lathe, cylinder, ring } from './parts.js';
import * as TEX from './textures.js';
import { POS } from './movement.js';

export const DIAL_Z = {
  ring: 2.60, ringT: 0.50,
  sub: 1.45, subT: 0.40,
  hour: 3.10, minute: 3.42, seconds: 1.95, handT: 0.13,
};

const R_IN = 10.70, R_OUT = 13.55;
const SUB_R = 3.00;

function printedRing(rIn, rOut, thickness, texture, span, mat) {
  const shape = shapeFrom(circlePoints(rOut, 0, 0, 200));
  shape.holes.push(circlePath(rIn, 0, 0, 180));
  const m = extrude(shape, thickness, mat, 0.03, 16);
  const printed = mat.clone();
  printed.color = new THREE.Color(0xffffff);   // let the printed base carry the colour
  printed.map = texture;
  texture.repeat.set(1 / span, 1 / span);
  texture.offset.set(0.5, 0.5);
  m.material = [printed, mat];   // ExtrudeGeometry: group 0 = caps, 1 = walls
  return m;
}

/** Breguet hand: a tapered shaft with a pierced "moon" near the tip. */
function breguetHand(len, mat, o = {}) {
  const {
    tail = len * 0.16, w = len * 0.055, moonAt = 0.74, moonR = len * 0.085,
    thickness = DIAL_Z.handT,
  } = o;
  const g = new THREE.Group();
  const mr = len * moonAt;
  const pts = [
    v2(-tail, 0.0),
    v2(-tail * 0.72, w * 0.95), v2(0, w * 1.15), v2(mr * 0.55, w * 0.75),
    v2(mr - moonR * 0.5, w * 0.5), v2(mr + moonR * 0.6, w * 0.42),
    v2(len - w * 0.9, w * 0.30), v2(len, 0),
    v2(len - w * 0.9, -w * 0.30), v2(mr + moonR * 0.6, -w * 0.42),
    v2(mr - moonR * 0.5, -w * 0.5), v2(mr * 0.55, -w * 0.75),
    v2(0, -w * 1.15), v2(-tail * 0.72, -w * 0.95),
  ];
  const shaft = smoothShape(pts, 200);
  g.add(extrude(shaft, thickness, mat, 0.018, 10));

  // the moon: an open ring threaded onto the shaft
  const moon = shapeFrom(circlePoints(moonR, mr, 0, 60));
  moon.holes.push(circlePath(moonR * 0.58, mr, 0, 44));
  g.add(extrude(moon, thickness, mat, 0.018, 10));

  // counterweight and boss
  const cw = shapeFrom(circlePoints(w * 1.5, -tail * 0.55, 0, 36));
  g.add(extrude(cw, thickness, mat, 0.018, 8));
  const boss = cylinder(w * 1.25, thickness * 2.6, mat, 22);
  g.add(boss);
  return g;
}

export function buildDial(M) {
  const group = new THREE.Group();
  group.userData.explode = 2.4;
  const parts = {};

  // ------------------------------------------------------------ chapter ring
  const chapterTex = TEX.chapterRing(2048, { rOuter: R_OUT, rInner: R_IN });
  const chap = printedRing(R_IN, R_OUT, DIAL_Z.ringT, chapterTex, 2 * R_OUT, M.dialRing);
  chap.position.z = DIAL_Z.ring;
  chap.receiveShadow = true;
  group.add(chap);
  parts.chapter = chap;

  // inner flange, sloping down toward the movement
  const flange = lathe([
    v2(R_IN, DIAL_Z.ring - DIAL_Z.ringT / 2), v2(R_IN + 0.02, DIAL_Z.ring + DIAL_Z.ringT / 2),
    v2(R_IN - 0.85, DIAL_Z.ring + DIAL_Z.ringT / 2 - 0.05),
    v2(R_IN - 0.90, DIAL_Z.ring - DIAL_Z.ringT / 2),
  ], M.dialRing, 140);
  group.add(flange);

  // applied baton indices — 12, 3 and 9 are printed numerals, 6 is the register
  for (const h of [1, 2, 4, 5, 7, 8, 10, 11]) {
    const a = Math.PI / 2 - (h / 12) * TAU;
    const bar = extrude(shapeFrom(roundedRect(1.65, 0.40, 0.16, 4)), 0.30, M.steel, 0.02, 6);
    bar.position.set(Math.cos(a) * 11.75, Math.sin(a) * 11.75, DIAL_Z.ring + DIAL_Z.ringT / 2 + 0.14);
    bar.rotation.z = a;
    group.add(bar);
  }

  // ------------------------------------------------------- small seconds
  const subTex = TEX.subdialRing(1024, SUB_R);
  const sub = printedRing(0.95, SUB_R, DIAL_Z.subT, subTex, 2 * SUB_R, M.dialRing);
  sub.position.set(POS.fourth.x, POS.fourth.y, DIAL_Z.sub);
  group.add(sub);
  const subRim = lathe([
    v2(SUB_R, DIAL_Z.sub - DIAL_Z.subT / 2), v2(SUB_R, DIAL_Z.sub + DIAL_Z.subT / 2),
    v2(SUB_R + 0.28, DIAL_Z.sub + DIAL_Z.subT / 2 + 0.10),
    v2(SUB_R + 0.28, DIAL_Z.sub - DIAL_Z.subT / 2),
  ], M.steel, 90);
  subRim.position.set(POS.fourth.x, POS.fourth.y, 0);
  group.add(subRim);

  // ------------------------------------------------------------------ hands
  const hour = breguetHand(8.30, M.blued, { w: 0.50, moonAt: 0.70, moonR: 0.80 });
  hour.position.z = DIAL_Z.hour;
  const minute = breguetHand(12.55, M.blued, { w: 0.44, moonAt: 0.76, moonR: 0.72 });
  minute.position.z = DIAL_Z.minute;
  const seconds = breguetHand(2.72, M.blued, {
    w: 0.115, tail: 0.85, moonAt: 0.62, moonR: 0.20, thickness: 0.09,
  });
  seconds.position.set(POS.fourth.x, POS.fourth.y, DIAL_Z.seconds);
  group.add(hour, minute, seconds);
  Object.assign(parts, { hour, minute, seconds });

  /** angles come straight off the movement, so the hands cannot disagree. */
  function setHands(a) {
    parts.hour.rotation.z = a.hour + Math.PI / 2;
    parts.minute.rotation.z = a.centre + Math.PI / 2;
    parts.seconds.rotation.z = a.fourth + Math.PI / 2;
  }

  return { group, parts, setHands };
}
