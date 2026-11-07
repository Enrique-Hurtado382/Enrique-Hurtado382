// Replays the winning inputs found by `npm run verify` (test/solutions.json).
// If a level changes and its saved solution stops working, run `npm run verify` again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALL_LEVELS } from '../src/game/universes.js';
import { replay } from '../src/game/solver.js';

const solutions = JSON.parse(readFileSync(new URL('./solutions.json', import.meta.url), 'utf8'));

for (const level of ALL_LEVELS) {
  test(`el nivel ${level.id} "${level.name}" se puede superar (intentos 1, 2 y 3)`, () => {
    for (const attempt of [1, 2, 3]) {
      const path = solutions[level.id]?.[attempt];
      assert.ok(path, `falta la solución del intento ${attempt}; ejecuta npm run verify -- ${level.id}`);
      const world = replay(level, path, attempt);
      assert.equal(world.status, 'won', `la solución guardada del intento ${attempt} ya no gana`);
    }
  });
}
