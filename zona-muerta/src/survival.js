// Items, loot tables, crafting and saving.

export const ITEMS = {
  ammo: { name: 'Munición 9 mm', icon: '⁍' },
  food: { name: 'Lata de comida', icon: '🥫', use: { hunger: 40 }, verb: 'Comer' },
  water: { name: 'Botella de agua', icon: '💧', use: { hunger: 15, stamina: 100 }, verb: 'Beber' },
  bandage: { name: 'Venda', icon: '🩹', use: { health: 25 }, verb: 'Usar' },
  medkit: { name: 'Botiquín', icon: '✚', use: { health: 70 }, verb: 'Usar' },
  cloth: { name: 'Tela', icon: '🧵' },
  scrap: { name: 'Chatarra', icon: '⚙' },
  powder: { name: 'Pólvora', icon: '✦' },
  alcohol: { name: 'Alcohol', icon: '⚗' },
};

export const RECIPES = [
  { id: 'bandage', name: 'Venda', needs: { cloth: 2 }, gives: { bandage: 1 } },
  { id: 'medkit', name: 'Botiquín', needs: { bandage: 2, alcohol: 1 }, gives: { medkit: 1 } },
  { id: 'ammo', name: 'Munición ×12', needs: { scrap: 2, powder: 1 }, gives: { ammo: 12 } },
  { id: 'knife', name: 'Afilar cuchillo (+daño)', needs: { scrap: 4, cloth: 1 }, upgrade: 'knife', max: 3 },
];

// item, min, max, chance
const LOOT = {
  caja: [['ammo', 4, 10, 0.6], ['scrap', 1, 3, 0.7], ['powder', 1, 2, 0.35], ['cloth', 1, 2, 0.4]],
  coche: [['scrap', 1, 3, 0.75], ['food', 1, 1, 0.45], ['water', 1, 1, 0.4], ['alcohol', 1, 1, 0.25], ['ammo', 3, 6, 0.3]],
  contenedor: [['cloth', 1, 3, 0.7], ['scrap', 1, 2, 0.5], ['food', 1, 1, 0.35]],
  casa: [['food', 1, 2, 0.65], ['water', 1, 2, 0.5], ['cloth', 1, 2, 0.5], ['bandage', 1, 1, 0.3], ['alcohol', 1, 1, 0.2]],
  tienda: [['food', 1, 3, 0.8], ['water', 1, 2, 0.7], ['alcohol', 1, 2, 0.4], ['cloth', 1, 1, 0.3]],
  botiquin: [['bandage', 1, 3, 0.85], ['medkit', 1, 1, 0.4], ['alcohol', 1, 2, 0.6]],
  militar: [['ammo', 10, 20, 0.9], ['powder', 1, 3, 0.6], ['medkit', 1, 1, 0.3], ['food', 1, 1, 0.4]],
};
const RESPAWN = 240; // seconds until a searched place has something again

export function rollLoot(type) {
  const found = {};
  for (const [item, min, max, chance] of LOOT[type] ?? []) {
    if (Math.random() < chance) found[item] = (found[item] ?? 0) + min + Math.floor(Math.random() * (max - min + 1));
  }
  if (!Object.keys(found).length) found.scrap = 1;
  return found;
}

export function lootReady(spot, now) {
  return now >= spot.readyAt;
}

export function markSearched(spot, now) {
  spot.readyAt = now + RESPAWN;
}

export function canCraft(inv, recipe, upgrades) {
  if (recipe.upgrade && (upgrades[recipe.upgrade] ?? 0) >= recipe.max) return false;
  return Object.entries(recipe.needs).every(([item, n]) => (inv[item] ?? 0) >= n);
}

export function craft(inv, recipe, upgrades) {
  if (!canCraft(inv, recipe, upgrades)) return false;
  for (const [item, n] of Object.entries(recipe.needs)) inv[item] -= n;
  if (recipe.gives) for (const [item, n] of Object.entries(recipe.gives)) inv[item] = (inv[item] ?? 0) + n;
  if (recipe.upgrade) upgrades[recipe.upgrade] = (upgrades[recipe.upgrade] ?? 0) + 1;
  return true;
}

export function describe(items) {
  return Object.entries(items).map(([k, n]) => `${ITEMS[k].name} ×${n}`).join(', ');
}

const SAVE_KEY = 'zona-muerta-v1';

export function newGame() {
  return {
    health: 100,
    hunger: 100,
    stamina: 100,
    clip: 12,
    inv: { ammo: 24, food: 1, bandage: 1 },
    upgrades: {},
    kills: 0,
    days: 1,
    hour: 8.5,
    pos: null,
    loot: {},
    look: { outfit: 'oliva', hair: 'long', hairColor: 'castano', eyes: 'avellana' },
    settings: { quality: 'media', sensitivity: 1, volume: 0.8 },
  };
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const base = newGame();
    return { ...base, ...data, look: { ...base.look, ...data.look }, settings: { ...base.settings, ...data.settings } };
  } catch {
    return null;
  }
}

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable: keep playing without saving.
  }
}

export function clearSave(keepLookAndSettings) {
  const fresh = newGame();
  if (keepLookAndSettings) {
    fresh.look = keepLookAndSettings.look;
    fresh.settings = keepLookAndSettings.settings;
  }
  saveGame(fresh);
  return fresh;
}
