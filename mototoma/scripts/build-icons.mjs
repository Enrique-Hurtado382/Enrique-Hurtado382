// Genera los iconos y la pantalla de inicio de Android a partir del dibujo de src/art.js.
//   npm run icons
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { iconoApp } from '../src/art.js';

const root = new URL('..', import.meta.url).pathname;
const res = `${root}android/app/src/main/res`;
const svg = Buffer.from(iconoApp());

// Fondo y primer plano para el icono adaptativo (el primer plano ocupa el 66% central).
const fondo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#11141b"/><stop offset="1" stop-color="#2a1208"/></linearGradient></defs><rect width="108" height="108" fill="url(#g)"/></svg>');
const primerPlano = Buffer.from(iconoApp()
  .replace('<rect width="512" height="512" rx="112" fill="url(#g)"/>', '')
  .replace('viewBox="0 0 512 512"', 'viewBox="-136 -136 784 784"'));

const DENSIDADES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [d, k] of Object.entries(DENSIDADES)) {
  const dir = `${res}/mipmap-${d}`;
  mkdirSync(dir, { recursive: true });
  const legacy = Math.round(48 * k);
  const adapt = Math.round(108 * k);
  await sharp(svg, { density: 300 }).resize(legacy, legacy).png().toFile(`${dir}/ic_launcher.png`);
  await sharp(svg, { density: 300 }).resize(legacy, legacy)
    .composite([{ input: Buffer.from(`<svg width="${legacy}" height="${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}"/></svg>`), blend: 'dest-in' }])
    .png().toFile(`${dir}/ic_launcher_round.png`);
  await sharp(primerPlano, { density: 300 }).resize(adapt, adapt).png().toFile(`${dir}/ic_launcher_foreground.png`);
}

// Icono adaptativo: fondo como imagen
mkdirSync(`${res}/drawable`, { recursive: true });
await sharp(fondo, { density: 300 }).resize(432, 432).png().toFile(`${res}/drawable/ic_launcher_bg.png`);
mkdirSync(`${res}/mipmap-anydpi-v26`, { recursive: true });
const adaptativo = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_bg"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
writeFileSync(`${res}/mipmap-anydpi-v26/ic_launcher.xml`, adaptativo);
writeFileSync(`${res}/mipmap-anydpi-v26/ic_launcher_round.xml`, adaptativo);

// Pantalla de inicio: logo centrado sobre fondo oscuro
const splash = async (w, h, file) => {
  const lado = Math.round(Math.min(w, h) * 0.32);
  const logo = await sharp(svg, { density: 300 }).resize(lado, lado).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: '#0b0d12' } })
    .composite([{ input: logo, gravity: 'center' }])
    .png().toFile(file);
};
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
await splash(480, 800, `${res}/drawable/splash.png`);
for (const [d, [w, h]] of Object.entries(SPLASH)) {
  for (const [o, W, H] of [['port', w, h], ['land', h, w]]) {
    const dir = `${res}/drawable-${o}-${d}`;
    mkdirSync(dir, { recursive: true });
    await splash(W, H, `${dir}/splash.png`);
  }
}
console.log('Iconos y splash generados');
