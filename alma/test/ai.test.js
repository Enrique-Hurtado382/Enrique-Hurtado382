import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { buildSystemPrompt, createResponder, toApiMessages } from '../server/ai.js';
import { client, sampleCharacter, startServer } from './helpers.js';

const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');

const messageStart = (model = 'claude-opus-5-5') => ({
  type: 'message_start',
  message: {
    id: 'msg_test', type: 'message', role: 'assistant', model, content: [],
    stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1 },
  },
});
const textBlock = (index, parts) => [
  { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
  ...parts.map((text) => ({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } })),
  { type: 'content_block_stop', index },
];
const finish = (stopReason) => [
  { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 8 } },
  { type: 'message_stop' },
];

// Scenarios the fake Claude API can play back.
const SCENARIOS = {
  reply: sse([
    messageStart(),
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
    { type: 'content_block_stop', index: 0 },
    ...textBlock(1, ['*Mueve la cola.* ', '¡Bienvenida', ' al bosque!']),
    ...finish('end_turn'),
  ]),
  // Declined mid-stream, then continued by the fallback model on the same stream.
  fallback: sse([
    messageStart(),
    ...textBlock(0, ['Érase una ']),
    { type: 'content_block_start', index: 1, content_block: { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' } } },
    { type: 'content_block_stop', index: 1 },
    ...textBlock(2, ['vez un zorro.']),
    ...finish('end_turn'),
  ]),
  refusal: sse([messageStart(), ...finish('refusal')]),
};

describe('Claude integration (against a fake Messages API)', () => {
  let fake;
  let app;
  let scenario = 'reply';
  const requests = [];
  const savedEnv = {};

  before(async () => {
    fake = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        requests.push({ url: req.url, headers: req.headers, body: JSON.parse(body) });
        if (scenario === 'unauthorized') {
          res.writeHead(401, { 'content-type': 'application/json' });
          return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
        }
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.end(SCENARIOS[scenario]);
      });
    });
    await new Promise((resolve) => fake.listen(0, resolve));

    for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_PROFILE', 'CLAUDE_MODEL', 'CLAUDE_EFFORT']) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fake.address().port}`;

    const responder = createResponder(process.env);
    assert.equal(responder.mode, 'claude');
    app = await startServer(responder);
  });

  after(async () => {
    await app.close();
    await new Promise((resolve) => fake.close(resolve));
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function newChat(username) {
    const user = client(app.base);
    await user.post('/api/auth/register', { username, password: 'contraseña1', display_name: 'Carla' });
    await user.patch('/api/me', { display_name: 'Carla', persona: 'Me encanta el bosque.' });
    const { data } = await user.post('/api/characters', sampleCharacter);
    const chat = await user.post('/api/chats', { character_id: data.character.id });
    return { user, chatId: chat.data.chat.id };
  }

  test('sends a well-formed streaming request and saves only the text', async () => {
    scenario = 'reply';
    const { user, chatId } = await newChat('carla');
    const res = await user.post(`/api/chats/${chatId}/messages`, { content: 'Hola, ¿dónde estoy?' });

    const done = res.data.at(-1);
    assert.equal(done.type, 'done');
    assert.equal(done.message.content, '*Mueve la cola.* ¡Bienvenida al bosque!');

    const req = requests.at(-1);
    assert.match(req.url, /^\/v1\/messages/);
    assert.match(req.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
    assert.match(req.headers['x-api-key'] ?? req.headers.authorization, /test-key/);
    assert.equal(req.body.model, 'claude-opus-5-5');
    assert.equal(req.body.stream, true);
    assert.equal(req.body.fallbacks, 'default');
    assert.deepEqual(req.body.output_config, { effort: 'low' });
    assert.deepEqual(req.body.cache_control, { type: 'ephemeral' });
    assert.equal(req.body.thinking, undefined, 'Opus 5.5 always thinks; no thinking config is sent');
    assert.match(req.body.system, /You are Zorro Sabio/);
    assert.match(req.body.system, /Me encanta el bosque\./);
    assert.deepEqual(req.body.messages, [
      { role: 'user', content: '[The user opened the chat.]' },
      { role: 'assistant', content: '*Mueve la cola.* Hola, Carla. Soy Zorro Sabio.' },
      { role: 'user', content: 'Hola, ¿dónde estoy?' },
    ]);

    // The next turn replays plain text only, so earlier messages can be edited safely.
    await user.post(`/api/chats/${chatId}/messages`, { content: '¿Y tú quién eres?' });
    const next = requests.at(-1).body;
    assert.equal(next.system, req.body.system, 'system prompt is stable across turns (prompt cache)');
    assert.deepEqual(next.messages[3], { role: 'assistant', content: '*Mueve la cola.* ¡Bienvenida al bosque!' });
  });

  test('a server-side fallback mid-stream keeps one continuous reply', async () => {
    scenario = 'fallback';
    const { user, chatId } = await newChat('fallback');
    const res = await user.post(`/api/chats/${chatId}/messages`, { content: 'Cuéntame un cuento' });
    assert.equal(res.data.at(-1).message.content, 'Érase una vez un zorro.');
  });

  test('a refusal sends a notice and saves nothing', async () => {
    scenario = 'refusal';
    const { user, chatId } = await newChat('rechazo');
    const res = await user.post(`/api/chats/${chatId}/messages`, { content: 'algo' });
    assert.ok(res.data.some((e) => e.type === 'notice'));
    assert.equal(res.data.at(-1).message, null);
    const detail = await user.get(`/api/chats/${chatId}`);
    assert.equal(detail.data.chat.messages.at(-1).role, 'user');
  });

  test('API errors reach the user as a readable message', async () => {
    scenario = 'unauthorized';
    const { user, chatId } = await newChat('sinclave');
    const res = await user.post(`/api/chats/${chatId}/messages`, { content: 'hola' });
    const error = res.data.find((e) => e.type === 'error');
    assert.match(error.error, /clave de la API/);
  });
});

describe('prompt building', () => {
  test('toApiMessages starts with a user turn and skips empty messages', () => {
    assert.deepEqual(toApiMessages([]), [{ role: 'user', content: '[The user opened the chat.]' }]);
    assert.deepEqual(
      toApiMessages([
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: '   ' },
      ]),
      [{ role: 'user', content: 'hola' }],
    );
  });

  test('buildSystemPrompt fills placeholders and leaves out empty sections', () => {
    const prompt = buildSystemPrompt(
      { ...sampleCharacter, example_dialogue: '{{user}}: hola\n{{char}}: buenas' },
      { display_name: 'Carla', persona: '' },
    );
    assert.match(prompt, /Carla se pierde en el bosque/);
    assert.match(prompt, /Carla: hola\nZorro Sabio: buenas/);
    assert.doesNotMatch(prompt, /What they shared/);
    assert.doesNotMatch(prompt, /\{\{/);
  });

  test('without credentials the app runs in demo mode', () => {
    assert.equal(createResponder({}).mode, 'demo');
  });
});
