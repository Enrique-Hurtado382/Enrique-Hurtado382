import express from 'express';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createAuth, requireUser, hashPassword, verifyPassword } from './auth.js';
import { buildSystemPrompt, describeError, fillPlaceholders, toApiMessages } from './ai.js';
import { transaction } from './db.js';
import {
  ValidationError,
  parseCharacter,
  parseCredentials,
  parseId,
  parseMessageContent,
  parseProfile,
} from './validate.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** Fixed-window counter keyed by user or IP, kept in memory. */
function createRateLimiter(limit, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start >= windowMs) {
      hits.set(key, { start: now, count: 1 });
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
      }
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

function versionTag(value) {
  return createHash('sha1').update(String(value)).digest('hex').slice(0, 10);
}

export function createApp({ db, responder, env = process.env }) {
  const app = express();
  const auth = createAuth(db, { secureCookies: env.COOKIE_SECURE === 'true' });
  const allowMessage = createRateLimiter(Number(env.MESSAGES_PER_MINUTE) || 20, 60_000);
  const allowLogin = createRateLimiter(10, 60_000);
  const generating = new Set();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY === 'true');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    );
    next();
  });

  app.use(express.static(PUBLIC_DIR, { index: 'index.html' }));
  app.use('/api', express.json({ limit: '600kb' }));

  // Writes must be JSON: browsers can't send that cross-site without a CORS
  // preflight, which this server never approves (CSRF protection).
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const type = req.headers['content-type'] || '';
      if (!type.startsWith('application/json')) {
        return res.status(415).json({ error: 'Las solicitudes deben enviarse como JSON.' });
      }
    }
    next();
  });

  app.use('/api', auth.loadUser);

  // ---------------------------------------------------------------- helpers

  const characterSelect = `
    SELECT c.*, u.display_name AS creator_name, u.username AS creator_username,
      EXISTS (SELECT 1 FROM likes l WHERE l.user_id = @viewer AND l.character_id = c.id) AS liked
    FROM characters c JOIN users u ON u.id = c.creator_id
  `;
  const getCharacterRow = db.prepare(`${characterSelect} WHERE c.id = @id`);

  function avatarFor(row) {
    if (row.avatar && row.avatar.startsWith('data:')) {
      return `/api/characters/${row.id}/avatar?v=${versionTag(row.updated_at + row.avatar.length)}`;
    }
    return row.avatar || '';
  }

  function serializeCharacter(row, viewerId) {
    const isOwner = row.creator_id === viewerId;
    const data = {
      id: row.id,
      name: row.name,
      avatar: avatarFor(row),
      tagline: row.tagline,
      description: row.description,
      greeting: row.greeting,
      tags: row.tags ? row.tags.split(',') : [],
      visibility: row.visibility,
      chat_count: row.chat_count,
      like_count: row.like_count,
      liked: Boolean(row.liked),
      is_owner: isOwner,
      creator: { id: row.creator_id, name: row.creator_name, username: row.creator_username },
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    // The full definition stays private to its creator.
    if (isOwner) {
      data.personality = row.personality;
      data.scenario = row.scenario;
      data.example_dialogue = row.example_dialogue;
    }
    return data;
  }

  function canView(row, viewerId) {
    return row && (row.visibility === 'public' || row.creator_id === viewerId);
  }

  function loadVisibleCharacter(req, res) {
    const id = parseId(req.params.id);
    const row = id && getCharacterRow.get({ id, viewer: req.user?.id ?? 0 });
    if (!canView(row, req.user?.id)) {
      res.status(404).json({ error: 'Personaje no encontrado.' });
      return null;
    }
    return row;
  }

  function loadOwnedCharacter(req, res) {
    const row = loadVisibleCharacter(req, res);
    if (!row) return null;
    if (row.creator_id !== req.user.id) {
      res.status(403).json({ error: 'Solo quien creó el personaje puede modificarlo.' });
      return null;
    }
    return row;
  }

  const getChat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?');
  const listMessages = db.prepare('SELECT id, role, content, created_at FROM messages WHERE chat_id = ? ORDER BY id');
  const insertMessage = db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)');
  const getMessage = db.prepare('SELECT id, role, content, created_at FROM messages WHERE id = ?');
  const touchChat = db.prepare("UPDATE chats SET updated_at = datetime('now') WHERE id = ?");

  function loadChat(req, res) {
    const id = parseId(req.params.id);
    const chat = id && getChat.get(id, req.user.id);
    if (!chat) {
      res.status(404).json({ error: 'Conversación no encontrada.' });
      return null;
    }
    return chat;
  }

  // ------------------------------------------------------------------- auth

  app.get('/api/me', (req, res) => {
    res.json({ user: req.user, ai: { mode: responder.mode, model: responder.model } });
  });

  app.post('/api/auth/register', (req, res) => {
    const { username, password } = parseCredentials(req.body);
    const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
    if (exists) return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
    const displayName = typeof req.body.display_name === 'string' && req.body.display_name.trim()
      ? parseProfile({ display_name: req.body.display_name }).display_name
      : username;
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)')
      .run(username, displayName, hashPassword(password));
    auth.startSession(res, Number(lastInsertRowid));
    res.status(201).json({ user: { id: Number(lastInsertRowid), username, display_name: displayName, persona: '' } });
  });

  app.post('/api/auth/login', (req, res) => {
    if (!allowLogin(req.ip)) {
      return res.status(429).json({ error: 'Demasiados intentos. Espera un minuto.' });
    }
    const username = String(req.body.username ?? '').trim();
    const password = String(req.body.password ?? '');
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    auth.startSession(res, user.id);
    res.json({ user: { id: user.id, username: user.username, display_name: user.display_name, persona: user.persona } });
  });

  app.post('/api/auth/logout', (req, res) => {
    auth.endSession(req, res);
    res.json({ ok: true });
  });

  app.patch('/api/me', requireUser, (req, res) => {
    const profile = parseProfile(req.body);
    db.prepare('UPDATE users SET display_name = ?, persona = ? WHERE id = ?').run(
      profile.display_name,
      profile.persona,
      req.user.id,
    );
    res.json({ user: { ...req.user, ...profile } });
  });

  // ------------------------------------------------------------- characters

  app.get('/api/characters', (req, res) => {
    const where = ["c.visibility = 'public'"];
    const params = { viewer: req.user?.id ?? 0 };
    const q = String(req.query.q ?? '').trim().slice(0, 60);
    if (q) {
      where.push("(c.name LIKE @q ESCAPE '\\' OR c.tagline LIKE @q ESCAPE '\\' OR c.tags LIKE @q ESCAPE '\\')");
      params.q = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    }
    const tag = String(req.query.tag ?? '').trim().toLowerCase().slice(0, 20);
    if (tag) {
      where.push("(',' || c.tags || ',') LIKE @tag ESCAPE '\\'");
      params.tag = `%,${tag.replace(/[\\%_]/g, (m) => `\\${m}`)},%`;
    }
    const order = req.query.sort === 'new' ? 'c.created_at DESC, c.id DESC' : '(c.chat_count + c.like_count * 3) DESC, c.id DESC';
    const rows = db.prepare(`${characterSelect} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 60`).all(params);
    res.json({ characters: rows.map((r) => serializeCharacter(r, req.user?.id)) });
  });

  app.get('/api/characters/mine', requireUser, (req, res) => {
    const rows = db
      .prepare(`${characterSelect} WHERE c.creator_id = @viewer ORDER BY c.updated_at DESC, c.id DESC`)
      .all({ viewer: req.user.id });
    res.json({ characters: rows.map((r) => serializeCharacter(r, req.user.id)) });
  });

  app.get('/api/characters/liked', requireUser, (req, res) => {
    const rows = db
      .prepare(
        `${characterSelect} JOIN likes lk ON lk.character_id = c.id AND lk.user_id = @viewer
         WHERE c.visibility = 'public' OR c.creator_id = @viewer
         ORDER BY lk.created_at DESC`,
      )
      .all({ viewer: req.user.id });
    res.json({ characters: rows.map((r) => serializeCharacter(r, req.user.id)) });
  });

  app.get('/api/tags', (_req, res) => {
    const counts = new Map();
    for (const { tags } of db.prepare("SELECT tags FROM characters WHERE visibility = 'public' AND tags != ''").all()) {
      for (const tag of tags.split(',')) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12);
    res.json({ tags: tags.map(([tag]) => tag) });
  });

  app.get('/api/characters/:id', (req, res) => {
    const row = loadVisibleCharacter(req, res);
    if (row) res.json({ character: serializeCharacter(row, req.user?.id) });
  });

  app.get('/api/characters/:id/avatar', (req, res) => {
    const row = loadVisibleCharacter(req, res);
    if (!row) return;
    const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(row.avatar);
    if (!match) return res.status(404).end();
    res.setHeader('Content-Type', match[1]);
    res.setHeader('Cache-Control', row.visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, max-age=3600');
    res.send(Buffer.from(match[2], 'base64'));
  });

  app.post('/api/characters', requireUser, (req, res) => {
    const c = parseCharacter(req.body);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO characters
          (creator_id, name, avatar, tagline, description, personality, scenario, greeting, example_dialogue, tags, visibility)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(req.user.id, c.name, c.avatar, c.tagline, c.description, c.personality, c.scenario, c.greeting, c.example_dialogue, c.tags, c.visibility);
    const row = getCharacterRow.get({ id: Number(lastInsertRowid), viewer: req.user.id });
    res.status(201).json({ character: serializeCharacter(row, req.user.id) });
  });

  app.put('/api/characters/:id', requireUser, (req, res) => {
    const existing = loadOwnedCharacter(req, res);
    if (!existing) return;
    // The editor sends an unchanged image avatar back as its URL: keep the stored image.
    const keepAvatar = typeof req.body.avatar === 'string' && req.body.avatar.startsWith(`/api/characters/${existing.id}/avatar`);
    const c = parseCharacter({ ...req.body, avatar: keepAvatar ? '' : req.body.avatar });
    if (keepAvatar) c.avatar = existing.avatar;
    db.prepare(
      `UPDATE characters SET name = ?, avatar = ?, tagline = ?, description = ?, personality = ?, scenario = ?,
         greeting = ?, example_dialogue = ?, tags = ?, visibility = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(c.name, c.avatar, c.tagline, c.description, c.personality, c.scenario, c.greeting, c.example_dialogue, c.tags, c.visibility, existing.id);
    const row = getCharacterRow.get({ id: existing.id, viewer: req.user.id });
    res.json({ character: serializeCharacter(row, req.user.id) });
  });

  app.delete('/api/characters/:id', requireUser, (req, res) => {
    const existing = loadOwnedCharacter(req, res);
    if (!existing) return;
    db.prepare('DELETE FROM characters WHERE id = ?').run(existing.id);
    res.json({ ok: true });
  });

  app.post('/api/characters/:id/like', requireUser, (req, res) => {
    const row = loadVisibleCharacter(req, res);
    if (!row) return;
    const liked = transaction(db, () => {
      const removed = db.prepare('DELETE FROM likes WHERE user_id = ? AND character_id = ?').run(req.user.id, row.id);
      if (removed.changes > 0) {
        db.prepare('UPDATE characters SET like_count = MAX(like_count - 1, 0) WHERE id = ?').run(row.id);
        return false;
      }
      db.prepare('INSERT INTO likes (user_id, character_id) VALUES (?, ?)').run(req.user.id, row.id);
      db.prepare('UPDATE characters SET like_count = like_count + 1 WHERE id = ?').run(row.id);
      return true;
    });
    const { like_count } = db.prepare('SELECT like_count FROM characters WHERE id = ?').get(row.id);
    res.json({ liked, like_count });
  });

  // ------------------------------------------------------------------ chats

  app.get('/api/chats', requireUser, (req, res) => {
    const rows = db
      .prepare(
        `SELECT ch.id, ch.updated_at, c.id AS character_id, c.name, c.avatar, c.updated_at AS character_updated_at,
           (SELECT content FROM messages m WHERE m.chat_id = ch.id ORDER BY m.id DESC LIMIT 1) AS last_message,
           (SELECT role FROM messages m WHERE m.chat_id = ch.id ORDER BY m.id DESC LIMIT 1) AS last_role
         FROM chats ch JOIN characters c ON c.id = ch.character_id
         WHERE ch.user_id = ?
         ORDER BY ch.updated_at DESC, ch.id DESC`,
      )
      .all(req.user.id);
    res.json({
      chats: rows.map((r) => ({
        id: r.id,
        updated_at: r.updated_at,
        last_message: r.last_message ? r.last_message.slice(0, 160) : '',
        last_role: r.last_role,
        character: {
          id: r.character_id,
          name: r.name,
          avatar: avatarFor({ id: r.character_id, avatar: r.avatar, updated_at: r.character_updated_at }),
        },
      })),
    });
  });

  app.post('/api/chats', requireUser, (req, res) => {
    const characterId = parseId(req.body.character_id);
    const row = characterId && getCharacterRow.get({ id: characterId, viewer: req.user.id });
    if (!canView(row, req.user.id)) return res.status(404).json({ error: 'Personaje no encontrado.' });

    const chatId = transaction(db, () => {
      const { lastInsertRowid } = db.prepare('INSERT INTO chats (user_id, character_id) VALUES (?, ?)').run(req.user.id, row.id);
      const greeting = fillPlaceholders(row.greeting, { charName: row.name, userName: req.user.display_name }).trim();
      if (greeting) insertMessage.run(Number(lastInsertRowid), 'assistant', greeting);
      db.prepare('UPDATE characters SET chat_count = chat_count + 1 WHERE id = ?').run(row.id);
      return Number(lastInsertRowid);
    });
    res.status(201).json({ chat: { id: chatId } });
  });

  app.get('/api/chats/:id', requireUser, (req, res) => {
    const chat = loadChat(req, res);
    if (!chat) return;
    const row = getCharacterRow.get({ id: chat.character_id, viewer: req.user.id });
    res.json({
      chat: {
        id: chat.id,
        created_at: chat.created_at,
        available: canView(row, req.user.id),
        character: serializeCharacter(row, req.user.id),
        messages: listMessages.all(chat.id),
      },
    });
  });

  app.delete('/api/chats/:id', requireUser, (req, res) => {
    const chat = loadChat(req, res);
    if (!chat) return;
    db.prepare('DELETE FROM chats WHERE id = ?').run(chat.id);
    res.json({ ok: true });
  });

  function messageInOwnedChat(req, res) {
    const id = parseId(req.params.id);
    const message = id && db.prepare(
      'SELECT m.id, m.chat_id FROM messages m JOIN chats ch ON ch.id = m.chat_id WHERE m.id = ? AND ch.user_id = ?',
    ).get(id, req.user.id);
    if (!message) {
      res.status(404).json({ error: 'Mensaje no encontrado.' });
      return null;
    }
    if (generating.has(message.chat_id)) {
      res.status(409).json({ error: 'Espera a que termine la respuesta actual.' });
      return null;
    }
    return message;
  }

  app.patch('/api/messages/:id', requireUser, (req, res) => {
    const message = messageInOwnedChat(req, res);
    if (!message) return;
    const content = parseMessageContent(req.body.content);
    db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, message.id);
    res.json({ message: getMessage.get(message.id) });
  });

  // Deletes the message and everything after it ("rewind the chat to here").
  app.delete('/api/messages/:id', requireUser, (req, res) => {
    const message = messageInOwnedChat(req, res);
    if (!message) return;
    const { changes } = db.prepare('DELETE FROM messages WHERE chat_id = ? AND id >= ?').run(message.chat_id, message.id);
    res.json({ deleted: changes });
  });

  // --------------------------------------------------- streaming generation

  /** Checks shared by "send message" and "regenerate". Returns the context or null. */
  function prepareGeneration(req, res) {
    const chat = loadChat(req, res);
    if (!chat) return null;
    const character = getCharacterRow.get({ id: chat.character_id, viewer: req.user.id });
    if (!canView(character, req.user.id)) {
      res.status(403).json({ error: 'Este personaje ya no está disponible.' });
      return null;
    }
    if (generating.has(chat.id)) {
      res.status(409).json({ error: 'Espera a que termine la respuesta actual.' });
      return null;
    }
    if (!allowMessage(`user:${req.user.id}`)) {
      res.status(429).json({ error: 'Vas muy rápido. Espera un momento antes de enviar otro mensaje.' });
      return null;
    }
    return { chat, character };
  }

  async function streamReply(req, res, { chat, character }, startPayload) {
    generating.add(chat.id);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event) => {
      if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    send({ type: 'start', ...startPayload });

    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });

    try {
      const result = await responder.streamReply({
        system: buildSystemPrompt(character, req.user),
        messages: toApiMessages(listMessages.all(chat.id)),
        onText: (text) => send({ type: 'delta', text }),
        signal: controller.signal,
        characterName: character.name,
      });

      const text = result.text.trim();
      let saved = null;
      if (text) {
        const { lastInsertRowid } = insertMessage.run(chat.id, 'assistant', text);
        saved = getMessage.get(Number(lastInsertRowid));
      }
      touchChat.run(chat.id);

      if (result.stopReason === 'refusal') {
        send({
          type: 'notice',
          message: `${character.name} no puede continuar con esto. Prueba a llevar la conversación por otro lado.`,
        });
      }
      send({ type: 'done', message: saved, stop_reason: result.stopReason });
    } catch (err) {
      console.error('[alma] Error generating reply:', err);
      send({ type: 'error', error: describeError(err) });
    } finally {
      generating.delete(chat.id);
      res.end();
    }
  }

  app.post('/api/chats/:id/messages', requireUser, async (req, res) => {
    const content = parseMessageContent(req.body.content);
    const context = prepareGeneration(req, res);
    if (!context) return;
    const { lastInsertRowid } = insertMessage.run(context.chat.id, 'user', content);
    touchChat.run(context.chat.id);
    await streamReply(req, res, context, { user_message: getMessage.get(Number(lastInsertRowid)) });
  });

  // Replaces the character's latest reply with a new one.
  app.post('/api/chats/:id/regenerate', requireUser, async (req, res) => {
    const context = prepareGeneration(req, res);
    if (!context) return;
    const messages = listMessages.all(context.chat.id);
    const lastUserIndex = messages.findLastIndex((m) => m.role === 'user');
    if (lastUserIndex === -1) {
      return res.status(400).json({ error: 'Escribe algo antes de pedir otra respuesta.' });
    }
    const removed = messages.slice(lastUserIndex + 1).map((m) => m.id);
    if (removed.length) {
      db.prepare('DELETE FROM messages WHERE chat_id = ? AND id > ?').run(context.chat.id, messages[lastUserIndex].id);
    }
    await streamReply(req, res, context, { removed_ids: removed });
  });

  // ------------------------------------------------------------- fallbacks

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

  app.use((err, _req, res, _next) => {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El contenido es demasiado grande.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido.' });
    console.error('[alma] Unexpected error:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  return app;
}
