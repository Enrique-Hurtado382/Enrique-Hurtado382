import { api } from '../api.js';
import { avatar, emptyState, h, timeAgo } from '../ui.js';

export async function renderChats(container) {
  const { chats } = await api('/api/chats');
  container.append(
    h(
      'div',
      { class: 'page' },
      h('header', { class: 'page-header' }, h('h1', {}, 'Chats')),
      chats.length
        ? h(
            'div',
            { class: 'list' },
            chats.map((chat) =>
              h(
                'a',
                { class: 'list-item', href: `#/chat/${chat.id}` },
                avatar(chat.character.avatar, chat.character.name, 'md'),
                h(
                  'div',
                  { class: 'list-item-body' },
                  h('div', { class: 'list-item-top' }, h('strong', {}, chat.character.name), h('span', { class: 'muted small' }, timeAgo(chat.updated_at))),
                  h('p', { class: 'list-item-text' }, chat.last_role === 'user' ? `Tú: ${chat.last_message}` : chat.last_message || 'Conversación vacía'),
                ),
              ),
            ),
          )
        : emptyState('💬', 'Aún no tienes conversaciones', 'Elige un personaje y salúdalo. Tus chats aparecerán aquí.', h('a', { class: 'btn btn-primary', href: '#/' }, 'Explorar personajes')),
    ),
  );
}
