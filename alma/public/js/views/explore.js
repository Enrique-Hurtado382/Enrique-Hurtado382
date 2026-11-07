import { api } from '../api.js';
import { navigate, state } from '../state.js';
import { clear, emptyState, h, spinner } from '../ui.js';
import { characterGrid, demoBanner } from './cards.js';

export async function renderExplore(container) {
  const params = { q: '', tag: '', sort: 'popular' };
  const results = h('div', { class: 'results' }, spinner());
  const tagRow = h('div', { class: 'chips' });
  const sortRow = h('div', { class: 'segmented', role: 'tablist' });
  let requestId = 0;

  async function load() {
    const id = ++requestId;
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.tag) query.set('tag', params.tag);
    query.set('sort', params.sort);
    try {
      const { characters } = await api(`/api/characters?${query}`);
      if (id !== requestId) return;
      clear(results).append(
        characters.length
          ? characterGrid(characters)
          : emptyState('🔍', 'Sin resultados', 'Prueba con otra búsqueda o crea tú ese personaje.', h('a', { class: 'btn btn-primary', href: '#/create' }, 'Crear personaje')),
      );
    } catch (err) {
      if (id === requestId) clear(results).append(h('p', { class: 'error-text' }, err.message));
    }
  }

  function renderSort() {
    clear(sortRow);
    for (const [value, label] of [['popular', 'Populares'], ['new', 'Nuevos']]) {
      sortRow.append(
        h('button', {
          class: `segment${params.sort === value ? ' active' : ''}`,
          role: 'tab',
          'aria-selected': String(params.sort === value),
          onclick: () => {
            params.sort = value;
            renderSort();
            load();
          },
        }, label),
      );
    }
  }

  function renderTags(tags) {
    clear(tagRow);
    for (const tag of ['', ...tags]) {
      tagRow.append(
        h('button', {
          class: `chip${params.tag === tag ? ' active' : ''}`,
          'aria-pressed': String(params.tag === tag),
          onclick: () => {
            params.tag = tag;
            renderTags(tags);
            load();
          },
        }, tag ? `#${tag}` : 'Todos'),
      );
    }
  }

  let debounce;
  const search = h('input', {
    type: 'search',
    class: 'search',
    placeholder: 'Buscar personajes…',
    'aria-label': 'Buscar personajes',
    oninput: (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        params.q = e.target.value.trim();
        load();
      }, 250);
    },
  });

  container.append(
    h(
      'div',
      { class: 'page' },
      h(
        'header',
        { class: 'page-header' },
        h('div', { class: 'brand' }, h('span', { class: 'logo-mark' }, 'a'), h('span', { class: 'brand-name' }, 'Alma')),
        state.user
          ? h('a', { class: 'btn btn-primary btn-sm', href: '#/create' }, '+ Crear')
          : h('button', { class: 'btn btn-primary btn-sm', onclick: () => navigate('/login') }, 'Entrar'),
      ),
      h('p', { class: 'page-intro' }, 'Descubre personajes creados por la comunidad y empieza a conversar.'),
      demoBanner(),
      search,
      tagRow,
      sortRow,
      results,
    ),
  );

  renderSort();
  renderTags([]);
  api('/api/tags').then(({ tags }) => renderTags(tags)).catch(() => {});
  await load();
  return () => clearTimeout(debounce);
}
