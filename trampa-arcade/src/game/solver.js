// Breadth-first search over short input chunks to prove a level can be beaten.
// Used by `npm run verify` (and its saved solutions are replayed by the tests).
import { cloneWorld, createWorld, doorRect, step } from './sim.js';
import { COLS, ROWS, RUN_SPEED, T, TILE } from './constants.js';

export const ACTIONS = [
  { right: true },
  { left: true },
  {},
  { right: true, jump: true },
  { left: true, jump: true },
  { jump: true },
];
export const ACTION_CODES = 'RLNrlj';
export const CHUNK = 6; // frames per action

function stateKey(w) {
  const p = w.player;
  const parts = [
    Math.round(p.x / 3), Math.round(p.y / 3),
    Math.sign(Math.round(p.vx / 30)), Math.round(p.vy / 90),
    p.jumpWasDown ? 1 : 0, p.onGround ? 1 : 0, p.gravity, p.reversed ? 1 : 0,
    w.traps.map((t) => (t.fired ? 1 : 0)).join(''),
    w.scheduled.length,
    w.revealed,
  ];
  for (const g of Object.values(w.groups)) {
    if (g.motion || g.falling || g.ox || g.oy || !g.visible) {
      parts.push(`${g.id}${Math.round(g.ox / 6)},${Math.round(g.oy / 6)}${g.visible ? 1 : 0}${g.gone ? 1 : 0}`);
    }
  }
  if (w.door.ox || w.door.oy) parts.push(`d${Math.round(w.door.ox / 4)},${Math.round(w.door.oy / 4)}`);
  for (const s of w.projectiles) parts.push(`p${Math.round(s.x / 8)},${Math.round(s.y / 8)}`);
  return parts.join('|');
}

/** Runs one action chunk. Returns the new world. */
export function runChunk(world, action) {
  for (let i = 0; i < CHUNK; i++) {
    step(world, action);
    world.events.length = 0;
    if (world.status !== 'playing') break;
  }
  return world;
}

/** Minimal binary heap ordered by `f`. */
class Heap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item) {
    const a = this.items;
    a.push(item);
    for (let i = a.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (a[parent].f <= a[i].f) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Walking distance (in tiles) from every tile to the exit, going around walls.
 * Ignores physics; it only guides the search toward the right corridor.
 */
function distanceField(world, doorTile) {
  const start = doorTile;
  const blocked = new Uint8Array(COLS * ROWS);
  world.grid.forEach((t, i) => { if (t === T.SOLID || t === T.SPRING) blocked[i] = 1; });
  for (const g of Object.values(world.groups)) {
    if (g.kind === 'solid' && g.visible && !g.fake) for (const [c, r] of g.tiles) blocked[r * COLS + c] = 1;
  }
  blocked[start] = 0;
  const dist = new Float64Array(COLS * ROWS).fill(Infinity);
  dist[start] = 0;
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const c = cur % COLS;
    const r = (cur - c) / COLS;
    for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const n = nr * COLS + nc;
      if (blocked[n] || dist[n] !== Infinity) continue;
      dist[n] = dist[cur] + 1;
      queue.push(n);
    }
  }
  return dist;
}

/** Heuristic: walking distance to wherever the exit is now (fields cached per exit tile). */
function estimator(start) {
  const fields = new Map();
  return (w) => {
    const d = doorRect(w);
    const dc = Math.min(COLS - 1, Math.max(0, Math.floor((d.x + d.w / 2) / TILE)));
    const dr = Math.min(ROWS - 1, Math.max(0, Math.floor((d.y + d.h / 2) / TILE)));
    const key = dr * COLS + dc;
    if (!fields.has(key)) fields.set(key, distanceField(start, key));
    const field = fields.get(key);
    const p = w.player;
    const c = Math.min(COLS - 1, Math.max(0, Math.floor((p.x + p.w / 2) / TILE)));
    const r = Math.min(ROWS - 1, Math.max(0, Math.floor((p.y + p.h / 2) / TILE)));
    let tiles = field[r * COLS + c];
    if (!Number.isFinite(tiles)) tiles = Math.hypot(p.x - d.x, p.y - d.y) / TILE;
    // Once the exit has run away, prefer to continue from there (staged search).
    const exitMoves = w.traps.filter((t) => t.fired && t.do.some((a) => a.door || a.doorTo)).length;
    return w.time + (tiles * TILE) / RUN_SPEED - 60 * exitMoves;
  };
}

/**
 * Finds a sequence of action codes that wins the level, or null.
 * A* over game time with the straight-line distance to the exit as heuristic.
 */
export function solve(level, { attempt = 1, maxNodes = 1200000, maxTime = 45 } = {}) {
  const start = createWorld(level, attempt);
  const estimate = estimator(start);
  const nodes = [{ parent: -1, action: -1 }];
  const open = new Heap();
  open.push({ f: estimate(start), id: 0, world: start });
  const seen = new Set([stateKey(start)]);
  while (open.size) {
    const { id, world } = open.pop();
    for (let a = 0; a < ACTIONS.length; a++) {
      const w = runChunk(cloneWorld(world), ACTIONS[a]);
      if (w.status === 'won') {
        const path = [ACTION_CODES[a]];
        for (let i = id; nodes[i].parent !== -1; i = nodes[i].parent) path.push(ACTION_CODES[nodes[i].action]);
        return { path: path.reverse().join(''), explored: nodes.length };
      }
      if (w.status !== 'playing' || w.time > maxTime) continue;
      const key = stateKey(w);
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push({ parent: id, action: a });
      open.push({ f: estimate(w), id: nodes.length - 1, world: w });
      if (nodes.length >= maxNodes) return { path: null, explored: nodes.length };
    }
  }
  return { path: null, explored: nodes.length };
}

/** Replays a solution string and returns the final world. */
export function replay(level, path, attempt = 1) {
  const world = createWorld(level, attempt);
  for (const code of path) {
    runChunk(world, ACTIONS[ACTION_CODES.indexOf(code)]);
    if (world.status !== 'playing') break;
  }
  return world;
}
