import { api } from '../api.js';
import { navigate } from '../state.js';
import { avatar, clear, h, resizeImage, toast } from '../ui.js';

const EMOJI_SUGGESTIONS = ['🦊', '🐱', '🐉', '🧙', '🤖', '👻', '🧚', '🦸', '🧛', '🧜', '👩‍🚀', '🕵️', '🏴‍☠️', '🌙', '🌸', '🔥', '🎸', '📚', '☕', '💖'];

const FIELDS = [
  { key: 'name', label: 'Nombre', max: 50, required: true, placeholder: 'Ej.: Luna Vega' },
  { key: 'tagline', label: 'Frase corta', max: 120, placeholder: 'Ej.: Astrónoma soñadora que habla con las estrellas', help: 'Aparece en la tarjeta del personaje.' },
  {
    key: 'description', label: 'Descripción', max: 2000, rows: 4, required: true,
    placeholder: '¿Quién es? Edad, aspecto, historia, a qué se dedica…',
    help: 'La ven todos los usuarios y la IA la usa para interpretar al personaje.',
  },
  {
    key: 'personality', label: 'Personalidad', max: 3000, rows: 4,
    placeholder: 'Ej.: Curiosa, poética y un poco despistada. Habla con metáforas sencillas…',
    help: 'Cómo piensa, habla y se comporta. Solo la ves tú.',
  },
  {
    key: 'scenario', label: 'Escenario', max: 2000, rows: 3,
    placeholder: 'Ej.: {{user}} sube al observatorio en una noche despejada…',
    help: 'Dónde y cómo empieza la historia. Solo lo ves tú.',
  },
  {
    key: 'greeting', label: 'Saludo', max: 2000, rows: 3,
    placeholder: '*Levanta la vista del telescopio.* ¡Llegas justo a tiempo!',
    help: 'El primer mensaje del personaje. Usa *asteriscos* para acciones.',
  },
  {
    key: 'example_dialogue', label: 'Diálogo de ejemplo', max: 4000, rows: 4,
    placeholder: '{{user}}: ¿Por qué brillan las estrellas?\n{{char}}: *Se ríe bajito.* Porque están ardiendo…',
    help: 'Opcional. Muestra cómo habla el personaje. Solo lo ves tú.',
  },
];

export async function renderEditor(container, [id]) {
  const editing = Boolean(id);
  const data = editing
    ? (await api(`/api/characters/${id}`)).character
    : { name: '', avatar: '', tagline: '', description: '', personality: '', scenario: '', greeting: '', example_dialogue: '', tags: [], visibility: 'public' };
  if (editing && !data.is_owner) {
    navigate(`/c/${id}`);
    return;
  }

  // Image avatars come back as URLs; keep them unless the user picks a new one.
  let avatarValue = data.avatar;
  const preview = h('div', { class: 'avatar-preview' });
  const renderPreview = () => clear(preview).append(avatar(avatarValue, inputs.name?.value || data.name, 'hero'));

  const fileInput = h('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp,image/gif',
    hidden: true,
    onchange: async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        avatarValue = await resizeImage(file);
        renderPreview();
      } catch (err) {
        toast(err.message, 'error');
      }
      fileInput.value = '';
    },
  });
  const emojiInput = h('input', {
    class: 'emoji-input',
    placeholder: '🙂',
    'aria-label': 'Emoji del avatar',
    maxlength: 8,
    value: avatarValue && !avatarValue.startsWith('/') ? avatarValue : '',
    oninput: () => {
      avatarValue = emojiInput.value.trim();
      renderPreview();
    },
  });

  const inputs = {};
  const fieldEls = FIELDS.map((f) => {
    const id = `f-${f.key}`;
    const counter = h('span', { class: 'counter' });
    const control = f.rows
      ? h('textarea', { id, rows: f.rows, maxlength: f.max, placeholder: f.placeholder, required: f.required }, data[f.key] ?? '')
      : h('input', { id, maxlength: f.max, placeholder: f.placeholder, required: f.required, value: data[f.key] ?? '' });
    const updateCounter = () => (counter.textContent = `${control.value.length}/${f.max}`);
    control.addEventListener('input', updateCounter);
    if (f.key === 'name') control.addEventListener('input', renderPreview);
    updateCounter();
    inputs[f.key] = control;
    return h(
      'div',
      { class: 'field' },
      h('div', { class: 'field-label' }, h('label', { for: id }, f.label, f.required ? h('span', { class: 'req' }, ' *') : null), counter),
      control,
      f.help ? h('p', { class: 'help' }, f.help) : null,
    );
  });

  const tagsInput = h('input', { id: 'f-tags', placeholder: 'fantasía, humor, aventura', value: data.tags.join(', ') });
  const visibility = h(
    'div',
    { class: 'segmented' },
    ['public', 'private'].map((v) =>
      h('label', { class: 'segment' },
        h('input', { type: 'radio', name: 'visibility', value: v, checked: data.visibility === v }),
        v === 'public' ? '🌍 Público' : '🔒 Privado'),
    ),
  );

  const error = h('p', { class: 'error-text', role: 'alert' });
  const saveBtn = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit' }, editing ? 'Guardar cambios' : 'Crear personaje');

  const form = h(
    'form',
    {
      class: 'editor',
      onsubmit: async (e) => {
        e.preventDefault();
        error.textContent = '';
        const body = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
        body.tags = tagsInput.value;
        body.visibility = form.querySelector('input[name="visibility"]:checked')?.value ?? 'public';
        // An unchanged image avatar is sent back as its URL; the server keeps the stored image.
        body.avatar = avatarValue;
        saveBtn.disabled = true;
        try {
          const { character } = editing
            ? await api(`/api/characters/${id}`, { method: 'PUT', body })
            : await api('/api/characters', { method: 'POST', body });
          toast(editing ? 'Cambios guardados' : '¡Personaje creado!');
          navigate(`/c/${character.id}`);
        } catch (err) {
          error.textContent = err.message;
          saveBtn.disabled = false;
        }
      },
    },
    h(
      'section',
      { class: 'avatar-editor' },
      preview,
      h(
        'div',
        { class: 'avatar-tools' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => fileInput.click() }, '📷 Subir imagen'),
        h('div', { class: 'row gap-sm' }, h('span', { class: 'muted small' }, 'o un emoji:'), emojiInput),
        h('div', { class: 'emoji-grid' }, EMOJI_SUGGESTIONS.map((emoji) =>
          h('button', {
            type: 'button',
            class: 'emoji-btn',
            'aria-label': `Usar ${emoji}`,
            onclick: () => {
              avatarValue = emoji;
                    emojiInput.value = emoji;
              renderPreview();
            },
          }, emoji))),
        fileInput,
      ),
    ),
    fieldEls,
    h('div', { class: 'field' }, h('label', { for: 'f-tags' }, 'Etiquetas'), tagsInput, h('p', { class: 'help' }, 'Hasta 6, separadas por comas. Ayudan a que te encuentren.')),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Visibilidad'), visibility, h('p', { class: 'help' }, 'Los personajes privados solo los ves tú.')),
    h('p', { class: 'help tip' }, 'Consejo: escribe {{user}} para referirte a quien chatea y {{char}} para el personaje.'),
    error,
    saveBtn,
  );

  container.append(
    h(
      'div',
      { class: 'page' },
      h('header', { class: 'page-header' },
        h('h1', {}, editing ? `Editar a ${data.name}` : 'Nuevo personaje'),
        editing ? h('a', { class: 'btn btn-ghost btn-sm', href: `#/c/${id}` }, 'Cancelar') : null),
      editing ? null : h('p', { class: 'page-intro' }, 'Dale vida a alguien nuevo: describe quién es y cómo habla. La IA hará el resto.'),
      form,
    ),
  );
  renderPreview();
}
