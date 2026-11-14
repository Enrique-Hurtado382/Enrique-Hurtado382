// Cámara y grabación con las APIs web (funcionan dentro de la app de Android).

const MIMES_CON_AUDIO = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];
const MIMES_SIN_AUDIO = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function elegirMime(conAudio) {
  if (typeof MediaRecorder === 'undefined') return null;
  const lista = conAudio ? MIMES_CON_AUDIO : MIMES_SIN_AUDIO;
  return lista.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  }) || '';
}

export function extension(mime) {
  return mime && mime.includes('mp4') ? 'mp4' : 'webm';
}

function es169(w, h) {
  const r = Math.max(w, h) / Math.min(w, h);
  return Math.abs(r - 16 / 9) < 0.08;
}

export class Camara {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.deviceId = null;
    this.lentes = [];
    this.conAudio = false;
    this.linternaOn = false;
  }

  async iniciar({ calidad = '1080', fps = 30, deviceId = null } = {}) {
    this.detener();
    const [W, H] = calidad === '720' ? [1280, 720] : [1920, 1080];
    const video = (w, h) => ({
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
      width: { ideal: w },
      height: { ideal: h },
      frameRate: { ideal: fps },
    });
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: video(W, H), audio });
      this.conAudio = true;
    } catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'NotFoundError' || e.name === 'NotReadableError')) {
        // quizá solo falla el micrófono
        stream = await navigator.mediaDevices.getUserMedia({ video: video(W, H), audio: false });
        this.conAudio = false;
      } else {
        throw e;
      }
    }

    // Algunos móviles devuelven 4:3 si piden 16:9 en vertical: prueba al revés.
    const s = stream.getVideoTracks()[0]?.getSettings?.() || {};
    if (s.width && s.height && !es169(s.width, s.height)) {
      try {
        await stream.getVideoTracks()[0].applyConstraints(video(H, W));
      } catch {
        /* se queda como está */
      }
    }

    this.stream = stream;
    this.deviceId = stream.getVideoTracks()[0]?.getSettings?.().deviceId || deviceId;
    this.video.srcObject = stream;
    this.video.muted = true;
    this.video.setAttribute('playsinline', '');
    await this.video.play().catch(() => {});
    await this.listarLentes();
    return this.info();
  }

  async listarLentes() {
    try {
      const todos = await navigator.mediaDevices.enumerateDevices();
      const camaras = todos.filter((d) => d.kind === 'videoinput');
      const traseras = camaras.filter((d) => /back|rear|trasera|environment/i.test(d.label));
      this.lentes = traseras.length ? traseras : camaras;
    } catch {
      this.lentes = [];
    }
    return this.lentes;
  }

  /** Cambia a la siguiente cámara trasera (gran angular, tele…). */
  async siguienteLente(opciones) {
    if (this.lentes.length < 2) return null;
    const i = this.lentes.findIndex((l) => l.deviceId === this.deviceId);
    const sig = this.lentes[(i + 1) % this.lentes.length];
    return this.iniciar({ ...opciones, deviceId: sig.deviceId });
  }

  info() {
    const t = this.stream?.getVideoTracks()[0];
    const s = t?.getSettings?.() || {};
    const c = t?.getCapabilities?.() || {};
    return {
      ancho: s.width || this.video.videoWidth,
      alto: s.height || this.video.videoHeight,
      fps: s.frameRate ? Math.round(s.frameRate) : null,
      linterna: !!c.torch,
      zoom: c.zoom ? { min: c.zoom.min, max: c.zoom.max, paso: c.zoom.step || 0.1, actual: s.zoom || c.zoom.min } : null,
      lentes: this.lentes.length,
      audio: this.conAudio,
    };
  }

  async linterna(on) {
    const t = this.stream?.getVideoTracks()[0];
    if (!t) return false;
    try {
      await t.applyConstraints({ advanced: [{ torch: on }] });
      this.linternaOn = on;
      return true;
    } catch {
      return false;
    }
  }

  async zoom(valor) {
    const t = this.stream?.getVideoTracks()[0];
    if (!t) return;
    try {
      await t.applyConstraints({ advanced: [{ zoom: valor }] });
    } catch {
      /* sin zoom */
    }
  }

  detener() {
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }
}

export class Grabadora {
  constructor(stream, { calidad = '1080' } = {}) {
    this.stream = stream;
    const conAudio = stream.getAudioTracks().length > 0;
    this.mime = elegirMime(conAudio);
    this.bits = calidad === '720' ? 8_000_000 : 16_000_000;
    this.trozos = [];
    this.rec = null;
    this.inicio = 0;
  }

  iniciar() {
    const op = { videoBitsPerSecond: this.bits, audioBitsPerSecond: 160_000 };
    if (this.mime) op.mimeType = this.mime;
    this.rec = new MediaRecorder(this.stream, op);
    this.mime = this.rec.mimeType || this.mime || 'video/webm';
    this.trozos = [];
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size) this.trozos.push(e.data);
    };
    this.rec.start(1000);
    this.inicio = performance.now();
  }

  get segundos() {
    return this.rec ? (performance.now() - this.inicio) / 1000 : 0;
  }

  detener() {
    return new Promise((resolve) => {
      if (!this.rec || this.rec.state === 'inactive') {
        resolve(null);
        return;
      }
      const segundos = this.segundos;
      this.rec.onstop = () => {
        const tipo = this.mime.split(';')[0] || 'video/webm';
        const blob = new Blob(this.trozos, { type: tipo });
        resolve({ blob, mime: tipo, ext: extension(tipo), segundos });
      };
      this.rec.stop();
    });
  }
}
