export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function readError(res) {
  try {
    const data = await res.json();
    return data.error || `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

/** JSON request to the backend. Throws ApiError with a user-facing message. */
export async function api(path, { method = 'GET', body } = {}) {
  const options = { method, headers: {}, credentials: 'same-origin' };
  if (method !== 'GET' && method !== 'DELETE') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body ?? {});
  }
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new ApiError('No hay conexión con el servidor.', 0);
  }
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return res.json();
}

/**
 * POSTs JSON and reads the server-sent events of a streaming reply.
 * Calls onEvent for every event; resolves when the stream ends.
 */
export async function streamPost(path, body, { onEvent, signal }) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body ?? {}),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') return;
    throw new ApiError('No hay conexión con el servidor.', 0);
  }
  if (!res.ok) throw new ApiError(await readError(res), res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) onEvent(JSON.parse(line.slice(6)));
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') throw err;
  }
}
