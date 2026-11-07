import { createApp } from '../server/app.js';
import { openDatabase } from '../server/db.js';
import { seedDatabase } from '../server/seed.js';

/** Starts the app on a random port with an in-memory database. */
export async function startServer(responder, env = {}) {
  const db = openDatabase(':memory:');
  seedDatabase(db);
  const app = createApp({ db, responder, env: { MESSAGES_PER_MINUTE: '1000', ...env } });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { db, base, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** A tiny HTTP client that keeps the session cookie, like a browser would. */
export function client(base) {
  let cookie = '';
  async function request(method, path, body) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const type = res.headers.get('content-type') || '';
    let data;
    if (type.includes('text/event-stream')) data = parseEvents(await res.text());
    else if (type.includes('application/json')) data = await res.json();
    else data = await res.text();
    return { status: res.status, data };
  }
  return {
    get: (path) => request('GET', path),
    post: (path, body = {}) => request('POST', path, body),
    put: (path, body = {}) => request('PUT', path, body),
    patch: (path, body = {}) => request('PATCH', path, body),
    del: (path) => request('DELETE', path),
    raw: (path, init) => fetch(base + path, { ...init, headers: { ...(init?.headers ?? {}), cookie } }),
  };
}

export function parseEvents(text) {
  return text
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice(6)));
}

/** Responder that answers with a fixed text and records what it was sent. */
export function fakeResponder(reply = 'Hola, soy tu personaje.') {
  const calls = [];
  return {
    mode: 'claude',
    model: 'fake',
    calls,
    async streamReply(args) {
      calls.push(args);
      const text = typeof reply === 'function' ? reply(args) : reply;
      for (const part of text.split(' ')) args.onText(`${part} `);
      return { text, stopReason: 'end_turn' };
    },
  };
}

export const sampleCharacter = {
  name: 'Zorro Sabio',
  avatar: '🦊',
  tagline: 'Un zorro que habla en acertijos',
  description: 'Un zorro anciano que vive en el bosque.',
  personality: 'Calmado y misterioso.',
  scenario: '{{user}} se pierde en el bosque.',
  greeting: '*Mueve la cola.* Hola, {{user}}. Soy {{char}}.',
  example_dialogue: '',
  tags: 'fantasía, Consejos',
  visibility: 'public',
};
