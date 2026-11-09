// Bundles the game into www/ (the folder Capacitor packs into the Android app).
//   npm run build   → www/
//   npm run dev     → build + local server on http://localhost:5174
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const out = `${root}www`;
const serve = process.argv.includes('--serve');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(`${root}public`, out, { recursive: true });

const options = {
  entryPoints: [`${root}src/main.js`],
  bundle: true,
  format: 'esm',
  target: ['es2020', 'chrome89'],
  outfile: `${out}/game.js`,
  minify: !serve,
  sourcemap: serve,
  legalComments: 'none',
};

if (serve) {
  const ctx = await context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: out, port: 5174 });
  console.log(`Juego en http://localhost:${port}`);
} else {
  await build(options);
  console.log('Compilado en www/');
}
