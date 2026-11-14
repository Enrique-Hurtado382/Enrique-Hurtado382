// MotoToma: punto de entrada y navegación entre pantallas.
import { App } from '@capacitor/app';
import { inicio } from './screens/inicio.js';
import { detalle } from './screens/detalle.js';
import { camara } from './screens/camara.js';
import { montaje } from './screens/montaje.js';
import { pantallaAjustes } from './screens/ajustes.js';
import { ayuda } from './screens/ayuda.js';
import { ajustes } from './storage.js';
import { activarVibracion, activarVoz, esNativo } from './native.js';

const RUTAS = [
  [/^#\/?$/, inicio],
  [/^#\/edit\/([\w-]+)$/, detalle],
  [/^#\/rodar\/([\w-]+)\/(\d+)$/, camara],
  [/^#\/montaje\/([\w-]+)$/, montaje],
  [/^#\/ajustes$/, pantallaAjustes],
  [/^#\/ayuda$/, ayuda],
];

const root = document.getElementById('app');
let actual = null;

// Pila propia de pantallas: así "volver" nunca sale de la app por error.
const pila = [location.hash || '#/'];

/** Navega a una ruta. atras=true vuelve en el historial si es la pantalla anterior. */
function ir(hash, atras = false) {
  if (atras && pila.length >= 2 && pila[pila.length - 2] === hash) {
    history.back();
    return;
  }
  if (location.hash === hash) render();
  else location.hash = hash;
}

/** Cambia la ruta actual sin crear una entrada nueva en el historial. */
function reemplazar(hash) {
  history.replaceState(null, '', hash);
  pila[pila.length - 1] = hash;
}

function render() {
  if (actual?.limpiar) actual.limpiar();
  actual = null;
  const hash = location.hash || '#/';
  for (const [re, pantalla] of RUTAS) {
    const m = hash.match(re);
    if (m) {
      root.innerHTML = '';
      window.scrollTo(0, 0);
      actual = pantalla(root, { params: m.slice(1), ir, reemplazar }) || null;
      return;
    }
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', () => {
  const h = location.hash || '#/';
  if (pila.length >= 2 && pila[pila.length - 2] === h) pila.pop();
  else pila.push(h);
  render();
});

if (esNativo) {
  App.addListener('backButton', () => {
    if (actual?.alVolver && actual.alVolver()) return;
    const hash = location.hash || '#/';
    if (hash === '#/' || hash === '#') {
      App.exitApp();
      return;
    }
    const m = hash.match(/^#\/(rodar|montaje)\/([\w-]+)/);
    if (m) ir(`#/edit/${m[2]}`, true);
    else ir('#/', true);
  });
}

const a = ajustes();
activarVoz(a.voz);
activarVibracion(a.vibracion);
if (!a.visto && (!location.hash || location.hash === '#/')) reemplazar('#/ayuda');
render();
