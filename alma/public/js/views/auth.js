import { api } from '../api.js';
import { afterLogin, navigate, state } from '../state.js';
import { h } from '../ui.js';

export function renderAuth(container) {
  let mode = 'login';
  const error = h('p', { class: 'error-text', role: 'alert' });
  const username = h('input', { id: 'username', name: 'username', autocomplete: 'username', required: true, maxlength: 24, autocapitalize: 'none', spellcheck: 'false' });
  const displayName = h('input', { id: 'display_name', name: 'display_name', autocomplete: 'nickname', maxlength: 40 });
  const password = h('input', { id: 'password', name: 'password', type: 'password', autocomplete: 'current-password', required: true, minlength: 8 });
  const nameField = h('div', { class: 'field', hidden: true }, h('label', { for: 'display_name' }, '¿Cómo quieres que te llamen?'), displayName);
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Entrar');
  const switchText = h('span');
  const switchBtn = h('button', { type: 'button', class: 'link', onclick: () => setMode(mode === 'login' ? 'register' : 'login') });

  function setMode(next) {
    mode = next;
    const isLogin = mode === 'login';
    nameField.hidden = isLogin;
    submit.textContent = isLogin ? 'Entrar' : 'Crear cuenta';
    password.autocomplete = isLogin ? 'current-password' : 'new-password';
    switchText.textContent = isLogin ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? ';
    switchBtn.textContent = isLogin ? 'Regístrate' : 'Inicia sesión';
    error.textContent = '';
  }

  const form = h(
    'form',
    {
      class: 'auth-card',
      onsubmit: async (e) => {
        e.preventDefault();
        error.textContent = '';
        submit.disabled = true;
        try {
          const body = { username: username.value, password: password.value };
          if (mode === 'register') body.display_name = displayName.value;
          const { user } = await api(`/api/auth/${mode}`, { method: 'POST', body });
          state.user = user;
          afterLogin();
        } catch (err) {
          error.textContent = err.message;
        } finally {
          submit.disabled = false;
        }
      },
    },
    h('div', { class: 'field' }, h('label', { for: 'username' }, 'Usuario'), username),
    nameField,
    h('div', { class: 'field' }, h('label', { for: 'password' }, 'Contraseña'), password),
    error,
    submit,
    h('p', { class: 'auth-switch' }, switchText, switchBtn),
  );

  setMode('login');
  container.append(
    h(
      'div',
      { class: 'auth-page' },
      h('button', { class: 'icon-btn auth-back', 'aria-label': 'Volver', onclick: () => navigate('/') }, '←'),
      h('div', { class: 'brand-big' }, h('span', { class: 'logo-mark' }, 'a'), h('h1', {}, 'Alma')),
      h('p', { class: 'auth-tagline' }, 'Crea personajes con inteligencia artificial y habla con ellos cuando quieras.'),
      form,
    ),
  );
  username.focus();
}
