// The movement: mainplate, bridges, going train, Swiss lever escapement,
// keyless works and motion works.
//
// LAYOUT NOTES ------------------------------------------------------------
// Millimetres throughout. +Z points out of the dial, so "back" (the caseback
// side, where the bridges live) is -Z.
//
// The train is a real one. Every centre distance below is the sum of the two
// meshing pitch radii, and the tooth counts multiply out to a working watch:
//
//   barrel 80t -> centre pinion 10       centre wheel  1 rev / hour
//   centre 60t -> third pinion 8         third wheel   7.5 rev / hour
//   third  64t -> fourth pinion 8        fourth wheel  1 rev / minute  (seconds)
//   fourth 72t -> escape pinion 6        escape wheel  12 rev / minute
//   escape 15 teeth, one tooth per oscillation of a 3 Hz balance = 21 600 A/h
//
// which means the seconds hand is driven by the escapement rather than by a
// clock, and it trembles by half a degree at each beat exactly like the real
// thing.
import * as THREE from 'three';
import {
  TAU, D2R, polar, v2, shapeFrom, pathFrom, circlePath, circlePoints,
  smoothShape, crossingPoints, chainOutline, smoothstep, lerp,
} from './shapes.js';
import {
  extrude, lathe, cylinder, ring, wheel, pinion, arbor, jewel, chaton, screw,
  escapeWheel, Spiral,
} from './parts.js';
import * as TEX from './textures.js';

// ---------------------------------------------------------------- geometry
export const R_MOV = 13.5;

export const POS = {
  centre: v2(0, 0),
  barrel: v2(3.27, 5.90),
  third: v2(2.784, -3.577),
  fourth: v2(0, -6.20),
  escape: v2(-3.14, -4.735),
  pallet: v2(-4.415, -2.527),
  balance: v2(-6.365, 0.258),
  // placed so the crown wheel meshes the ratchet (3.00 + 1.90 = 4.90 centres)
  // and the winding pinion meshes the crown wheel (1.90 + 0.95) while sitting
  // exactly on the 3 o'clock axis, so the stem leaves the case dead level.
  crownWheel: v2(6.699, 2.40),
  windingPinion: v2(8.236, 0),
  minuteWheel: v2(3.383, 1.231),
};

const Z = {
  plate: 0, plateT: 1.10,
  centreWheel: -0.85, centrePinion: -1.94,
  thirdPinion: -0.86, thirdWheel: -1.35,
  fourthPinion: -1.36, fourthWheel: -1.70,
  escapePinion: -1.70, escapeWheel: -2.00,
  fork: -2.00,
  barrelTeeth: -1.95, barrelTop: -1.50, barrelBottom: -2.40,
  trainBridge: -2.62, trainBridgeT: 0.55,
  barrelBridge: -2.72, barrelBridgeT: 0.45,
  palletCock: -2.33, palletCockT: 0.26,
  ratchet: -3.12,
  roller: -2.02, balance: -2.80, hairspring: -3.22,
  balanceCock: -3.47, balanceCockT: 0.26,
  stem: -3.00,
  cannonTop: 2.60, minuteWheel: 0.75, minutePinion: 1.15, hourWheel: 1.15,
};
export const ZLEVELS = Z;

// pitch radii (mm)
const PR = {
  barrel: 6.00, centrePinion: 0.75,
  centre: 4.00, thirdPinion: 0.533,
  third: 3.40, fourthPinion: 0.425,
  fourth: 3.20, escapePinion: 0.267,
  escapeTip: 2.00,
  ratchet: 3.00, crownWheel: 1.90,
  cannon: 0.90, minuteWheel: 2.70, minutePinion: 0.75, hourWheel: 2.85,
};
export const PITCH = PR;

const BEAT_HZ = 6;               // 21 600 A/h = 6 beats per second
const AMPLITUDE = 275 * D2R;     // balance swing, one way
const LOCK = 5.5 * D2R;          // pallet fork travel, one way
const STEP = TAU / 30;           // escape wheel advance per beat: half a tooth

// ------------------------------------------------------------------ pieces

/** Ratchet (sawtooth) wheel — the click has to have something to bite. */
function ratchetWheel(teeth, rOut, thickness, mat) {
  const pts = [];
  const rIn = rOut - Math.max(0.28, rOut * 0.10);
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * TAU;
    const a1 = ((i + 1) / teeth) * TAU;
    pts.push(polar(rIn, a0));
    pts.push(polar(rIn + (rOut - rIn) * 0.15, a0 + (a1 - a0) * 0.12));
    pts.push(polar(rOut, a1 - (a1 - a0) * 0.10));   // slow climb
    pts.push(polar(rIn, a1 - (a1 - a0) * 0.06));    // radial drop the click sits against
  }
  const shape = shapeFrom(pts);
  shape.holes.push(circlePath(rOut * 0.24, 0, 0, 24));
  for (let i = 0; i < 5; i++) {
    shape.holes.push(pathFrom(crossingPoints(rOut * 0.42, rIn - 0.42,
      (i / 5) * TAU, (TAU / 5) * 0.7, 50)));
  }
  return extrude(shape, thickness, mat, 0.015, 8);
}

/** Kidney-shaped openings cut around a pivot: how a plate is skeletonised. */
function openingsAround(shape, c, rIn, rOut, angles, spread) {
  for (const a of angles) {
    const pts = crossingPoints(rIn, rOut, a * D2R, spread * D2R, 70)
      .map((p) => p.add(c));
    shape.holes.push(pathFrom(pts));
  }
}

/** Post that carries a bridge down to the mainplate. */
function post(x, y, z0, z1, r, mat) {
  const m = cylinder(r, Math.abs(z1 - z0), mat, 20);
  m.position.set(x, y, (z0 + z1) / 2);
  return m;
}

// ------------------------------------------------------------------- build
export function buildMovement(M) {
  const root = new THREE.Group();
  const anchors = [];
  // anchors sit on the part itself; labels.js pushes the chip outward from
  // there and draws the leader line back. Vector2s can be spread in place.
  const anchor = (label, x, y, z, side = -1) =>
    anchors.push({ label, pos: new THREE.Vector3(x, y, z), side });

  const layer = (name, ex) => {
    const g = new THREE.Group();
    g.userData.explode = ex;
    g.userData.layer = name;
    root.add(g);
    return g;
  };

  const Lplate = layer('plate', 0);
  const Ltrain = layer('train', -0.55);
  const Lbridge = layer('bridges', -1.7);
  const Lbalance = layer('balance', -2.35);
  const Lkeyless = layer('keyless', -2.9);
  const Lmotion = layer('motion', 1.15);

  // ============================================================ mainplate
  {
    const shape = shapeFrom(circlePoints(R_MOV, 0, 0, 220));

    // barrel: three crossings leave a boss for the barrel arbour
    openingsAround(shape, POS.barrel, 1.55, 5.25, [30, 150, 270], 90);
    // centre: three openings dodging the neighbouring pivots
    openingsAround(shape, POS.centre, 1.35, 3.85, [-13], 52);
    openingsAround(shape, POS.centre, 1.35, 3.85, [105], 62);
    openingsAround(shape, POS.centre, 1.35, 3.85, [207], 38);
    // third wheel: the two directions that are not pointing at another pivot
    openingsAround(shape, POS.third, 0.90, 2.50, [300], 78);
    openingsAround(shape, POS.third, 0.90, 2.40, [28], 52);
    // balance: open heart
    openingsAround(shape, POS.balance, 1.25, 3.25, [55, 235], 112);
    // escapement
    openingsAround(shape, POS.escape, 1.05, 2.55, [130, 250], 96);
    // fourth wheel / small seconds
    openingsAround(shape, POS.fourth, 0.95, 2.75, [180, 300], 84);
    // decorative crescent at 4 o'clock and its mirror at 8
    shape.holes.push(pathFrom(crossingPoints(8.6, 11.9, -34 * D2R, 46 * D2R, 70)));
    shape.holes.push(pathFrom(crossingPoints(9.1, 11.9, 232 * D2R, 34 * D2R, 70)));

    // pivot bores
    const bores = [
      [POS.centre, 0.80], [POS.third, 0.34], [POS.fourth, 0.42],
      [POS.escape, 0.28], [POS.pallet, 0.28], [POS.balance, 0.40],
      [POS.barrel, 0.52], [POS.crownWheel, 0.34], [POS.minuteWheel, 0.30],
    ];
    for (const [p, r] of bores) shape.holes.push(circlePath(r, p.x, p.y, 22));

    const plate = extrude(shape, Z.plateT, M.plate, 0.05, 14);
    plate.position.z = Z.plate;
    plate.castShadow = plate.receiveShadow = true;
    Lplate.add(plate);

    // jewels set into the plate, seen from the dial side
    for (const p of [POS.third, POS.fourth, POS.escape, POS.pallet, POS.balance]) {
      const j = jewel({ r: 0.40, h: 0.22, holeR: 0.11, material: M.ruby });
      j.position.set(p.x, p.y, Z.plate - Z.plateT / 2 + 0.14);
      Lplate.add(j);
    }
    // plate screws round the rim
    for (const a of [12, 105, 195, 285]) {
      const s = screw({ r: 0.46, material: M.blued, slotMat: M.bluedDeep, shank: 0.7 });
      s.position.set(Math.cos(a * D2R) * 12.5, Math.sin(a * D2R) * 12.5, Z.plate + Z.plateT / 2);
      Lplate.add(s);
    }
    anchor('Mainplate', ...polar(12.4, 250 * D2R), Z.plate + Z.plateT / 2, 1);
  }

  // ============================================================ going train
  const train = {};

  /** Build one wheel + pinion + arbor assembly and register it. */
  function assembly(name, p, parts) {
    const g = new THREE.Group();
    g.position.set(p.x, p.y, 0);
    for (const part of parts) g.add(part);
    Ltrain.add(g);
    train[name] = g;
    return g;
  }

  // --- barrel -------------------------------------------------------------
  {
    const g = new THREE.Group();
    g.position.set(POS.barrel.x, POS.barrel.y, 0);

    const teeth = wheel({
      teeth: 80, pitchR: PR.barrel, thickness: 0.70, crossings: 0,
      material: M.brass, boreR: 5.10, hubCollar: false,
    });
    teeth.position.z = Z.barrelTeeth;
    g.add(teeth);

    const rimTop = ring(4.90, 5.60, 0.16, M.brass, 72);
    rimTop.position.z = Z.barrelTop;
    g.add(rimTop);
    const rimBot = ring(4.90, 5.60, 0.16, M.brass, 72);
    rimBot.position.z = Z.barrelBottom;
    g.add(rimBot);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      const p = cylinder(0.26, Z.barrelTop - Z.barrelBottom, M.brass, 12);
      p.position.set(Math.cos(a) * 5.25, Math.sin(a) * 5.25, (Z.barrelTop + Z.barrelBottom) / 2);
      g.add(p);
    }

    // mainspring, coiled inside
    const spring = new Spiral({
      turns: 6.4, rInner: 1.20, rOuter: 4.72, width: 1.05, thickness: 0.10,
      segments: 460, radial: 6, material: M.springSteel, startAngle: 0.5,
    });
    spring.mesh.position.z = Z.barrelTeeth;
    spring.update(0);
    g.add(spring.mesh);

    const core = cylinder(0.95, 1.5, M.steelDark, 20);
    core.position.z = Z.barrelTeeth;
    g.add(core);

    Ltrain.add(g);
    train.barrel = g;
    anchor('Mainspring barrel', ...polar(5.60, 205 * D2R).add(POS.barrel), Z.barrelTeeth);
    anchor('Mainspring', ...polar(3.40, 130 * D2R).add(POS.barrel), Z.barrelTeeth);
  }

  // barrel arbour + ratchet wheel (winds the spring)
  {
    const g = new THREE.Group();
    g.position.set(POS.barrel.x, POS.barrel.y, 0);
    const ar = arbor({ r: 0.55, length: 3.60, material: M.steel, pivotR: 0.22 });
    ar.position.z = -1.50;
    g.add(ar);
    const rw = ratchetWheel(24, PR.ratchet, 0.24, M.steelSatin);
    rw.position.z = Z.ratchet;
    g.add(rw);
    const cap = screw({ r: 0.66, material: M.blued, slotMat: M.bluedDeep, shank: 0.5, headH: 0.2 });
    cap.position.z = Z.ratchet - 0.22;
    g.add(cap);
    Lkeyless.add(g);
    train.ratchet = g;
    anchor('Ratchet wheel', ...polar(2.40, 60 * D2R).add(POS.barrel), Z.ratchet);
  }

  // --- centre wheel -------------------------------------------------------
  {
    const w = wheel({ teeth: 60, pitchR: PR.centre, thickness: 0.18, crossings: 5, material: M.goldWheel, boreR: 0.34 });
    w.position.z = Z.centreWheel;
    const pn = pinion({ leaves: 10, pitchR: PR.centrePinion, height: 0.62, material: M.steel, boreR: 0.16 });
    pn.position.z = Z.centrePinion;
    const ar = arbor({ r: 0.30, length: 3.70, material: M.steel, pivotR: 0.13 });
    ar.position.z = -0.65;
    assembly('centre', POS.centre, [w, pn, ar]);
    anchor('Centre wheel', ...polar(3.30, 15 * D2R), Z.centreWheel);
  }

  // --- third wheel --------------------------------------------------------
  {
    const w = wheel({ teeth: 64, pitchR: PR.third, thickness: 0.16, crossings: 4, material: M.goldWheel, boreR: 0.28 });
    w.position.z = Z.thirdWheel;
    const pn = pinion({ leaves: 8, pitchR: PR.thirdPinion, height: 0.30, material: M.steel, boreR: 0.13 });
    pn.position.z = Z.thirdPinion;
    const ar = arbor({ r: 0.24, length: 2.6, material: M.steel, pivotR: 0.11 });
    ar.position.z = -1.35;
    assembly('third', POS.third, [w, pn, ar]);
    anchor('Third wheel', ...polar(2.80, -35 * D2R).add(POS.third), Z.thirdWheel);
  }

  // --- fourth wheel (small seconds) ---------------------------------------
  {
    const w = wheel({ teeth: 72, pitchR: PR.fourth, thickness: 0.16, crossings: 4, material: M.goldWheel, boreR: 0.26 });
    w.position.z = Z.fourthWheel;
    const pn = pinion({ leaves: 8, pitchR: PR.fourthPinion, height: 0.28, material: M.steel, boreR: 0.12 });
    pn.position.z = Z.fourthPinion;
    const ar = arbor({ r: 0.26, length: 4.80, material: M.steel, pivotR: 0.12 });
    ar.position.z = -0.40;
    assembly('fourth', POS.fourth, [w, pn, ar]);
    anchor('Fourth wheel — seconds', ...polar(2.60, 250 * D2R).add(POS.fourth), Z.fourthWheel);
  }

  // --- escape wheel -------------------------------------------------------
  {
    const w = escapeWheel({ teeth: 15, tipR: PR.escapeTip, thickness: 0.14, material: M.steel, hubR: 0.42, boreR: 0.20 });
    w.position.z = Z.escapeWheel;
    const pn = pinion({ leaves: 6, pitchR: PR.escapePinion, height: 0.26, material: M.steel, boreR: 0.10 });
    pn.position.z = Z.escapePinion;
    const ar = arbor({ r: 0.19, length: 1.90, material: M.steel, pivotR: 0.09 });
    ar.position.z = -1.50;
    assembly('escape', POS.escape, [w, pn, ar]);
    anchor('Escape wheel', ...polar(1.70, 200 * D2R).add(POS.escape), Z.escapeWheel);
  }

  // ============================================================ escapement
  // pallet fork: drawn in a local frame with +X pointing at the escape wheel
  {
    const g = new THREE.Group();
    g.position.set(POS.pallet.x, POS.pallet.y, 0);
    const toEsc = Math.atan2(POS.escape.y - POS.pallet.y, POS.escape.x - POS.pallet.x);
    g.rotation.z = toEsc;

    const SX = 0.836, SY = 0.929;         // pallet stone seats
    const ctrl = [
      v2(SX + 0.16, SY + 0.20), v2(SX - 0.20, SY + 0.30), v2(0.12, 0.54),
      v2(-0.62, 0.44), v2(-1.9, 0.33), v2(-2.86, 0.42), v2(-3.16, 0.40),
      v2(-3.00, 0.13), v2(-2.66, 0.02),
      v2(-3.00, -0.13), v2(-3.16, -0.40), v2(-2.86, -0.42), v2(-1.9, -0.33),
      v2(-0.62, -0.44), v2(0.12, -0.54), v2(SX - 0.20, -SY - 0.30), v2(SX + 0.16, -SY - 0.20),
      v2(SX + 0.30, -SY + 0.22), v2(0.62, -0.46), v2(0.40, 0), v2(0.62, 0.46),
      v2(SX + 0.30, SY - 0.22),
    ];
    const body = extrude(smoothShape(ctrl, 260), 0.22, M.steel, 0.018, 10);
    body.position.z = Z.fork;
    g.add(body);

    const hub = cylinder(0.34, 0.5, M.steel, 18);
    hub.position.z = Z.fork;
    g.add(hub);

    // ruby pallet stones: locking face perpendicular to the escape wheel radius
    for (const sgn of [1, -1]) {
      const sx = SX, sy = SY * sgn;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.50, 0.24), M.ruby);
      const rad = Math.atan2(sy - 0, sx - 2.55);
      st.rotation.z = rad;
      st.position.set(sx, sy, Z.fork);
      g.add(st);
    }
    // guard pin, riding toward the safety roller
    const gp = cylinder(0.07, 0.42, M.steel, 10);
    gp.position.set(-2.62, 0, Z.fork - 0.30);
    g.add(gp);

    const ar = arbor({ r: 0.18, length: 2.20, material: M.steel, pivotR: 0.085 });
    ar.position.z = -1.35;
    g.add(ar);

    Ltrain.add(g);
    train.fork = g;
    train.forkBase = toEsc;
    anchor('Pallet fork', POS.pallet.x, POS.pallet.y, Z.fork);
    anchor('Pallet jewels', ...polar(1.25, -32 * D2R).add(POS.pallet), Z.fork);
  }

  // ============================================================ balance
  {
    const g = new THREE.Group();
    g.position.set(POS.balance.x, POS.balance.y, 0);

    const rimR = 3.50, rimW = 0.46, rimT = 0.50;
    const shape = shapeFrom(circlePoints(rimR, 0, 0, 128));
    shape.holes.push(circlePath(rimR - rimW, 0, 0, 120));
    const rim = extrude(shape, rimT, M.gold, 0.03, 14);
    rim.position.z = Z.balance;
    g.add(rim);

    // two arms
    for (const a of [0, Math.PI]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(rimR - rimW * 0.4, 0.46, 0.34), M.gold);
      arm.position.set(Math.cos(a) * (rimR - rimW) / 2, Math.sin(a) * (rimR - rimW) / 2, Z.balance);
      arm.rotation.z = a;
      g.add(arm);
    }
    const hub = cylinder(0.52, 0.62, M.gold, 22);
    hub.position.z = Z.balance;
    g.add(hub);

    // timing screws round the rim
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + 0.19;
      const s = new THREE.Group();
      const head = cylinder(0.19, 0.24, M.gold, 12);
      head.rotation.y = Math.PI / 2;
      const shank = cylinder(0.10, 0.5, M.gold, 8);
      shank.rotation.y = Math.PI / 2;
      shank.position.x = -0.35;
      s.add(head, shank);
      s.position.set(Math.cos(a) * (rimR + 0.10), Math.sin(a) * (rimR + 0.10), Z.balance);
      s.rotation.z = a;
      g.add(s);
    }

    // roller table + impulse jewel + safety roller
    const roller = cylinder(0.62, 0.17, M.steel, 26);
    roller.position.z = Z.roller;
    g.add(roller);
    const safety = cylinder(0.44, 0.13, M.steel, 22);
    safety.position.z = Z.roller - 0.18;
    g.add(safety);
    const imp = cylinder(0.115, 0.46, M.ruby, 14);
    // the impulse jewel points at the fork when the balance is at rest
    const toFork = Math.atan2(POS.pallet.y - POS.balance.y, POS.pallet.x - POS.balance.x);
    imp.position.set(Math.cos(toFork) * 0.40, Math.sin(toFork) * 0.40, Z.roller);
    g.add(imp);
    train.impulseBase = toFork;

    const staff = arbor({ r: 0.20, length: 3.05, material: M.steel, pivotR: 0.075 });
    staff.position.z = -1.95;
    g.add(staff);

    Lbalance.add(g);
    train.balance = g;
    anchor('Balance wheel', ...polar(3.50, 250 * D2R).add(POS.balance), Z.balance);
    anchor('Roller & impulse jewel', POS.balance.x, POS.balance.y, Z.roller);
  }

  // hairspring: outer end pinned to the stud on the cock, inner end on the staff
  const hairspring = new Spiral({
    turns: 12.5, rInner: 0.42, rOuter: 2.42, width: 0.40, thickness: 0.045,
    segments: 900, radial: 6, material: M.springSteel, startAngle: 1.15,
  });
  hairspring.mesh.position.set(POS.balance.x, POS.balance.y, Z.hairspring);
  Lbalance.add(hairspring.mesh);
  anchor('Hairspring', ...polar(1.90, 60 * D2R).add(POS.balance), Z.hairspring);

  // ============================================================ bridges
  //
  // Skeletonised movements use bars, not plates: a boss over each pivot, a
  // waisted neck between them, and feet screwed down clear of the wheels. Every
  // foot below was placed to miss both the wheel it sits beside and the
  // openings cut in the mainplate — a post is a solid column from the bar down
  // to the plate, so it cannot pass through anything.
  {
    const B = POS.barrel, T = POS.third, F = POS.fourth, E = POS.escape, P = POS.pallet;
    const CW = POS.crownWheel;

    /** bar + posts + screws, from a chain of bosses */
    function bar(nodes, z, t, feet, opts = {}) {
      const shape = smoothShape(chainOutline(nodes, opts.waist ?? 0.60, 7), opts.samples ?? 260);
      const mesh = extrude(shape, t, M.bridge, 0.055, 12);
      mesh.position.z = z;
      mesh.castShadow = true;
      Lbridge.add(mesh);
      for (const f of feet) {
        Lbridge.add(post(f.c.x, f.c.y, z, Z.plate + 0.2, f.r ?? 0.7, M.plate));
        const s = screw({
          r: f.screw ?? 0.46, material: M.blued, slotMat: M.bluedDeep, shank: 0.55,
        });
        s.position.set(f.c.x, f.c.y, z - t / 2);
        s.rotation.x = Math.PI;
        Lbridge.add(s);
      }
      return mesh;
    }

    /** a jewel, optionally in a chaton, set into the underside of a bar */
    function setJewel(p, z, o = {}) {
      if (o.chaton) {
        const ch = chaton({
          rIn: 0.44, rOut: 0.74, h: 0.26, material: M.gold, screwMat: M.steelSatin,
        });
        ch.position.set(p.x, p.y, z);
        ch.rotation.x = Math.PI;
        Lbridge.add(ch);
      }
      const j = jewel({ r: o.r ?? 0.40, h: 0.22, holeR: 0.10, material: M.ruby });
      j.position.set(p.x, p.y, z - 0.02);
      j.rotation.x = Math.PI;
      Lbridge.add(j);
    }

    // --- barrel bar: over the barrel arbour and on to the crown wheel
    const bFoot1 = { c: polar(7.0, 150 * D2R).add(B), r: 0.95, screw: 0.46 };
    const bFoot2 = { c: polar(7.0, -20 * D2R).add(B), r: 0.95, screw: 0.46 };
    bar([
      bFoot1, { c: B, r: 2.25 }, { c: CW, r: 2.35 }, bFoot2,
    ], Z.barrelBridge, Z.barrelBridgeT, [bFoot1, bFoot2], { waist: 0.48 });
    anchor('Barrel bar', ...polar(3.90, 152 * D2R).add(B), Z.barrelBridge);
    train.clickAnchor = polar(4.90, 150 * D2R).add(B);

    // engraved caption, along the arm out to the crown wheel
    const engTex = TEX.engraving(1024, [
      { text: 'SEVENTEEN JEWELS', size: 0.085, y: 0.44 },
      { text: 'ADJUSTED · FIVE POSITIONS', size: 0.052, y: 0.58 },
    ]);
    // the plane is turned to face the caseback, which mirrors its UVs — flip
    // the texture back or the engraving reads in reverse
    engTex.wrapS = THREE.RepeatWrapping;
    engTex.repeat.x = -1;
    engTex.offset.x = 1;
    const engMat = M.engrave.clone();
    engMat.alphaMap = engTex;
    engMat.transparent = true;
    const eng = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), engMat);
    const engAt = B.clone().lerp(bFoot2.c, 0.62);
    eng.position.set(engAt.x, engAt.y, Z.barrelBridge - Z.barrelBridgeT / 2 - 0.012);
    eng.rotation.y = Math.PI;
    eng.rotation.z = -Math.atan2(bFoot2.c.y - B.y, bFoot2.c.x - B.x);
    Lbridge.add(eng);

    // --- train bar over third and fourth
    const tFoot1 = { c: v2(7.10, -3.90), r: 0.95 };
    const tFoot2 = { c: v2(-2.20, -9.60), r: 0.95 };
    bar([
      tFoot1, { c: T, r: 2.15 }, { c: F, r: 2.30 }, tFoot2,
    ], Z.trainBridge, Z.trainBridgeT, [tFoot1, tFoot2], { waist: 0.68 });
    setJewel(T, Z.trainBridge - Z.trainBridgeT / 2 - 0.03, { chaton: true });
    setJewel(F, Z.trainBridge - Z.trainBridgeT / 2 - 0.03, { chaton: true });
    anchor('Train bar', ...v2(4.60, -3.70), Z.trainBridge);
    anchor('Ruby jewel in chaton', F.x, F.y, Z.trainBridge);

    // --- centre cock: the centre arbour needs an upper bearing too, and its
    // foot has to clear the centre wheel (r 4.0), the barrel (r 6.14) and the
    // balance (r 3.5), which leaves the gap at 130 degrees
    const cFoot = { c: polar(5.20, 130 * D2R), r: 0.88, screw: 0.42 };
    bar([{ c: POS.centre, r: 1.40 }, cFoot], Z.trainBridge, 0.45, [cFoot], { waist: 0.50 });
    setJewel(POS.centre, Z.trainBridge - 0.45 / 2 - 0.03, { chaton: true });
    anchor('Centre cock', ...polar(3.60, 130 * D2R), Z.trainBridge);

    // --- escape cock: small, so the escape wheel stays in plain sight
    const eFoot = { c: polar(3.0, 250 * D2R).add(E), r: 0.58, screw: 0.38 };
    bar([{ c: E, r: 0.92 }, eFoot], Z.palletCock, Z.palletCockT, [eFoot], { waist: 0.68 });
    setJewel(E, Z.palletCock - Z.palletCockT / 2 - 0.02, { r: 0.34 });

    // --- pallet cock, reaching in from the opposite side
    const pFoot = { c: polar(3.0, 210 * D2R).add(P), r: 0.58, screw: 0.38 };
    bar([{ c: P, r: 0.92 }, pFoot], Z.palletCock, Z.palletCockT, [pFoot], { waist: 0.68 });
    setJewel(P, Z.palletCock - Z.palletCockT / 2 - 0.02, { r: 0.34 });
    anchor('Pallet cock', P.x, P.y, Z.palletCock);
  }

  // --- balance cock, regulator index and stud ------------------------------
  {
    const A = POS.balance;
    const foot = v2(A.x - 4.35, A.y - 1.55);
    const cockMesh = extrude(
      smoothShape(chainOutline([{ c: A, r: 2.10 }, { c: foot, r: 1.45 }], 0.52, 7), 220),
      Z.balanceCockT, M.bridge, 0.055, 12);
    cockMesh.position.z = Z.balanceCock;
    cockMesh.castShadow = true;
    cockMesh.userData.isCock = true;     // hidden along with the other bridges
    Lbalance.add(cockMesh);
    Lbalance.add(post(foot.x, foot.y, Z.balanceCock, Z.plate + 0.2, 0.85, M.plate));
    const cs = screw({ r: 0.52, material: M.blued, slotMat: M.bluedDeep, shank: 0.6 });
    cs.position.set(foot.x, foot.y, Z.balanceCock - Z.balanceCockT / 2);
    cs.rotation.x = Math.PI;
    Lbalance.add(cs);

    // cap jewel in a chaton over the balance pivot
    const ch = chaton({ rIn: 0.40, rOut: 0.78, h: 0.26, material: M.gold, screwMat: M.steelSatin });
    ch.position.set(A.x, A.y, Z.balanceCock - Z.balanceCockT / 2 - 0.03);
    ch.rotation.x = Math.PI;
    Lbalance.add(ch);
    const cj = jewel({ r: 0.38, h: 0.2, holeR: 0.09, material: M.ruby });
    cj.position.set(A.x, A.y, Z.balanceCock - Z.balanceCockT / 2 - 0.05);
    cj.rotation.x = Math.PI;
    Lbalance.add(cj);
    anchor('Balance cock', ...A.clone().lerp(foot, 0.55), Z.balanceCock);

    // regulator: an arc riding under the cock with two curb pins
    const regA0 = 0.30, regA1 = 1.55;
    const regPts = [];
    for (let i = 0; i <= 20; i++) regPts.push(polar(2.62, lerp(regA0, regA1, i / 20)));
    for (let i = 20; i >= 0; i--) regPts.push(polar(2.26, lerp(regA0, regA1, i / 20)));
    const reg = extrude(shapeFrom(regPts.map((p) => p.clone().add(A))), 0.16, M.steelSatin, 0.012, 8);
    reg.position.z = Z.hairspring - 0.24;
    Lbalance.add(reg);
    for (const d of [-0.055, 0.055]) {
      const pin = cylinder(0.045, 0.30, M.steel, 8);
      const pp = polar(2.42, regA0 + 0.06).add(A);
      pin.position.set(pp.x + Math.cos(regA0) * d * 3, pp.y + Math.sin(regA0) * d * 3, Z.hairspring);
      Lbalance.add(pin);
    }
    anchor('Regulator index', ...polar(2.44, 0.9).add(A), Z.hairspring - 0.24);

    // hairspring stud, where the outer coil is pinned to the cock
    const stud = cylinder(0.17, 0.55, M.bluedDeep, 12);
    const sp = polar(2.42, 1.15).add(A);
    stud.position.set(sp.x, sp.y, Z.hairspring - 0.1);
    Lbalance.add(stud);
  }

  // ============================================================ keyless works
  {
    const g = Lkeyless;
    const CW = POS.crownWheel, WP = POS.windingPinion;

    const cw = ratchetWheel(30, PR.crownWheel, 0.22, M.steelSatin);
    cw.position.set(0, 0, Z.ratchet);
    const cwg = new THREE.Group();
    cwg.position.set(CW.x, CW.y, 0);
    cwg.add(cw);
    const cscrew = screw({ r: 0.34, material: M.blued, slotMat: M.bluedDeep, shank: 0.4, headH: 0.16 });
    cscrew.position.set(CW.x, CW.y, Z.ratchet - 0.2);
    g.add(cscrew);
    g.add(cwg);
    train.crownWheel = cwg;
    train.crownWheelPivot = CW;
    anchor('Crown wheel', CW.x, CW.y, Z.ratchet);

    // click and its spring, holding the ratchet against the mainspring
    const B = POS.barrel;
    // pivoted 4.9 from the barrel arbour, on the barrel bar's own arm, so the
    // 2.05-long beak lands on the ratchet teeth at r = 2.85 rather than inside
    // them and the click screw has something to bite into
    const clickPivot = train.clickAnchor;
    const cl = extrude(smoothShape([
      v2(0.42, 0.3), v2(0.1, 0.52), v2(-0.3, 0.42), v2(-0.42, 0),
      v2(-0.2, -0.42), v2(0.9, -0.62), v2(1.85, -0.5), v2(2.05, -0.16),
      v2(1.6, 0.02), v2(0.85, 0.12),
    ], 120), 0.22, M.steelSatin, 0.015, 8);
    const clg = new THREE.Group();
    clg.add(cl);
    clg.position.set(clickPivot.x, clickPivot.y, Z.ratchet);
    clg.rotation.z = Math.atan2(B.y - clickPivot.y, B.x - clickPivot.x) - 0.15;
    g.add(clg);
    const clScrew = screw({ r: 0.3, material: M.blued, slotMat: M.bluedDeep, shank: 0.4, headH: 0.14 });
    clScrew.position.set(clickPivot.x, clickPivot.y, Z.ratchet - 0.18);
    g.add(clScrew);
    anchor('Click', ...clickPivot.clone().lerp(B, 0.45), Z.ratchet);

    // click spring: a slim curved blade lying alongside the click, bearing on
    // its tail. It has to follow the click, not sit on the far side of the
    // barrel looking decorative.
    const csA0 = 176 * D2R, csA1 = 132 * D2R;
    const csPts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      csPts.push(polar(5.05 - Math.sin(t * Math.PI) * 0.30, lerp(csA0, csA1, t)).add(B));
    }
    for (let i = 24; i >= 0; i--) {
      const t = i / 24;
      csPts.push(polar(4.88 - Math.sin(t * Math.PI) * 0.30, lerp(csA0, csA1, t)).add(B));
    }
    const cspring = extrude(shapeFrom(csPts), 0.18, M.springSteel, 0.01, 6);
    cspring.position.z = Z.ratchet;
    g.add(cspring);

    // winding stem and crown-side pinion
    const wp = new THREE.Group();
    const wpBody = lathe([
      v2(0.30, -0.75), v2(0.86, -0.75), v2(0.95, -0.42), v2(0.95, 0.2),
      v2(0.62, 0.42), v2(0.30, 0.42),
    ], M.steelSatin, 22);
    wpBody.rotation.y = Math.PI / 2;
    wp.add(wpBody);
    // bevel teeth
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.30), M.steelSatin);
      t.position.set(-0.72, Math.cos(a) * 0.80, Math.sin(a) * 0.80);
      t.rotation.x = -a;
      wp.add(t);
    }
    wp.position.set(WP.x, WP.y, Z.stem);
    g.add(wp);

    const stem = cylinder(0.42, 12.0, M.steel, 18);
    stem.rotation.y = Math.PI / 2;
    stem.position.set(WP.x + 5.8, WP.y, Z.stem);
    g.add(stem);
    train.stem = stem;
    anchor('Winding stem', WP.x + 3.4, WP.y, Z.stem);
  }

  // ============================================================ motion works
  {
    const g = Lmotion;

    // cannon pinion — friction fit on the centre arbour, carries the minute hand
    const cannon = new THREE.Group();
    const tube = cylinder(0.42, 3.5, M.steelDark, 20);
    tube.position.z = 1.0;
    cannon.add(tube);
    const cp = pinion({ leaves: 12, pitchR: PR.cannon, height: 0.36, material: M.steelDark, boreR: 0.3 });
    cp.position.z = 0.78;
    cannon.add(cp);
    cannon.position.set(0, 0, 0);
    g.add(cannon);
    train.cannon = cannon;
    anchor('Cannon pinion', 0, 0, 0.9, 1);

    // minute wheel + pinion
    const mw = new THREE.Group();
    const w = wheel({ teeth: 36, pitchR: PR.minuteWheel, thickness: 0.20, crossings: 4, material: M.brass, boreR: 0.26 });
    w.position.z = Z.minuteWheel;
    const mp = pinion({ leaves: 10, pitchR: PR.minutePinion, height: 0.34, material: M.steelDark, boreR: 0.14 });
    mp.position.z = Z.minutePinion;
    const mstud = cylinder(0.24, 1.8, M.steel, 14);
    mstud.position.z = 0.95;
    mw.add(w, mp, mstud);
    mw.position.set(POS.minuteWheel.x, POS.minuteWheel.y, 0);
    g.add(mw);
    train.minuteWheel = mw;
    anchor('Minute wheel', POS.minuteWheel.x, POS.minuteWheel.y, Z.minuteWheel, 1);

    // hour wheel — a tube around the cannon pinion, carries the hour hand
    const hw = new THREE.Group();
    const hwheel = wheel({ teeth: 40, pitchR: PR.hourWheel, thickness: 0.22, crossings: 4, material: M.brass, boreR: 0.62 });
    hwheel.position.z = Z.hourWheel;
    const htube = ring(0.48, 0.66, 1.5, M.brass, 24);
    htube.position.z = Z.hourWheel + 0.7;
    hw.add(hwheel, htube);
    g.add(hw);
    train.hourWheel = hw;
    anchor('Hour wheel', ...polar(2.60, 150 * D2R), Z.hourWheel, 1);
  }

  // ============================================================ animation
  const state = { t: 0 };

  /**
   * `t` is watch time in seconds and drives the train and the hands.
   * `beatT` drives the escapement. They are the same number at 1x; when the
   * hands are being run fast the escapement keeps its own real-time phase so
   * the balance stays legible, and `stepped` goes false so the escape wheel
   * runs off the train instead of off the beat.
   */
  function update(t, beatT = t, stepped = true) {
    state.t = t;
    const beats = beatT * BEAT_HZ;
    const n = Math.floor(beats);
    const f = beats - n;
    const drop = smoothstep(0, 0.085, f);

    // The train is exact: one turn of the centre wheel per hour, and every
    // other angle follows from a tooth count.
    const centre = -(TAU * t) / 3600;
    const third = -centre * 7.5;
    const barrel = -centre / 8;
    // Escape wheel advances half a tooth per beat. The fourth wheel hangs off
    // it through a 6-leaf pinion, which is why the seconds hand trembles.
    const esc = stepped ? STEP * (n + drop) : centre * 720 * -1;
    const fourth = stepped ? -esc / 12 : centre * 60;

    train.escape.rotation.z = esc % TAU;
    train.fourth.rotation.z = fourth % TAU;
    train.third.rotation.z = third % TAU;
    train.centre.rotation.z = centre % TAU;
    train.barrel.rotation.z = barrel % TAU;
    train.ratchet.rotation.z = barrel % TAU;
    train.crownWheel.rotation.z = (-barrel * (PITCH.ratchet / PITCH.crownWheel)) % TAU;

    // motion works
    train.cannon.rotation.z = centre % TAU;
    train.minuteWheel.rotation.z = (-centre / 3) % TAU;
    train.hourWheel.rotation.z = (centre / 12) % TAU;

    // escapement
    const bal = Math.sin(Math.PI * beats) * AMPLITUDE;
    train.balance.rotation.z = bal;
    hairspring.update(bal * 0.92);
    train.fork.rotation.z = train.forkBase + LOCK * (2 * drop - 1) * (n % 2 ? -1 : 1);

    return { centre, fourth, hour: centre / 12 };
  }

  return {
    group: root, update, anchors, train, hairspring,
    layers: { Lplate, Ltrain, Lbridge, Lbalance, Lkeyless, Lmotion },
    constants: { BEAT_HZ, AMPLITUDE, LOCK },
  };
}
