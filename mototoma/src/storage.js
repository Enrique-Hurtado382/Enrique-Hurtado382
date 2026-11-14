// Guardado local: ajustes y progreso en localStorage, imágenes en IndexedDB.

const PREFIJO = 'mototoma:v1:';

function leer(clave, porDefecto) {
  try {
    const raw = localStorage.getItem(PREFIJO + clave);
    return raw ? { ...porDefecto, ...JSON.parse(raw) } : { ...porDefecto };
  } catch {
    return { ...porDefecto };
  }
}

function escribir(clave, valor) {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: la app sigue funcionando */
  }
}

export const AJUSTES_POR_DEFECTO = {
  voz: true,
  vozGrabando: true,
  vibracion: true,
  pararSola: true,
  cuadricula: true,
  calidad: '1080',      // '1080' | '720'
  fantasma: true,
  cuentaAtras: 3,
  formatos: {},         // editId → 'vertical' | 'horizontal' (si lo cambias)
  visto: false,         // ya vio la introducción
};

export function ajustes() {
  return leer('ajustes', AJUSTES_POR_DEFECTO);
}

export function guardarAjustes(cambios) {
  const a = { ...ajustes(), ...cambios };
  escribir('ajustes', a);
  return a;
}

/** Progreso: { [editId]: { [shotId]: { tomas, archivo, fecha, buena } } } */
export function progreso() {
  return leer('progreso', {});
}

export function progresoEdit(editId) {
  return progreso()[editId] || {};
}

export function marcarToma(editId, shotId, datos) {
  const p = progreso();
  const e = p[editId] || {};
  const previa = e[shotId] || { tomas: 0 };
  e[shotId] = { ...previa, ...datos, tomas: (previa.tomas || 0) + 1, fecha: Date.now() };
  p[editId] = e;
  escribir('progreso', p);
  return e[shotId];
}

export function reiniciarEdit(editId) {
  const p = progreso();
  delete p[editId];
  escribir('progreso', p);
}

// ---------------------------------------------------------------- IndexedDB

let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open('mototoma', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('imagenes');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }
  return dbPromise;
}

async function tx(modo, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction('imagenes', modo);
    const r = fn(t.objectStore('imagenes'));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
}

/** Imágenes: clave 'ref:<edit>:<toma>' (referencia) o 'cuadro:<edit>:<toma>:primero|ultimo'. */
export async function guardarImagen(clave, dataUrl) {
  try {
    await tx('readwrite', (s) => s.put(dataUrl, clave));
  } catch {
    /* ignorar */
  }
}

export async function leerImagen(clave) {
  try {
    return (await tx('readonly', (s) => s.get(clave))) || null;
  } catch {
    return null;
  }
}

export async function borrarImagenes(prefijo) {
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const t = d.transaction('imagenes', 'readwrite');
      const s = t.objectStore('imagenes');
      const req = s.openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        if (String(c.key).startsWith(prefijo)) c.delete();
        c.continue();
      };
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  } catch {
    /* ignorar */
  }
}
