// Scene, lighting, camera choreography and the UI wiring.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

import { buildMaterials } from './materials.js';
import { buildMovement } from './movement.js';
import { buildDial } from './dial.js';
import { buildCase } from './watchcase.js';
import { createLabels } from './labels.js';
import * as TEX from './textures.js';

const LIFT = 5.35;           // watch sits this far above the table
const START_TIME = 10 * 3600 + 9 * 60 + 32;

export function start() {
  const app = document.getElementById('app');

  // ------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // the transmission pass re-renders the scene for every refractive surface;
  // it does not need full resolution to look right through 0.9 mm of sapphire
  if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.6;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = TEX.backdrop('#171c24', '#05070b');
  scene.fog = new THREE.Fog(0x05070b, 175, 460);

  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 900);
  camera.position.set(34, 42, 52);

  // studio environment for the metal — this is what makes polished steel read
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
  scene.environmentIntensity = 0.42;  // RoomEnvironment is a lit box; it is bright

  // ---------------------------------------------------------------- lights
  RectAreaLightUniformsLib.init();

  const key = new THREE.DirectionalLight(0xfff4e2, 1.85);
  key.position.set(30, 62, 34);
  key.castShadow = true;
  key.shadow.camera.near = 30;
  key.shadow.camera.far = 130;
  const s = 27;
  Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.06;
  key.shadow.radius = 2;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xbcd0ff, 0.35);
  fill.position.set(-44, 26, 18);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffe9c8, 0.75);
  rim.position.set(-8, 14, -52);
  scene.add(rim);

  // two soft boxes: these are what draw the long highlights along polished steel
  const soft = new THREE.RectAreaLight(0xffffff, 1.7, 70, 40);
  soft.position.set(6, 58, 22);
  soft.lookAt(0, 4, 0);
  scene.add(soft);

  const sparkle = new THREE.RectAreaLight(0xdfe8ff, 1.1, 16, 60);
  sparkle.position.set(-46, 22, 14);
  sparkle.lookAt(0, 4, 0);
  scene.add(sparkle);

  // ---------------------------------------------------------------- ground
  const M = buildMaterials();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(340, 96), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ------------------------------------------------------------- the watch
  const watchRoot = new THREE.Group();
  watchRoot.position.y = LIFT;
  watchRoot.rotation.x = -Math.PI / 2;      // lay it dial-up on the table
  scene.add(watchRoot);

  const movement = buildMovement(M);
  const dial = buildDial(M);
  const wcase = buildCase(M);
  watchRoot.add(movement.group, dial.group, wcase.group);

  wcase.parts.crystal.userData.explode = 3.6;
  wcase.parts.caseback.userData.explode = -3.4;
  wcase.parts.lugs.userData.explode = 0;

  // remember where everything started, for the exploded view
  const exploders = [];
  watchRoot.traverse((o) => {
    if (o.userData && typeof o.userData.explode === 'number') {
      exploders.push({ o, base: o.position.z, k: o.userData.explode });
    }
  });

  // Everything receives shadow. Without it the movement reads as a flat
  // collage: it is four millimetres of stacked metal, and the shadows between
  // the layers are most of what tells you so. The shadow frustum is tight
  // (54 mm across) so a 2k map still resolves a wheel tooth.
  watchRoot.traverse((c) => {
    if (!c.isMesh) return;
    c.receiveShadow = true;
    // Only parts big enough for their shadow to be visible cast one. Screws,
    // jewels and stitches are ~0.4 mm across; letting all 380 meshes into the
    // shadow pass doubles the draw calls to no visible end.
    c.geometry.computeBoundingSphere();
    c.castShadow = c.geometry.boundingSphere.radius > 0.9;
  });
  wcase.parts.crystal.castShadow = false;
  wcase.parts.caseback.castShadow = false;

  const labels = createLabels(app, movement.anchors, watchRoot);

  // ------------------------------------------------------------- controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.minDistance = 12;
  controls.maxDistance = 240;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.target.set(0, 4, 0);

  // ---------------------------------------------------------- composition
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    type: THREE.HalfFloatType, samples: 4,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // ambient occlusion: the small dark gaps where parts meet
  const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.updateGtaoMaterial({
    radius: 0.7, distanceExponent: 1.6, thickness: 1.2, scale: 1.1,
    samples: 8, screenSpaceRadius: false,
  });
  composer.addPass(gtao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.17, 0.6, 0.90);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setSize(innerWidth, innerHeight);   // re-applies the device pixel ratio

  // ------------------------------------------------------------ view logic
  const V = (localTarget, dir, dist, flip) => ({
    localTarget: new THREE.Vector3(...localTarget),
    dir: new THREE.Vector3(...dir).normalize(), dist, flip,
  });
  const VIEWS = {
    hero: V([0, 0, 0], [0.55, 0.78, 0.86], 76, false),
    dial: V([0, 0, 2], [0.05, 1, 0.14], 48, false),
    profile: V([0, 0, -0.5], [0.10, 0.17, 1], 78, false),
    movement: V([0, 0, -3], [0.05, 1, 0.15], 40, true),
    escapement: V([-4.5, -3.0, -2.2], [0.20, 0.94, 0.30], 20, true),
    barrel: V([3.27, 5.9, -2.6], [0.10, 1, 0.34], 30, true),
  };

  /** where a local point ends up once the watch has finished flipping */
  function localToWorldAt(p, flipped) {
    return flipped
      ? new THREE.Vector3(p.x, -p.z + LIFT, p.y)
      : new THREE.Vector3(p.x, p.z + LIFT, -p.y);
  }

  const anim = {
    from: new THREE.Vector3(), to: new THREE.Vector3(),
    tFrom: new THREE.Vector3(), tTo: new THREE.Vector3(),
    t: 1, dur: 1.15,
    flipFrom: 0, flipTo: 0,
  };
  let flipped = false;

  function goTo(name) {
    const v = VIEWS[name];
    if (!v) return;
    const target = localToWorldAt(v.localTarget, v.flip);
    anim.from.copy(camera.position);
    anim.tFrom.copy(controls.target);
    anim.tTo.copy(target);
    anim.to.copy(target).addScaledVector(v.dir, v.dist);
    anim.flipFrom = flipped ? 1 : 0;
    anim.flipTo = v.flip ? 1 : 0;
    anim.t = 0;
    flipped = v.flip;
    setStrapVisible(show.strap && !v.flip);
  }

  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  // ------------------------------------------------------------------- UI
  const show = { case: true, crystal: true, dial: true, bridges: true, strap: true, labels: false };
  let speed = 1;
  let watchSeconds = START_TIME;
  let beatSeconds = 0;
  let explode = 0;
  let spin = 0;

  const setStrapVisible = (v) => { wcase.parts.strap.visible = v; };

  function applyToggles() {
    wcase.parts.body.visible = show.case;
    wcase.parts.lugs.visible = show.case;
    wcase.parts.crown.visible = show.case;
    wcase.parts.crystal.visible = show.crystal && show.case;
    wcase.parts.caseback.visible = show.crystal && show.case;
    dial.group.visible = show.dial;
    movement.layers.Lbridge.visible = show.bridges;
    movement.layers.Lbalance.children.forEach((c) => {
      // the cock is part of the balance layer; hide it with the bridges
      if (c.userData.isCock) c.visible = show.bridges;
    });
    setStrapVisible(show.strap && !flipped);
    labels.setEnabled(show.labels);
  }

  document.querySelectorAll('[data-view]').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('[data-view]').forEach((o) => o.classList.remove('on'));
      b.classList.add('on');
      goTo(b.dataset.view);
    };
  });
  document.querySelectorAll('[data-speed]').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('[data-speed]').forEach((o) => o.classList.remove('on'));
      b.classList.add('on');
      speed = Number(b.dataset.speed);
    };
  });
  document.querySelectorAll('[data-toggle]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.toggle;
      show[k] = !show[k];
      b.classList.toggle('on', show[k]);
      applyToggles();
    };
  });
  document.getElementById('rewind').onclick = () => { watchSeconds = START_TIME; };
  document.getElementById('explode').oninput = (e) => { explode = e.target.value / 100; };
  document.getElementById('spin').oninput = (e) => { spin = e.target.value / 100; };

  const clockEl = document.getElementById('clock');
  const rateEl = document.getElementById('rate');
  function paintClock() {
    const t = ((watchSeconds % 43200) + 43200) % 43200;
    const h = Math.floor(t / 3600) || 12;
    const m = Math.floor((t % 3600) / 60);
    const sec = Math.floor(t % 60);
    const p = (n) => String(n).padStart(2, '0');
    clockEl.innerHTML = `${p(h)}:${p(m)}<small>:${p(sec)}</small>`;
    rateEl.textContent = speed === 0 ? 'stopped'
      : speed < 1 ? `slow motion · ${speed}×`
        : speed === 1 ? 'running · 1×'
          : `running · ${speed}×  ·  escapement real time`;
  }

  // --------------------------------------------------------------- resize
  let sized = [0, 0];
  function resize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    sized = [w, h];
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
  }
  addEventListener('resize', resize);
  resize();

  // ----------------------------------------------------------------- loop
  const clock = new THREE.Clock();
  const caseMats = [M.caseSteel, M.leather, M.thread];

  applyToggles();
  goTo('hero');
  camera.position.copy(anim.to);       // start where the hero shot is
  controls.target.copy(anim.tTo);
  anim.t = 1;

  // Adaptive quality. dt is real elapsed time, so a vsynced 60 fps reads as
  // 16.7 ms and anything much above that means we are not keeping up. Drop the
  // expensive passes in order rather than running the whole thing at 20 fps.
  const perf = { n: 0, sum: 0, step: 0 };
  function checkPerf(dt) {
    if (perf.step > 1 || dt > 0.25) return;
    perf.sum += dt; perf.n++;
    if (perf.n < 70) return;
    const avg = perf.sum / perf.n;
    perf.sum = 0; perf.n = 0;
    if (avg > 0.030) {
      perf.step++;
      if (perf.step === 1) { gtao.enabled = false; }
      else { renderer.setPixelRatio(1); composer.setSize(innerWidth, innerHeight); }
      console.info(`[watch] ${(avg * 1000).toFixed(0)} ms/frame — reducing quality (step ${perf.step})`);
    } else {
      perf.step = 9;   // fast enough; stop watching
    }
  }

  function frame(forcedDt) {
    const dt = forcedDt ?? Math.min(clock.getDelta(), 0.1);
    if (forcedDt === undefined) checkPerf(dt);
    // a page that starts life in a hidden tab gets a 0x0 viewport and no
    // resize event when it finally has one; notice it here instead
    if (sized[0] !== Math.max(1, innerWidth) || sized[1] !== Math.max(1, innerHeight)) resize();

    if (speed > 0) {
      watchSeconds += dt * speed;
      beatSeconds += dt * Math.min(speed, 1);
    }
    const stepped = speed <= 1;
    const angles = movement.update(watchSeconds, speed <= 1 ? watchSeconds : beatSeconds, stepped);
    dial.setHands(angles);

    // exploded view
    for (const e of exploders) e.o.position.z = e.base + e.k * explode * 5.2;
    const fade = 1 - explode * 0.9;
    for (const m of caseMats) {
      m.transparent = explode > 0.01;
      m.opacity = fade;
      m.depthWrite = explode < 0.5;
    }

    // camera choreography
    if (anim.t < 1) {
      anim.t = Math.min(1, anim.t + dt / anim.dur);
      const k = easeInOut(anim.t);
      camera.position.lerpVectors(anim.from, anim.to, k);
      controls.target.lerpVectors(anim.tFrom, anim.tTo, k);
      watchRoot.rotation.x = -Math.PI / 2 + Math.PI * (anim.flipFrom + (anim.flipTo - anim.flipFrom) * k);
    }

    controls.autoRotate = spin > 0.001;
    controls.autoRotateSpeed = spin * 3.2;
    controls.update();

    composer.render();
    labels.update(camera, innerWidth, innerHeight);
    paintClock();
  }
  // NB: setAnimationLoop hands the callback a timestamp, so it has to be
  // wrapped — passing `frame` directly feeds that timestamp in as the forced
  // delta and the watch runs away by hours per frame.
  renderer.setAnimationLoop(() => frame());

  // fade the boot screen once the first frame is on the glass
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const boot = document.getElementById('boot');
    if (!boot) return;
    boot.style.opacity = '0';
    setTimeout(() => boot.remove(), 750);
  }));

  // handy for poking at it from the console (and for stepping the animation by
  // hand when the tab is throttled and rAF has stopped)
  window.WATCH = {
    scene, camera, renderer, composer, movement, dial, wcase, controls, goTo, frame,
    lights: { key, fill, rim, soft, sparkle },
    settle(n = 90) { for (let i = 0; i < n; i++) frame(1 / 60); },
    set(k, v) { show[k] = v; applyToggles(); },
    explode(v) { explode = v; },
  };
}
