import { EDITS } from '../catalog.js';
import { iconoApp, portada } from '../art.js';
import { progresoEdit } from '../storage.js';
import { esc, formatoDe, ICONOS_UI, seg } from '../ui.js';

const FILTROS = [
  { id: 'todos', txt: 'Todos', f: () => true },
  { id: 'noche', txt: 'Noche', f: (e) => e.momento === 'Noche' },
  { id: 'dia', txt: 'Día', f: (e) => e.momento !== 'Noche' },
  { id: 'vertical', txt: 'Vertical', f: (e) => formatoDe(e) === 'vertical' },
  { id: 'horizontal', txt: 'Horizontal', f: (e) => formatoDe(e) === 'horizontal' },
  { id: 'solo', txt: 'Solo tú', f: (e) => e.personas.startsWith('Solo') },
  { id: 'piloto', txt: 'Con piloto', f: (e) => !e.personas.startsWith('Solo') },
  { id: 'facil', txt: 'Fáciles', f: (e) => e.dificultad === 1 },
  { id: 'analizados', txt: 'De tus vídeos', f: (e) => e.origen === 'analizado' },
];

let filtroActual = 'todos';

function tarjeta(e) {
  const p = progresoEdit(e.id);
  const hechas = e.tomas.filter((t) => p[t.id]).length;
  const formato = formatoDe(e);
  return `<button class="card" data-id="${e.id}">
    <div class="card-art">${portada(e)}
      <span class="card-badge">${formato === 'vertical' ? '9:16' : '16:9'}</span>
      ${e.origen === 'analizado' ? '<span class="card-badge right">De tus vídeos</span>' : ''}
    </div>
    <div class="card-body">
      <h3>${esc(e.nombre)}</h3>
      <p>${esc(e.lema)}</p>
      <div class="meta">
        <span class="tag">${seg(e.duracion)}</span>
        <span class="tag">${e.tomas.length} tomas</span>
        <span class="tag">${esc(e.momento)}</span>
        <span class="tag">${esc(e.personas)}</span>
        <span class="tag"><span class="dots-level">${'●'.repeat(e.dificultad)}${'○'.repeat(3 - e.dificultad)}</span></span>
      </div>
      ${hechas ? `<div class="progress" title="${hechas} de ${e.tomas.length}"><i style="width:${(hechas / e.tomas.length) * 100}%"></i></div>` : ''}
    </div>
  </button>`;
}

export function inicio(root, { ir }) {
  const pintar = () => {
    const filtro = FILTROS.find((f) => f.id === filtroActual) || FILTROS[0];
    const lista = EDITS.filter(filtro.f);
    root.innerHTML = `<main class="screen">
      <header class="topbar">
        <div class="brand" style="flex:1">
          <div class="brand-logo">${iconoApp()}</div>
          <div><h1>MotoToma</h1><p>Graba edits de motos guiado</p></div>
        </div>
        <button class="btn-icon" data-ir="#/ayuda" aria-label="Cómo funciona">${ICONOS_UI.ayuda}</button>
        <button class="btn-icon" data-ir="#/ajustes" aria-label="Ajustes">${ICONOS_UI.ajustes}</button>
      </header>
      <p class="hero">Elige un edit y la cámara te guía toma a toma: encuadre, altura, movimiento, velocidad y cuándo cortar.</p>
      <nav class="chips" aria-label="Filtros">
        ${FILTROS.map((f) => `<button class="chip" data-f="${f.id}" aria-pressed="${f.id === filtroActual}">${f.txt}</button>`).join('')}
      </nav>
      <section class="grid">${lista.map(tarjeta).join('') || '<p class="muted">No hay edits con ese filtro.</p>'}</section>
    </main>`;
    root.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => ir(`#/edit/${c.dataset.id}`)));
    root.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => ir(b.dataset.ir)));
    root.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
      filtroActual = c.dataset.f;
      pintar();
    }));
  };
  pintar();
}
