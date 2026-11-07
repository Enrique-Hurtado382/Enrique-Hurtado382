// Renders the app icon and Play Store graphics from assets/icon.svg with the
// pre-installed Chromium (Playwright). Run: node scripts/make-icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'assets/icon.svg'), 'utf8');
const font = fs.readFileSync(path.join(root, 'node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2')).toString('base64');

async function shot(page, html, file, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><head><style>
    @font-face { font-family: P; src: url(data:font/woff2;base64,${font}); }
    html, body { margin: 0; background: transparent; }
  </style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: true });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const icon = (size, round = false) =>
    `<div style="width:${size}px;height:${size}px;overflow:hidden;${round ? 'border-radius:50%' : ''}">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>`;

  await shot(page, icon(512), path.join(root, 'public/icon.png'), 512, 512);
  await shot(page, icon(512), path.join(root, 'store/icono-512.png'), 512, 512);

  // Play Store feature graphic 1024x500
  await shot(page, `<div style="width:1024px;height:500px;background:#06061a;position:relative;overflow:hidden;font-family:P">
      <div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 63px,#10104a 63px 64px),repeating-linear-gradient(0deg,transparent 0 63px,#10104a 63px 64px)"></div>
      <div style="position:absolute;left:70px;top:110px;width:300px;height:300px">${svg.replace('<svg ', '<svg width="300" height="300" ')}</div>
      <div style="position:absolute;left:420px;top:150px;color:#ffd23f;font-size:72px;text-shadow:6px 6px 0 #ff4f7b,12px 12px 0 #000">TRAMPA</div>
      <div style="position:absolute;left:420px;top:250px;color:#f4f6ff;font-size:58px;text-shadow:6px 6px 0 #4d6bff,12px 12px 0 #000">ARCADE</div>
      <div style="position:absolute;left:424px;top:350px;color:#b9c0e8;font-size:20px">Nada es lo que parece</div>
    </div>`, path.join(root, 'store/grafico-destacado-1024x500.png'), 1024, 500);

  // Android launcher icons (legacy + adaptive foreground)
  const res = path.join(root, 'android/app/src/main/res');
  if (fs.existsSync(res)) {
    const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
    const adaptive = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
    for (const [dpi, size] of Object.entries(legacy)) {
      await shot(page, icon(size), path.join(res, `mipmap-${dpi}/ic_launcher.png`), size, size);
      await shot(page, icon(size, true), path.join(res, `mipmap-${dpi}/ic_launcher_round.png`), size, size);
    }
    for (const [dpi, size] of Object.entries(adaptive)) {
      // The adaptive foreground keeps its art inside the central 66% safe zone.
      const inner = Math.round(size * 0.66);
      await shot(page, `<div style="width:${size}px;height:${size}px;display:grid;place-items:center">${icon(inner)}</div>`,
        path.join(res, `mipmap-${dpi}/ic_launcher_foreground.png`), size, size);
    }
  }
  // Splash screens: dark background with the icon in the middle, same size as Capacitor's.
  if (fs.existsSync(res)) {
    for (const dir of fs.readdirSync(res)) {
      const file = path.join(res, dir, 'splash.png');
      if (!fs.existsSync(file)) continue;
      const header = fs.readFileSync(file).subarray(16, 24);
      const w = header.readUInt32BE(0);
      const h = header.readUInt32BE(4);
      const size = Math.round(Math.min(w, h) * 0.35);
      await shot(page, `<div style="width:${w}px;height:${h}px;background:#06061a;display:grid;place-items:center">${icon(size)}</div>`, file, w, h);
    }
  }
  await browser.close();
  console.log('Iconos generados.');
})();
