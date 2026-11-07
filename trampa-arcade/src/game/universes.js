// The five universes: names, colors, tile style, background and music.
// Backgrounds and music are original and only evoke classic arcade *genres*.
import u1 from './levels/u1-laberinto.js';
import u2 from './levels/u2-invasion.js';
import u3 from './levels/u3-ladrillos.js';
import u4 from './levels/u4-vector.js';
import u5 from './levels/u5-andamios.js';

export const UNIVERSES = [
  {
    id: 1,
    name: 'Laberinto Neón',
    tagline: 'Pasillos que mienten',
    levels: u1,
    tile: 'neon',
    background: 'maze',
    colors: {
      bg: '#06061a', bg2: '#0d0d3d', fill: '#0b0b30', edge: '#4d6bff', edge2: '#2537b8',
      spike: '#ff4f7b', accent: '#ffd23f', text: '#e8ecff', player: '#f4f6ff', eye: '#141433',
    },
    music: { tempo: 132, root: 57, chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]] },
  },
  {
    id: 2,
    name: 'Invasión Pixel',
    tagline: 'Algo cae del cielo',
    levels: u2,
    tile: 'metal',
    background: 'invaders',
    colors: {
      bg: '#020208', bg2: '#0a1a10', fill: '#2a303c', edge: '#5df27e', edge2: '#5b6478',
      spike: '#ff4040', accent: '#5df27e', text: '#e9ffe9', player: '#f4f6ff', eye: '#0b1a10',
    },
    music: { tempo: 118, root: 52, chords: [[0, 3, 7], [0, 3, 7], [-2, 2, 5], [-4, 0, 3]] },
  },
  {
    id: 3,
    name: 'Muro de Ladrillos',
    tagline: 'Las paredes caminan',
    levels: u3,
    tile: 'brick',
    background: 'bricks',
    colors: {
      bg: '#150a24', bg2: '#2a1442', fill: '#e2574c', edge: '#ffb36b', edge2: '#8c2a40',
      spike: '#ffe066', accent: '#4dd2ff', text: '#fff1e6', player: '#f4f6ff', eye: '#2a1442',
      bricks: ['#e2574c', '#f08a3c', '#f4c542', '#59c46b', '#3fa7e0', '#9b6ff2'],
    },
    music: { tempo: 140, root: 60, chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]] },
  },
  {
    id: 4,
    name: 'Vectorlandia',
    tagline: 'La gravedad miente',
    levels: u4,
    tile: 'wire',
    background: 'vector',
    colors: {
      bg: '#000004', bg2: '#12002a', fill: '#020210', edge: '#3dffd0', edge2: '#ff3dd8',
      spike: '#ff3dd8', accent: '#3dffd0', text: '#e6fffb', player: '#f4f6ff', eye: '#04041a', grid: '#5b2bb5',
    },
    music: { tempo: 108, root: 50, chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]] },
  },
  {
    id: 5,
    name: 'Andamios Locos',
    tagline: 'Todo rueda cuesta abajo',
    levels: u5,
    tile: 'girder',
    background: 'girders',
    colors: {
      bg: '#14070a', bg2: '#2a0d14', fill: '#d6336c', edge: '#ff8fb3', edge2: '#7a1235',
      spike: '#ffd23f', accent: '#ffb000', text: '#fff0f4', player: '#f4f6ff', eye: '#2a0d14',
    },
    music: { tempo: 150, root: 55, chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]] },
  },
];

export const ALL_LEVELS = UNIVERSES.flatMap((u) => u.levels.map((level) => ({ ...level, universe: u.id })));

export function findLevel(levelId) {
  const [u, n] = levelId.split('-').map(Number);
  return { universe: UNIVERSES[u - 1], level: UNIVERSES[u - 1].levels[n - 1], uIndex: u - 1, lIndex: n - 1 };
}
