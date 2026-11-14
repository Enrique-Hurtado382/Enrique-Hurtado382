// Empaqueta la app en www/ (la carpeta que Capacitor mete en el APK).
//   npm run build   → www/
//   npm run dev     → compila y sirve en http://localhost:5175
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { iconoApp } from '../src/art.js';

const root = new URL('..', import.meta.url).pathname;
const out = `${root}www`;
const serve = process.argv.includes('--serve');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(`${root}public`, out, { recursive: true });
writeFileSync(`${out}/icon.svg`, iconoApp());

const options = {
  entryPoints: [`${root}src/main.js`],
  bundle: true,
  format: 'esm',
  target: ['es2020', 'chrome89'],
  outfile: `${out}/app.js`,
  minify: !serve,
  sourcemap: serve,
  legalComments: 'none',
};

if (serve) {
  const ctx = await context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: out, port: 5175 });
  console.log(`MotoToma en http://localhost:${port}`);
} else {
  await build(options);
  console.log('Compilado en www/');
}
