// Cielo Roto - Varita del Cielo
// Script principal (@minecraft/server 2.x). Coordina el lanzamiento del hechizo,
// la secuencia del cielo roto y los efectos sobre el mundo.
import { world, system } from "@minecraft/server";
import { T, CAST_SECONDS, HOLE_HEIGHT, COOLDOWN_CATEGORY } from "./timeline.js";

const WAND = "sky:varita_del_cielo";
const BREAKER = "sky:sky_breaker";
const SHARD = "sky:shard";

export const CONFIG = {
  destroyTerrain: true,     // cráter y grietas reales en el suelo
  placeGlassOnLanding: true, // los fragmentos que caen quedan clavados como bloques de vidrio
  craterRadius: 6,
  crackCount: 9,
  crackLength: 26,
  forwardDistance: 14,       // a cuántos bloques delante del jugador se abre el cielo
  cooldownTicks: 45 * 20,
  gazeSign: 1,               // poner -1 si el ojo mira hacia el lado contrario del jugador
  audienceRadius: 150,
};

const TICKS = (s) => Math.max(1, Math.round(s * 20));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function valid(e) {
  try {
    return typeof e.isValid === "function" ? e.isValid() : !!e.isValid;
  } catch {
    return false;
  }
}

function warn(msg) {
  console.warn("[cielo-roto] " + msg);
}

function later(sec, fn) {
  return system.runTimeout(() => {
    try {
      fn();
    } catch (err) {
      warn(String(err));
    }
  }, TICKS(sec));
}

function particle(dim, id, loc) {
  try {
    dim.spawnParticle(id, loc);
  } catch (err) {
    warn(`particula ${id}: ${err}`);
  }
}

function playersNear(dim, center, radius) {
  try {
    return dim.getPlayers({ location: center, maxDistance: radius });
  } catch {
    return [];
  }
}

// Sonido "en la cabeza" de cada jugador cercano (para lo que pasa 80 bloques arriba).
function soundAround(dim, center, radius, id, volume = 1, pitch = 1) {
  for (const p of playersNear(dim, center, radius)) {
    try {
      p.playSound(id, { volume, pitch });
    } catch {}
  }
}

// Sonido posicional (para lo que pasa en el suelo).
function soundLoc(dim, loc, id, volume = 1, pitch = 1) {
  try {
    dim.playSound(id, loc, { volume, pitch });
  } catch {}
}

function shake(dim, center, radius, intensity, seconds) {
  for (const p of playersNear(dim, center, radius)) {
    const d = Math.hypot(p.location.x - center.x, p.location.z - center.z);
    const f = clamp(1.2 - d / radius, 0.25, 1);
    try {
      p.runCommand(`camerashake add @s ${(intensity * f).toFixed(2)} ${seconds.toFixed(2)} positional`);
    } catch {}
  }
}

function title(dim, center, radius, text, subtitle = "") {
  for (const p of playersNear(dim, center, radius)) {
    try {
      p.onScreenDisplay.setTitle(text, { fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 15, subtitle });
    } catch {}
  }
}

function handPos(player) {
  const v = player.getViewDirection();
  const h = player.getHeadLocation();
  const len = Math.hypot(v.x, v.z) || 1;
  const rx = -v.z / len, rz = v.x / len; // vector "derecha"
  return { x: h.x + v.x * 0.7 + rx * 0.35, y: h.y - 0.35 + v.y * 0.7, z: h.z + v.z * 0.7 + rz * 0.35 };
}

function safeBlock(dim, x, y, z) {
  try {
    return dim.getBlock({ x, y, z });
  } catch {
    return undefined;
  }
}

const NATURAL_RE = /^minecraft:(grass_block|dirt|coarse_dirt|rooted_dirt|dirt_with_roots|podzol|mycelium|mud|stone|deepslate|cobblestone|cobbled_deepslate|mossy_cobblestone|gravel|sand|red_sand|sandstone|red_sandstone|clay|hardened_clay|terracotta|andesite|diorite|granite|tuff|calcite|dripstone_block|moss_block|pale_moss_block|snow|snow_layer|powder_snow|ice|packed_ice|netherrack|basalt|blackstone|soul_sand|soul_soil|end_stone|short_grass|tall_grass|tallgrass|fern|large_fern|dandelion|poppy|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|dead_bush|sweet_berry_bush|bamboo|cactus|vine|seagrass|kelp|brown_mushroom|red_mushroom|moss_carpet|pink_petals|wildflowers|leaf_litter|bush|firefly_bush|crying_obsidian|glass)$|_terracotta$|_tulip$|_leaves$|_log$|_ore$|_flower$|_sapling$/;

function isNatural(block) {
  try {
    if (block.isAir) return true;
    if (NATURAL_RE.test(block.typeId)) return true;
    for (const tag of ["dirt", "stone", "grass", "sand", "gravel", "snow", "plant", "log", "leaves"]) {
      if (block.hasTag(tag)) return true;
    }
  } catch {}
  return false;
}

function findGround(dim, x, z, aroundY) {
  try {
    const top = dim.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
    if (top && Math.abs(top.y - aroundY) < 40) return top.y + 1;
  } catch {}
  for (let y = Math.floor(aroundY) + 24; y > Math.floor(aroundY) - 40; y--) {
    const b = safeBlock(dim, Math.floor(x), y, Math.floor(z));
    if (b && !b.isAir && !b.isLiquid) return y + 1;
  }
  return Math.floor(aroundY);
}

// ------------------------------------------------------------ lanzamiento --

const casting = new Set();
const lastUse = new Map();

function onUse(player, item) {
  if (!player || player.typeId !== "minecraft:player") return;
  if (!item || item.typeId !== WAND) return;
  const now = system.currentTick;
  if ((lastUse.get(player.id) ?? -100) > now - 10) return; // evita el doble evento (aire + bloque)
  lastUse.set(player.id, now);
  tryCast(player);
}

world.afterEvents.itemUse.subscribe((ev) => onUse(ev.source, ev.itemStack));
try {
  world.afterEvents.itemUseOn.subscribe((ev) => onUse(ev.source, ev.itemStack));
} catch {}

function tryCast(player) {
  if (casting.has(player.id)) return;
  let cd = 0;
  try {
    cd = player.getItemCooldown(COOLDOWN_CATEGORY);
  } catch {}
  if (cd > 0) {
    try {
      player.onScreenDisplay.setActionBar(`§bLa varita todavía se recarga... §f${Math.ceil(cd / 20)}s`);
    } catch {}
    return;
  }
  startCast(player);
}

function startCast(player) {
  const dim = player.dimension;
  casting.add(player.id);
  try {
    player.startItemCooldown(COOLDOWN_CATEGORY, CONFIG.cooldownTicks);
  } catch (err) {
    warn("cooldown: " + err);
  }
  try {
    player.playAnimation("animation.sky_varita.cast", { blendOutTime: 0.3 });
  } catch (err) {
    warn("playAnimation: " + err);
  }
  try {
    player.playSound("sky.wand_charge", { volume: 1, pitch: 1 });
    player.onScreenDisplay.setActionBar("§b✦ La Varita del Cielo despierta...");
  } catch {}

  // Punto del cielo que se va a romper: delante del jugador, 80 bloques sobre el suelo.
  const view = player.getViewDirection();
  let vx = view.x, vz = view.z;
  const len = Math.hypot(vx, vz);
  if (len < 0.08) {
    const yaw = (player.getRotation().y * Math.PI) / 180;
    vx = -Math.sin(yaw);
    vz = Math.cos(yaw);
  } else {
    vx /= len;
    vz /= len;
  }
  const origin = player.location;
  const tx = Math.floor(origin.x + vx * CONFIG.forwardDistance) + 0.5;
  const tz = Math.floor(origin.z + vz * CONFIG.forwardDistance) + 0.5;
  const groundY = findGround(dim, tx, tz, origin.y);
  const target = { x: tx, y: groundY, z: tz };

  const castTicks = TICKS(CAST_SECONDS);
  let tick = 0;
  const id = system.runInterval(() => {
    if (!valid(player)) {
      system.clearRun(id);
      casting.delete(player.id);
      return;
    }
    const loc = player.location;
    const hand = handPos(player);
    if (tick % 8 === 0) particle(dim, "sky:wand_motes", hand);
    if (tick % 20 === 0) particle(dim, "sky:wand_ring", { x: loc.x, y: loc.y + 0.06, z: loc.z });
    if (tick > castTicks * 0.45 && tick % 3 === 0) particle(dim, "sky:bolt_trail", hand);
    if (tick === Math.floor(castTicks * 0.5)) shake(dim, loc, 10, 0.12, 1.5);
    tick++;
    if (tick >= castTicks) {
      system.clearRun(id);
      try {
        castBurst(player, dim, target);
      } catch (err) {
        warn("castBurst: " + err);
        casting.delete(player.id);
      }
    }
  }, 1);
}

function castBurst(player, dim, target) {
  casting.delete(player.id);
  const hand = handPos(player);
  particle(dim, "sky:flash", hand);
  particle(dim, "sky:wand_burst", hand);
  try {
    player.playSound("sky.wand_cast", { volume: 1, pitch: 1 });
    player.playSound("sky.bolt", { volume: 0.9, pitch: 1 });
  } catch {}
  shake(dim, player.location, 12, 0.3, 0.6);
  try {
    player.camera.fade({ fadeTime: { fadeInTime: 0.05, holdTime: 0.05, fadeOutTime: 0.45 }, fadeColor: { red: 0.6, green: 0.9, blue: 1.0 } });
  } catch {}

  const spawnLoc = { x: target.x, y: target.y + HOLE_HEIGHT, z: target.z };
  let breaker;
  try {
    breaker = dim.spawnEntity(BREAKER, spawnLoc);
    try {
      breaker.setRotation({ x: 0, y: 0 });
    } catch {}
  } catch (err) {
    warn("No se pudo invocar el cielo roto: " + err);
    return;
  }

  // El rayo de la varita viaja hasta el punto del cielo.
  const steps = TICKS(T.bolt_arrive);
  let i = 0;
  const from = { ...hand };
  const bolt = system.runInterval(() => {
    i++;
    const u = Math.min(1, i / steps);
    const e = u * u;
    const pos = {
      x: from.x + (spawnLoc.x - from.x) * e,
      y: from.y + (spawnLoc.y - from.y) * e + Math.sin(u * Math.PI) * 5,
      z: from.z + (spawnLoc.z - from.z) * e,
    };
    particle(dim, "sky:bolt_head", pos);
    particle(dim, "sky:bolt_trail", pos);
    if (i >= steps) system.clearRun(bolt);
  }, 1);

  runSequence(dim, breaker, target, spawnLoc);
}

// --------------------------------------------------------------- secuencia --

function runSequence(dim, breaker, target, hole) {
  const R = CONFIG.audienceRadius;
  const S = (id, vol = 1, pitch = 1) => soundAround(dim, hole, R, id, vol, pitch);
  const SG = (id, vol = 1, pitch = 1) => soundLoc(dim, target, id, vol, pitch);
  const shards = [];
  const above = { x: hole.x, y: hole.y - 1, z: hole.z };

  later(T.bolt_arrive, () => {
    S("sky.glass_creak");
    title(dim, hole, R, "§b¡Mirá hacia arriba!", "§7el cielo se está agrietando");
  });
  later(T.creak2, () => S("sky.glass_creak", 0.8, 0.85));
  later(T.punch, () => {
    S("sky.glass_shatter");
    S("random.glass", 1, 0.7);
    S("sky.rumble", 0.7, 1);
    shake(dim, hole, R, 0.5, 1.2);
    particle(dim, "sky:glass_shards_burst", above);
    particle(dim, "sky:glass_glitter", above);
    spawnShards(dim, hole, 14, shards);
  });
  later(T.punch_bottom, () => S("mob.wither.break_block", 0.5, 0.6));
  later(T.fist_hold_end, () => S("sky.rumble", 0.6, 0.8));
  later(T.eye_enter, () => {
    S("sky.eye_hum");
    particle(dim, "sky:void_motes", above);
  });
  later(T.eye_open, () => S("sky.blink", 1, 0.8));
  later(T.track_start, () => {
    const trk = system.runInterval(() => {
      if (!valid(breaker)) {
        system.clearRun(trk);
        return;
      }
      updateGaze(breaker, dim, hole);
    }, 2);
    later(T.eye_leave - T.track_start + 0.4, () => system.clearRun(trk));
  });
  for (const b of [T.blink1, T.blink2, T.blink3]) later(b, () => S("sky.blink", 0.8, rand(0.9, 1.1)));
  later(T.track_full, () => S("sky.eye_hum", 0.9, 0.95));
  later(T.eye_squint, () => {
    S("sky.blink", 1, 0.6);
    S("sky.rumble", 0.8, 0.7);
  });
  later(T.hole_grow, () => {
    S("sky.glass_shatter", 0.8, 0.9);
    shake(dim, hole, R, 0.3, 0.8);
    particle(dim, "sky:glass_shards_burst", above);
    spawnShards(dim, hole, 8, shards);
  });
  later(T.arm_start, () => {
    S("sky.whoosh");
    S("sky.rumble", 1.0, 0.6);
    title(dim, hole, R, "", "§c§lALGO BAJA DEL CIELO");
  });
  later(T.slam - 0.5, () => particle(dim, "sky:arm_wind", { x: target.x, y: target.y + 20, z: target.z }));
  later(T.slam - 0.12, () => shake(dim, hole, R, 0.4, 0.4));
  later(T.slam, () => slamImpact(dim, target, hole));
  later(T.slam + 0.6, () => SG("sky.crack_ground"));
  later(T.press_end, () => {
    SG("sky.crack_ground", 1, 0.8);
    shake(dim, hole, R, 0.3, 0.8);
  });
  later(T.grab_start + 0.4, () => {
    SG("sky.crack_ground", 1, 0.7);
    SG("random.explode", 0.7, 0.6);
    particle(dim, "sky:debris", { x: target.x, y: target.y + 1, z: target.z });
    particle(dim, "sky:crack_dust", { x: target.x, y: target.y + 1, z: target.z });
  });
  later(T.grab_end + 0.3, () => {
    SG("sky.slam", 0.6, 1.3);
    shake(dim, hole, R, 0.5, 0.6);
    particle(dim, "sky:debris", { x: target.x, y: target.y + 2, z: target.z });
  });
  later(T.lift_start, () => {
    S("sky.whoosh", 1, 0.9);
    let n = 0;
    const total = TICKS(T.lift_end - T.lift_start);
    const trail = system.runInterval(() => {
      const u = Math.min(1, n / total);
      const h = (HOLE_HEIGHT - 2.5) * (1 - u * u); // altura de la mano sobre el suelo
      const y = target.y + (HOLE_HEIGHT - h) ;
      particle(dim, "sky:crack_dust", { x: target.x + rand(-4, 4), y: y - 3, z: target.z + rand(-4, 4) });
      if (n % 4 === 0) particle(dim, "sky:debris", { x: target.x + rand(-2, 2), y: y - 4, z: target.z + rand(-2, 2) });
      n += 2;
      if (n >= total) system.clearRun(trail);
    }, 2);
  });
  later(T.light_on, () => {
    S("sky.seal");
    particle(dim, "sky:seal_glow", above);
  });
  later(T.light_peak, () => particle(dim, "sky:seal_glow", above));
  later(T.heal_start, () => S("sky.glass_creak", 0.6, 1.3));
  later(T.despawn, () => {
    try {
      if (valid(breaker)) breaker.remove();
    } catch {}
  });

  const watcher = system.runInterval(() => watchShards(dim, shards), 3);
  later(T.hole_grow + 14, () => {
    system.clearRun(watcher);
    for (const s of shards) {
      try {
        if (valid(s)) s.remove();
      } catch {}
    }
  });
}

function updateGaze(breaker, dim, hole) {
  const players = playersNear(dim, hole, 140);
  if (!players.length) return;
  let best = null, bd = 1e9;
  for (const p of players) {
    const d = Math.hypot(p.location.x - hole.x, p.location.z - hole.z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  const head = best.getHeadLocation();
  const eyeY = hole.y + 60 / 16;
  const H = Math.max(eyeY - head.y, 5);
  // El modelo de Bedrock mira hacia -Z con yaw 0, así que el espacio del modelo está girado 180°.
  const mx = -(head.x - hole.x) * CONFIG.gazeSign;
  const mz = -(head.z - hole.z) * CONFIG.gazeSign;
  const gx = (Math.atan2(mz, H) * 180) / Math.PI;
  const gz = (Math.atan2(mx, H) * 180) / Math.PI;
  try {
    breaker.setProperty("sky:gaze_x", clamp(gx, -60, 60));
    breaker.setProperty("sky:gaze_z", clamp(gz, -60, 60));
  } catch (err) {
    warn("gaze: " + err);
  }
}

function spawnShards(dim, hole, n, out) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(2, 9);
    const v = Math.floor(Math.random() * 4);
    try {
      const s = dim.spawnEntity(`${SHARD}<sky:v${v}>`, {
        x: hole.x + Math.cos(a) * r,
        y: hole.y - 0.6 - Math.random(),
        z: hole.z + Math.sin(a) * r,
      });
      try {
        s.applyImpulse({ x: Math.cos(a) * rand(0.15, 0.5), y: rand(-0.3, 0.2), z: Math.sin(a) * rand(0.15, 0.5) });
      } catch {}
      out.push(s);
    } catch (err) {
      warn("fragmento: " + err);
    }
  }
}

function watchShards(dim, shards) {
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    if (!valid(s)) {
      shards.splice(i, 1);
      continue;
    }
    let landed = false;
    try {
      landed = s.isOnGround || s.isInWater;
    } catch {}
    if (!landed) continue;
    const loc = s.location;
    particle(dim, "sky:shard_shatter", loc);
    soundLoc(dim, loc, "random.glass", 1, rand(0.8, 1.2));
    if (CONFIG.destroyTerrain && CONFIG.placeGlassOnLanding) {
      const b = safeBlock(dim, Math.floor(loc.x), Math.floor(loc.y), Math.floor(loc.z));
      try {
        if (b && b.isAir) {
          const below = b.below();
          if (below && !below.isAir && !below.isLiquid) b.setType("minecraft:glass");
        }
      } catch {}
    }
    try {
      s.remove();
    } catch {}
    shards.splice(i, 1);
  }
}

// ------------------------------------------------------------------ golpe --

function knock(entity, from, horizontal, vertical) {
  const dx = entity.location.x - from.x;
  const dz = entity.location.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  const f = clamp(1 - d / 40, 0.15, 1);
  try {
    entity.applyKnockback({ x: (dx / d) * horizontal * f, z: (dz / d) * horizontal * f }, vertical * f);
  } catch {
    try {
      entity.applyKnockback(dx / d, dz / d, horizontal * f, vertical * f);
    } catch {}
  }
}

function slamImpact(dim, target, hole) {
  const R = CONFIG.audienceRadius;
  const g = { x: target.x, y: target.y + 0.5, z: target.z };
  particle(dim, "sky:impact_flash", g);
  particle(dim, "sky:dust_ring", g);
  particle(dim, "sky:dust_cloud", g);
  particle(dim, "sky:debris", g);
  later(0.15, () => particle(dim, "sky:dust_cloud", g));
  later(0.4, () => particle(dim, "sky:dust_cloud", { x: g.x, y: g.y + 2, z: g.z }));
  soundLoc(dim, target, "sky.slam", 1.0, 1.0);
  soundLoc(dim, target, "random.explode", 1.0, 0.5);
  soundAround(dim, hole, R, "ambient.weather.thunder", 0.7, 0.6);
  shake(dim, hole, R, 1.0, 2.2);
  for (const p of playersNear(dim, g, 45)) {
    try {
      p.camera.fade({ fadeTime: { fadeInTime: 0.05, holdTime: 0.08, fadeOutTime: 0.5 }, fadeColor: { red: 1, green: 0.95, blue: 0.85 } });
    } catch {}
    knock(p, g, 1.6, 0.6);
  }
  try {
    for (const e of dim.getEntities({ location: g, maxDistance: 16, excludeTypes: ["minecraft:player", BREAKER, SHARD, "minecraft:item"] })) {
      const dx = e.location.x - g.x, dz = e.location.z - g.z;
      const d = Math.hypot(dx, dz) || 1;
      try {
        e.applyImpulse({ x: (dx / d) * 1.3, y: 1.0, z: (dz / d) * 1.3 });
      } catch {}
    }
  } catch {}
  if (CONFIG.destroyTerrain) {
    try {
      system.runJob(terrainJob(dim, target));
    } catch (err) {
      warn("terreno: " + err);
    }
  }
  let n = 0;
  const linger = system.runInterval(() => {
    particle(dim, "sky:dust_linger", { x: g.x + rand(-7, 7), y: g.y + rand(0, 2), z: g.z + rand(-7, 7) });
    if (++n > 50) system.clearRun(linger);
  }, 8);
}

function surfaceY(dim, x, z, gy) {
  for (let y = gy + 6; y >= gy - 8; y--) {
    const b = safeBlock(dim, x, y, z);
    if (!b) return null;
    if (b.isAir || b.isLiquid) continue;
    if (!isNatural(b)) return null; // no tocamos construcciones
    return y;
  }
  return null;
}

function setNatural(dim, x, y, z, type) {
  const b = safeBlock(dim, x, y, z);
  if (b && isNatural(b)) {
    try {
      b.setType(type);
      return true;
    } catch {}
  }
  return false;
}

function carve(dim, x, sy, z, depth) {
  for (let k = 0; k < depth; k++) setNatural(dim, x, sy - k, z, "minecraft:air");
  setNatural(dim, x, sy - depth, z, Math.random() < 0.7 ? "minecraft:deepslate" : "minecraft:cobbled_deepslate");
}

function* terrainJob(dim, target) {
  const cx = Math.floor(target.x), cz = Math.floor(target.z);
  const gy = Math.floor(target.y) - 1;
  const R = CONFIG.craterRadius;
  const dark = ["minecraft:blackstone", "minecraft:cobbled_deepslate", "minecraft:deepslate", "minecraft:basalt", "minecraft:tuff"];
  let ops = 0;
  for (let dx = -R; dx <= R; dx++) {
    for (let dz = -R; dz <= R; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > R + 0.4) continue;
      const sy = surfaceY(dim, cx + dx, cz + dz, gy);
      if (sy === null) continue;
      const depth = Math.max(1, Math.round(Math.sqrt(Math.max(0, R * R - d * d)) * 0.55));
      for (let k = 0; k < depth; k++) setNatural(dim, cx + dx, sy - k, cz + dz, "minecraft:air");
      setNatural(dim, cx + dx, sy - depth, cz + dz, d < 1.6 ? "minecraft:crying_obsidian" : pick(dark));
      if (d > R - 1.3 && Math.random() < 0.35) {
        const lip = safeBlock(dim, cx + dx, sy + 1, cz + dz);
        if (lip && lip.isAir) {
          try {
            lip.setType(pick(dark));
          } catch {}
        }
      }
      if (++ops % 16 === 0) yield;
    }
  }
  // Grietas radiales que avanzan un bloque por tick.
  const cracks = [];
  const base = Math.random() * Math.PI * 2;
  for (let i = 0; i < CONFIG.crackCount; i++) {
    cracks.push({ ang: base + (i * 2 * Math.PI) / CONFIG.crackCount + rand(-0.25, 0.25), r: R + 0.5, len: CONFIG.crackLength * rand(0.6, 1.15), drift: 0, step: 0 });
  }
  let active = true;
  while (active) {
    active = false;
    for (const c of cracks) {
      if (c.r > c.len) continue;
      active = true;
      c.drift = c.drift * 0.85 + rand(-0.18, 0.18);
      c.ang += c.drift;
      c.r += 1;
      const x = Math.round(cx + Math.cos(c.ang) * c.r);
      const z = Math.round(cz + Math.sin(c.ang) * c.r);
      const sy = surfaceY(dim, x, z, gy);
      c.step++;
      if (sy === null) continue;
      const depth = c.r < R + 6 ? 3 : Math.random() < 0.5 ? 2 : 1;
      carve(dim, x, sy, z, depth);
      if (Math.random() < 0.25) carve(dim, x + (Math.random() < 0.5 ? 1 : -1), sy, z, Math.max(1, depth - 1));
      if (c.step % 3 === 0) particle(dim, "sky:crack_dust", { x: x + 0.5, y: sy + 1, z: z + 0.5 });
      if (c.step % 7 === 0) soundLoc(dim, { x, y: sy, z }, "sky.crack_ground", 0.6, rand(0.8, 1.2));
      if (Math.random() < 0.12 && c.r < c.len - 4 && cracks.length < 40) {
        cracks.push({ ang: c.ang + (Math.random() < 0.5 ? 1 : -1) * rand(0.5, 1.0), r: c.r, len: c.r + rand(4, 9), drift: 0, step: 0 });
      }
    }
    yield;
  }
}

// ------------------------------------------------------------------ ayuda --

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const p = ev.player;
  try {
    if (p.getDynamicProperty("sky:hint")) return;
    p.setDynamicProperty("sky:hint", true);
  } catch {}
  later(3, () => {
    try {
      p.sendMessage("§b[Cielo Roto] §fCrafteá la §bVarita del Cielo§f (amatista + vidrio + palos) o usá §7/give @s sky:varita_del_cielo§f. Apuntá al cielo y usala.");
    } catch {}
  });
});

console.warn("[cielo-roto] script cargado");
