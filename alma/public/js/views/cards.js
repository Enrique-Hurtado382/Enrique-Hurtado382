import { state } from '../state.js';
import { avatar, compactNumber, h } from '../ui.js';

export function characterCard(c) {
  return h(
    'a',
    { class: 'card', href: `#/c/${c.id}` },
    h('div', { class: 'card-avatar' }, avatar(c.avatar, c.name, 'xl')),
    h(
      'div',
      { class: 'card-body' },
      h('h3', { class: 'card-title' }, c.name, c.visibility === 'private' ? h('span', { class: 'badge', title: 'Privado' }, '🔒') : null),
      h('p', { class: 'card-tagline' }, c.tagline || c.description),
      h(
        'div',
        { class: 'card-meta' },
        h('span', { title: 'Conversaciones' }, `💬 ${compactNumber(c.chat_count)}`),
        h('span', { title: 'Me gusta' }, `${c.liked ? '♥' : '♡'} ${compactNumber(c.like_count)}`),
        h('span', { class: 'card-creator' }, `@${c.creator.username}`),
      ),
    ),
  );
}

export function characterGrid(characters) {
  return h('div', { class: 'grid' }, characters.map(characterCard));
}

/** Notice shown while the server runs without an API key. */
export function demoBanner() {
  if (state.ai.mode !== 'demo') return null;
  return h(
    'div',
    { class: 'banner' },
    h('strong', {}, 'Modo demo. '),
    'Los personajes responden con mensajes de ejemplo. Añade ANTHROPIC_API_KEY en el archivo .env del servidor para activar la IA.',
  );
}
