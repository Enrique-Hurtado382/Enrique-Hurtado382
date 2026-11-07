import { api } from '../api.js';
import { navigate, state } from '../state.js';
import { avatar, clear, emptyState, h, spinner, toast } from '../ui.js';
import { characterGrid } from './cards.js';

export async function renderProfile(container) {
  const user = state.user;
  let tab = 'mine';

  const displayName = h('input', { id: 'p-name', maxlength: 40, required: true, value: user.display_name });
  const persona = h(
    'textarea',
    { id: 'p-persona', rows: 4, maxlength: 1500, placeholder: 'Ej.: Tengo 25 años, vivo en Madrid, me encantan los videojuegos y el café.' },
    user.persona || '',
  );
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Guardar');
  const form = h(
    'form',
    {
      class: 'card-panel',
      onsubmit: async (e) => {
        e.preventDefault();
        saveBtn.disabled = true;
        try {
          const res = await api('/api/me', { method: 'PATCH', body: { display_name: displayName.value, persona: persona.value } });
          state.user = res.user;
          clear(header).append(...headerContent());
          toast('Perfil guardado');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          saveBtn.disabled = false;
        }
      },
    },
    h('div', { class: 'field' }, h('label', { for: 'p-name' }, 'Cómo te llaman los personajes'), displayName),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'p-persona' }, 'Sobre ti'),
      persona,
      h('p', { class: 'help' }, 'Opcional. Los personajes lo tendrán en cuenta al hablar contigo.'),
    ),
    saveBtn,
  );

  const headerContent = () => [
    avatar('', state.user.display_name, 'lg'),
    h('div', {}, h('h1', {}, state.user.display_name), h('p', { class: 'muted' }, `@${state.user.username}`)),
  ];
  const header = h('div', { class: 'profile-header' }, ...headerContent());

  const tabs = h('div', { class: 'segmented' });
  const list = h('div', { class: 'results' });

  async function loadList() {
    clear(tabs);
    for (const [value, label] of [['mine', 'Mis personajes'], ['liked', 'Me gustan']]) {
      tabs.append(h('button', { class: `segment${tab === value ? ' active' : ''}`, onclick: () => { tab = value; loadList(); } }, label));
    }
    clear(list).append(spinner());
    try {
      const { characters } = await api(tab === 'mine' ? '/api/characters/mine' : '/api/characters/liked');
      clear(list).append(
        characters.length
          ? characterGrid(characters)
          : tab === 'mine'
            ? emptyState('✨', 'Todavía no has creado personajes', 'Crea el primero en menos de un minuto.', h('a', { class: 'btn btn-primary', href: '#/create' }, 'Crear personaje'))
            : emptyState('♡', 'Sin favoritos', 'Pulsa el corazón en un personaje para guardarlo aquí.'),
      );
    } catch (err) {
      clear(list).append(h('p', { class: 'error-text' }, err.message));
    }
  }

  const logout = h('button', {
    class: 'btn btn-ghost btn-block',
    onclick: async () => {
      await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
      state.user = null;
      navigate('/');
    },
  }, 'Cerrar sesión');

  container.append(
    h(
      'div',
      { class: 'page' },
      header,
      form,
      tabs,
      list,
      h('p', { class: 'muted small center' }, state.ai.mode === 'demo' ? 'IA en modo demo' : `IA: ${state.ai.model}`),
      logout,
    ),
  );
  await loadList();
}
