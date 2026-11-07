// Canvas drawing: backgrounds, tiles, hazards, the exit cabinet and the player.
// Everything is drawn with rectangles on a 480x272 pixel-art canvas.
import { TILE, COLS, ROWS, WIDTH, HEIGHT, T } from './constants.js';
import { doorRect, tileAt } from './sim.js';

const TAU = Math.PI * 2;
export const FONT = '"Press Start 2P", monospace';

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function withAlpha(ctx, alpha, fn) {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  fn();
  ctx.globalAlpha = prev;
}

function pixelSprite(ctx, rows, x, y, color, scale = 1) {
  ctx.fillStyle = color;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(x + i * scale, y + j * scale, scale, scale);
  });
}

// ---------------------------------------------------------------- backgrounds

const cache = new Map();
function cached(key, draw) {
  if (!cache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    draw(canvas.getContext('2d'));
    cache.set(key, canvas);
  }
  return cache.get(key);
}

function mazeLayer(c) {
  return cached('maze', (g) => {
    const cw = 15;
    const ch = 9;
    const size = 32;
    const next = rand(7);
    const visited = new Set();
    const walls = new Set();
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      if (x < cw - 1) walls.add(`v${x},${y}`);
      if (y < ch - 1) walls.add(`h${x},${y}`);
    }
    const stack = [[0, 0]];
    visited.add('0,0');
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const options = [[x + 1, y, `v${x},${y}`], [x - 1, y, `v${x - 1},${y}`], [x, y + 1, `h${x},${y}`], [x, y - 1, `h${x},${y - 1}`]]
        .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < cw && ny < ch && !visited.has(`${nx},${ny}`));
      if (!options.length) { stack.pop(); continue; }
      const [nx, ny, wall] = options[Math.floor(next() * options.length)];
      walls.delete(wall);
      visited.add(`${nx},${ny}`);
      stack.push([nx, ny]);
    }
    g.strokeStyle = c.edge2;
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.beginPath();
    for (const w of walls) {
      const [x, y] = w.slice(1).split(',').map(Number);
      if (w[0] === 'v') { g.moveTo((x + 1) * size, y * size + 2); g.lineTo((x + 1) * size, (y + 1) * size - 2); }
      else { g.moveTo(x * size + 2, (y + 1) * size); g.lineTo((x + 1) * size - 2, (y + 1) * size); }
    }
    g.stroke();
  });
}

const ALIEN_A = ['...###...', '.#######.', '##.###.##', '#########', '#.#...#.#', '.#.....#.'];
const ALIEN_A2 = ['...###...', '.#######.', '##.###.##', '#########', '.#.#.#.#.', '#.......#'];
const ALIEN_B = ['..#####..', '.#######.', '###...###', '###.#.###', '.#######.', '#.#.#.#.#'];
const ALIEN_B2 = ['..#####..', '.#######.', '###...###', '###.#.###', '.#######.', '.#.#.#.#.'];
const SAUCER = ['....####....', '..########..', '.##.##.##.##', '############', '..##....##..'];

const stars = (() => {
  const next = rand(42);
  return Array.from({ length: 70 }, () => ({ x: next() * WIDTH, y: next() * HEIGHT, layer: 1 + Math.floor(next() * 3), tw: next() * 6 }));
})();

const rocks = (() => {
  const next = rand(99);
  return Array.from({ length: 6 }, () => {
    const n = 7 + Math.floor(next() * 3);
    return {
      x: next() * WIDTH, y: next() * 140, vx: (next() - 0.5) * 14, vy: (next() - 0.5) * 8,
      spin: (next() - 0.5) * 0.8, r: 10 + next() * 16,
      shape: Array.from({ length: n }, () => 0.7 + next() * 0.4),
    };
  });
})();

export function drawBackground(ctx, universe, t) {
  const c = universe.colors;
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  grad.addColorStop(0, c.bg);
  grad.addColorStop(1, c.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  switch (universe.background) {
    case 'maze': {
      withAlpha(ctx, 0.28, () => ctx.drawImage(mazeLayer(c), 0, 0));
      ctx.fillStyle = c.accent;
      for (let y = 0; y < 9; y++) for (let x = 0; x < 15; x++) {
        const a = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(t * 2 + x * 0.7 + y * 1.3));
        withAlpha(ctx, a, () => ctx.fillRect(x * 32 + 15, y * 32 + 15, 2, 2));
      }
      break;
    }
    case 'invaders': {
      for (const s of stars) {
        const x = (s.x - t * 6 * s.layer + WIDTH * 10) % WIDTH;
        withAlpha(ctx, 0.25 + 0.2 * s.layer * (0.6 + 0.4 * Math.sin(t * 3 + s.tw)), () => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.round(x), Math.round(s.y), s.layer > 2 ? 2 : 1, s.layer > 2 ? 2 : 1);
        });
      }
      const step = Math.floor(t * 2);
      const offset = (Math.floor(t * 2) % 16 < 8 ? step % 8 : 8 - (step % 8)) * 6;
      withAlpha(ctx, 0.16, () => {
        for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
          const sprite = row === 1 ? (step % 2 ? ALIEN_B : ALIEN_B2) : (step % 2 ? ALIEN_A : ALIEN_A2);
          pixelSprite(ctx, sprite, 60 + i * 36 + offset, 28 + row * 22, row === 1 ? c.accent : '#b6ffc6', 2);
        }
      });
      const cycle = t % 14;
      if (cycle < 5) withAlpha(ctx, 0.3, () => pixelSprite(ctx, SAUCER, -30 + cycle * 110, 10, '#ff5c5c', 2));
      break;
    }
    case 'bricks': {
      withAlpha(ctx, 0.09, () => {
        for (let row = 0; row < 6; row++) for (let i = 0; i < 15; i++) {
          if ((i * 7 + row * 3) % 11 === 0) continue;
          ctx.fillStyle = c.bricks[row % c.bricks.length];
          ctx.fillRect(i * 32 + 1, 20 + row * 10, 30, 8);
        }
      });
      const tri = (v, max) => { const m = v % (2 * max); return m < max ? m : 2 * max - m; };
      const bx = 8 + tri(t * 130, WIDTH - 20);
      const by = 90 + tri(t * 95, 150);
      withAlpha(ctx, 0.25, () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(bx), Math.round(by), 4, 4);
        ctx.fillStyle = c.accent;
        ctx.fillRect(Math.round(Math.min(WIDTH - 44, Math.max(4, bx - 18))), 258, 40, 4);
      });
      break;
    }
    case 'vector': {
      const horizon = 150;
      ctx.strokeStyle = c.grid;
      ctx.lineWidth = 1;
      withAlpha(ctx, 0.3, () => {
        ctx.beginPath();
        for (let i = -12; i <= 12; i++) {
          ctx.moveTo(WIDTH / 2 + i * 8, horizon);
          ctx.lineTo(WIDTH / 2 + i * 70, HEIGHT);
        }
        for (let i = 0; i < 10; i++) {
          const z = ((i + (t * 0.6) % 1) / 10);
          const y = horizon + (HEIGHT - horizon) * z * z;
          ctx.moveTo(0, Math.round(y) + 0.5);
          ctx.lineTo(WIDTH, Math.round(y) + 0.5);
        }
        ctx.stroke();
      });
      ctx.strokeStyle = c.edge;
      withAlpha(ctx, 0.35, () => {
        for (const r of rocks) {
          const x = ((r.x + r.vx * t) % (WIDTH + 60) + WIDTH + 60) % (WIDTH + 60) - 30;
          const y = ((r.y + r.vy * t) % 160 + 160) % 160;
          ctx.beginPath();
          r.shape.forEach((k, i) => {
            const a = (i / r.shape.length) * TAU + t * r.spin;
            const px = x + Math.cos(a) * r.r * k;
            const py = y + Math.sin(a) * r.r * k;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          });
          ctx.closePath();
          ctx.stroke();
        }
      });
      break;
    }
    case 'girders': {
      withAlpha(ctx, 0.12, () => {
        ctx.fillStyle = c.edge2;
        for (let i = 0; i < 4; i++) {
          const y0 = 40 + i * 62;
          const slope = i % 2 ? -0.06 : 0.06;
          for (let x = 0; x < WIDTH; x += 8) {
            const y = Math.round(y0 + x * slope);
            ctx.fillRect(x, y, 7, 2);
            ctx.fillRect(x, y + 6, 7, 2);
            ctx.fillRect(x + ((x / 8) % 2 ? 2 : 4), y + 2, 2, 4);
          }
          const lx = i % 2 ? 60 : 400;
          for (let y = y0 + 10; y < y0 + 56; y += 6) ctx.fillRect(lx, y, 12, 2);
          ctx.fillRect(lx, y0 + 8, 2, 50);
          ctx.fillRect(lx + 10, y0 + 8, 2, 50);
        }
      });
      withAlpha(ctx, 0.1, () => {
        for (let i = 0; i < 4; i++) {
          const y0 = 40 + i * 62;
          const slope = i % 2 ? -0.06 : 0.06;
          const dir = slope > 0 ? 1 : -1;
          const p = ((t * 40 + i * 120) % (WIDTH + 40)) - 20;
          const x = dir > 0 ? p : WIDTH - p;
          const y = y0 + x * slope - 8;
          drawBarrel(ctx, x - 6, y - 4, t * dir * 4, c);
        }
      });
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------- tiles

function solidish(t) {
  return t === T.SOLID || t === T.FAKE;
}

function drawTile(ctx, u, x, y, row, exposed) {
  const c = u.colors;
  switch (u.tile) {
    case 'neon': {
      ctx.fillStyle = c.fill;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = c.edge;
      if (exposed.top) ctx.fillRect(x, y + 1, TILE, 2);
      if (exposed.bottom) ctx.fillRect(x, y + 13, TILE, 2);
      if (exposed.left) ctx.fillRect(x + 1, y, 2, TILE);
      if (exposed.right) ctx.fillRect(x + 13, y, 2, TILE);
      ctx.fillStyle = c.edge2;
      if (exposed.top) ctx.fillRect(x, y + 5, TILE, 1);
      if (exposed.bottom) ctx.fillRect(x, y + 10, TILE, 1);
      if (exposed.left) ctx.fillRect(x + 5, y, 1, TILE);
      if (exposed.right) ctx.fillRect(x + 10, y, 1, TILE);
      break;
    }
    case 'metal': {
      ctx.fillStyle = c.fill;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#1a1e27';
      ctx.fillRect(x, y + 15, TILE, 1);
      ctx.fillRect(x + 15, y, 1, TILE);
      ctx.fillStyle = c.edge2;
      ctx.fillRect(x, y, TILE, 1);
      ctx.fillRect(x, y, 1, TILE);
      ctx.fillRect(x + 3, y + 4, 1, 1);
      ctx.fillRect(x + 12, y + 4, 1, 1);
      ctx.fillRect(x + 3, y + 11, 1, 1);
      ctx.fillRect(x + 12, y + 11, 1, 1);
      if (exposed.top) {
        ctx.fillStyle = c.edge;
        ctx.fillRect(x, y, TILE, 2);
      }
      break;
    }
    case 'brick': {
      ctx.fillStyle = c.bricks[row % c.bricks.length];
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, y + 7, TILE, 1);
      ctx.fillRect(x, y + 15, TILE, 1);
      ctx.fillRect(x + 4, y, 1, 7);
      ctx.fillRect(x + 12, y + 8, 1, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, y, TILE, 1);
      ctx.fillRect(x, y + 8, TILE, 1);
      break;
    }
    case 'wire': {
      ctx.fillStyle = c.fill;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = c.edge;
      if (exposed.top) ctx.fillRect(x, y, TILE, 1);
      if (exposed.bottom) ctx.fillRect(x, y + 15, TILE, 1);
      if (exposed.left) ctx.fillRect(x, y, 1, TILE);
      if (exposed.right) ctx.fillRect(x + 15, y, 1, TILE);
      withAlpha(ctx, 0.35, () => {
        ctx.fillStyle = c.edge2;
        for (let i = 2; i < 14; i += 4) ctx.fillRect(x + i, y + i, 2, 2);
      });
      break;
    }
    case 'girder': {
      ctx.fillStyle = c.fill;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = c.edge2;
      ctx.fillRect(x, y + 4, TILE, 1);
      ctx.fillRect(x, y + 11, TILE, 1);
      for (let i = 0; i < 4; i++) ctx.fillRect(x + i * 4 + 1, y + 6, 2, 3);
      ctx.fillStyle = c.edge;
      if (exposed.top) ctx.fillRect(x, y, TILE, 1);
      break;
    }
    default:
      ctx.fillStyle = c.fill;
      ctx.fillRect(x, y, TILE, TILE);
  }
}

function drawSpike(ctx, x, y, type, color, grow = 1) {
  const h = Math.round(10 * grow);
  ctx.fillStyle = color;
  for (let k = 0; k < 2; k++) {
    const o = k * 8;
    ctx.beginPath();
    switch (type) {
      case T.SPIKE_DOWN: ctx.moveTo(x + o, y); ctx.lineTo(x + o + 8, y); ctx.lineTo(x + o + 4, y + h); break;
      case T.SPIKE_LEFT: ctx.moveTo(x + 16, y + o); ctx.lineTo(x + 16, y + o + 8); ctx.lineTo(x + 16 - h, y + o + 4); break;
      case T.SPIKE_RIGHT: ctx.moveTo(x, y + o); ctx.lineTo(x, y + o + 8); ctx.lineTo(x + h, y + o + 4); break;
      default: ctx.moveTo(x + o, y + 16); ctx.lineTo(x + o + 8, y + 16); ctx.lineTo(x + o + 4, y + 16 - h);
    }
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let k = 0; k < 2; k++) {
    const o = k * 8 + 4;
    switch (type) {
      case T.SPIKE_DOWN: ctx.fillRect(x + o - 1, y + h - 2, 1, 1); break;
      case T.SPIKE_LEFT: ctx.fillRect(x + 16 - h + 1, y + o - 1, 1, 1); break;
      case T.SPIKE_RIGHT: ctx.fillRect(x + h - 2, y + o - 1, 1, 1); break;
      default: ctx.fillRect(x + o - 1, y + 16 - h + 1, 1, 1);
    }
  }
}

function drawSaw(ctx, cx, cy, r, t) {
  ctx.fillStyle = '#9aa4b1';
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + t * 9;
    const rr = i % 2 ? r : r - 2.5;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d9e0e8';
  ctx.beginPath();
  ctx.arc(cx, cy, r - 3.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#3a3f47';
  ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 2, 2);
}

function drawSpring(ctx, x, y, c) {
  ctx.fillStyle = '#3a3f47';
  ctx.fillRect(x + 2, y + 13, 12, 3);
  ctx.fillStyle = '#c9d1d9';
  for (let i = 0; i < 3; i++) ctx.fillRect(x + (i % 2 ? 4 : 5), y + 10 - i * 2, 7, 1);
  ctx.fillStyle = c.accent;
  ctx.fillRect(x + 1, y + 6, 14, 3);
}

function drawBarrel(ctx, x, y, angle, c) {
  ctx.save();
  ctx.translate(x + 8, y + 8);
  ctx.rotate(angle);
  ctx.fillStyle = '#8a4b22';
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#c47a3a';
  ctx.fillRect(-7, -2, 14, 1);
  ctx.fillRect(-7, 2, 14, 1);
  ctx.fillStyle = c?.accent ?? '#ffb000';
  ctx.fillRect(-1, -6, 2, 12);
  ctx.restore();
}

// ---------------------------------------------------------------- door and player

function drawDoor(ctx, world, u, t) {
  const d = doorRect(world);
  const x = Math.round(d.x);
  const y = Math.round(d.y);
  ctx.save();
  if (world.door.ceiling) {
    ctx.translate(0, y * 2 + d.h);
    ctx.scale(1, -1);
  }
  withAlpha(ctx, 0.18 + 0.08 * Math.sin(t * 4), () => {
    ctx.fillStyle = u.colors.accent;
    ctx.fillRect(x - 4, y - 4, d.w + 8, d.h + 6);
  });
  ctx.fillStyle = '#1d1b3a';
  ctx.fillRect(x, y + 3, 14, 19);
  ctx.fillStyle = u.colors.accent;
  ctx.fillRect(x - 1, y, 16, 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 2 + (Math.floor(t * 6) % 10), y + 1, 2, 2);
  const hue = Math.floor((t * 90) % 360);
  ctx.fillStyle = `hsl(${hue} 90% 60%)`;
  ctx.fillRect(x + 2, y + 6, 10, 7);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 5, y + 9, 4, 1);
  ctx.fillRect(x + 7, y + 8, 1, 3);
  ctx.fillStyle = '#3c3a6e';
  ctx.fillRect(x + 1, y + 14, 12, 3);
  ctx.fillStyle = '#ff4f7b';
  ctx.fillRect(x + 3, y + 14, 2, 2);
  ctx.fillStyle = '#4dd2ff';
  ctx.fillRect(x + 9, y + 15, 2, 1);
  ctx.fillStyle = u.colors.accent;
  ctx.fillRect(x + 6, y + 18, 2, 2);
  ctx.restore();
}

export function drawPlayer(ctx, p, u, t) {
  const c = u.colors;
  let w = 10;
  let h = 12;
  if (p.landT > 0) { w = 12; h = 10; }
  else if (!p.onGround && Math.abs(p.vy) > 220) { w = 9; h = 13; }
  const flip = p.gravity < 0;
  const x = Math.round(p.x + (p.w - w) / 2);
  const y = flip ? Math.round(p.y) : Math.round(p.y + p.h - h);
  ctx.save();
  if (flip) {
    ctx.translate(0, y * 2 + h);
    ctx.scale(1, -1);
  }
  // antenna
  ctx.fillStyle = c.eye;
  ctx.fillRect(x + Math.floor(w / 2), y - 4, 1, 4);
  ctx.fillStyle = Math.floor(t * 3) % 2 ? c.accent : '#ffffff';
  ctx.fillRect(x + Math.floor(w / 2) - 1, y - 6, 3, 2);
  // outline + body
  ctx.fillStyle = c.eye;
  ctx.fillRect(x + 1, y - 1, w - 2, h + 1);
  ctx.fillRect(x - 1, y + 1, w + 2, h - 2);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = c.player;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillRect(x, y + 2, w, h - 4);
  // cheeks
  ctx.fillStyle = '#ff9ec0';
  ctx.fillRect(x + 1, y + h - 5, 2, 1);
  ctx.fillRect(x + w - 3, y + h - 5, 2, 1);
  // eyes
  const blink = (t % 3.2) < 0.12;
  const look = p.facing > 0 ? 1 : -1;
  const ex = x + Math.floor(w / 2) + look - 3;
  ctx.fillStyle = c.eye;
  ctx.fillRect(ex, y + 3, 2, blink ? 1 : 3);
  ctx.fillRect(ex + 4, y + 3, 2, blink ? 1 : 3);
  // feet
  if (p.onGround && Math.abs(p.vx) > 20) {
    const step = Math.floor(t * 14) % 2;
    ctx.fillStyle = c.eye;
    ctx.fillRect(x + 1 + step, y + h, 3, 1);
    ctx.fillRect(x + w - 4 - step, y + h, 3, 1);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- world

export function drawWorld(ctx, world, u, t) {
  const c = u.colors;
  const g = world.grid;

  // static tiles
  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      const tile = g[r * COLS + col];
      const x = col * TILE;
      const y = r * TILE;
      if (solidish(tile)) {
        const at = (dc, dr) => {
          const cc = col + dc;
          const rr = r + dr;
          if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) return true;
          return solidish(g[rr * COLS + cc]);
        };
        drawTile(ctx, u, x, y, r, { top: !at(0, -1), bottom: !at(0, 1), left: !at(-1, 0), right: !at(1, 0) });
      } else if (tile >= T.SPIKE_UP && tile <= T.SPIKE_RIGHT) {
        drawSpike(ctx, x, y, tile, c.spike);
      } else if (tile === T.SPRING) {
        drawSpring(ctx, x, y, c);
      } else if (tile === T.SAW) {
        drawSaw(ctx, x + 8, y + 8, 8, t);
      }
    }
  }

  // trap groups
  for (const grp of Object.values(world.groups)) {
    if (!grp.visible || grp.gone) continue;
    const members = new Set(grp.tiles.map(([cc, rr]) => `${cc},${rr}`));
    for (const [col, r] of grp.tiles) {
      const x = Math.round(col * TILE + grp.ox);
      const y = Math.round(r * TILE + grp.oy);
      if (grp.kind === 'spike') {
        drawSpike(ctx, x, y, grp.dir, c.spike, grp.popT > 0 ? 1 - grp.popT / 0.12 : 1);
      } else {
        const has = (dc, dr) => members.has(`${col + dc},${r + dr}`) || (!grp.ox && !grp.oy && solidish(tileAt(world, col + dc, r + dr)));
        drawTile(ctx, u, x, y, r, { top: !has(0, -1), bottom: !has(0, 1), left: !has(-1, 0), right: !has(1, 0) });
      }
    }
  }

  drawDoor(ctx, world, u, t);

  for (const s of world.projectiles) {
    switch (s.kind) {
      case 'saw': drawSaw(ctx, s.x + s.w / 2, s.y + s.h / 2, s.w / 2, t); break;
      case 'barrel': drawBarrel(ctx, s.x, s.y, (s.x + s.y) / 7, c); break;
      case 'bomb':
        ctx.fillStyle = '#2b2b33';
        ctx.beginPath();
        ctx.arc(s.x + 8, s.y + 9, 6.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = Math.floor(t * 12) % 2 ? '#ffd23f' : '#ff4f4f';
        ctx.fillRect(s.x + 7, s.y, 2, 3);
        break;
      case 'ball':
        ctx.fillStyle = '#8f95a3';
        ctx.beginPath();
        ctx.arc(s.x + 8, s.y + 8, 7, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#5b606b';
        ctx.fillRect(s.x + 5, s.y + 6, 3, 2);
        ctx.fillRect(s.x + 9, s.y + 10, 2, 2);
        break;
      default:
        drawTile(ctx, u, Math.round(s.x), Math.round(s.y), 3, { top: true, bottom: true, left: true, right: true });
    }
  }

  if (world.status !== 'dead') drawPlayer(ctx, world.player, u, t);
}

export function drawSay(ctx, world, u) {
  if (!world.say) return;
  const age = world.time - world.say.t;
  if (age > 2.6) return;
  const alpha = Math.min(1, age * 6, (2.6 - age) * 3);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `8px ${FONT}`;
  ctx.textBaseline = 'top';
  const text = world.say.text;
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  const x = Math.round((WIDTH - w) / 2);
  const y = 26;
  ctx.fillStyle = 'rgba(5,5,20,0.85)';
  ctx.fillRect(x, y, w, 20);
  ctx.fillStyle = u.colors.accent;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + 19, w, 1);
  ctx.fillRect(x, y, 1, 20);
  ctx.fillRect(x + w - 1, y, 1, 20);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x + 8, y + 6);
  ctx.restore();
}

// ---------------------------------------------------------------- particles

export function spawnParticles(list, x, y, color, count, speed = 120, size = 2) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU;
    const v = speed * (0.4 + Math.random() * 0.8);
    list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + Math.random() * 0.5, age: 0, color, size });
  }
}

export function updateParticles(list, dt) {
  for (const p of list) {
    p.age += dt;
    p.vy += 500 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  return list.filter((p) => p.age < p.life);
}

export function drawParticles(ctx, list) {
  for (const p of list) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;
}
