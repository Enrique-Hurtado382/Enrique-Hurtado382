// Utilidades de interfaz compartidas.
import { golpes } from './catalog.js';
import { ajustes } from './storage.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer = null;
export function toast(texto, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = texto;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export const COLORES = ['#ff8a3d', '#5cc8ff', '#b28dff', '#3ddc84', '#ffd23d', '#ff6b9a', '#4de1d2', '#c2e85c', '#ffa8a8', '#9fb4ff'];
export function colorToma(edit, shotId) {
  const i = edit.tomas.findIndex((t) => t.id === shotId);
  return i < 0 ? '#333' : COLORES[i % COLORES.length];
}

export function formatoDe(edit) {
  return ajustes().formatos?.[edit.id] || edit.formato;
}

export function seg(n) {
  return `${(Math.round(n * 10) / 10).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

export const ICONOS_UI = {
  atras: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  ayuda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-5M12 8h.01"/></svg>',
  lente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-3l-2-3H9L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M9 13a3 3 0 0 0 5.2 2M15 13a3 3 0 0 0-5.2-2"/></svg>',
  linterna: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  fantasma: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="13" height="10" rx="2"/><rect x="8" y="9" width="13" height="10" rx="2" opacity=".6"/></svg>',
  cuadricula: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>',
  ant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  sig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  galeria: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
};

/** Flechas de movimiento para la cámara. */
export function flechaMovimiento(mov) {
  const s = (d) => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  switch (mov.tipo) {
    case 'orbita':
      return mov.dir === 'der'
        ? s('<path d="M6 20a12 7 0 0 0 20 0"/><path d="M6 20a12 7 0 0 1 20-4"/><path d="M22 10l4 6-7 1"/>')
        : s('<path d="M26 20a12 7 0 0 1-20 0"/><path d="M26 20a12 7 0 0 0-20-4"/><path d="M10 10l-4 6 7 1"/>');
    case 'paneo':
      return mov.dir === 'der' ? s('<path d="M6 22a12 12 0 0 1 20-8"/><path d="M20 8l6 6-7 2"/>') : s('<path d="M26 22a12 12 0 0 0-20-8"/><path d="M12 8l-6 6 7 2"/>');
    case 'deslizar':
      return mov.dir === 'der' ? s('<path d="M4 16h22"/><path d="M19 9l7 7-7 7"/>') : s('<path d="M28 16H6"/><path d="M13 9l-7 7 7 7"/>');
    case 'subir':
      return s('<path d="M16 28V6"/><path d="M9 13l7-7 7 7"/>');
    case 'bajar':
      return s('<path d="M16 4v22"/><path d="M9 19l7 7 7-7"/>');
    case 'acercar':
      return s('<path d="M4 4l8 8M28 4l-8 8M4 28l8-8M28 28l-8-8"/><rect x="12" y="12" width="8" height="8" rx="1"/>');
    case 'alejar':
      return s('<path d="M11 11L4 4M21 11l7-7M11 21l-7 7M21 21l7 7"/><path d="M4 9V4h5M28 9V4h-5M4 23v5h5M28 23v5h-5"/>');
    case 'giro':
      return s('<path d="M26 16a10 10 0 1 1-4-8"/><path d="M23 3l-1 6 6 1"/>');
    case 'pov':
      return s('<path d="M10 26c-2 0-3-2-3-5s1-8 4-8 3 4 3 7-2 6-4 6zM22 18c-2 0-3-2-3-5s1-8 4-8 3 4 3 7-2 6-4 6z"/>');
    default:
      return s('<circle cx="16" cy="16" r="10"/><path d="M12 12v8M20 12v8"/>');
  }
}

/** Línea de tiempo del edit (HTML). La interactividad la añade enlazarTimeline. */
export function timelineHTML(edit, { marcar = null } = {}) {
  const total = edit.duracion;
  const segs = edit.estructura.map((s, i) => {
    const w = ((s.hasta - s.desde) / total) * 100;
    const n = s.toma ? edit.tomas.findIndex((t) => t.id === s.toma) + 1 : '';
    const color = s.toma ? colorToma(edit, s.toma) : '';
    const resaltado = marcar && s.toma === marcar;
    const estilo = s.toma ? `background:${color};${marcar && !resaltado ? 'opacity:.3;' : ''}` : '';
    return `<button class="tl-seg ${s.toma ? '' : 'black'}" style="width:${w}%;${estilo}" data-i="${i}" aria-label="Segmento ${i + 1}">${w > 3.2 ? n : ''}</button>`;
  }).join('');
  const bpb = 4;
  const beats = golpes(edit).map((t, i) => `<i class="${i % bpb === 0 ? 'bar' : ''}" style="left:${(t / total) * 100}%"></i>`).join('');
  const drop = edit.drop != null ? `<div class="tl-drop" style="left:${(edit.drop / total) * 100}%">⚡ drop</div>` : '';
  return `<div class="timeline">${drop}<div class="tl-bar">${segs}</div><div class="tl-beats">${beats}</div>
    <div class="tl-axis"><span>0 s</span><span>${seg(total / 2)}</span><span>${seg(total)}</span></div></div>`;
}

export function textoSegmento(edit, s) {
  const shot = s.toma ? edit.tomas.find((t) => t.id === s.toma) : null;
  const n = shot ? `T${String(edit.tomas.indexOf(shot) + 1).padStart(2, '0')} · ${shot.nombre}` : 'Pantalla negra';
  return `<b>${seg(s.desde)} – ${seg(s.hasta)}</b> · ${esc(n)}${s.nota ? `<br><span class="muted small">${esc(s.nota)}</span>` : ''}`;
}

export function enlazarTimeline(root, edit, info) {
  root.querySelectorAll('.tl-seg').forEach((b) => {
    b.addEventListener('click', () => {
      root.querySelectorAll('.tl-seg').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      if (info) info.innerHTML = textoSegmento(edit, edit.estructura[+b.dataset.i]);
    });
  });
}

/** Pitido corto con WebAudio (cuenta atrás). */
let audioCtx = null;
export function pitido(frecuencia = 880, duracion = 0.12) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = frecuencia;
    g.gain.setValueAtTime(0.25, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duracion);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + duracion);
  } catch {
    /* sin audio */
  }
}
