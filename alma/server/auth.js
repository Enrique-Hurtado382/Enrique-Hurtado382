import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'alma_session';
const SESSION_DAYS = 30;
const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(expected, actual);
}

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export function createAuth(db, { secureCookies = false } = {}) {
  const insertSession = db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)');
  const findSession = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.persona
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `);
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');
  const purgeExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

  function cookieHeader(token, maxAgeSeconds) {
    const parts = [
      `${SESSION_COOKIE}=${token}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAgeSeconds}`,
    ];
    if (secureCookies) parts.push('Secure');
    return parts.join('; ');
  }

  return {
    startSession(res, userId) {
      purgeExpired.run(Date.now());
      const token = randomBytes(32).toString('base64url');
      const maxAge = SESSION_DAYS * 24 * 60 * 60;
      insertSession.run(token, userId, Date.now() + maxAge * 1000);
      res.setHeader('Set-Cookie', cookieHeader(token, maxAge));
    },

    endSession(req, res) {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (token) deleteSession.run(token);
      res.setHeader('Set-Cookie', cookieHeader('', 0));
    },

    /** Express middleware: sets req.user when the session cookie is valid. */
    loadUser(req, _res, next) {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      req.user = token ? findSession.get(token, Date.now()) ?? null : null;
      next();
    },
  };
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Necesitas iniciar sesión.' });
  next();
}
