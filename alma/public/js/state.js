/** Shared app state and navigation helpers (kept apart from main.js to avoid import cycles). */
export const state = { user: null, ai: { mode: 'claude', model: '' } };

let pendingRoute = null;

export function navigate(path) {
  if (location.hash === `#${path}`) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = path;
}

/** Sends the user to log in, then back to where they were. */
export function requireLogin() {
  const current = location.hash.slice(1) || '/';
  if (current !== '/login') pendingRoute = current;
  navigate('/login');
}

export function afterLogin() {
  const target = pendingRoute || '/';
  pendingRoute = null;
  navigate(target);
}
