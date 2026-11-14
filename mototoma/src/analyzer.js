// Análisis ligero de la imagen de la cámara: brillo y movimiento global.
// Se ejecuta unas 10 veces por segundo sobre una copia diminuta del vídeo.

/**
 * Desplazamiento global entre dos imágenes en escala de grises (Uint8Array).
 * Busca el (dx, dy) que mejor alinea `cur` con `prev` y lo refina por debajo
 * del píxel con una parábola. dx > 0 = el contenido se movió a la derecha.
 */
export function estimarDesplazamiento(prev, cur, w, h, max = 5) {
  let mejor = Infinity;
  let bx = 0;
  let by = 0;
  const costes = new Map();
  const coste = (dx, dy) => {
    const key = dx * 1000 + dy;
    if (costes.has(key)) return costes.get(key);
    let s = 0;
    let n = 0;
    for (let y = max; y < h - max; y += 2) {
      const fila = y * w;
      const filaP = (y - dy) * w;
      for (let x = max; x < w - max; x += 2) {
        s += Math.abs(cur[fila + x] - prev[filaP + x - dx]);
        n++;
      }
    }
    const c = n ? s / n : Infinity;
    costes.set(key, c);
    return c;
  };
  for (let dy = -max; dy <= max; dy++) {
    for (let dx = -max; dx <= max; dx++) {
      const c = coste(dx, dy);
      if (c < mejor) {
        mejor = c;
        bx = dx;
        by = dy;
      }
    }
  }
  const refina = (cm, c0, cp) => {
    const d = cm - 2 * c0 + cp;
    if (!isFinite(d) || d <= 1e-9) return 0;
    return Math.max(-0.5, Math.min(0.5, (cm - cp) / (2 * d)));
  };
  const sx = Math.abs(bx) < max ? refina(coste(bx - 1, by), mejor, coste(bx + 1, by)) : 0;
  const sy = Math.abs(by) < max ? refina(coste(bx, by - 1), mejor, coste(bx, by + 1)) : 0;
  const base = coste(0, 0);
  return { dx: bx + sx, dy: by + sy, err: mejor, mejora: base - mejor };
}

/** Brillo medio (0-255) de una imagen en escala de grises. */
export function brilloMedio(gris) {
  let s = 0;
  for (let i = 0; i < gris.length; i++) s += gris[i];
  return gris.length ? s / gris.length : 0;
}

export class Analizador {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.prev = null;
    this.prevT = 0;
    this.flujo = { x: 0, y: 0 };
    this.brillo = null;
  }

  /** Procesa un fotograma del vídeo. ahora en segundos. */
  procesar(video, ahora) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const horizontal = vw >= vh;
    const w = horizontal ? 128 : 72;
    const h = horizontal ? 72 : 128;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.prev = null;
    }
    this.ctx.drawImage(video, 0, 0, w, h);
    const rgba = this.ctx.getImageData(0, 0, w, h).data;
    const gris = new Uint8Array(w * h);
    for (let i = 0, j = 0; j < gris.length; i += 4, j++) {
      gris[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
    }
    const b = brilloMedio(gris);
    this.brillo = this.brillo == null ? b : this.brillo + (b - this.brillo) * 0.3;
    if (this.prev) {
      const dt = Math.max(0.03, ahora - this.prevT);
      const d = estimarDesplazamiento(this.prev, gris, w, h, 5);
      // Si la imagen casi no tiene textura, el cálculo no es fiable.
      const fiable = d.mejora > 0.4 || (Math.abs(d.dx) < 0.3 && Math.abs(d.dy) < 0.3);
      // El contenido va a la izquierda cuando la cámara va a la derecha.
      const cx = fiable ? -d.dx / w / dt : 0;
      const cy = fiable ? d.dy / h / dt : 0;
      this.flujo.x += (cx - this.flujo.x) * 0.35;
      this.flujo.y += (cy - this.flujo.y) * 0.35;
    }
    this.prev = gris;
    this.prevT = ahora;
    return { brillo: this.brillo, flujo: { ...this.flujo } };
  }

  reiniciar() {
    this.prev = null;
    this.flujo = { x: 0, y: 0 };
  }
}

/** Copia un fotograma del vídeo como JPEG (para el fantasma). */
export function capturarFotograma(video, anchoMax = 540) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const k = Math.min(1, anchoMax / Math.max(vw, vh));
  const c = document.createElement('canvas');
  c.width = Math.round(vw * k);
  c.height = Math.round(vh * k);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.75);
}
