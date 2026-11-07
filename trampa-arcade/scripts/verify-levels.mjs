// Proves every level can be beaten on its 1st, 2nd and 3rd attempt (traps can
// change between attempts) and saves the winning inputs to test/solutions.json.
// Usage: npm run verify            (all levels)
//        npm run verify -- 2-8     (one level)
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { ALL_LEVELS } from '../src/game/universes.js';
import { solve } from '../src/game/solver.js';

const file = new URL('../test/solutions.json', import.meta.url);
const solutions = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const only = process.argv[2];
let failed = 0;

for (const level of ALL_LEVELS) {
  if (only && level.id !== only) continue;
  solutions[level.id] = {};
  for (const attempt of [1, 2, 3]) {
    const t0 = Date.now();
    const result = solve(level, { attempt });
    const ms = Date.now() - t0;
    if (result.path) {
      solutions[level.id][attempt] = result.path;
      console.log(`✔ ${level.id} intento ${attempt}: ${result.path.length} pasos (${ms} ms)`);
    } else {
      failed += 1;
      console.log(`✘ ${level.id} intento ${attempt}: SIN SOLUCIÓN (${result.explored} estados, ${ms} ms)`);
    }
  }
  writeFileSync(file, `${JSON.stringify(solutions, null, 1)}\n`);
}
if (failed) {
  console.error(`\n${failed} combinaciones sin solución.`);
  process.exit(1);
}
console.log('\nTodos los niveles se pueden superar.');
