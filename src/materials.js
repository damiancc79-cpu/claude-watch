// Shared materials. Units are millimetres, so bump/normal scales are small and
// texture repeats are expressed as "tiles per millimetre" (ExtrudeGeometry hands
// us UVs straight out of the XY position, which is exactly what we want here).
import * as THREE from 'three';
import * as TEX from './textures.js';

const M = {};

export function buildMaterials() {
  if (M.built) return M;

  const perlage = TEX.perlage(512, 64);
  perlage.repeat.set(1 / 4.4, 1 / 4.4);
  const cotes = TEX.cotesDeGeneve(512, 9);
  cotes.repeat.set(1 / 7.4, 1 / 7.4);
  cotes.center.set(0.5, 0.5);
  cotes.rotation = 0.42;
  const grain = TEX.circularBrush(512);
  const brush = TEX.brushed(512);
  brush.repeat.set(1, 6);

  // --- movement ---
  M.plate = new THREE.MeshPhysicalMaterial({
    color: 0x596069, metalness: 1, roughness: 0.40,
    bumpMap: perlage, bumpScale: 0.7,
    envMapIntensity: 0.85,
  });

  M.bridge = new THREE.MeshPhysicalMaterial({
    color: 0x6a717c, metalness: 1, roughness: 0.30,
    bumpMap: cotes, bumpScale: 1.05,
    envMapIntensity: 0.95,
  });

  M.gold = new THREE.MeshPhysicalMaterial({
    color: 0xd9ae66, metalness: 1, roughness: 0.22,
    envMapIntensity: 1.15,
  });

  M.goldWheel = new THREE.MeshPhysicalMaterial({
    color: 0xd2a353, metalness: 1, roughness: 0.26,
    bumpMap: grain, bumpScale: 0.3,
    envMapIntensity: 1.1,
  });

  M.brass = new THREE.MeshPhysicalMaterial({
    color: 0xc09349, metalness: 1, roughness: 0.32, envMapIntensity: 1.05,
  });

  M.steel = new THREE.MeshPhysicalMaterial({
    color: 0xdfe4ea, metalness: 1, roughness: 0.10, envMapIntensity: 1.2,
  });

  M.steelSatin = new THREE.MeshPhysicalMaterial({
    color: 0xd4dae1, metalness: 1, roughness: 0.27, envMapIntensity: 1.0,
  });

  M.steelDark = new THREE.MeshPhysicalMaterial({
    color: 0x939ba6, metalness: 1, roughness: 0.19, envMapIntensity: 1.1,
  });

  M.blued = new THREE.MeshPhysicalMaterial({
    color: 0x1d3f86, metalness: 1, roughness: 0.13,
    clearcoat: 0.7, clearcoatRoughness: 0.1, envMapIntensity: 1.35,
  });

  M.bluedDeep = new THREE.MeshPhysicalMaterial({
    color: 0x142c63, metalness: 1, roughness: 0.16, envMapIntensity: 1.2,
  });

  M.ruby = new THREE.MeshPhysicalMaterial({
    color: 0xd8102c, metalness: 0, roughness: 0.04,
    transmission: 0.82, thickness: 0.45, ior: 1.77,
    attenuationColor: new THREE.Color(0xff1030), attenuationDistance: 1.4,
    clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5,
  });

  M.springSteel = new THREE.MeshPhysicalMaterial({
    color: 0x878e98, metalness: 1, roughness: 0.17, envMapIntensity: 1.15,
  });

  // --- case & dress ---
  M.caseSteel = new THREE.MeshPhysicalMaterial({
    color: 0xd2d8e0, metalness: 1, roughness: 0.13, envMapIntensity: 0.95,
  });

  M.caseBrushed = new THREE.MeshPhysicalMaterial({
    color: 0xd9dee5, metalness: 1, roughness: 0.30,
    bumpMap: brush, bumpScale: 0.35, envMapIntensity: 1.3,
  });

  // Anti-reflective coated sapphire reflects well under 1% of the light that
  // hits it. At specularIntensity 1 the dome mirrors the softbox and you cannot
  // see the movement at all — which is exactly why real crystals are coated.
  M.sapphire = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.008,
    transmission: 1, thickness: 0.35, ior: 1.77,
    specularIntensity: 0.24, specularColor: new THREE.Color(0x9fc0ff),
    envMapIntensity: 0.32,
    attenuationColor: new THREE.Color(0xeaf2ff), attenuationDistance: 40,
  });

  M.dialRing = new THREE.MeshPhysicalMaterial({
    color: 0xf4f1e8, metalness: 0.25, roughness: 0.38, envMapIntensity: 0.85,
  });

  M.leather = new THREE.MeshPhysicalMaterial({
    color: 0x1c1210, metalness: 0, roughness: 0.66,
    normalMap: TEX.leatherNormal(512), normalScale: new THREE.Vector2(0.9, 0.9),
    sheen: 0.3, sheenRoughness: 0.65, sheenColor: new THREE.Color(0x7a5238),
    envMapIntensity: 0.45,
  });
  M.leather.normalMap.repeat.set(6, 24);

  M.thread = new THREE.MeshStandardMaterial({ color: 0xa8845a, roughness: 0.88, metalness: 0 });

  M.ground = new THREE.MeshPhysicalMaterial({
    color: 0x090c11, metalness: 0.0, roughness: 0.42,
    clearcoat: 0.30, clearcoatRoughness: 0.36, envMapIntensity: 0.20,
  });

  M.engrave = new THREE.MeshBasicMaterial({
    color: 0x2b3138, transparent: true, opacity: 0.85, depthWrite: false,
  });

  M.built = true;
  return M;
}

export const mats = M;
