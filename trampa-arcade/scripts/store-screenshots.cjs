// Takes 1920x1080 screenshots for the Google Play listing from the web build.
// Needs a local server on www/ (npm run dev) — run: node scripts/store-screenshots.cjs [url]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = path.join(__dirname, '..', 'store');
const solutions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test/solutions.json'), 'utf8'));
const CODES = { R: { right: true }, L: { left: true }, N: {}, r: { right: true, jump: true }, l: { left: true, jump: true }, j: { jump: true } };

const shots = [
  { name: '1-titulo', title: true },
  { name: '2-laberinto', level: [0, 7], at: 0.42 },
  { name: '3-invasion', level: [1, 3], at: 0.45 },
  { name: '4-ladrillos', level: [2, 3], at: 0.55 },
  { name: '5-vector', level: [3, 4], at: 0.6 },
  { name: '6-andamios', level: [4, 1], at: 0.5 },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  for (const shot of shots) {
    await page.goto(`${url}?test`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(700);
    if (!shot.title) {
      const [u, l] = shot.level;
      const id = `${u + 1}-${l + 1}`;
      const pathCodes = solutions[id]['1'];
      const chunks = Math.floor(pathCodes.length * shot.at);
      await page.evaluate(({ u, l, inputs }) => {
        const t = window.__trampa;
        t.startLevel(u, l);
        for (const input of inputs) for (let i = 0; i < 6; i++) t.step(t.game.world, input);
        t.game.world.events.length = 0;
        t.game.world.say = null;
        t.game.mode = 'paused';
      }, { u, l, inputs: pathCodes.slice(0, chunks).split('').map((c) => CODES[c]) });
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: path.join(out, `captura-${shot.name}.png`) });
  }
  await browser.close();
  console.log('Capturas guardadas en store/');
})();
