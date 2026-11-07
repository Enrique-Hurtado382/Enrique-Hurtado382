import { api } from './api.js';
import { state, navigate, requireLogin } from './state.js';
import { clear, h } from './ui.js';
import { renderAuth } from './views/auth.js';
import { renderExplore } from './views/explore.js';
import { renderCharacter } from './views/character.js';
import { renderChats } from './views/chats.js';
import { renderChat } from './views/chat.js';
import { renderEditor } from './views/editor.js';
import { renderProfile } from './views/profile.js';

const routes = [
  { pattern: /^\/$/, view: renderExplore, tab: 'explore', public: true },
  { pattern: /^\/c\/(\d+)$/, view: renderCharacter, tab: 'explore', public: true },
  { pattern: /^\/chats$/, view: renderChats, tab: 'chats' },
  { pattern: /^\/chat\/(\d+)$/, view: renderChat, tab: null, fullscreen: true },
  { pattern: /^\/create$/, view: renderEditor, tab: 'create' },
  { pattern: /^\/edit\/(\d+)$/, view: renderEditor, tab: 'create' },
  { pattern: /^\/profile$/, view: renderProfile, tab: 'profile' },
  { pattern: /^\/login$/, view: renderAuth, tab: null, public: true, fullscreen: true },
];

let cleanup = null;

const TABS = [
  { id: 'explore', path: '/', icon: '✦', label: 'Explorar' },
  { id: 'chats', path: '/chats', icon: '💬', label: 'Chats' },
  { id: 'create', path: '/create', icon: '＋', label: 'Crear' },
  { id: 'profile', path: '/profile', icon: '☺', label: 'Perfil' },
];

function renderTabbar(active) {
  const bar = document.getElementById('tabbar');
  clear(bar);
  for (const tab of TABS) {
    bar.append(
      h(
        'a',
        { href: `#${tab.path}`, class: `tab${tab.id === active ? ' active' : ''}${tab.id === 'create' ? ' tab-create' : ''}`, 'aria-current': tab.id === active ? 'page' : null },
        h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, tab.icon),
        h('span', { class: 'tab-label' }, tab.label),
      ),
    );
  }
}

async function route() {
  const path = location.hash.slice(1) || '/';
  const match = routes.map((r) => ({ r, m: r.pattern.exec(path) })).find((x) => x.m);
  if (!match) return navigate('/');
  const { r, m } = match;

  if (!r.public && !state.user) return requireLogin();
  if (r.view === renderAuth && state.user) return navigate('/');

  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  document.querySelector('.menu')?.remove();

  document.body.classList.toggle('fullscreen', Boolean(r.fullscreen));
  renderTabbar(r.tab);
  const container = clear(document.getElementById('app'));
  window.scrollTo(0, 0);
  try {
    cleanup = await r.view(container, m.slice(1));
  } catch (err) {
    console.error(err);
    container.append(h('div', { class: 'page' }, h('p', { class: 'error-text' }, err.message || 'Algo salió mal.')));
  }
}

async function start() {
  try {
    const me = await api('/api/me');
    state.user = me.user;
    state.ai = me.ai;
  } catch {
    // Offline or server down: the views show their own errors.
  }
  window.addEventListener('hashchange', route);
  route();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

start();
