import { api, streamPost } from '../api.js';
import { navigate } from '../state.js';
import { avatar, clear, confirmDialog, formatMessage, h, openMenu, toast } from '../ui.js';
import { demoBanner } from './cards.js';

export async function renderChat(container, [chatId]) {
  const { chat } = await api(`/api/chats/${chatId}`);
  const c = chat.character;
  let messages = chat.messages;
  let generating = false;
  let controller = null;
  let openActionsId = null;

  const list = h('div', { class: 'messages', 'aria-live': 'polite' });
  const scroller = h('div', { class: 'chat-scroll' }, demoBanner(), list);
  const input = h('textarea', {
    class: 'composer-input',
    rows: 1,
    placeholder: chat.available ? `Escribe a ${c.name}…` : 'Este personaje ya no está disponible',
    'aria-label': 'Mensaje',
    maxlength: 4000,
    disabled: !chat.available,
    oninput: autosize,
    onkeydown: (e) => {
      // Enter sends on devices with a physical keyboard; Shift+Enter adds a line.
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover: hover)').matches) {
        e.preventDefault();
        form.requestSubmit();
      }
    },
  });
  const sendBtn = h('button', { class: 'send-btn', type: 'submit', 'aria-label': 'Enviar', disabled: !chat.available }, '➤');
  const form = h('form', { class: 'composer', onsubmit: onSubmit }, input, sendBtn);

  function autosize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }

  function nearBottom() {
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
  }
  function scrollToBottom(force = false) {
    if (force || nearBottom()) scroller.scrollTop = scroller.scrollHeight;
  }

  function setGenerating(value) {
    generating = value;
    sendBtn.textContent = value ? '■' : '➤';
    sendBtn.setAttribute('aria-label', value ? 'Detener' : 'Enviar');
    sendBtn.classList.toggle('stop', value);
    sendBtn.type = value ? 'button' : 'submit';
    sendBtn.onclick = value ? () => controller?.abort() : null;
  }

  // ------------------------------------------------------------ rendering

  function aiRow(content) {
    return h('div', { class: 'msg msg-ai' }, avatar(c.avatar, c.name, 'sm'), h('div', { class: 'msg-content' }, content));
  }

  function messageRow(m, index) {
    const isLast = index === messages.length - 1;
    const bubble = h('div', {
      class: `bubble ${m.role === 'user' ? 'bubble-user' : 'bubble-ai'}`,
      tabindex: '0',
      onclick: () => toggleActions(m.id),
      onkeydown: (e) => (e.key === 'Enter' ? toggleActions(m.id) : null),
    }, formatMessage(m.content));

    const actions = openActionsId === m.id && !generating
      ? h(
          'div',
          { class: 'msg-actions' },
          h('button', { onclick: () => copy(m) }, 'Copiar'),
          h('button', { onclick: () => startEdit(m) }, 'Editar'),
          h('button', { class: 'danger', onclick: () => rewind(m) }, 'Borrar desde aquí'),
        )
      : null;

    const canRegenerate = isLast && m.role === 'assistant' && messages.some((x) => x.role === 'user') && chat.available && !generating;
    const regenerate = canRegenerate ? h('button', { class: 'regen-btn', onclick: regenerateReply }, '↻ Otra respuesta') : null;

    const content = h('div', { class: 'msg-content' }, bubble, actions, regenerate);
    return m.role === 'user'
      ? h('div', { class: 'msg msg-user', dataset: { id: m.id } }, content)
      : h('div', { class: 'msg msg-ai', dataset: { id: m.id } }, avatar(c.avatar, c.name, 'sm'), content);
  }

  function renderMessages() {
    clear(list);
    if (!messages.length) {
      list.append(h('div', { class: 'chat-start' }, avatar(c.avatar, c.name, 'xl'), h('p', {}, `Empieza la conversación con ${c.name}.`)));
    }
    messages.forEach((m, i) => list.append(messageRow(m, i)));
    const last = messages[messages.length - 1];
    if (last?.role === 'user' && !generating && chat.available) {
      list.append(h('div', { class: 'retry' }, h('button', { class: 'regen-btn', onclick: regenerateReply }, `↻ Pedir respuesta a ${c.name}`)));
    }
  }

  function toggleActions(id) {
    if (generating) return;
    openActionsId = openActionsId === id ? null : id;
    renderMessages();
  }

  // -------------------------------------------------------------- actions

  async function copy(m) {
    try {
      await navigator.clipboard.writeText(m.content);
      toast('Copiado');
    } catch {
      toast('No se pudo copiar', 'error');
    }
  }

  function startEdit(m) {
    const row = list.querySelector(`[data-id="${m.id}"] .msg-content`);
    const editor = h('textarea', { class: 'edit-input', rows: 4, maxlength: 4000 }, m.content);
    const save = async () => {
      const content = editor.value.trim();
      if (!content) return toast('El mensaje no puede estar vacío', 'error');
      try {
        const { message } = await api(`/api/messages/${m.id}`, { method: 'PATCH', body: { content } });
        m.content = message.content;
        openActionsId = null;
        renderMessages();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    clear(row).append(
      editor,
      h('div', { class: 'msg-actions' },
        h('button', { onclick: () => { openActionsId = null; renderMessages(); } }, 'Cancelar'),
        h('button', { class: 'primary', onclick: save }, 'Guardar')),
    );
    editor.focus();
  }

  async function rewind(m) {
    const ok = await confirmDialog('Se borrará este mensaje y todos los que vienen después. ¿Continuar?', { confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    try {
      await api(`/api/messages/${m.id}`, { method: 'DELETE' });
      messages = messages.filter((x) => x.id < m.id);
      openActionsId = null;
      renderMessages();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ----------------------------------------------------------- streaming

  async function runStream(path, body, { onStart } = {}) {
    setGenerating(true);
    openActionsId = null;
    renderMessages();

    const typing = h('div', { class: 'bubble bubble-ai typing' }, h('span'), h('span'), h('span'));
    const row = aiRow(typing);
    list.append(row);
    scrollToBottom(true);

    let text = '';
    let bubble = null;
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (!bubble) {
        bubble = h('div', { class: 'bubble bubble-ai streaming' });
        typing.replaceWith(bubble);
      }
      clear(bubble).append(formatMessage(text));
      scrollToBottom();
    };

    controller = new AbortController();
    let reloadAfter = false;
    try {
      await streamPost(path, body, {
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'start') onStart?.(event);
          else if (event.type === 'delta') {
            text += event.text;
            if (!frame) frame = requestAnimationFrame(paint);
          } else if (event.type === 'notice') toast(event.message);
          else if (event.type === 'error') toast(event.error, 'error');
          else if (event.type === 'done' && event.message) messages.push(event.message);
        },
      });
      if (controller.signal.aborted) reloadAfter = true;
    } catch (err) {
      toast(err.message, 'error');
      throw err;
    } finally {
      cancelAnimationFrame(frame);
      controller = null;
      setGenerating(false);
      if (reloadAfter) {
        // The server keeps whatever was written before stopping; fetch it.
        const fresh = await api(`/api/chats/${chat.id}`).catch(() => null);
        if (fresh) messages = fresh.chat.messages;
      }
      renderMessages();
      scrollToBottom(true);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const content = input.value.trim();
    if (!content || generating || !chat.available) return;

    const pending = { id: Number.MAX_SAFE_INTEGER, role: 'user', content };
    messages.push(pending);
    input.value = '';
    autosize();
    try {
      await runStream(`/api/chats/${chat.id}/messages`, { content }, {
        onStart: (event) => Object.assign(pending, event.user_message),
      });
    } catch {
      // The message never reached the server: give the text back.
      if (pending.id === Number.MAX_SAFE_INTEGER) {
        messages = messages.filter((m) => m !== pending);
        input.value = content;
        autosize();
        renderMessages();
      }
    }
    input.focus();
  }

  async function regenerateReply() {
    if (generating) return;
    const lastUser = messages.findLastIndex((m) => m.role === 'user');
    const removed = messages.slice(lastUser + 1);
    messages = messages.slice(0, lastUser + 1);
    try {
      await runStream(`/api/chats/${chat.id}/regenerate`, {});
    } catch {
      messages.push(...removed);
      renderMessages();
    }
  }

  // ---------------------------------------------------------------- layout

  const menuBtn = h('button', {
    class: 'icon-btn',
    'aria-label': 'Opciones',
    onclick: () =>
      openMenu(menuBtn, [
        { label: 'Ver personaje', onClick: () => navigate(`/c/${c.id}`) },
        ...(chat.available
          ? [{
              label: 'Nueva conversación',
              onClick: async () => {
                try {
                  const res = await api('/api/chats', { method: 'POST', body: { character_id: c.id } });
                  navigate(`/chat/${res.chat.id}`);
                } catch (err) {
                  toast(err.message, 'error');
                }
              },
            }]
          : []),
        {
          label: 'Borrar conversación',
          danger: true,
          onClick: async () => {
            const ok = await confirmDialog('¿Borrar esta conversación? No se puede deshacer.', { confirmLabel: 'Borrar', danger: true });
            if (!ok) return;
            try {
              await api(`/api/chats/${chat.id}`, { method: 'DELETE' });
              navigate('/chats');
            } catch (err) {
              toast(err.message, 'error');
            }
          },
        },
      ]),
  }, '⋮');

  container.append(
    h(
      'div',
      { class: 'chat-page' },
      h(
        'header',
        { class: 'chat-header' },
        h('button', { class: 'icon-btn', 'aria-label': 'Volver a chats', onclick: () => navigate('/chats') }, '←'),
        h('a', { class: 'chat-title', href: `#/c/${c.id}` }, avatar(c.avatar, c.name, 'sm'), h('span', {}, c.name)),
        menuBtn,
      ),
      scroller,
      chat.available ? null : h('p', { class: 'chat-unavailable' }, 'Quien creó este personaje lo hizo privado o lo eliminó. Puedes leer la conversación, pero no continuarla.'),
      form,
    ),
  );

  renderMessages();
  scrollToBottom(true);
  if (chat.available && matchMedia('(hover: hover)').matches) input.focus();

  return () => controller?.abort();
}

