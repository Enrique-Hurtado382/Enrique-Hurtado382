/**
 * Small DOM helper: h('div', { class: 'x', onclick: fn }, 'text', child).
 * Strings always become text nodes, so user content is never parsed as HTML.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key in el && typeof value !== 'string') {
      el[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : value);
    }
  }
  append(el, children);
  return el;
}

function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

/** Avatar: an image URL (or data URL) or an emoji. Falls back to the initial. */
export function avatar(value, name = '', size = 'md') {
  const isImage = typeof value === 'string' && (value.startsWith('/') || value.startsWith('data:') || value.startsWith('blob:'));
  if (isImage) {
    return h('span', { class: `avatar avatar-${size}` }, h('img', { src: value, alt: '', loading: 'lazy' }));
  }
  const label = value || (name.trim()[0] || '?').toUpperCase();
  return h('span', { class: `avatar avatar-${size}${value ? ' avatar-emoji' : ' avatar-initial'}`, 'aria-hidden': 'true' }, label);
}

/** Renders chat text: *actions* in italics, **bold**, and line breaks. */
export function formatMessage(text) {
  const frag = document.createDocumentFragment();
  const lines = String(text).split('\n');
  lines.forEach((line, i) => {
    if (i > 0) frag.append(document.createElement('br'));
    for (const part of line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        frag.append(h('strong', {}, part.slice(2, -2)));
      } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        frag.append(h('em', { class: 'action' }, part.slice(1, -1)));
      } else {
        frag.append(document.createTextNode(part));
      }
    }
  });
  return frag;
}

let toastTimer;
export function toast(message, kind = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show toast-${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 3200);
}

/** Promise-based confirm dialog. Resolves true when the user accepts. */
export function confirmDialog(message, { confirmLabel = 'Aceptar', danger = false } = {}) {
  return new Promise((resolve) => {
    const dialog = h(
      'dialog',
      { class: 'dialog' },
      h('p', {}, message),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { class: 'btn btn-ghost', value: 'cancel', onclick: () => dialog.close('cancel') }, 'Cancelar'),
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => dialog.close('ok') }, confirmLabel),
      ),
    );
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** Popover menu anchored to a button. items: [{ label, onClick, danger }] */
export function openMenu(anchor, items) {
  document.querySelector('.menu')?.remove();
  const menu = h(
    'div',
    { class: 'menu', role: 'menu' },
    items.map((item) =>
      h(
        'button',
        {
          class: `menu-item${item.danger ? ' danger' : ''}`,
          role: 'menuitem',
          onclick: () => {
            close();
            item.onClick();
          },
        },
        item.label,
      ),
    ),
  );
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
  menu.style.right = `${Math.max(document.documentElement.clientWidth - rect.right, 12)}px`;
  document.body.append(menu);
  const onDocClick = (e) => {
    if (!menu.contains(e.target) && e.target !== anchor) close();
  };
  function close() {
    menu.remove();
    document.removeEventListener('click', onDocClick, true);
  }
  setTimeout(() => document.addEventListener('click', onDocClick, true));
  menu.querySelector('button')?.focus();
}

export function timeAgo(sqliteDate) {
  const date = new Date(`${sqliteDate.replace(' ', 'T')}Z`);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  if (seconds < 60) return 'ahora';
  if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return rtf.format(-Math.floor(seconds / 3600), 'hour');
  if (seconds < 604800) return rtf.format(-Math.floor(seconds / 86400), 'day');
  return date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

export function compactNumber(n) {
  return new Intl.NumberFormat('es', { notation: 'compact' }).format(n);
}

/** Resizes an image file to a square data URL so avatars stay small. */
export async function resizeImage(file, size = 256) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      image.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function emptyState(icon, title, text, action) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, icon), h('h3', {}, title), h('p', {}, text), action ?? null);
}

export function spinner() {
  return h('div', { class: 'loading' }, h('span', { class: 'spinner' }));
}
