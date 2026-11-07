export class ValidationError extends Error {}

const AVATAR_DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
const MAX_AVATAR_LENGTH = 400_000; // ~300 KB image; the browser resizes before upload

function text(value, { field, max, min = 0, required = false }) {
  const str = typeof value === 'string' ? value.trim() : '';
  if (required && !str) throw new ValidationError(`El campo "${field}" es obligatorio.`);
  if (str.length < min) throw new ValidationError(`"${field}" debe tener al menos ${min} caracteres.`);
  if (str.length > max) throw new ValidationError(`"${field}" no puede superar ${max} caracteres.`);
  return str;
}

export function parseCredentials(body = {}) {
  const username = text(body.username, { field: 'Usuario', min: 3, max: 24, required: true });
  if (!/^[A-Za-z0-9_.]+$/.test(username)) {
    throw new ValidationError('El usuario solo puede tener letras, números, puntos y guiones bajos.');
  }
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8) throw new ValidationError('La contraseña debe tener al menos 8 caracteres.');
  if (password.length > 200) throw new ValidationError('La contraseña es demasiado larga.');
  return { username, password };
}

export function parseProfile(body = {}) {
  return {
    display_name: text(body.display_name, { field: 'Nombre', max: 40, required: true }),
    persona: text(body.persona, { field: 'Sobre ti', max: 1500 }),
  };
}

export function parseTags(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
  const tags = [];
  for (const item of raw) {
    const tag = String(item).trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, ' ');
    if (!tag) continue;
    if (tag.length > 20) throw new ValidationError('Cada etiqueta puede tener como máximo 20 caracteres.');
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > 6) throw new ValidationError('Puedes poner como máximo 6 etiquetas.');
  return tags.join(',');
}

export function parseAvatar(value) {
  const avatar = typeof value === 'string' ? value.trim() : '';
  if (!avatar) return '';
  if (avatar.startsWith('data:')) {
    if (avatar.length > MAX_AVATAR_LENGTH) throw new ValidationError('La imagen es demasiado grande.');
    if (!AVATAR_DATA_URL.test(avatar)) throw new ValidationError('Formato de imagen no válido.');
    return avatar;
  }
  if ([...avatar].length > 8) throw new ValidationError('El avatar debe ser un emoji o una imagen.');
  return avatar;
}

export function parseCharacter(body = {}) {
  const visibility = body.visibility === 'private' ? 'private' : 'public';
  return {
    name: text(body.name, { field: 'Nombre', max: 50, required: true }),
    avatar: parseAvatar(body.avatar),
    tagline: text(body.tagline, { field: 'Frase corta', max: 120 }),
    description: text(body.description, { field: 'Descripción', max: 2000, required: true }),
    personality: text(body.personality, { field: 'Personalidad', max: 3000 }),
    scenario: text(body.scenario, { field: 'Escenario', max: 2000 }),
    greeting: text(body.greeting, { field: 'Saludo', max: 2000 }),
    example_dialogue: text(body.example_dialogue, { field: 'Diálogo de ejemplo', max: 4000 }),
    tags: parseTags(body.tags),
    visibility,
  };
}

export function parseMessageContent(value) {
  return text(value, { field: 'Mensaje', max: 4000, required: true });
}

export function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
