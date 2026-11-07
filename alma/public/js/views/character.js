import { api } from '../api.js';
import { navigate, requireLogin, state } from '../state.js';
import { avatar, compactNumber, confirmDialog, formatMessage, h, timeAgo, toast } from '../ui.js';

export async function renderCharacter(container, [id]) {
  const { character: c } = await api(`/api/characters/${id}`);
  const previousChats = state.user
    ? (await api('/api/chats')).chats.filter((chat) => chat.character.id === c.id)
    : [];

  const likeBtn = h('button', { class: `btn btn-ghost like-btn${c.liked ? ' liked' : ''}`, 'aria-pressed': String(c.liked), onclick: toggleLike });
  function renderLike() {
    likeBtn.textContent = `${c.liked ? '♥' : '♡'} ${compactNumber(c.like_count)}`;
    likeBtn.classList.toggle('liked', c.liked);
    likeBtn.setAttribute('aria-pressed', String(c.liked));
    likeBtn.setAttribute('aria-label', c.liked ? 'Quitar me gusta' : 'Me gusta');
  }
  async function toggleLike() {
    if (!state.user) return requireLogin();
    try {
      const res = await api(`/api/characters/${c.id}/like`, { method: 'POST' });
      c.liked = res.liked;
      c.like_count = res.like_count;
      renderLike();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  renderLike();

  const startBtn = h('button', {
    class: 'btn btn-primary btn-block btn-lg',
    onclick: async () => {
      if (!state.user) return requireLogin();
      startBtn.disabled = true;
      try {
        const { chat } = await api('/api/chats', { method: 'POST', body: { character_id: c.id } });
        navigate(`/chat/${chat.id}`);
      } catch (err) {
        toast(err.message, 'error');
        startBtn.disabled = false;
      }
    },
  }, previousChats.length ? 'Nueva conversación' : 'Empezar a chatear');

  const ownerActions = c.is_owner
    ? h(
        'div',
        { class: 'row gap' },
        h('a', { class: 'btn btn-ghost', href: `#/edit/${c.id}` }, '✎ Editar'),
        h('button', {
          class: 'btn btn-ghost danger',
          onclick: async () => {
            const ok = await confirmDialog(`¿Eliminar a ${c.name}? También se borrarán todas sus conversaciones.`, { confirmLabel: 'Eliminar', danger: true });
            if (!ok) return;
            try {
              await api(`/api/characters/${c.id}`, { method: 'DELETE' });
              toast('Personaje eliminado');
              navigate('/profile');
            } catch (err) {
              toast(err.message, 'error');
            }
          },
        }, 'Eliminar'),
      )
    : null;

  const section = (title, body) => (body ? h('section', { class: 'detail-section' }, h('h2', {}, title), h('p', { class: 'pre' }, body)) : null);

  container.append(
    h(
      'div',
      { class: 'page character-page' },
      h('header', { class: 'topbar' }, h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: () => history.length > 1 ? history.back() : navigate('/') }, '←')),
      h(
        'div',
        { class: 'hero' },
        avatar(c.avatar, c.name, 'hero'),
        h('h1', {}, c.name),
        c.tagline ? h('p', { class: 'hero-tagline' }, c.tagline) : null,
        h(
          'p',
          { class: 'hero-meta' },
          `por @${c.creator.username} · 💬 ${compactNumber(c.chat_count)}`,
          c.visibility === 'private' ? ' · 🔒 Privado' : '',
        ),
        c.tags.length ? h('div', { class: 'chips chips-center' }, c.tags.map((t) => h('span', { class: 'chip chip-static' }, `#${t}`))) : null,
      ),
      h('div', { class: 'row gap' }, startBtn, likeBtn),
      previousChats.length
        ? h(
            'section',
            { class: 'detail-section' },
            h('h2', {}, 'Tus conversaciones'),
            h('div', { class: 'list' }, previousChats.map((chat) =>
              h('a', { class: 'list-item', href: `#/chat/${chat.id}` },
                h('div', { class: 'list-item-body' },
                  h('p', { class: 'list-item-text' }, chat.last_message || 'Conversación vacía'),
                  h('span', { class: 'muted small' }, timeAgo(chat.updated_at))),
                h('span', { class: 'chevron', 'aria-hidden': 'true' }, '›')),
            )),
          )
        : null,
      section('Descripción', c.description),
      c.greeting
        ? h('section', { class: 'detail-section' }, h('h2', {}, 'Saludo'), h('div', { class: 'bubble bubble-ai bubble-preview' }, formatMessage(c.greeting.replace(/\{\{\s*char\s*\}\}/gi, c.name).replace(/\{\{\s*user\s*\}\}/gi, state.user?.display_name || 'tú'))))
        : null,
      c.is_owner ? section('Personalidad', c.personality) : null,
      c.is_owner ? section('Escenario', c.scenario) : null,
      c.is_owner ? section('Diálogo de ejemplo', c.example_dialogue) : null,
      ownerActions,
    ),
  );
}
