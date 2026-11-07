import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { client, fakeResponder, sampleCharacter, startServer } from './helpers.js';

describe('API', () => {
  let server;
  let responder;

  before(async () => {
    responder = fakeResponder((args) => `Respuesta número ${responder.calls.length}`);
    server = await startServer(responder);
  });
  after(() => server.close());

  test('register, session and login', async () => {
    const ana = client(server.base);
    const reg = await ana.post('/api/auth/register', { username: 'ana', password: 'contraseña1', display_name: 'Ana' });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.user.display_name, 'Ana');

    const me = await ana.get('/api/me');
    assert.equal(me.data.user.username, 'ana');

    const dup = await client(server.base).post('/api/auth/register', { username: 'ANA', password: 'otra-clave' });
    assert.equal(dup.status, 409);

    const short = await client(server.base).post('/api/auth/register', { username: 'bea', password: '123' });
    assert.equal(short.status, 400);

    const wrong = await client(server.base).post('/api/auth/login', { username: 'ana', password: 'incorrecta' });
    assert.equal(wrong.status, 401);

    const other = client(server.base);
    assert.equal((await other.post('/api/auth/login', { username: 'ana', password: 'contraseña1' })).status, 200);
    await other.post('/api/auth/logout');
    assert.equal((await other.get('/api/me')).data.user, null);
  });

  test('writes must be JSON (CSRF protection)', async () => {
    const res = await fetch(`${server.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'username=ana&password=contraseña1',
    });
    assert.equal(res.status, 415);
  });

  test('starter characters are listed and searchable', async () => {
    const anon = client(server.base);
    const all = await anon.get('/api/characters');
    assert.ok(all.data.characters.length >= 6);
    const found = await anon.get('/api/characters?q=pirata');
    assert.deepEqual(found.data.characters.map((c) => c.name), ['Capitán Bruma']);
    const tagged = await anon.get('/api/characters?tag=misterio');
    assert.deepEqual(tagged.data.characters.map((c) => c.name), ['Detective Vargas']);
    const wildcard = await anon.get('/api/characters?q=%25');
    assert.equal(wildcard.data.characters.length, 0);
  });

  test('characters: create, privacy and ownership', async () => {
    const owner = client(server.base);
    await owner.post('/api/auth/register', { username: 'creador', password: 'contraseña1' });
    const stranger = client(server.base);
    await stranger.post('/api/auth/register', { username: 'curioso', password: 'contraseña1' });

    const missing = await owner.post('/api/characters', { ...sampleCharacter, description: '' });
    assert.equal(missing.status, 400);

    const created = await owner.post('/api/characters', sampleCharacter);
    assert.equal(created.status, 201);
    const c = created.data.character;
    assert.deepEqual(c.tags, ['fantasía', 'consejos']);
    assert.equal(c.personality, 'Calmado y misterioso.');

    const seen = await stranger.get(`/api/characters/${c.id}`);
    assert.equal(seen.status, 200);
    assert.equal(seen.data.character.personality, undefined, 'definition is hidden from other users');

    const hijack = await stranger.put(`/api/characters/${c.id}`, { ...sampleCharacter, name: 'Robado' });
    assert.equal(hijack.status, 403);

    await owner.put(`/api/characters/${c.id}`, { ...sampleCharacter, visibility: 'private' });
    assert.equal((await stranger.get(`/api/characters/${c.id}`)).status, 404);
    assert.equal((await owner.get(`/api/characters/${c.id}`)).status, 200);
    assert.ok(!(await stranger.get('/api/characters')).data.characters.some((x) => x.id === c.id));
    assert.ok((await owner.get('/api/characters/mine')).data.characters.some((x) => x.id === c.id));
  });

  test('image avatars are served separately and kept on edit', async () => {
    const owner = client(server.base);
    await owner.post('/api/auth/register', { username: 'pintora', password: 'contraseña1' });
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const { data } = await owner.post('/api/characters', { ...sampleCharacter, avatar: png });
    const url = data.character.avatar;
    assert.match(url, /^\/api\/characters\/\d+\/avatar\?v=/);

    const img = await owner.raw(url);
    assert.equal(img.headers.get('content-type'), 'image/png');

    const edited = await owner.put(`/api/characters/${data.character.id}`, { ...sampleCharacter, avatar: url, name: 'Nuevo nombre' });
    assert.equal(edited.status, 200);
    assert.match(edited.data.character.avatar, /^\/api\/characters\/\d+\/avatar/);

    const bad = await owner.post('/api/characters', { ...sampleCharacter, avatar: 'data:text/html;base64,PHNjcmlwdD4=' });
    assert.equal(bad.status, 400);
  });

  test('likes toggle', async () => {
    const fan = client(server.base);
    await fan.post('/api/auth/register', { username: 'fan', password: 'contraseña1' });
    const first = await fan.post('/api/characters/1/like');
    assert.deepEqual(first.data, { liked: true, like_count: 1 });
    assert.equal((await fan.get('/api/characters/liked')).data.characters[0].id, 1);
    const second = await fan.post('/api/characters/1/like');
    assert.deepEqual(second.data, { liked: false, like_count: 0 });
  });

  test('chat flow: greeting, streaming reply, regenerate, edit and rewind', async () => {
    const user = client(server.base);
    await user.post('/api/auth/register', { username: 'charla', password: 'contraseña1', display_name: 'Carla' });
    const { data } = await user.post('/api/characters', sampleCharacter);
    const characterId = data.character.id;

    const chat = await user.post('/api/chats', { character_id: characterId });
    assert.equal(chat.status, 201);
    const chatId = chat.data.chat.id;

    let detail = await user.get(`/api/chats/${chatId}`);
    assert.equal(detail.data.chat.messages[0].content, '*Mueve la cola.* Hola, Carla. Soy Zorro Sabio.');

    const sent = await user.post(`/api/chats/${chatId}/messages`, { content: 'Hola zorro' });
    assert.equal(sent.status, 200);
    const types = sent.data.map((e) => e.type);
    assert.equal(types[0], 'start');
    assert.ok(types.includes('delta'));
    assert.equal(types.at(-1), 'done');
    const done = sent.data.at(-1);
    assert.equal(done.message.role, 'assistant');
    const streamed = sent.data.filter((e) => e.type === 'delta').map((e) => e.text).join('');
    assert.equal(streamed.trim(), done.message.content);

    // What the character saw: its system prompt and the conversation so far.
    const call = responder.calls.at(-1);
    assert.match(call.system, /You are Zorro Sabio/);
    assert.match(call.system, /Carla se pierde en el bosque/);
    assert.equal(call.messages[0].role, 'user', 'API turns must start with the user');
    assert.deepEqual(call.messages.at(-1), { role: 'user', content: 'Hola zorro' });

    const regen = await user.post(`/api/chats/${chatId}/regenerate`);
    assert.deepEqual(regen.data[0].removed_ids, [done.message.id]);
    detail = await user.get(`/api/chats/${chatId}`);
    assert.equal(detail.data.chat.messages.length, 3);
    assert.notEqual(detail.data.chat.messages[2].id, done.message.id);

    const userMsg = detail.data.chat.messages[1];
    const edited = await user.patch(`/api/messages/${userMsg.id}`, { content: 'Hola, zorro sabio' });
    assert.equal(edited.data.message.content, 'Hola, zorro sabio');

    const rewind = await user.del(`/api/messages/${userMsg.id}`);
    assert.equal(rewind.data.deleted, 2);
    detail = await user.get(`/api/chats/${chatId}`);
    assert.equal(detail.data.chat.messages.length, 1);

    const list = await user.get('/api/chats');
    assert.equal(list.data.chats[0].character.name, 'Zorro Sabio');

    // Other users can't see or write to this chat.
    const intruder = client(server.base);
    await intruder.post('/api/auth/register', { username: 'intruso', password: 'contraseña1' });
    assert.equal((await intruder.get(`/api/chats/${chatId}`)).status, 404);
    assert.equal((await intruder.post(`/api/chats/${chatId}/messages`, { content: 'hola' })).status, 404);
    assert.equal((await intruder.del(`/api/messages/${userMsg.id}`)).status, 404);

    assert.equal((await user.del(`/api/chats/${chatId}`)).status, 200);
    assert.equal((await user.get(`/api/chats/${chatId}`)).status, 404);
  });

  test('chats with a character made private by someone else become read-only', async () => {
    const owner = client(server.base);
    await owner.post('/api/auth/register', { username: 'duena', password: 'contraseña1' });
    const { data } = await owner.post('/api/characters', sampleCharacter);

    const user = client(server.base);
    await user.post('/api/auth/register', { username: 'visita', password: 'contraseña1' });
    const chat = await user.post('/api/chats', { character_id: data.character.id });

    await owner.put(`/api/characters/${data.character.id}`, { ...sampleCharacter, visibility: 'private' });
    const detail = await user.get(`/api/chats/${chat.data.chat.id}`);
    assert.equal(detail.data.chat.available, false);
    const blocked = await user.post(`/api/chats/${chat.data.chat.id}/messages`, { content: 'hola' });
    assert.equal(blocked.status, 403);
  });
});

describe('rate limiting', () => {
  test('limits messages per minute per user', async () => {
    const server = await startServer(fakeResponder(), { MESSAGES_PER_MINUTE: '2' });
    try {
      const user = client(server.base);
      await user.post('/api/auth/register', { username: 'rapida', password: 'contraseña1' });
      const chat = await user.post('/api/chats', { character_id: 1 });
      const path = `/api/chats/${chat.data.chat.id}/messages`;
      assert.equal((await user.post(path, { content: 'uno' })).status, 200);
      assert.equal((await user.post(path, { content: 'dos' })).status, 200);
      assert.equal((await user.post(path, { content: 'tres' })).status, 429);
    } finally {
      await server.close();
    }
  });
});
