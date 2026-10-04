// Part annotations. Anchors are given in the watch's own coordinates, so they
// follow the watch when it is turned over or exploded; each label is a chip
// pushed outward from the centre of the watch on screen with a leader line
// back to the part.
import * as THREE from 'three';

export function createLabels(container, anchors, watchRoot) {
  const layer = document.createElement('div');
  layer.className = 'labels';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'leaders');
  layer.appendChild(svg);
  container.appendChild(layer);

  const items = anchors.map((a) => {
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = a.label;
    layer.appendChild(el);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('class', 'leader');
    svg.appendChild(line);
    return { ...a, el, line, world: new THREE.Vector3(), screen: new THREE.Vector3() };
  });

  let enabled = false;
  const centre = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const zAxis = new THREE.Vector3();

  function setEnabled(v) {
    enabled = v;
    layer.style.display = v ? 'block' : 'none';
  }

  function update(camera, w, h) {
    if (!enabled) return;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    centre.setFromMatrixPosition(watchRoot.matrixWorld);
    const centreS = centre.clone().project(camera);
    const cx = (centreS.x * 0.5 + 0.5) * w;
    const cy = (-centreS.y * 0.5 + 0.5) * h;

    // which face of the watch is toward the camera?
    zAxis.set(0, 0, 1).transformDirection(watchRoot.matrixWorld);
    camDir.copy(camera.position).sub(centre).normalize();
    const facing = zAxis.dot(camDir);

    for (const it of items) {
      it.world.copy(it.pos).applyMatrix4(watchRoot.matrixWorld);
      it.screen.copy(it.world).project(camera);
      const x = (it.screen.x * 0.5 + 0.5) * w;
      const y = (-it.screen.y * 0.5 + 0.5) * h;
      const wrongSide = it.side > 0 ? facing < 0.12 : facing > -0.12;
      const off = it.screen.z > 1 || wrongSide;
      if (off) { it.el.style.opacity = '0'; it.line.setAttribute('d', ''); continue; }

      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const push = Math.min(150, 60 + d * 0.55);
      const lx = x + (dx / d) * push;
      const ly = y + (dy / d) * push;
      it.el.style.opacity = '1';
      it.el.style.transform = `translate(-50%,-50%) translate(${lx}px, ${ly}px)`;
      it.line.setAttribute('d', `M ${x} ${y} L ${lx - (dx / d) * 4} ${ly - (dy / d) * 4}`);
    }
  }

  return { setEnabled, update, get enabled() { return enabled; } };
}
