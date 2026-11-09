// The heroine: model setup (outfit, hair, gear), secondary motion, animation
// blending (full body, lower body + upper body layers) and movement.
import * as THREE from 'three';
import { applyHairSway, applyOutfit, col, v3 } from './shaders.js';

export const OUTFITS = {
  oliva: { label: 'Verde oliva', shirt: '#4a5934', camo: ['#566139', '#2f3a22', '#5b4630', '#1d1f18'], boots: '#1b1714', belt: '#6b5a3a', gloves: '#1e1e1e' },
  negro: { label: 'Fuerzas especiales', shirt: '#1d1f22', camo: ['#3a3d42', '#232528', '#4a4d52', '#111214'], boots: '#111111', belt: '#2b2b2b', gloves: '#151515' },
  desierto: { label: 'Desierto', shirt: '#9c8763', camo: ['#b39b74', '#8a7350', '#cdb892', '#5e4c33'], boots: '#5a4632', belt: '#3e3324', gloves: '#3b3127' },
  urbano: { label: 'Urbano', shirt: '#4b5057', camo: ['#7c838c', '#4a5058', '#a8adb3', '#2a2d31'], boots: '#141414', belt: '#2c2c2c', gloves: '#1a1a1a' },
};
export const HAIR_COLORS = { castano: '#4a2c1b', negro: '#17120f', rubio: '#c9a15e', pelirrojo: '#8a3218' };
export const EYE_COLORS = { avellana: '#8f7a3c', verde: '#4f8a4a', azul: '#4a7fb5', marron: '#5a3520' };

const UPPER = /^(spine_02|spine_03|neck_01|Head|clavicle_|upperarm_|lowerarm_|hand_|index_|middle_|pinky_|ring_|thumb_)/;
function splitClip(clip, upper) {
  const tracks = clip.tracks.filter((t) => UPPER.test(t.name.split('.')[0]) === upper);
  return new THREE.AnimationClip(`${clip.name}${upper ? '#up' : '#low'}`, clip.duration, tracks);
}

const LOCO = [
  { name: 'Idle_Loop', speed: 0 },
  { name: 'Walk_Loop', speed: 1.45 },
  { name: 'Jog_Fwd_Loop', speed: 3.4 },
  { name: 'Sprint_Loop', speed: 5.8 },
];

/** Blends locomotion with upper-body actions (aim, shoot, reload, knife) and full-body one-shots. */
export class Animator {
  constructor(root, clips, { upperClips = [], fullClips = [] } = {}) {
    this.mixer = new THREE.AnimationMixer(root);
    const byName = Object.fromEntries(clips.map((c) => [c.name, c]));
    this.byName = byName;
    this.loco = LOCO.map((l) => {
      const full = this.mixer.clipAction(byName[l.name]);
      const low = this.mixer.clipAction(splitClip(byName[l.name], false));
      for (const a of [full, low]) { a.play(); a.setEffectiveWeight(0); }
      return { ...l, full, low, w: l.speed === 0 ? 1 : 0 };
    });
    this.upper = {};
    for (const name of upperClips) {
      const a = this.mixer.clipAction(splitClip(byName[name], true));
      a.setEffectiveWeight(0);
      this.upper[name] = a;
    }
    this.full = {};
    for (const name of fullClips) {
      const a = this.mixer.clipAction(byName[name]);
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.setEffectiveWeight(0);
      this.full[name] = a;
    }
    this.upperW = 0;
    this.fullW = 0;
    this.upperLoop = null; // e.g. aim pose while the weapon is drawn
    this.upperOnce = null;
    this.fullOnce = null;
  }

  /** Plays an upper-body clip once (shoot, reload, knife, hit). */
  upperShot(name, timeScale = 1) {
    const a = this.upper[name];
    if (!a) return 0;
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = timeScale;
    a.play();
    this.upperOnce = a;
    return a.getClip().duration / timeScale;
  }

  setUpperLoop(name) {
    const a = name ? this.upper[name] : null;
    if (a === this.upperLoop) return;
    if (a) { a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.play(); }
    this.upperLoop = a;
  }

  /** Plays a full-body clip once (roll, search, death). */
  fullShot(name, timeScale = 1, hold = false) {
    const a = this.full[name];
    if (!a) return 0;
    if (this.fullOnce && this.fullOnce !== a) this.fullOnce.setEffectiveWeight(0);
    a.reset();
    a.timeScale = timeScale;
    a.play();
    this.fullOnce = a;
    this.holdFull = hold;
    return a.getClip().duration / timeScale;
  }

  clearFull() {
    this.fullOnce = null;
    this.holdFull = false;
  }

  update(dt, speed) {
    const done = (a) => a && !a.isRunning();
    if (done(this.upperOnce)) this.upperOnce = null;
    if (done(this.fullOnce) && !this.holdFull) this.fullOnce = null;

    // locomotion weights by speed
    let target = [1, 0, 0, 0];
    if (speed > 0.15) {
      if (speed < LOCO[2].speed) {
        const t = THREE.MathUtils.clamp((speed - LOCO[1].speed) / (LOCO[2].speed - LOCO[1].speed), 0, 1);
        target = [0, 1 - t, t, 0];
      } else {
        const t = THREE.MathUtils.clamp((speed - LOCO[2].speed) / (LOCO[3].speed - LOCO[2].speed), 0, 1);
        target = [0, 0, 1 - t, t];
      }
      if (speed < 0.6) target = [1 - speed / 0.6, speed / 0.6, 0, 0];
    }
    const k = 1 - Math.exp(-dt * 10);
    let sum = 0;
    this.loco.forEach((l, i) => { l.w += (target[i] - l.w) * k; sum += l.w; });
    this.loco.forEach((l) => {
      l.w /= sum;
      if (l.speed > 0) {
        const ts = THREE.MathUtils.clamp(speed / l.speed, 0.65, 1.5);
        l.full.timeScale = ts;
        l.low.timeScale = ts;
      }
    });

    const upperActive = this.upperOnce || this.upperLoop;
    this.upperW += ((upperActive ? 1 : 0) - this.upperW) * (1 - Math.exp(-dt * 14));
    this.fullW += ((this.fullOnce ? 1 : 0) - this.fullW) * (1 - Math.exp(-dt * 12));

    for (const l of this.loco) {
      l.full.setEffectiveWeight(l.w * (1 - this.upperW) * (1 - this.fullW));
      l.low.setEffectiveWeight(l.w * this.upperW * (1 - this.fullW));
    }
    for (const a of Object.values(this.upper)) {
      const w = a === (this.upperOnce ?? this.upperLoop) ? this.upperW * (1 - this.fullW) : 0;
      a.setEffectiveWeight(w);
    }
    for (const a of Object.values(this.full)) a.setEffectiveWeight(a === this.fullOnce ? this.fullW : 0);
    this.mixer.update(dt);
  }
}

/** Damped spring in 3D, driven by an acceleration (inertia). */
class Spring {
  constructor(k, c, gain, limit) {
    Object.assign(this, { k, c, gain, limit });
    this.x = new THREE.Vector3();
    this.v = new THREE.Vector3();
  }
  step(dt, accel) {
    const a = new THREE.Vector3().copy(this.x).multiplyScalar(-this.k).addScaledVector(this.v, -this.c).addScaledVector(accel, -this.gain);
    this.v.addScaledVector(a, dt);
    this.x.addScaledVector(this.v, dt);
    if (this.x.length() > this.limit) this.x.setLength(this.limit);
    return this.x;
  }
}

/** Tracks a moving point's acceleration from its positions. */
class Tracker {
  constructor() {
    this.p = null;
    this.v = new THREE.Vector3();
    this.a = new THREE.Vector3();
  }
  update(p, dt) {
    if (!this.p) { this.p = p.clone(); return this.a.set(0, 0, 0); }
    const v = p.clone().sub(this.p).divideScalar(Math.max(dt, 1e-3));
    this.a.copy(v).sub(this.v).divideScalar(Math.max(dt, 1e-3));
    if (this.a.length() > 60) this.a.setLength(60);
    this.v.copy(v);
    this.p.copy(p);
    return this.a;
  }
}

function boxMesh(w, h, d, color, rough = 0.7) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: rough }));
}

export function buildPistol() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#202225', roughness: 0.35, metalness: 0.6 });
  const grip = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.8 });
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.17), metal);
  slide.position.set(0, 0.03, 0.04);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.1, 0.045), grip);
  handle.position.set(0, -0.025, -0.02);
  handle.rotation.x = -0.25;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.04), metal);
  guard.position.set(0, -0.005, 0.03);
  g.add(slide, handle, guard);
  g.userData.muzzle = new THREE.Vector3(0, 0.03, 0.13);
  return g;
}

export function buildKnife() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.17), new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.25, metalness: 0.9 }));
  blade.position.z = 0.1;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.026, 0.1), new THREE.MeshStandardMaterial({ color: '#2a2219', roughness: 0.9 }));
  g.add(blade, handle);
  return g;
}

function findBones(object) {
  const bones = {};
  object.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  return bones;
}

/**
 * Builds the heroine from the loaded assets.
 * Returns { root, bones, animator, setLook, update(dt, ctx) ... }.
 */
export function createHeroine(assets, look) {
  const root = new THREE.Group();
  const model = assets.heroine.scene;
  root.add(model);
  const bones = findBones(model);
  let body = null;
  let eyes = null;
  let brows = null;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = true;
    if (/Superhero/.test(o.name)) body = o;
    else if (/Eyes/.test(o.name)) eyes = o;
    else if (/Eyebrows/.test(o.name)) brows = o;
  });

  // ---- outfit material
  const geo = body.geometry;
  const pos = geo.attributes.position;
  const pick = (filter, score) => {
    let best = null;
    let bestScore = -Infinity;
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      if (!filter(p)) continue;
      const s = score(p);
      if (s > bestScore) { bestScore = s; best = p.clone(); }
    }
    return best;
  };
  const chestL = pick((p) => p.y > 1.16 && p.y < 1.34 && p.x > 0.03 && p.x < 0.17, (p) => p.z);
  const chestR = pick((p) => p.y > 1.16 && p.y < 1.34 && p.x < -0.03 && p.x > -0.17, (p) => p.z);
  const hipsL = pick((p) => p.y > 0.78 && p.y < 0.98 && p.x > 0.03 && p.x < 0.18, (p) => -p.z);
  const hipsR = pick((p) => p.y > 0.78 && p.y < 0.98 && p.x < -0.03 && p.x > -0.18, (p) => -p.z);
  chestL.z -= 0.04; chestR.z -= 0.04; hipsL.z += 0.05; hipsR.z += 0.05;

  const outfitUniforms = {
    uShirt: col('#3d4a2b'), uCamoA: col('#566139'), uCamoB: col('#2f3a22'), uCamoC: col('#5b4630'), uCamoD: col('#1d1f18'),
    uBoots: col('#1b1714'), uBelt: col('#6b5a3a'), uGloves: col('#1e1e1e'), uSkinTint: col('#ffffff'),
    uChestL: { value: chestL }, uChestR: { value: chestR }, uHipsL: { value: hipsL }, uHipsR: { value: hipsR },
    uChestOffL: v3(0, 0, 0), uChestOffR: v3(0, 0, 0), uHipsOffL: v3(0, 0, 0), uHipsOffR: v3(0, 0, 0),
  };
  const bodyMat = body.material.clone();
  bodyMat.side = THREE.FrontSide;
  applyOutfit(bodyMat, outfitUniforms);
  body.material = bodyMat;

  const eyeMat = eyes.material.clone();
  eyeMat.onBeforeCompile = (shader) => {
    shader.uniforms.uIris = eyeUniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uIris;')
      .replace('#include <map_fragment>', `#include <map_fragment>
float sat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
diffuseColor.rgb = mix(diffuseColor.rgb, uIris * dot(diffuseColor.rgb, vec3(0.6)) * 2.2, smoothstep(0.12, 0.3, sat));`);
  };
  const eyeUniform = col('#8f7a3c');
  eyes.material = eyeMat;

  // ---- hair (two styles, re-bound to the body's skeleton)
  const hairUniforms = { uHairOffset: v3(0, 0, 0), uHairTop: { value: 1.62 }, uHairTint: col('#4a2c1b') };
  const browUniforms = { uHairOffset: v3(0, 0, 0), uHairTop: { value: -10 }, uHairTint: hairUniforms.uHairTint };
  const browMat = brows.material.clone();
  applyHairSway(browMat, browUniforms);
  brows.material = browMat;
  const hairs = {};
  for (const [key, gltf] of [['long', assets.hairLong], ['buns', assets.hairBuns]]) {
    let mesh = null;
    gltf.scene.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
    const skeleton = new THREE.Skeleton(mesh.skeleton.bones.map((b) => bones[b.name]), mesh.skeleton.boneInverses);
    mesh.removeFromParent();
    body.parent.add(mesh);
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    mesh.scale.copy(body.scale);
    mesh.bind(skeleton, body.bindMatrix);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    const mat = mesh.material.clone();
    applyHairSway(mat, hairUniforms);
    mesh.material = mat;
    hairs[key] = mesh;
  }

  // ---- gear attached to bones (positions given in bind pose, metres)
  model.updateMatrixWorld(true);
  const attach = (boneName, mesh, x, y, z, rx = 0, ry = 0, rz = 0) => {
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    model.add(mesh);
    mesh.updateMatrixWorld(true);
    bones[boneName].attach(mesh);
    return mesh;
  };
  const holster = new THREE.Group();
  const hb = boxMesh(0.05, 0.17, 0.095, '#1a1a1a', 0.6);
  const grip = boxMesh(0.03, 0.07, 0.045, '#0f0f0f', 0.8);
  grip.position.set(0, 0.11, -0.01);
  grip.rotation.x = -0.2;
  holster.add(hb, grip);
  holster.userData.grip = grip;
  attach('thigh_r', holster, -0.175, 0.79, 0.0);
  const strap = boxMesh(0.12, 0.018, 0.13, '#1a1a1a', 0.7);
  attach('thigh_r', strap, -0.12, 0.74, -0.01);
  attach('pelvis', boxMesh(0.07, 0.075, 0.045, '#4a4130', 0.85), 0.11, 0.985, -0.125);
  attach('pelvis', boxMesh(0.07, 0.075, 0.045, '#4a4130', 0.85), -0.11, 0.985, -0.125);
  const sheath = boxMesh(0.035, 0.16, 0.025, '#2a2219', 0.9);
  attach('pelvis', sheath, 0.165, 0.9, -0.03, 0, 0, 0.12);
  attach('lowerarm_l', boxMesh(0.035, 0.03, 0.04, '#111111', 0.5), 0.585, 1.418, -0.052);

  const pistol = buildPistol();
  const knife = buildKnife();
  pistol.visible = false;
  knife.visible = false;

  const animator = new Animator(model, assets.clips, {
    upperClips: ['Pistol_Aim_Neutral', 'Pistol_Shoot', 'Pistol_Reload', 'Punch_Cross', 'Hit_Chest'],
    fullClips: ['Roll', 'Interact', 'PickUp_Table', 'Death01', 'Hit_Head'],
  });

  // ---- secondary motion
  const springs = {
    chestL: new Spring(170, 9, 0.24, 0.018),
    chestR: new Spring(160, 9.5, 0.24, 0.018),
    hipsL: new Spring(140, 11, 0.16, 0.012),
    hipsR: new Spring(150, 11, 0.16, 0.012),
    hair: new Spring(55, 5.5, 0.9, 0.09),
  };
  const trackers = { chest: new Tracker(), hips: new Tracker(), hair: new Tracker() };
  const tmp = new THREE.Vector3();
  const invQ = new THREE.Quaternion();
  const toLocal = (v) => v.clone().applyQuaternion(invQ);

  function setLook(l) {
    const o = OUTFITS[l.outfit] ?? OUTFITS.oliva;
    outfitUniforms.uShirt.value.set(o.shirt);
    ['uCamoA', 'uCamoB', 'uCamoC', 'uCamoD'].forEach((k, i) => outfitUniforms[k].value.set(o.camo[i]));
    outfitUniforms.uBoots.value.set(o.boots);
    outfitUniforms.uBelt.value.set(o.belt);
    outfitUniforms.uGloves.value.set(o.gloves);
    hairUniforms.uHairTint.value.set(HAIR_COLORS[l.hairColor] ?? HAIR_COLORS.castano);
    eyeUniform.value.set(EYE_COLORS[l.eyes] ?? EYE_COLORS.avellana);
    hairs.long.visible = l.hair !== 'buns';
    hairs.buns.visible = l.hair === 'buns';
  }
  setLook(look);

  let breath = 0;
  function updateSecondary(dt, intensity = 1) {
    breath += dt;
    invQ.copy(root.quaternion).invert();
    const chestA = toLocal(trackers.chest.update(bones.spine_03.getWorldPosition(tmp), dt)).multiplyScalar(intensity);
    const hipsA = toLocal(trackers.hips.update(bones.pelvis.getWorldPosition(tmp), dt)).multiplyScalar(intensity);
    const breathe = new THREE.Vector3(0, 1, 0.6).multiplyScalar(Math.sin(breath * 1.7) * 0.0015);
    outfitUniforms.uChestOffL.value.copy(springs.chestL.step(dt, chestA)).add(breathe);
    outfitUniforms.uChestOffR.value.copy(springs.chestR.step(dt, chestA)).add(breathe);
    outfitUniforms.uHipsOffL.value.copy(springs.hipsL.step(dt, hipsA));
    outfitUniforms.uHipsOffR.value.copy(springs.hipsR.step(dt, hipsA));
    // Hair follows a point behind the head, so turning swings it too.
    const head = bones.Head.getWorldPosition(new THREE.Vector3());
    const behind = new THREE.Vector3(0, 0, -0.25).applyQuaternion(root.quaternion).add(head);
    const hairA = trackers.hair.update(behind, dt);
    const offWorld = springs.hair.step(dt, hairA);
    hairUniforms.uHairOffset.value.copy(toLocal(offWorld));
  }

  return { root, model, bones, body, hairs, pistol, knife, holster, animator, setLook, updateSecondary, outfitUniforms };
}
