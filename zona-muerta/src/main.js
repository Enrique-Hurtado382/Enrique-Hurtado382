// Zona Muerta — entry point: loading, title screen, game loop, combat,
// scavenging, crafting, customization and saving.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { createWorld, START } from './world.js';
import { createHeroine, EYE_COLORS, HAIR_COLORS, OUTFITS } from './heroine.js';
import { Zombies } from './zombies.js';
import { Controls, ThirdPersonCamera } from './controls.js';
import { Audio } from './audio.js';
import { Effects } from './fx.js';
import { ITEMS, RECIPES, canCraft, clearSave, craft, describe, loadGame, lootReady, markSearched, newGame, rollLoot, saveGame } from './survival.js';

const $ = (s) => document.querySelector(s);
const native = Capacitor.isNativePlatform();
const QUALITY = {
  baja: { label: 'Baja', ratio: 0.75, shadows: false, mapSize: 512 },
  media: { label: 'Media', ratio: 1.1, shadows: true, mapSize: 1024 },
  alta: { label: 'Alta', ratio: 1.75, shadows: true, mapSize: 2048 },
};

let state = loadGame();
const hasSave = Boolean(state);
state = state ?? newGame();

// ------------------------------------------------------------------ renderer
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);

function applyQuality() {
  const q = QUALITY[state.settings.quality] ?? QUALITY.media;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.ratio));
  renderer.shadowMap.enabled = q.shadows;
  if (world) {
    world.sun.castShadow = q.shadows;
    world.sun.shadow.mapSize.set(q.mapSize, q.mapSize);
    world.sun.shadow.map?.dispose();
    world.sun.shadow.map = null;
  }
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
}
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ loading
const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => {
  $('#load-bar').style.width = `${Math.round((loaded / total) * 100)}%`;
  $('#load-text').textContent = `Cargando… ${loaded}/${total}`;
};
const gltfLoader = new GLTFLoader(manager);
const texLoader = new THREE.TextureLoader(manager);

async function loadAssets() {
  const glb = (name) => gltfLoader.loadAsync(`models/${name}.glb`);
  const [heroine, hairLong, hairBuns, zombieMale, anims] = await Promise.all([glb('heroine'), glb('hair-long'), glb('hair-buns'), glb('zombie-male'), glb('anims')]);
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const pair = (name) => {
    const map = texLoader.load(`textures/${name}_diff.jpg`);
    const normal = texLoader.load(`textures/${name}_nor_gl.jpg`);
    map.colorSpace = THREE.SRGBColorSpace;
    for (const t of [map, normal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; }
    return { map, normal };
  };
  const textures = {
    grass: pair('sparse_grass'), ground: pair('dry_ground_01'), asphalt: pair('asphalt_02'), concrete: pair('concrete_wall_008'),
    plaster: pair('damaged_plaster'), brick: pair('red_brick_03'), shutter: pair('rusted_shutter'), wood: pair('wood_planks'), metal: pair('rusty_metal_02'),
  };
  return { heroine, hairLong, hairBuns, zombieMale, clips: anims.animations, textures };
}

// ------------------------------------------------------------------ game objects
let world;
let her;
let zombies;
let fx;
let camRig;
const audio = new Audio();
const controls = new Controls($('#touch-layer'), [...document.querySelectorAll('[data-btn]')]);
const flashlight = new THREE.SpotLight('#fff1d6', 0, 30, 0.5, 0.5, 1.4);

const player = {
  pos: START.clone(),
  yaw: 0,
  vel: new THREE.Vector3(),
  alive: true,
  sprintOn: false,
  sprinting: false,
  rollT: 0,
  rollDir: new THREE.Vector3(),
  busyT: 0,
  aimT: 0,
  fireCd: 0,
  knifeCd: 0,
  knifeHitT: -1,
  reloadT: 0,
  hurtT: 0,
  staminaWait: 0,
  stepT: 0,
};
let mode = 'loading'; // loading | title | play | paused | bag | look | dead
let playTime = 0;
let lockCheck = 0;
let lockTarget = null;
let saveT = 0;
let heartbeatT = 0;
let nearSpot = null;
let titleT = 0;

function toast(text, ms = 2200) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
}

function haptic(style = ImpactStyle.Medium) {
  if (native) Haptics.impact({ style }).catch(() => {});
  else navigator.vibrate?.(40);
}

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
}

// ------------------------------------------------------------------ setup
async function start() {
  if (native) StatusBar.hide().catch(() => {});
  resize();
  const assets = await loadAssets();
  // Pristine copies for female zombies before the heroine gets her gear.
  const templates = { female: cloneSkinned(assets.heroine.scene), male: assets.zombieMale.scene };
  world = createWorld(scene, assets.textures, { shadows: QUALITY[state.settings.quality]?.shadows ?? true });
  world.state.hour = state.hour;
  her = createHeroine(assets, state.look);
  scene.add(her.root, her.pistol, her.knife);
  her.root.add(flashlight, flashlight.target);
  // soft fill light from the camera so the heroine reads well against the sun
  const fill = new THREE.DirectionalLight('#dfe6ff', 0.55);
  camera.add(fill);
  fill.position.set(0, 0.3, 0);
  fill.target.position.set(0, 0, -1);
  camera.add(fill.target);
  scene.add(camera);
  flashlight.position.set(0.15, 1.35, 0.25);
  flashlight.target.position.set(0, 0.6, 8);
  fx = new Effects(scene);
  camRig = new ThirdPersonCamera(camera, world);
  zombies = new Zombies(scene, assets, templates, world, {
    onKill: (z) => {
      state.kills += 1;
      audio.play('death');
      updateHud();
    },
    onPlayerHit: (dmg, z) => hurtPlayer(dmg, z),
    sound: (name, dist) => audio.play(name, dist),
  });
  applyQuality();
  controls.sensitivity = state.settings.sensitivity;
  audio.setVolume(state.settings.volume);

  if (state.pos) {
    player.pos.set(state.pos[0], 0, state.pos[1]);
    player.yaw = state.pos[2] ?? 0;
  }
  for (const [id, readyIn] of Object.entries(state.loot ?? {})) {
    const spot = world.loot[id];
    if (spot) spot.readyAt = readyIn;
  }
  playTime = state.playTime ?? 0;
  camRig.yaw = player.yaw;

  // compile shaders while the loading screen is up
  her.root.position.copy(player.pos);
  renderer.compile(scene, camera);
  $('#btn-continue').hidden = !hasSave;
  goTitle();
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ screens
function goTitle() {
  mode = 'title';
  $('#hud').hidden = true;
  show('title');
  zombies.list.slice().forEach((z) => zombies.remove(z));
}

function beginPlay() {
  mode = 'play';
  show(null);
  $('#hud').hidden = false;
  controls.reset();
  controls.enabled = true;
  her.root.position.copy(player.pos);
  updateHud();
  audio.unlock();
}

function newGameFromScratch() {
  state = clearSave(state);
  Object.assign(player, { pos: START.clone(), yaw: 0, alive: true, rollT: 0, busyT: 0, aimT: 0 });
  her.animator.clearFull();
  her.setLook(state.look);
  for (const spot of world.loot) spot.readyAt = 0;
  playTime = 0;
  world.state.hour = state.hour;
  camRig.yaw = 0;
  zombies.list.slice().forEach((z) => zombies.remove(z));
  beginPlay();
  toast('Día 1. Busca recursos y sobrevive.');
}

function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  show('pause');
  persist();
}

function openBag() {
  if (mode !== 'play') return;
  mode = 'bag';
  renderBag();
  show('bag');
}

let lookReturn = 'title';
function openLook() {
  lookReturn = mode === 'title' ? 'title' : 'pause';
  mode = 'look';
  renderLook();
  show('look');
}

function renderBag() {
  const items = $('#bag-items');
  items.replaceChildren();
  const entries = Object.entries(state.inv).filter(([, n]) => n > 0);
  if (!entries.length) items.innerHTML = '<li>La mochila está vacía.</li>';
  for (const [key, n] of entries) {
    const item = ITEMS[key];
    const li = document.createElement('li');
    li.innerHTML = `<span>${item.icon}</span><span class="name"></span><span class="n">×${n}</span>`;
    li.querySelector('.name').textContent = item.name;
    if (item.use) {
      const b = document.createElement('button');
      b.className = 'btn small';
      b.textContent = item.verb.toUpperCase();
      b.onclick = () => { useItem(key); renderBag(); };
      li.append(b);
    }
    items.append(li);
  }
  const recipes = $('#bag-recipes');
  recipes.replaceChildren();
  for (const r of RECIPES) {
    const li = document.createElement('li');
    const needs = Object.entries(r.needs).map(([k, n]) => `${ITEMS[k].name} ${state.inv[k] ?? 0}/${n}`).join(' · ');
    const level = r.upgrade ? ` (nivel ${state.upgrades[r.upgrade] ?? 0}/${r.max})` : '';
    li.innerHTML = '<span class="name"><b></b><span class="need"></span></span>';
    li.querySelector('b').textContent = r.name + level;
    li.querySelector('.need').textContent = needs;
    const b = document.createElement('button');
    b.className = 'btn small';
    b.textContent = 'FABRICAR';
    b.disabled = !canCraft(state.inv, r, state.upgrades);
    b.onclick = () => {
      if (craft(state.inv, r, state.upgrades)) {
        audio.play('craft');
        toast(r.upgrade ? 'Cuchillo afilado.' : `Fabricaste: ${r.name}`);
        renderBag();
        updateHud();
      }
    };
    li.append(b);
    recipes.append(li);
  }
}

function useItem(key) {
  const item = ITEMS[key];
  if (!item.use || !state.inv[key]) return;
  if (item.use.health && state.health >= 100 && !item.use.hunger) return toast('Ya tienes la salud al máximo.');
  state.inv[key] -= 1;
  state.health = Math.min(100, state.health + (item.use.health ?? 0));
  state.hunger = Math.min(100, state.hunger + (item.use.hunger ?? 0));
  state.stamina = Math.min(100, state.stamina + (item.use.stamina ?? 0));
  audio.play(item.use.hunger ? 'eat' : 'pickup');
  updateHud();
}

function renderLook() {
  const options = {
    outfit: Object.fromEntries(Object.entries(OUTFITS).map(([k, v]) => [k, v.label])),
    hair: { long: 'Largo suelto', buns: 'Moños' },
    hairColor: { castano: 'Castaño', negro: 'Negro', rubio: 'Rubio', pelirrojo: 'Pelirrojo' },
    eyes: { avellana: 'Avellana', verde: 'Verdes', azul: 'Azules', marron: 'Marrones' },
  };
  for (const box of document.querySelectorAll('[data-look]')) {
    const key = box.dataset.look;
    box.replaceChildren();
    for (const [value, label] of Object.entries(options[key])) {
      const b = document.createElement('button');
      b.className = `chip${state.look[key] === value ? ' on' : ''}`;
      b.textContent = label;
      b.onclick = () => {
        state.look[key] = value;
        her.setLook(state.look);
        saveGame(state);
        renderLook();
      };
      box.append(b);
    }
  }
}

function renderSettings() {
  const q = $('#quality');
  q.replaceChildren();
  for (const [key, v] of Object.entries(QUALITY)) {
    const b = document.createElement('button');
    b.className = `chip${state.settings.quality === key ? ' on' : ''}`;
    b.textContent = v.label;
    b.onclick = () => { state.settings.quality = key; applyQuality(); renderSettings(); saveGame(state); };
    q.append(b);
  }
  $('#sensitivity').value = state.settings.sensitivity;
  $('#volume').value = state.settings.volume;
}
$('#sensitivity').addEventListener('input', (e) => { state.settings.sensitivity = Number(e.target.value); controls.sensitivity = state.settings.sensitivity; });
$('#volume').addEventListener('input', (e) => { state.settings.volume = Number(e.target.value); audio.setVolume(state.settings.volume); });

let settingsReturn = 'title';
const actions = {
  continue: () => { audio.unlock(); beginPlay(); },
  new: () => { audio.unlock(); newGameFromScratch(); },
  look: openLook,
  settings: () => { settingsReturn = mode; mode = 'settings'; renderSettings(); show('settings'); },
  'close-settings': () => {
    saveGame(state);
    mode = settingsReturn;
    show(settingsReturn === 'title' ? 'title' : 'pause');
  },
  'close-look': () => {
    mode = lookReturn === 'title' ? 'title' : 'paused';
    show(lookReturn === 'title' ? 'title' : 'pause');
  },
  resume: () => { mode = 'play'; show(null); controls.reset(); },
  close: () => { mode = 'play'; show(null); controls.reset(); },
  title: () => { persist(); goTitle(); },
  respawn: () => respawn(),
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (b && actions[b.dataset.action]) actions[b.dataset.action]();
});
$('#btn-pause').addEventListener('click', pause);
$('#btn-bag').addEventListener('click', openBag);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') { if (mode === 'play') pause(); else if (mode === 'paused') actions.resume(); else if (mode === 'bag') actions.close(); }
  if ((e.code === 'Tab' || e.code === 'KeyI') && mode === 'play') { e.preventDefault(); openBag(); }
});

// ------------------------------------------------------------------ combat
const _v = new THREE.Vector3();

function aimDirection() {
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  return d;
}

function muzzleWorld() {
  return her.pistol.localToWorld(her.pistol.userData.muzzle.clone());
}

function shoot() {
  if (!player.alive || player.rollT > 0 || player.busyT > 0 || player.reloadT > 0 || player.fireCd > 0) return;
  if (state.clip <= 0) {
    if ((state.inv.ammo ?? 0) > 0) reload();
    else { audio.play('empty'); toast('Sin munición. Usa el cuchillo o fabrica balas.'); }
    return;
  }
  player.fireCd = 0.3;
  player.aimT = 3;
  state.clip -= 1;
  const origin = new THREE.Vector3(player.pos.x, 1.45, player.pos.z);
  const dir = aimDirection();
  const target = zombies.findTarget(origin, dir, 32, Math.cos(THREE.MathUtils.degToRad(24)));
  let hitPoint;
  if (target) {
    player.yaw = Math.atan2(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
    const dist = target.pos.distanceTo(player.pos);
    const head = Math.random() < (camRig.aim > 0.5 ? 0.3 : 0.18) + (dist < 6 ? 0.08 : 0);
    hitPoint = new THREE.Vector3(target.pos.x, head ? 1.62 : 1.25, target.pos.z);
    const killed = zombies.damage(target, head ? 200 : 32 + Math.random() * 10, player.pos);
    fx.burst(hitPoint, 'blood', head ? 22 : 12);
    audio.play(head ? 'headshot' : 'flesh');
    hitmark(head);
    if (head && killed) toast('¡Tiro a la cabeza!', 900);
  } else {
    const far = origin.clone().addScaledVector(dir, 40);
    const t = world.raycast(origin, far);
    hitPoint = origin.clone().lerp(far, t);
    if (t < 1) fx.burst(hitPoint, 'dust', 8);
  }
  her.animator.upperShot('Pistol_Shoot', 1.7);
  placeWeapons();
  her.pistol.updateMatrixWorld(true);
  const muzzle = muzzleWorld();
  fx.muzzle(muzzle);
  fx.tracer(muzzle, hitPoint);
  audio.play('shot');
  camRig.shake = Math.max(camRig.shake, 0.35);
  zombies.alert(player.pos, 34);
  if (state.clip === 0 && (state.inv.ammo ?? 0) > 0) setTimeout(() => reload(), 350);
  updateHud();
}

function reload() {
  if (!player.alive || player.reloadT > 0 || state.clip >= 12 || !(state.inv.ammo > 0) || player.rollT > 0) return;
  player.reloadT = her.animator.upperShot('Pistol_Reload', 1.3);
  player.aimT = Math.max(player.aimT, player.reloadT + 1);
  audio.play('reload');
}

function finishReload() {
  const need = 12 - state.clip;
  const take = Math.min(need, state.inv.ammo ?? 0);
  state.clip += take;
  state.inv.ammo -= take;
  updateHud();
}

function knife() {
  if (!player.alive || player.knifeCd > 0 || player.rollT > 0 || player.busyT > 0) return;
  player.knifeCd = 0.7;
  player.knifeHitT = 0.22;
  her.animator.upperShot('Punch_Cross', 1.3);
  audio.play('knife');
  // face the closest zombie in reach
  const near = zombies.findTarget(new THREE.Vector3(player.pos.x, 1.2, player.pos.z), aimDirection(), 2.6, Math.cos(1.2));
  if (near) player.yaw = Math.atan2(near.pos.x - player.pos.x, near.pos.z - player.pos.z);
}

function knifeHit() {
  const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  let hit = false;
  for (const z of zombies.alive()) {
    _v.copy(z.pos).sub(player.pos);
    const d = _v.length();
    if (d > 2 || _v.normalize().dot(fwd) < 0.35) continue;
    const dmg = 45 + 22 * (state.upgrades.knife ?? 0);
    zombies.damage(z, dmg, player.pos);
    fx.burst(new THREE.Vector3(z.pos.x, 1.3, z.pos.z), 'blood', 14);
    hit = true;
  }
  if (hit) { audio.play('flesh'); hitmark(false); haptic(ImpactStyle.Light); }
}

function roll(moveDir) {
  if (!player.alive || player.rollT > 0 || player.busyT > 0 || state.stamina < 18) return;
  state.stamina -= 18;
  player.staminaWait = 0.8;
  player.rollT = her.animator.fullShot('Roll', 1.35) * 0.9;
  player.rollDir.copy(moveDir.lengthSq() > 0.01 ? moveDir : new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw))).normalize();
  player.yaw = Math.atan2(player.rollDir.x, player.rollDir.z);
  audio.play('roll');
}

function search() {
  if (!nearSpot || player.busyT > 0 || !player.alive) return;
  if (!lootReady(nearSpot, playTime)) return toast('Aquí ya no queda nada. Vuelve más tarde.');
  player.busyT = her.animator.fullShot(nearSpot.type === 'coche' || nearSpot.type === 'caja' ? 'PickUp_Table' : 'Interact', 1.2);
  player.yaw = Math.atan2(nearSpot.pos.x - player.pos.x, nearSpot.pos.z - player.pos.z);
  const spot = nearSpot;
  player.onBusyEnd = () => {
    const found = rollLoot(spot.type);
    for (const [k, n] of Object.entries(found)) state.inv[k] = (state.inv[k] ?? 0) + n;
    markSearched(spot, playTime);
    audio.play('pickup');
    toast(`${spot.label}: ${describe(found)}`, 2800);
    updateHud();
    persist();
  };
}

function hurtPlayer(dmg, z) {
  if (!player.alive || player.rollT > 0) return;
  state.health = Math.max(0, state.health - dmg);
  player.hurtT = 0.6;
  camRig.shake = 0.8;
  audio.play('hurt');
  haptic(ImpactStyle.Heavy);
  if (player.busyT > 0) { player.busyT = 0; player.onBusyEnd = null; her.animator.clearFull(); }
  her.animator.upperShot('Hit_Chest', 1.4);
  _v.copy(player.pos).sub(z.pos).setY(0).normalize();
  player.vel.addScaledVector(_v, 2.5);
  if (state.health <= 0) die();
  updateHud();
}

function die() {
  player.alive = false;
  her.animator.fullShot('Death01', 1, true);
  $('#dead-text').textContent = `Sobreviviste ${state.days} ${state.days === 1 ? 'día' : 'días'} y acabaste con ${state.kills} zombis.`;
  setTimeout(() => { mode = 'dead'; show('dead'); $('#hud').hidden = true; }, 2600);
}

function respawn() {
  her.animator.clearFull();
  player.alive = true;
  player.pos.copy(START);
  state.health = 60;
  state.hunger = Math.max(state.hunger, 40);
  state.inv.ammo = Math.floor((state.inv.ammo ?? 0) / 2);
  zombies.list.slice().forEach((z) => zombies.remove(z));
  beginPlay();
  toast('Vuelves al puesto militar. Perdiste la mitad de la munición.');
}

function hitmark(head) {
  const el = $('#hitmark');
  el.classList.toggle('head', head);
  el.classList.add('show');
  clearTimeout(hitmark.t);
  hitmark.t = setTimeout(() => el.classList.remove('show'), 160);
}

// ------------------------------------------------------------------ weapons in hand
function placeWeapons() {
  const drawn = player.alive && (player.aimT > 0 || player.reloadT > 0) && player.knifeHitT < -0.25 && player.rollT <= 0;
  const knifeOut = player.knifeHitT > -0.25 && player.knifeCd > 0;
  her.pistol.visible = drawn && !knifeOut;
  her.holster.userData.grip.visible = !her.pistol.visible;
  her.knife.visible = knifeOut;
  const hand = her.bones.hand_r.getWorldPosition(new THREE.Vector3());
  const dir = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  if (her.pistol.visible) {
    const pitch = THREE.MathUtils.clamp(-camRig.pitch * 0.8, -0.6, 0.6);
    dir.y = Math.sin(pitch);
    dir.normalize();
    her.pistol.position.copy(hand).addScaledVector(dir, 0.06);
    her.pistol.position.y += 0.015;
    her.pistol.lookAt(her.pistol.position.clone().add(dir));
  }
  if (her.knife.visible) {
    her.knife.position.copy(hand).addScaledVector(dir, 0.04);
    her.knife.lookAt(her.knife.position.clone().add(dir));
  }
}

// ------------------------------------------------------------------ HUD
function updateHud() {
  $('#bar-health').style.width = `${state.health}%`;
  $('#bar-hunger').style.width = `${state.hunger}%`;
  $('#bar-stamina').style.width = `${state.stamina}%`;
  $('#ammo-clip').textContent = state.clip;
  $('#ammo-total').textContent = `/ ${state.inv.ammo ?? 0}`;
  const h = Math.floor(world.state.hour);
  const m = Math.floor((world.state.hour % 1) * 60);
  $('#clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${world.state.night ? ' 🌙' : ''}`;
  $('#day').textContent = `DÍA ${state.days}`;
  $('#kills').textContent = `☠ ${state.kills}`;
  $('#btn-sprint').classList.toggle('on', player.sprintOn);
  $('#vignette').style.opacity = String(Math.max(player.hurtT * 1.2, state.health < 30 ? 0.35 + Math.sin(performance.now() / 300) * 0.1 : 0));
}

function persist() {
  state.pos = [player.pos.x, player.pos.z, player.yaw];
  state.hour = world.state.hour;
  state.playTime = playTime;
  state.loot = Object.fromEntries(world.loot.filter((s) => s.readyAt > playTime).map((s) => [s.id, s.readyAt]));
  saveGame(state);
}

// ------------------------------------------------------------------ loop
const clock = new THREE.Timer();

function updatePlay(dt) {
  playTime += dt;
  const prevHour = world.state.hour;

  // camera look
  camRig.applyLook(controls.consumeLook());

  // movement input relative to the camera
  const mv = controls.moveVector();
  const f = new THREE.Vector3(Math.sin(camRig.yaw), 0, Math.cos(camRig.yaw));
  const r = new THREE.Vector3(-Math.cos(camRig.yaw), 0, Math.sin(camRig.yaw));
  const moveDir = new THREE.Vector3().addScaledVector(r, mv.x).addScaledVector(f, mv.y);
  const mag = mv.len;

  if (controls.take('sprint')) player.sprintOn = !player.sprintOn;
  const shiftHeld = controls.keys.has('ShiftLeft') || controls.keys.has('ShiftRight');
  if (controls.take('fire')) shoot();
  if (controls.take('knife')) knife();
  if (controls.take('reload')) reload();
  if (controls.take('roll')) roll(moveDir);
  if (controls.take('search')) search();
  if (controls.held.has('aim')) player.aimT = Math.max(player.aimT, 0.3);

  // timers
  player.fireCd -= dt;
  player.knifeCd -= dt;
  player.aimT -= dt;
  player.hurtT = Math.max(0, player.hurtT - dt);
  if (player.knifeHitT > 0) {
    player.knifeHitT -= dt;
    if (player.knifeHitT <= 0) knifeHit();
  } else player.knifeHitT -= dt;
  if (player.reloadT > 0) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) finishReload();
  }
  if (player.busyT > 0) {
    player.busyT -= dt;
    if (player.busyT <= 0) { player.onBusyEnd?.(); player.onBusyEnd = null; }
  }

  // speed
  const aiming = player.aimT > 0;
  let speed = 0;
  if (player.alive && player.busyT <= 0 && mag > 0.08) {
    speed = mag < 0.6 ? 1.6 * (mag / 0.6) : 3.6;
    player.sprinting = (player.sprintOn || shiftHeld) && mag > 0.5 && state.stamina > 1 && !aiming;
    if (player.sprinting) speed = 6.1;
    if (aiming) speed = Math.min(speed, 2.4);
  } else {
    player.sprinting = false;
    if (mag < 0.08) player.sprintOn = false;
  }
  if (player.sprinting) {
    state.stamina = Math.max(0, state.stamina - dt * 14);
    player.staminaWait = 1;
    if (state.stamina <= 0) player.sprintOn = false;
  } else {
    player.staminaWait -= dt;
    if (player.staminaWait <= 0) state.stamina = Math.min(100, state.stamina + dt * 20);
  }

  const desired = moveDir.lengthSq() > 0 ? moveDir.clone().normalize().multiplyScalar(speed) : new THREE.Vector3();
  if (player.rollT > 0) {
    player.rollT -= dt;
    desired.copy(player.rollDir).multiplyScalar(5.2);
  }
  player.vel.lerp(desired, 1 - Math.exp(-dt * (player.rollT > 0 ? 20 : 11)));
  if (!player.alive) player.vel.multiplyScalar(0.8);
  player.pos.addScaledVector(player.vel, dt);
  world.collide(player.pos, 0.32);

  // facing
  if (player.alive && player.busyT <= 0) {
    let targetYaw = null;
    if (aiming && player.rollT <= 0) targetYaw = camRig.yaw;
    else if (player.vel.lengthSq() > 0.2) targetYaw = Math.atan2(player.vel.x, player.vel.z);
    if (targetYaw !== null) {
      const diff = Math.atan2(Math.sin(targetYaw - player.yaw), Math.cos(targetYaw - player.yaw));
      player.yaw += diff * Math.min(1, dt * (aiming ? 18 : 10));
    }
  }

  const groundSpeed = Math.hypot(player.vel.x, player.vel.z);
  her.root.position.copy(player.pos);
  her.root.rotation.y = player.yaw;
  her.animator.setUpperLoop(player.alive && aiming && player.rollT <= 0 ? 'Pistol_Aim_Neutral' : null);
  her.animator.update(dt, player.rollT > 0 || player.busyT > 0 ? 0 : groundSpeed);
  her.updateSecondary(dt);
  placeWeapons();

  // footsteps
  player.stepT -= dt * groundSpeed;
  if (player.stepT <= 0 && groundSpeed > 0.5) { player.stepT = 1.25; audio.play('step'); }

  // survival stats
  state.hunger = Math.max(0, state.hunger - dt * 0.1);
  if (state.hunger <= 0) state.health = Math.max(0, state.health - dt * 0.6);
  else if (state.hunger > 60 && player.alive && state.health < 100 && player.hurtT <= 0) state.health = Math.min(100, state.health + dt * 0.12);
  if (state.health <= 0 && player.alive) die();
  if (state.health < 30 && player.alive) {
    heartbeatT -= dt;
    if (heartbeatT <= 0) { heartbeatT = 1.1; audio.play('heartbeat'); }
  }

  // world, zombies, effects
  world.update(dt, player.pos);
  if (world.state.hour < prevHour) {
    state.days += 1;
    toast(`Día ${state.days}`);
  }
  if (!world.state.night && prevHour < 19 && world.state.hour >= 19) toast('Anochece. Los zombis son más rápidos de noche.');
  flashlight.intensity = world.state.night ? 45 : 0;
  zombies.update(dt, player, { camDir: aimDirection(), night: world.state.night, playerAlive: player.alive });
  fx.update(dt);

  // aim lock indicator and nearby loot
  lockCheck -= dt;
  if (lockCheck <= 0) {
    lockCheck = 0.15;
    lockTarget = zombies.findTarget(new THREE.Vector3(player.pos.x, 1.45, player.pos.z), aimDirection(), 32, Math.cos(THREE.MathUtils.degToRad(24)));
    $('#crosshair').classList.toggle('lock', Boolean(lockTarget));
    nearSpot = null;
    let best = 2.4;
    for (const s of world.loot) {
      const d = s.pos.distanceTo(player.pos);
      if (d < best) { best = d; nearSpot = s; }
    }
    const btn = $('#btn-search');
    btn.hidden = !nearSpot || !player.alive;
    if (nearSpot) btn.textContent = lootReady(nearSpot, playTime) ? `BUSCAR · ${nearSpot.label.toUpperCase()}` : 'VACÍO';
  }

  camRig.update(dt, player.pos, aiming);
  saveT += dt;
  if (saveT > 20) { saveT = 0; persist(); }
  updateHud();
}

function updateTitle(dt) {
  titleT += dt;
  world.update(dt * 0.2, player.pos);
  her.root.position.copy(player.pos);
  her.root.rotation.y = player.yaw;
  her.animator.setUpperLoop(null);
  her.animator.update(dt, 0);
  her.updateSecondary(dt);
  placeWeapons();
  const close = mode === 'look';
  const a = player.yaw + (window.__zmOrbit ?? Math.sin(titleT * 0.25) * 0.5);
  const dist = close ? 1.45 : 2.15;
  const lookY = close ? 1.2 : 1.0;
  camera.position.set(player.pos.x + Math.sin(a) * dist, close ? 1.45 : 1.3, player.pos.z + Math.cos(a) * dist);
  camera.lookAt(player.pos.x - Math.cos(a) * 0.42, lookY, player.pos.z + Math.sin(a) * 0.42);
  if (window.__zmCam) {
    // test-only portrait camera (used to render the app icon)
    camera.position.set(player.pos.x + window.__zmCam[0], window.__zmCam[1], player.pos.z + window.__zmCam[2]);
    camera.lookAt(player.pos.x, window.__zmCam[3], player.pos.z);
  }
  flashlight.intensity = world.state.night ? 45 : 0;
}

function loop() {
  clock.update();
  const dt = Math.min(0.05, clock.getDelta());
  if (mode === 'play') updatePlay(dt);
  else if (mode === 'title' || mode === 'look' || (mode === 'settings' && settingsReturn === 'title')) updateTitle(dt);
  else if (mode === 'paused' || mode === 'bag' || mode === 'dead' || mode === 'settings') {
    her.animator.update(mode === 'dead' ? dt : 0, 0);
    if (mode === 'dead') zombies.update(dt, player, { camDir: aimDirection(), night: world.state.night, playerAlive: false });
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ app lifecycle
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); audio.suspend(); } else audio.resume();
});
if (native) {
  App.addListener('backButton', () => {
    if (mode === 'play') pause();
    else if (mode === 'paused') actions.resume();
    else if (mode === 'bag') actions.close();
    else if (mode === 'look') actions['close-look']();
    else if (mode === 'settings') actions['close-settings']();
    else if (mode === 'title') App.exitApp();
  });
}
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

start().catch((err) => {
  console.error(err);
  $('#load-text').textContent = `Error al cargar: ${err.message}`;
});

if (new URLSearchParams(location.search).has('test')) {
  window.__zm = { get state() { return state; }, get her() { return her; }, player, get zombies() { return zombies; }, get world() { return world; }, actions, camera: () => camRig, setMode: (m) => (mode = m), shoot, openLook, openBag };
}
