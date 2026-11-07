// Trampa Arcade — app entry point: menus, game loop, saving, ads and purchases.
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { CONFIG } from './config.js';
import { DT, HEIGHT, WIDTH } from './game/constants.js';
import { createWorld, step } from './game/sim.js';
import { UNIVERSES } from './game/universes.js';
import { FONT, drawBackground, drawParticles, drawSay, drawWorld, spawnParticles, updateParticles } from './game/render.js';
import { Sound } from './engine/audio.js';
import { Input } from './engine/input.js';
import { Ads } from './platform/ads.js';
import { Billing } from './platform/billing.js';
import { loadSave, writeSave } from './platform/storage.js';

const $ = (sel) => document.querySelector(sel);
const native = Capacitor.isNativePlatform();
const stage = $('#stage');
const canvas = $('#game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const sound = new Sound();
const ads = new Ads();
const billing = new Billing();
const input = new Input({ movePad: $('#pad-move'), jumpPad: $('#pad-jump'), onPause: () => togglePause() });
const touchDevice = native || matchMedia('(pointer: coarse)').matches;

let save = null;
let bannerHeight = 0;
let currentScreen = 's-title';

const game = {
  mode: 'menu', // menu | play | paused | over
  uIndex: 0,
  lIndex: 0,
  world: null,
  attempt: 1,
  levelDeaths: 0,
  particles: [],
  t: 0,
  acc: 0,
  last: 0,
  menuUniverse: 0,
};

const levelAt = (u, l) => UNIVERSES[u].levels[l];
// The pixel font draws accented capitals oddly, so uppercase labels drop accents (Ñ stays).
const CAPS = { Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U' };
const caps = (text) => text.toUpperCase().replace(/[ÁÉÍÓÚÜ]/g, (ch) => CAPS[ch]);
const deathsText = (n) => `${n} ${n === 1 ? 'muerte' : 'muertes'}`;
const currentLevel = () => levelAt(game.uIndex, game.lIndex);

// ------------------------------------------------------------------ layout

function layout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight - bannerHeight;
  const scale = Math.min(vw / WIDTH, vh / HEIGHT);
  const w = Math.floor(WIDTH * scale);
  const h = Math.floor(HEIGHT * scale);
  Object.assign(stage.style, {
    width: `${w}px`,
    height: `${h}px`,
    left: `${Math.floor((vw - w) / 2)}px`,
    top: `${Math.floor((vh - h) / 2)}px`,
  });
  document.documentElement.style.setProperty('--px', `${scale}px`);
  // Touch pads cover only the floor rows (bottom ~2.6 tiles), never the player.
  const padH = Math.max(52, Math.min(96, Math.round(16 * 2.6 * scale)));
  document.documentElement.style.setProperty('--pad', `${padH}px`);
}
window.addEventListener('resize', layout);
ads.onBannerHeight = (h) => {
  bannerHeight = h;
  layout();
};

function applyTheme(universe) {
  const root = document.documentElement.style;
  root.setProperty('--accent', universe.colors.accent);
  root.setProperty('--edge', universe.colors.edge);
  root.setProperty('--bg', universe.colors.bg);
}

// ------------------------------------------------------------------ helpers

let toastTimer;
function toast(message, ms = 2600) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function vibrate() {
  if (!save.settings.vibration) return;
  if (native) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  else navigator.vibrate?.(60);
}

const MENU_SCREENS = new Set(['s-title', 's-universes', 's-levels', 's-settings', 's-credits']);

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  currentScreen = id;
  const playing = id === null;
  $('#hud').hidden = !playing;
  $('#controls').hidden = !(playing && touchDevice);
  if (MENU_SCREENS.has(id)) ads.showBanner();
  else ads.hideBanner();
  const first = id && $(`#${id} button`);
  if (first && !touchDevice) first.focus({ preventScroll: true });
}

// ------------------------------------------------------------------ progress

const cleared = (id) => Boolean(save.completed[id] || save.skipped[id]);

function isUnlocked(u, l) {
  if (u === 0 && l === 0) return true;
  if (l > 0) return cleared(levelAt(u, l - 1).id);
  const prev = UNIVERSES[u - 1].levels;
  return cleared(prev[prev.length - 1].id);
}

function nextUnclearedLevel() {
  for (let u = 0; u < UNIVERSES.length; u++) {
    for (let l = 0; l < UNIVERSES[u].levels.length; l++) {
      if (!cleared(levelAt(u, l).id)) return [u, l];
    }
  }
  return null;
}

// ------------------------------------------------------------------ menus

function renderTitle() {
  const total = Object.keys(save.completed).length;
  $('#title-deaths').textContent = total ? `NIVELES: ${total}/40 · MUERTES: ${save.deaths}` : '40 NIVELES · 5 UNIVERSOS';
  updateRemoveAdsButton();
}

function updateRemoveAdsButton() {
  const btn = $('#btn-remove-ads');
  btn.hidden = save.adsRemoved;
  btn.querySelector('.price').textContent = billing.price ? `· ${billing.price}` : '';
}

function renderUniverses() {
  const list = $('#universe-list');
  list.replaceChildren();
  UNIVERSES.forEach((u, i) => {
    const unlocked = isUnlocked(i, 0);
    const done = u.levels.filter((l) => cleared(l.id)).length;
    const card = document.createElement('button');
    card.className = `universe${unlocked ? '' : ' locked'}`;
    card.style.borderColor = u.colors.edge;
    card.innerHTML = `<span class="num"></span><span class="name"></span><span class="progress"></span>`;
    card.querySelector('.num').textContent = unlocked ? String(u.id) : '?';
    card.querySelector('.num').style.color = u.colors.accent;
    card.querySelector('.name').textContent = unlocked ? caps(u.name) : 'BLOQUEADO';
    card.querySelector('.progress').textContent = unlocked ? `${done}/${u.levels.length}` : '';
    card.addEventListener('focus', () => (game.menuUniverse = i));
    card.addEventListener('pointerenter', () => (game.menuUniverse = i));
    card.addEventListener('click', () => {
      sound.play('click');
      if (!unlocked) return toast(`Supera el universo ${i} para desbloquearlo.`);
      openLevels(i);
    });
    list.append(card);
  });
}

function openLevels(u) {
  game.menuUniverse = u;
  const universe = UNIVERSES[u];
  applyTheme(universe);
  $('#levels-title').textContent = caps(universe.name);
  const list = $('#level-list');
  list.replaceChildren();
  universe.levels.forEach((level, l) => {
    const unlocked = isUnlocked(u, l);
    const done = save.completed[level.id];
    const skipped = save.skipped[level.id];
    const btn = document.createElement('button');
    btn.className = `level${done ? ' done' : skipped ? ' skipped' : ''}${unlocked ? '' : ' locked'}`;
    btn.innerHTML = '<span class="n"></span><span class="meta"></span>';
    btn.querySelector('.n').textContent = unlocked ? String(l + 1) : '·';
    btn.querySelector('.meta').textContent = done ? deathsText(done.deaths).toUpperCase() : skipped ? 'SALTADO' : unlocked ? caps(level.name).slice(0, 12) : '';
    btn.addEventListener('click', () => {
      sound.play('click');
      if (!unlocked) return toast('Supera el nivel anterior primero.');
      startLevel(u, l);
    });
    list.append(btn);
  });
  show('s-levels');
}

function renderSettings() {
  for (const btn of document.querySelectorAll('[data-setting]')) {
    btn.querySelector('span').textContent = save.settings[btn.dataset.setting] ? 'SI' : 'NO';
  }
  $('[data-action="ad-privacy"]').hidden = !native || save.adsRemoved || !ads.ready;
}

function goToMenu(screen = 's-title') {
  game.mode = 'menu';
  input.reset();
  if (screen === 's-title') renderTitle();
  if (screen === 's-universes') renderUniverses();
  show(screen);
}

// ------------------------------------------------------------------ playing

function startLevel(u, l) {
  game.uIndex = u;
  game.lIndex = l;
  game.menuUniverse = u;
  game.attempt = 1;
  game.levelDeaths = 0;
  game.world = createWorld(currentLevel(), 1);
  game.particles = [];
  game.acc = 0;
  game.mode = 'play';
  input.reset();
  applyTheme(UNIVERSES[u]);
  updateHud();
  show(null);
  if (save.settings.music) sound.playMusic(UNIVERSES[u].music);
}

function restartLevel() {
  game.attempt += 1;
  game.world = createWorld(currentLevel(), game.attempt);
  game.particles = [];
  game.acc = 0;
}

function updateHud() {
  const level = currentLevel();
  $('#hud-level').textContent = `${level.id} ${caps(level.name)}`;
  $('#hud-deaths').textContent = `MUERTES ${game.levelDeaths}`;
  $('#hud-skip').hidden = game.levelDeaths < CONFIG.offerSkipAfterDeaths;
}

function togglePause() {
  if (game.mode === 'play') {
    game.mode = 'paused';
    input.reset();
    const skip = $('#btn-skip');
    skip.disabled = false;
    skip.textContent = save.adsRemoved ? 'SALTAR NIVEL' : 'SALTAR NIVEL ▶ ANUNCIO';
    show('s-pause');
  } else if (game.mode === 'paused') {
    resume();
  }
}

function resume() {
  game.mode = 'play';
  game.acc = 0;
  input.reset();
  show(null);
}

async function skipLevel() {
  const btn = $('#btn-skip');
  if (!save.adsRemoved) {
    if (!ads.canReward) return toast('No hay anuncios disponibles ahora mismo.');
    btn.disabled = true;
    btn.textContent = 'CARGANDO…';
    sound.suspend();
    const rewarded = await ads.showRewarded();
    sound.resume();
    btn.disabled = false;
    btn.textContent = 'SALTAR NIVEL ▶ ANUNCIO';
    if (!rewarded) return toast('No se pudo ver el anuncio. Inténtalo de nuevo.');
  }
  save.skipped[currentLevel().id] = true;
  writeSave(save);
  advance();
}

function handleEvents() {
  const w = game.world;
  const u = UNIVERSES[game.uIndex];
  for (const e of w.events) {
    sound.play(e.type);
    switch (e.type) {
      case 'death':
        game.levelDeaths += 1;
        save.deaths += 1;
        writeSave(save);
        spawnParticles(game.particles, e.x, e.y, u.colors.player, 26, 160, 2);
        spawnParticles(game.particles, e.x, e.y, u.colors.spike, 10, 120, 2);
        vibrate();
        updateHud();
        break;
      case 'win': {
        const p = w.player;
        spawnParticles(game.particles, p.x + p.w / 2, p.y, u.colors.accent, 24, 140, 2);
        break;
      }
      case 'jump': {
        const p = w.player;
        spawnParticles(game.particles, p.x + p.w / 2, p.gravity > 0 ? p.y + p.h : p.y, '#ffffff', 4, 40, 1);
        break;
      }
      case 'poof': {
        const g = w.groups[e.group];
        for (const [c, r] of g.tiles) spawnParticles(game.particles, c * 16 + 8 + g.ox, r * 16 + 8 + g.oy, u.colors.edge, 5, 90, 2);
        break;
      }
      case 'reveal':
        spawnParticles(game.particles, e.c * 16 + 8, e.r * 16 + 8, u.colors.accent, 8, 80, 1);
        break;
      default:
        break;
    }
  }
  w.events.length = 0;
}

function afterStep() {
  const w = game.world;
  if (w.status === 'dead' && w.statusT > 0.75) restartLevel();
  else if (w.status === 'won' && w.statusT > 0.45) levelComplete();
}

async function levelComplete() {
  game.mode = 'over';
  const level = currentLevel();
  const prev = save.completed[level.id];
  if (!prev || game.levelDeaths < prev.deaths) save.completed[level.id] = { deaths: game.levelDeaths };
  save.levelsSinceAd += 1;
  writeSave(save);
  sound.suspend();
  const shown = await ads.maybeInterstitial(save.levelsSinceAd);
  sound.resume();
  if (shown) {
    save.levelsSinceAd = 0;
    writeSave(save);
  }
  advance();
}

function advance() {
  const universe = UNIVERSES[game.uIndex];
  if (game.lIndex < universe.levels.length - 1) {
    startLevel(game.uIndex, game.lIndex + 1);
    return;
  }
  game.mode = 'over';
  const deaths = universe.levels.reduce((sum, l) => sum + (save.completed[l.id]?.deaths ?? 0), 0);
  const last = game.uIndex === UNIVERSES.length - 1;
  $('#done-title').textContent = last ? '¡LO LOGRASTE!' : `¡UNIVERSO ${universe.id} SUPERADO!`;
  $('#done-text').textContent = last
    ? `Superaste las 40 trampas con ${deathsText(save.deaths)}. ¡Gracias por jugar!`
    : `${universe.name}: ${deathsText(deaths)}. Siguiente: ${UNIVERSES[game.uIndex + 1].name}.`;
  $('#btn-next-universe').hidden = last;
  sound.play('unlock');
  show('s-universe-done');
}

// ------------------------------------------------------------------ purchases

async function grantRemoveAds() {
  save.adsRemoved = true;
  writeSave(save);
  await ads.removeAll();
  updateRemoveAdsButton();
  layout();
}

async function buyRemoveAds() {
  sound.play('click');
  if (save.adsRemoved) return toast('Ya no tienes anuncios. ¡Gracias!');
  if (!billing.available) return toast('Las compras no están disponibles en este dispositivo.');
  const result = await billing.buyRemoveAds();
  if (result === 'ok') {
    await grantRemoveAds();
    toast('¡Gracias! Anuncios eliminados y saltos de nivel gratis.');
  } else if (result === 'pending') {
    toast('Pago pendiente: se activará cuando se complete.');
  } else if (result === 'error') {
    toast('No se pudo completar la compra.');
  }
}

async function restorePurchases() {
  sound.play('click');
  if (!native) return toast('Disponible en la app de Android.');
  const owns = await billing.restore();
  if (owns) {
    await grantRemoveAds();
    toast('Compra restaurada: sin anuncios.');
  } else {
    toast('No hay compras que restaurar.');
  }
}

async function openPrivacyPolicy() {
  if (native) await Browser.open({ url: CONFIG.privacyPolicyUrl });
  else window.open('privacidad.html', '_blank');
}

// ------------------------------------------------------------------ actions

const actions = {
  play: () => {
    const next = nextUnclearedLevel();
    if (next) startLevel(...next);
    else goToMenu('s-universes');
  },
  universes: () => goToMenu('s-universes'),
  settings: () => {
    renderSettings();
    show('s-settings');
  },
  credits: () => show('s-credits'),
  back: () => goToMenu('s-title'),
  'remove-ads': buyRemoveAds,
  restore: restorePurchases,
  privacy: openPrivacyPolicy,
  'ad-privacy': async () => {
    if (!(await ads.showPrivacyOptions())) toast('No hay opciones de privacidad que mostrar.');
  },
  resume,
  restart: () => {
    restartLevel();
    resume();
  },
  skip: skipLevel,
  quit: () => {
    game.world = null;
    openLevels(game.uIndex);
    game.mode = 'menu';
  },
  'next-universe': () => startLevel(game.uIndex + 1, 0),
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn && actions[btn.dataset.action]) {
    if (btn.dataset.action !== 'remove-ads' && btn.dataset.action !== 'restore') sound.play('click');
    actions[btn.dataset.action]();
  }
  const setting = e.target.closest('[data-setting]');
  if (setting) {
    const key = setting.dataset.setting;
    save.settings[key] = !save.settings[key];
    writeSave(save);
    sound.setSfx(save.settings.sfx);
    sound.setMusic(save.settings.music);
    if (key === 'music' && save.settings.music) sound.playMusic(UNIVERSES[game.menuUniverse].music);
    sound.play('click');
    renderSettings();
  }
});
$('#hud-pause').addEventListener('click', () => togglePause());
$('#hud-skip').addEventListener('click', () => togglePause());

// The first touch unlocks audio (browsers and WebViews require a gesture).
const unlockAudio = () => {
  sound.unlock();
  if (save?.settings.music) sound.playMusic(UNIVERSES[game.menuUniverse].music);
};
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

// ------------------------------------------------------------------ loop

function drawIntro(level) {
  const age = game.world.time;
  if (game.mode !== 'play' || game.attempt !== 1 || age > 1.8) return;
  const alpha = Math.min(1, (1.8 - age) * 2);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 96, WIDTH, 52);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = UNIVERSES[game.uIndex].colors.accent;
  ctx.fillText(level.id, WIDTH / 2, 112);
  ctx.font = `8px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(caps(level.name), WIDTH / 2, 134);
  ctx.restore();
}

function render() {
  const universe = UNIVERSES[game.world && game.mode !== 'menu' ? game.uIndex : game.menuUniverse];
  drawBackground(ctx, universe, game.t);
  if (!game.world || game.mode === 'menu') return;
  ctx.save();
  if (game.world.shake > 0 && game.mode === 'play') {
    const s = game.world.shake * 14;
    ctx.translate(Math.round((Math.random() - 0.5) * s), Math.round((Math.random() - 0.5) * s));
  }
  drawWorld(ctx, game.world, universe, game.t);
  drawParticles(ctx, game.particles);
  ctx.restore();
  drawSay(ctx, game.world, universe);
  drawIntro(currentLevel());
  if (game.world.status === 'dead') {
    ctx.fillStyle = `rgba(255,40,60,${Math.max(0, 0.35 - game.world.statusT)})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}

function frame(ts) {
  const dt = game.last ? Math.min(0.05, (ts - game.last) / 1000) : 0;
  game.last = ts;
  game.t += dt;
  if (game.mode === 'play') {
    game.acc += dt;
    while (game.acc >= DT && game.mode === 'play') {
      game.acc -= DT;
      step(game.world, input.state());
      handleEvents();
      afterStep();
    }
  }
  game.particles = updateParticles(game.particles, dt);
  render();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ Android

function handleBack() {
  if (game.mode === 'play') return togglePause();
  if (game.mode === 'paused') return resume();
  if (currentScreen === 's-title') return App.exitApp();
  if (currentScreen === 's-levels') return goToMenu('s-universes');
  if (currentScreen === 's-credits') return actions.settings();
  if (currentScreen === 's-universe-done') return actions.quit();
  return goToMenu('s-title');
}

if (native) {
  StatusBar.hide().catch(() => {});
  App.addListener('backButton', handleBack);
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      if (game.mode === 'play') togglePause();
      sound.suspend();
    } else if (!ads.onDismiss) {
      sound.resume();
    }
  });
}

// ------------------------------------------------------------------ start

async function start() {
  save = await loadSave();
  sound.setSfx(save.settings.sfx);
  sound.setMusic(save.settings.music);
  if (save.adsRemoved) ads.removed = true;
  layout();
  await document.fonts?.load(`8px ${FONT}`).catch(() => {});
  const next = nextUnclearedLevel();
  game.menuUniverse = next ? next[0] : 0;
  applyTheme(UNIVERSES[game.menuUniverse]);
  goToMenu('s-title');
  requestAnimationFrame(frame);

  billing.init().then(async (owns) => {
    if (owns && !save.adsRemoved) await grantRemoveAds();
    updateRemoveAdsButton();
  });
  if (!save.adsRemoved) {
    await ads.init();
    if (MENU_SCREENS.has(currentScreen) && game.mode === 'menu') ads.showBanner();
  }
}

start();

// Hook for automated browser tests (only when the page is opened with ?test).
if (new URLSearchParams(location.search).has('test')) window.__trampa = { game, actions, startLevel, step };
