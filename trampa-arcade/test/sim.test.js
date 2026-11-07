import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/game/sim.js';
import { ALL_LEVELS, UNIVERSES } from '../src/game/universes.js';
import { T, TILE } from '../src/game/constants.js';

// Builds a 30x17 test map: floor on rows 14-16, `row13` is the walking row.
function level(row13, extra = {}) {
  const map = ['#'.repeat(30)];
  for (let r = 1; r < 13; r++) map.push(extra.rows?.[r] ?? `#${'.'.repeat(28)}#`);
  map.push(row13);
  map.push(...(extra.floor ?? ['#'.repeat(30), '#'.repeat(30), '#'.repeat(30)]));
  return { id: 'test', map, traps: extra.traps ?? [], groups: extra.groups, doorCeiling: extra.doorCeiling };
}

function run(world, input, frames) {
  for (let i = 0; i < frames && world.status === 'playing'; i++) step(world, input);
  return world;
}

test('there are 5 universes with 8 valid levels each', () => {
  assert.equal(UNIVERSES.length, 5);
  for (const u of UNIVERSES) assert.equal(u.levels.length, 8);
  assert.equal(ALL_LEVELS.length, 40);
  const ids = new Set();
  for (const l of ALL_LEVELS) {
    assert.ok(!ids.has(l.id), `id repetido ${l.id}`);
    ids.add(l.id);
    assert.doesNotThrow(() => createWorld(l), `el nivel ${l.id} no se puede cargar`);
    assert.ok(l.name, `el nivel ${l.id} no tiene nombre`);
  }
});

test('walking into the exit wins the level', () => {
  const w = createWorld(level('#P...D.......................#'));
  run(w, { right: true }, 120);
  assert.equal(w.status, 'won');
});

test('a full jump rises about three tiles and clears a three-tile gap', () => {
  const w = createWorld(level('#P..........................D#'));
  run(w, {}, 5);
  const y0 = w.player.y;
  let minY = y0;
  for (let i = 0; i < 40; i++) {
    step(w, { jump: true });
    minY = Math.min(minY, w.player.y);
  }
  const rise = (y0 - minY) / TILE;
  assert.ok(rise > 2.8 && rise < 3.1, `sube ${rise} casillas`);

  const gap = createWorld(level('#P..........D................#', { floor: ['#####...######################', '#####...######################', '#####...######################'] }));
  for (let i = 0; i < 200 && gap.status === 'playing'; i++) {
    const nearEdge = gap.player.x + gap.player.w > 4.5 * TILE && gap.player.x < 5 * TILE;
    step(gap, { right: true, jump: nearEdge });
  }
  assert.equal(gap.status, 'won');
});

test('spikes and pits kill the player', () => {
  const spikes = createWorld(level('#P...^^.....................D#'));
  run(spikes, { right: true }, 120);
  assert.equal(spikes.status, 'dead');
  assert.equal(spikes.cause, 'spike');

  const pit = createWorld(level('#P...........................D#'.slice(0, 30), { floor: ['####..########################', '####..########################', '####..########################'] }));
  run(pit, { right: true }, 200);
  assert.equal(pit.status, 'dead');
  assert.equal(pit.cause, 'fall');
});

test('a collapsing floor trap drops its group', () => {
  const w = createWorld(level('#P.........................D.#', {
    floor: ['######aaa#####################', '######aaa#####################', '######aaa#####################'],
    traps: [{ when: { px: [6, 8] }, do: { fall: 'a' } }],
  }));
  run(w, { right: true }, 300);
  assert.equal(w.status, 'dead');
  assert.equal(w.traps[0].fired, true);
});

test('traps can depend on the attempt number', () => {
  const lvl = level('#P.........................D.#', {
    floor: ['######aaa#####################', '######aaa#####################', '######aaa#####################'],
    traps: [{ when: { px: [6, 8] }, attempts: [1, 1], do: { fall: 'a' } }],
  });
  assert.equal(run(createWorld(lvl, 1), { right: true }, 300).status, 'dead');
  assert.equal(run(createWorld(lvl, 2), { right: true }, 300).status, 'won');
});

test('invisible blocks appear when hit from below', () => {
  const rows = { 12: '#....x.......................#' };
  const w = createWorld(level('#P..........................D#', { rows }));
  while (w.player.x + w.player.w / 2 < 5.5 * TILE) step(w, { right: true });
  run(w, {}, 10);
  run(w, { jump: true }, 20);
  assert.equal(w.grid[12 * 30 + 5], T.SOLID);
  assert.equal(w.revealed, 1);
});

test('fake blocks look solid but drop the player', () => {
  const w = createWorld(level('#P.........................D.#', {
    floor: ['#####~~#######################', '#####..#######################', '#####..#######################'],
  }));
  run(w, { right: true }, 200);
  assert.equal(w.status, 'dead');
});

test('gravity flips and the player can win on a ceiling exit', () => {
  const rows = { 1: '#........D...................#' };
  const w = createWorld(level('#P...........................#', {
    rows,
    doorCeiling: true,
    traps: [{ when: { px: [4, 5] }, do: { gravity: -1 } }],
  }));
  run(w, { right: true }, 400);
  assert.equal(w.status, 'won');
});

test('reversed controls move the other way', () => {
  const w = createWorld(level('#P..........................D#', { traps: [{ when: { time: 0 }, do: { reverse: true } }] }));
  const x0 = w.player.x;
  run(w, { left: true }, 30);
  assert.ok(w.player.x > x0);
});
