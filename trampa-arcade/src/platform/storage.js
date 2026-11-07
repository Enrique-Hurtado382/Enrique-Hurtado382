// Saves progress on the device (Capacitor Preferences on Android, localStorage on the web).
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const KEY = 'trampa-arcade-save-v1';

export function defaultSave() {
  return {
    version: 1,
    completed: {}, // levelId -> { deaths }
    skipped: {}, // levelId -> true
    deaths: 0,
    settings: { sfx: true, music: true, vibration: true },
    adsRemoved: false,
    levelsSinceAd: 0,
  };
}

export async function loadSave() {
  try {
    const raw = Capacitor.isNativePlatform()
      ? (await Preferences.get({ key: KEY })).value
      : localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    const base = defaultSave();
    return { ...base, ...data, settings: { ...base.settings, ...data.settings } };
  } catch {
    return defaultSave();
  }
}

let pending = null;
export function writeSave(save) {
  // Coalesce bursts of writes (e.g. several deaths in a row).
  clearTimeout(pending);
  pending = setTimeout(async () => {
    const raw = JSON.stringify(save);
    try {
      if (Capacitor.isNativePlatform()) await Preferences.set({ key: KEY, value: raw });
      else localStorage.setItem(KEY, raw);
    } catch {
      // Storage full or unavailable: the game keeps working without saving.
    }
  }, 200);
}
