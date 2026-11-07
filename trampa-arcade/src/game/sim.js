// Game simulation: pure data in, pure data out (no DOM), so levels can be
// verified automatically in Node. Every world is plain JSON-like data that
// can be copied with structuredClone().
import {
  TILE, COLS, ROWS, WIDTH, HEIGHT, DT, T, SPIKE_DIRS,
  PLAYER_W, PLAYER_H, RUN_SPEED, GROUND_ACCEL, GROUND_FRICTION, AIR_ACCEL,
  GRAVITY, MAX_FALL, JUMP_SPEED, JUMP_CUT, SPRING_SPEED, COYOTE_TIME, JUMP_BUFFER,
} from './constants.js';

/*
 * Level map legend (30 columns x 17 rows):
 *   .  empty            #  solid block        P  player start     D  exit (arcade cabinet)
 *   ^ v < >  spikes     x  invisible block    ~  fake block       =  spring
 *   *  saw blade
 *   a-u, w, y, z  solid blocks in a named group (traps can move, drop or hide them)
 *   1-9  spikes in a numbered group (hidden until a trap shows them, unless configured)
 */
const STATIC_TILES = {
  '.': T.EMPTY, P: T.EMPTY, D: T.EMPTY,
  '#': T.SOLID, '^': T.SPIKE_UP, v: T.SPIKE_DOWN, '<': T.SPIKE_LEFT, '>': T.SPIKE_RIGHT,
  x: T.INVISIBLE, '~': T.FAKE, '=': T.SPRING, '*': T.SAW,
};

const ROUND_HAZARDS = new Set(['saw', 'barrel', 'bomb', 'ball']);

export const DOOR_W = 14;
export const DOOR_H = 22;

export function parseLevel(level) {
  const rows = level.map;
  if (rows.length !== ROWS) throw new Error(`Nivel ${level.id}: el mapa debe tener ${ROWS} filas (tiene ${rows.length})`);
  rows.forEach((row, r) => {
    if (row.length !== COLS) throw new Error(`Nivel ${level.id}: la fila ${r} debe tener ${COLS} columnas (tiene ${row.length})`);
  });
  return rows;
}

export function createWorld(level, attempt = 1) {
  const rows = parseLevel(level);
  const grid = new Uint8Array(COLS * ROWS);
  const groups = {};
  let spawn = null;
  let doorTile = null;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = rows[r][c];
      if (ch in STATIC_TILES) {
        grid[r * COLS + c] = STATIC_TILES[ch];
        if (ch === 'P') spawn = { c, r };
        if (ch === 'D') doorTile = { c, r };
      } else if (/[a-z1-9]/.test(ch)) {
        const isSpike = /[1-9]/.test(ch);
        groups[ch] ??= {
          id: ch,
          kind: isSpike ? 'spike' : 'solid',
          dir: T.SPIKE_UP,
          tiles: [],
          ox: 0,
          oy: 0,
          vy: 0,
          visible: !isSpike,
          falling: false,
          gone: false,
          motion: null,
          fake: false,
          deadly: false,
          popT: 0,
          land: false,
        };
        groups[ch].tiles.push([c, r]);
      } else {
        throw new Error(`Nivel ${level.id}: carácter desconocido "${ch}" en fila ${r}, columna ${c}`);
      }
    }
  }
  if (!spawn) throw new Error(`Nivel ${level.id}: falta la P (inicio)`);
  if (!doorTile) throw new Error(`Nivel ${level.id}: falta la D (salida)`);

  for (const [id, cfg] of Object.entries(level.groups ?? {})) {
    const g = groups[id];
    if (!g) throw new Error(`Nivel ${level.id}: el grupo "${id}" no está en el mapa`);
    if (cfg.hidden !== undefined) g.visible = !cfg.hidden;
    if (cfg.dir) g.dir = SPIKE_DIRS[cfg.dir];
    if (cfg.fake) g.fake = true;
    if (cfg.deadly) g.deadly = true;
  }

  const traps = (level.traps ?? []).map((t, i) => ({
    id: t.id ?? String(i),
    when: t.when ?? {},
    do: Array.isArray(t.do) ? t.do : [t.do],
    attempts: t.attempts ?? null,
    fired: false,
    firedAt: -1,
  }));

  return {
    levelId: level.id,
    attempt,
    time: 0,
    frame: 0,
    jumps: 0,
    revealed: 0,
    grid,
    groups,
    player: {
      x: spawn.c * TILE + (TILE - PLAYER_W) / 2,
      y: spawn.r * TILE + TILE - PLAYER_H,
      w: PLAYER_W,
      h: PLAYER_H,
      vx: 0,
      vy: 0,
      gravity: 1,
      reversed: false,
      speedMul: 1,
      onGround: false,
      groundGroup: null,
      coyote: 0,
      jumpBuffer: 0,
      jumpWasDown: false,
      jumping: false,
      facing: 1,
      landT: 0,
    },
    door: {
      ceiling: Boolean(level.doorCeiling),
      x: doorTile.c * TILE + (TILE - DOOR_W) / 2,
      y: level.doorCeiling ? doorTile.r * TILE : doorTile.r * TILE + TILE - DOOR_H,
      w: DOOR_W,
      h: DOOR_H,
      ox: 0,
      oy: 0,
      motion: null,
    },
    traps,
    scheduled: [],
    projectiles: [],
    status: 'playing',
    statusT: 0,
    cause: null,
    say: null,
    shake: 0,
    events: [],
  };
}

// ------------------------------------------------------------------ geometry

export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function tileAt(world, c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return T.EMPTY;
  return world.grid[r * COLS + c];
}

export function doorRect(world) {
  const d = world.door;
  return { x: d.x + d.ox, y: d.y + d.oy, w: d.w, h: d.h };
}

/** Calls fn(rect) for every solid rectangle near `area` (static tiles and visible solid groups). */
function forEachSolid(world, area, fn, exceptGroup = null) {
  const c0 = Math.floor(area.x / TILE) - 1;
  const c1 = Math.floor((area.x + area.w) / TILE) + 1;
  const r0 = Math.floor(area.y / TILE) - 1;
  const r1 = Math.floor((area.y + area.h) / TILE) + 1;
  for (let r = Math.max(0, r0); r <= Math.min(ROWS - 1, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(COLS - 1, c1); c++) {
      const t = world.grid[r * COLS + c];
      if (t === T.SOLID || t === T.SPRING || t === T.INVISIBLE) {
        fn({ x: c * TILE, y: r * TILE, w: TILE, h: TILE, type: t, c, r, group: null });
      }
    }
  }
  for (const g of Object.values(world.groups)) {
    if (g.kind !== 'solid' || !g.visible || g.gone || g.fake || g.id === exceptGroup) continue;
    for (const [c, r] of g.tiles) {
      const rect = { x: c * TILE + g.ox, y: r * TILE + g.oy, w: TILE, h: TILE, type: T.SOLID, c, r, group: g.id };
      if (rect.x > area.x + area.w + TILE || rect.x + TILE < area.x - TILE) continue;
      if (rect.y > area.y + area.h + TILE || rect.y + TILE < area.y - TILE) continue;
      fn(rect);
    }
  }
}

function overlapsSolid(world, rect, exceptGroup = null) {
  let hit = false;
  forEachSolid(world, rect, (s) => {
    if (!hit && s.type !== T.INVISIBLE && overlap(rect, s)) hit = true;
  }, exceptGroup);
  return hit;
}

export function spikeBox(x, y, type) {
  switch (type) {
    case T.SPIKE_DOWN: return { x: x + 2, y, w: 12, h: 8 };
    case T.SPIKE_LEFT: return { x: x + 8, y: y + 2, w: 8, h: 12 };
    case T.SPIKE_RIGHT: return { x, y: y + 2, w: 8, h: 12 };
    default: return { x: x + 2, y: y + 8, w: 12, h: 8 };
  }
}

function circleHitsRect(cx, cy, radius, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < radius * radius;
}

// ------------------------------------------------------------------ events

function emit(world, type, data = {}) {
  world.events.push({ type, ...data });
}

function kill(world, cause) {
  if (world.status !== 'playing') return;
  world.status = 'dead';
  world.statusT = 0;
  world.cause = cause;
  emit(world, 'death', { cause, x: world.player.x + world.player.w / 2, y: world.player.y + world.player.h / 2 });
}

// ------------------------------------------------------------------ traps

function armed(trap, attempt) {
  if (!trap.attempts) return true;
  const [min, max = Infinity] = trap.attempts;
  return attempt >= min && attempt <= max;
}

function conditionMet(world, when) {
  const p = world.player;
  const cx = (p.x + p.w / 2) / TILE;
  const cy = (p.y + p.h / 2) / TILE;
  if (when.px && (cx < when.px[0] || cx >= when.px[1] + 1)) return false;
  if (when.py && (cy < when.py[0] || cy >= when.py[1] + 1)) return false;
  if (when.time !== undefined && world.time < when.time) return false;
  if (when.jumps !== undefined && world.jumps < when.jumps) return false;
  if (when.air && p.onGround) return false;
  if (when.ground !== undefined && p.groundGroup !== when.ground) return false;
  if (when.near !== undefined) {
    const d = doorRect(world);
    const dist = Math.hypot(cx - (d.x + d.w / 2) / TILE, cy - (d.y + d.h / 2) / TILE);
    if (dist > when.near) return false;
  }
  if (when.after !== undefined) {
    const other = world.traps.find((t) => t.id === when.after);
    if (!other || !other.fired || world.time - other.firedAt < (when.delay ?? 0)) return false;
  }
  return true;
}

function group(world, id) {
  const g = world.groups[id];
  if (!g) throw new Error(`Nivel ${world.levelId}: la trampa usa el grupo "${id}", que no existe`);
  return g;
}

const ids = (value) => (Array.isArray(value) ? value : String(value).split(''));

function runAction(world, a) {
  const p = world.player;
  if (a.fall) {
    for (const id of ids(a.fall)) {
      const g = group(world, id);
      g.falling = true;
      g.land = Boolean(a.land);
      g.motion = null;
      g.vy = a.speed ? a.speed * TILE : 0;
    }
    emit(world, 'rumble');
  }
  if (a.vanish) {
    for (const id of ids(a.vanish)) {
      const g = group(world, id);
      if (g.visible) emit(world, 'poof', { group: id });
      g.visible = false;
    }
  }
  if (a.appear) {
    for (const id of ids(a.appear)) {
      const g = group(world, id);
      g.visible = true;
      g.popT = 0.12;
    }
    emit(world, 'pop');
  }
  if (a.move) {
    for (const id of ids(a.move)) {
      const g = group(world, id);
      g.motion = {
        fx: g.ox, fy: g.oy,
        tx: g.ox + (a.dx ?? 0) * TILE, ty: g.oy + (a.dy ?? 0) * TILE,
        speed: (a.speed ?? 6) * TILE,
        pingpong: Boolean(a.pingpong),
      };
    }
    emit(world, 'slide');
  }
  if (a.door) {
    const d = world.door;
    d.motion = {
      fx: d.ox, fy: d.oy,
      tx: d.ox + (a.door.dx ?? 0) * TILE, ty: d.oy + (a.door.dy ?? 0) * TILE,
      speed: (a.door.speed ?? 8) * TILE,
      pingpong: Boolean(a.door.pingpong),
    };
    emit(world, 'door-run');
  }
  if (a.doorTo) {
    const d = world.door;
    d.motion = null;
    d.ox = a.doorTo[0] * TILE + (TILE - d.w) / 2 - d.x;
    d.oy = a.doorTo[1] * TILE + TILE - d.h - d.y;
    emit(world, 'teleport');
  }
  if (a.gravity !== undefined) {
    p.gravity = a.gravity;
    p.onGround = false;
    p.groundGroup = null;
    emit(world, 'gravity');
  }
  if (a.reverse !== undefined) {
    p.reversed = a.reverse;
    emit(world, 'reverse');
  }
  if (a.speedMul !== undefined) p.speedMul = a.speedMul;
  if (a.shoot) {
    const s = a.shoot;
    world.projectiles.push({
      x: s.x * TILE, y: s.y * TILE,
      w: (s.w ?? 1) * TILE, h: (s.h ?? 1) * TILE,
      vx: (s.vx ?? 0) * TILE, vy: (s.vy ?? 0) * TILE,
      kind: s.kind ?? 'block',
    });
    emit(world, 'shoot');
  }
  if (a.shake) world.shake = Math.max(world.shake, a.shake);
  if (a.say) world.say = { text: a.say, t: world.time };
}

function updateTraps(world) {
  for (const trap of world.traps) {
    if (trap.fired || !armed(trap, world.attempt)) continue;
    if (!conditionMet(world, trap.when)) continue;
    trap.fired = true;
    trap.firedAt = world.time;
    for (const action of trap.do) {
      if (action.delay) world.scheduled.push({ at: world.time + action.delay, action });
      else runAction(world, action);
    }
  }
  if (world.scheduled.length) {
    const due = world.scheduled.filter((s) => s.at <= world.time + 1e-9);
    world.scheduled = world.scheduled.filter((s) => s.at > world.time + 1e-9);
    for (const s of due) runAction(world, s.action);
  }
}

// ------------------------------------------------------------------ moving things

function stepMotion(obj) {
  const m = obj.motion;
  const ddx = m.tx - obj.ox;
  const ddy = m.ty - obj.oy;
  const dist = Math.hypot(ddx, ddy);
  const len = m.speed * DT;
  if (dist <= len) {
    obj.ox = m.tx;
    obj.oy = m.ty;
    if (m.pingpong) {
      [m.tx, m.fx] = [m.fx, m.tx];
      [m.ty, m.fy] = [m.fy, m.ty];
    } else {
      obj.motion = null;
    }
  } else {
    obj.ox += (ddx / dist) * len;
    obj.oy += (ddy / dist) * len;
  }
}

function updateGroups(world) {
  const p = world.player;
  for (const g of Object.values(world.groups)) {
    if (g.gone) continue;
    if (g.popT > 0) g.popT = Math.max(0, g.popT - DT);
    const ox0 = g.ox;
    const oy0 = g.oy;
    if (g.falling) {
      g.vy = Math.min(g.vy + GRAVITY * DT, 720);
      g.oy += g.vy * DT;
      if (g.land) landOnGround(world, g);
      if (g.oy > HEIGHT + 2 * TILE) g.gone = true;
    } else if (g.motion) {
      stepMotion(g);
    }
    const dx = g.ox - ox0;
    const dy = g.oy - oy0;
    if ((!dx && !dy) || g.kind !== 'solid' || !g.visible || g.fake || world.status !== 'playing') continue;

    // Carry the player standing on a moving platform.
    if (!g.falling && p.groundGroup === g.id) {
      p.x += dx;
      if (overlapsSolid(world, p, g.id)) p.x -= dx;
      p.y += dy;
      if (overlapsSolid(world, p, g.id)) p.y -= dy;
    }

    // Push the player out of the way, or crush them against something solid.
    let pushed = false;
    for (const [c, r] of g.tiles) {
      const rect = { x: c * TILE + g.ox, y: r * TILE + g.oy, w: TILE, h: TILE };
      if (!overlap(p, rect)) continue;
      if (g.deadly) return kill(world, 'block');
      if (Math.abs(dy) >= Math.abs(dx)) p.y = dy > 0 ? rect.y + rect.h : rect.y - p.h;
      else p.x = dx > 0 ? rect.x + rect.w : rect.x - p.w;
      pushed = true;
    }
    if (pushed) {
      if (dy > 0 && p.vy < g.vy) p.vy = g.falling ? g.vy : dy / DT;
      if (overlapsSolid(world, p, g.id) || p.x < -1 || p.x + p.w > WIDTH + 1) return kill(world, 'crush');
      for (const [c, r] of g.tiles) {
        if (overlap(p, { x: c * TILE + g.ox, y: r * TILE + g.oy, w: TILE, h: TILE })) return kill(world, 'crush');
      }
    }
  }
}

/** Stops a falling group ("land" option) when it reaches static solid ground. */
function landOnGround(world, g) {
  let stopAt = null;
  for (const [c, r] of g.tiles) {
    const bottom = r * TILE + g.oy + TILE;
    const below = Math.floor(bottom / TILE);
    const t = tileAt(world, c, below);
    if (bottom > below * TILE && (t === T.SOLID || t === T.SPRING)) {
      const oy = below * TILE - TILE - r * TILE;
      stopAt = stopAt === null ? oy : Math.min(stopAt, oy);
    }
  }
  if (stopAt !== null) {
    g.oy = stopAt;
    g.vy = 0;
    g.falling = false;
    world.shake = Math.max(world.shake, 0.15);
    emit(world, 'thud');
  }
}

function updateDoor(world) {
  if (world.door.motion) stepMotion(world.door);
}

function updateProjectiles(world) {
  for (const s of world.projectiles) {
    s.x += s.vx * DT;
    s.y += s.vy * DT;
  }
  world.projectiles = world.projectiles.filter(
    (s) => s.x > -6 * TILE && s.x < WIDTH + 6 * TILE && s.y > -6 * TILE && s.y < HEIGHT + 6 * TILE,
  );
}

// ------------------------------------------------------------------ player

function approach(value, target, amount) {
  return value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);
}

function moveX(world, dx) {
  const p = world.player;
  if (!dx) return;
  p.x += dx;
  let hit = false;
  forEachSolid(world, p, (s) => {
    if (s.type === T.INVISIBLE || !overlap(p, s)) return;
    p.x = dx > 0 ? s.x - p.w : s.x + s.w;
    hit = true;
  });
  if (p.x < 0) { p.x = 0; hit = true; }
  if (p.x + p.w > WIDTH) { p.x = WIDTH - p.w; hit = true; }
  if (hit) p.vx = 0;
}

function moveY(world, dy) {
  const p = world.player;
  if (!dy) return;
  const g = p.gravity;
  const prevTop = p.y;
  const prevBottom = p.y + p.h;
  p.y += dy;
  let landedOn = null;
  let bumped = false;
  forEachSolid(world, p, (s) => {
    if (!overlap(p, s)) return;
    if (s.type === T.INVISIBLE) {
      const fromHead = g > 0 ? dy < 0 && prevTop >= s.y + s.h - 0.5 : dy > 0 && prevBottom <= s.y + 0.5;
      if (!fromHead) return;
      world.grid[s.r * COLS + s.c] = T.SOLID;
      world.revealed += 1;
      emit(world, 'reveal', { c: s.c, r: s.r });
    }
    if (dy > 0) {
      p.y = s.y - p.h;
      if (g > 0) landedOn = s; else bumped = true;
    } else {
      p.y = s.y + s.h;
      if (g < 0) landedOn = s; else bumped = true;
    }
  });
  if (landedOn && landedOn.type === T.SPRING) {
    p.vy = -SPRING_SPEED * g;
    p.jumping = false;
    emit(world, 'spring');
    return;
  }
  if (landedOn || bumped) {
    if (landedOn && Math.abs(p.vy) > 200) p.landT = 0.12;
    if (bumped) emit(world, 'bump');
    p.vy = 0;
  }
}

function probeGround(world) {
  const p = world.player;
  const probe = { x: p.x + 0.5, y: p.gravity > 0 ? p.y + p.h : p.y - 1, w: p.w - 1, h: 1 };
  let ground = null;
  forEachSolid(world, probe, (s) => {
    if (s.type !== T.INVISIBLE && overlap(probe, s)) ground = ground ?? s;
  });
  p.onGround = Boolean(ground) && p.vy * p.gravity >= 0;
  p.groundGroup = p.onGround ? ground.group : null;
}

function updatePlayer(world, input) {
  const p = world.player;
  const g = p.gravity;
  let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (p.reversed) dir = -dir;
  if (dir) p.facing = dir;

  const target = dir * RUN_SPEED * p.speedMul;
  const accel = p.onGround ? (dir ? GROUND_ACCEL : GROUND_FRICTION) : AIR_ACCEL;
  p.vx = approach(p.vx, target, accel * DT);

  const pressed = input.jump && !p.jumpWasDown;
  p.jumpWasDown = Boolean(input.jump);
  p.jumpBuffer = pressed ? JUMP_BUFFER : Math.max(0, p.jumpBuffer - DT);
  p.coyote = p.onGround ? COYOTE_TIME : Math.max(0, p.coyote - DT);
  if (p.jumpBuffer > 0 && p.coyote > 0) {
    p.vy = -JUMP_SPEED * g;
    p.jumpBuffer = 0;
    p.coyote = 0;
    p.onGround = false;
    p.groundGroup = null;
    p.jumping = true;
    world.jumps += 1;
    emit(world, 'jump');
  }
  if (p.jumping && !input.jump && p.vy * g < -JUMP_CUT) p.vy = -JUMP_CUT * g;
  if (p.vy * g >= 0) p.jumping = false;

  p.vy += GRAVITY * g * DT;
  p.vy = g > 0 ? Math.min(p.vy, MAX_FALL) : Math.max(p.vy, -MAX_FALL);
  if (p.landT > 0) p.landT = Math.max(0, p.landT - DT);

  moveX(world, p.vx * DT);
  moveY(world, p.vy * DT);
  probeGround(world);
}

function checkHazards(world) {
  const p = world.player;
  const body = { x: p.x + 1, y: p.y + 1, w: p.w - 2, h: p.h - 2 };
  if (p.y > HEIGHT + TILE || p.y + p.h < -TILE) return kill(world, 'fall');

  const c0 = Math.floor(p.x / TILE) - 1;
  const r0 = Math.floor(p.y / TILE) - 1;
  for (let r = r0; r <= r0 + 3; r++) {
    for (let c = c0; c <= c0 + 3; c++) {
      const t = tileAt(world, c, r);
      if (t >= T.SPIKE_UP && t <= T.SPIKE_RIGHT && overlap(body, spikeBox(c * TILE, r * TILE, t))) return kill(world, 'spike');
      if (t === T.SAW && circleHitsRect(c * TILE + 8, r * TILE + 8, 7, body)) return kill(world, 'saw');
    }
  }
  for (const g of Object.values(world.groups)) {
    if (g.kind !== 'spike' || !g.visible || g.gone) continue;
    for (const [c, r] of g.tiles) {
      if (overlap(body, spikeBox(c * TILE + g.ox, r * TILE + g.oy, g.dir))) return kill(world, 'spike');
    }
  }
  for (const s of world.projectiles) {
    const hit = ROUND_HAZARDS.has(s.kind)
      ? circleHitsRect(s.x + s.w / 2, s.y + s.h / 2, s.w / 2 - 1, body)
      : overlap(body, { x: s.x + 1, y: s.y + 1, w: s.w - 2, h: s.h - 2 });
    if (hit) return kill(world, s.kind);
  }
  if (overlap(body, doorRect(world))) {
    world.status = 'won';
    world.statusT = 0;
    emit(world, 'win');
  }
}

/**
 * Advances the world by one fixed step (1/60 s).
 * input: { left, right, jump } — whether each control is held down.
 */
export function step(world, input) {
  if (world.status !== 'playing') {
    world.statusT += DT;
    updateGroups(world);
    updateProjectiles(world);
    return world;
  }
  world.time += DT;
  world.frame += 1;
  if (world.shake > 0) world.shake = Math.max(0, world.shake - DT);
  updateTraps(world);
  updateGroups(world);
  updateDoor(world);
  updateProjectiles(world);
  if (world.status !== 'playing') return world;
  updatePlayer(world, input);
  checkHazards(world);
  return world;
}

/** Fast copy of a world. Immutable parts (map tiles of groups, trap definitions) are shared. */
export function cloneWorld(w) {
  const groups = {};
  for (const k in w.groups) {
    const g = w.groups[k];
    groups[k] = { ...g, motion: g.motion && { ...g.motion } };
  }
  return {
    ...w,
    grid: w.grid.slice(),
    groups,
    player: { ...w.player },
    door: { ...w.door, motion: w.door.motion && { ...w.door.motion } },
    traps: w.traps.map((t) => ({ ...t })),
    scheduled: w.scheduled.slice(),
    projectiles: w.projectiles.map((s) => ({ ...s })),
    events: [],
  };
}
