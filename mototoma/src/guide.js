// Motor de la guía en tiempo real. Todo es cálculo puro (sin DOM) para poder
// probarlo con `npm test`.
//
// Sensores (W3C DeviceMotion, ejes del dispositivo: x a la derecha, y hacia
// arriba de la pantalla, z saliendo de la pantalla):
//   accelerationIncludingGravity  → vector que apunta hacia ARRIBA en reposo.
//   rotationRate {alpha: z, beta: x, gamma: y} en grados por segundo.
// La cámara trasera mira hacia -z.

export const DEG = 180 / Math.PI;

export function norm180(a) {
  let r = ((a + 180) % 360 + 360) % 360 - 180;
  if (r === -180) r = 180;
  return r;
}

function unit(v) {
  const m = Math.hypot(v.x, v.y, v.z);
  if (!m) return null;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

/**
 * Inclinación y nivel a partir de la gravedad.
 * pitch: 0 = cámara mirando al horizonte, + hacia el cielo, - hacia el suelo.
 * roll:  0 = móvil derecho respecto a la pantalla actual; + girado en sentido
 *        antihorario (la parte de arriba hacia la izquierda), ±180 = boca abajo.
 */
export function orientacion(g, anguloPantalla = 0) {
  const u = unit(g);
  if (!u) return null;
  const pitch = Math.asin(Math.max(-1, Math.min(1, -u.z))) * DEG;
  const rollDispositivo = Math.atan2(u.x, u.y) * DEG;
  const roll = norm180(rollDispositivo - anguloPantalla);
  return { pitch, roll };
}

/** Velocidad de giro horizontal (°/s). Positivo = el móvil gira hacia la izquierda. */
export function giroHorizontal(rot, g) {
  const u = unit(g);
  if (!u || !rot) return 0;
  const w = { x: rot.beta || 0, y: rot.gamma || 0, z: rot.alpha || 0 };
  return w.x * u.x + w.y * u.y + w.z * u.z;
}

/** Rangos de velocidad por tipo de movimiento. */
export const RANGOS = {
  // grados por segundo de giro horizontal
  orbita: { lento: [5, 30], medio: [18, 55], rapido: [40, 160] },
  paneo: { lento: [6, 30], medio: [20, 65], rapido: [45, 260] },
  // anchos de pantalla por segundo (movimiento de la imagen)
  deslizar: { lento: [0.02, 0.3], medio: [0.12, 0.6], rapido: [0.35, 3] },
  subir: { lento: [0.02, 0.3], medio: [0.12, 0.6], rapido: [0.35, 3] },
  bajar: { lento: [0.02, 0.3], medio: [0.12, 0.6], rapido: [0.35, 3] },
};

/** Suaviza las lecturas de los sensores y mide el temblor. */
export class Movimiento {
  constructor() {
    this.yaw = 0;          // °/s suavizado
    this.temblor = 0;      // °/s de vibración rápida
    this.pitch = null;
    this.roll = null;
    this._w = null;
  }

  /** Muestra de DeviceMotion. dt en segundos. */
  muestra({ g, rot, anguloPantalla = 0, dt = 1 / 60 }) {
    const o = orientacion(g, anguloPantalla);
    if (o) {
      const k = Math.min(1, dt * 8);
      this.pitch = this.pitch == null ? o.pitch : this.pitch + (o.pitch - this.pitch) * k;
      // el roll se suaviza en el círculo para no saltar entre 180 y -180
      if (this.roll == null) this.roll = o.roll;
      else this.roll = norm180(this.roll + norm180(o.roll - this.roll) * k);
    }
    if (rot) {
      const w = { x: rot.beta || 0, y: rot.gamma || 0, z: rot.alpha || 0 };
      const k = Math.min(1, dt * 4);
      if (!this._w) this._w = { ...w };
      else for (const a of ['x', 'y', 'z']) this._w[a] += (w[a] - this._w[a]) * k;
      const hp = Math.hypot(w.x - this._w.x, w.y - this._w.y, w.z - this._w.z);
      this.temblor += (hp - this.temblor) * Math.min(1, dt * 3);
      const y = giroHorizontal(rot, g);
      this.yaw += (y - this.yaw) * Math.min(1, dt * 5);
    }
  }
}

/** Ángulo de giro objetivo (0..180) para tomas de giro en el instante t. */
export function giroObjetivo(giro, t) {
  const p = Math.max(0, Math.min(1, (t - giro.inicio) / giro.segundos));
  return giro.desde + (giro.hasta - giro.desde) * p;
}

function umbralTemblor(tipo) {
  if (tipo === 'pov') return Infinity;
  if (tipo === 'estatico') return 10;
  return 18;
}

/**
 * Evalúa el estado actual frente a lo que pide la toma.
 * estado: { pitch, roll, yaw, temblor, flujo: {x, y} (anchos de pantalla/s,
 *          movimiento de la CÁMARA: x+ derecha, y+ arriba), brillo (0-255) }
 * t: segundos desde que empezó la grabación (o null antes de grabar).
 * Devuelve una lista ordenada por prioridad: [{clave, texto, nivel}]
 * nivel: 'mal' (corrige ya) | 'aviso' | 'bien'.
 */
export function evaluar(toma, estado, t) {
  const out = [];
  const mov = toma.mov || { tipo: 'estatico' };
  const grabando = t != null;
  const { pitch, roll, yaw = 0, temblor = 0, flujo, brillo } = estado;

  // 1. Giro del móvil
  if (mov.tipo === 'giro' && toma.giro && roll != null) {
    const actual = Math.abs(roll);
    const g = toma.giro;
    if (!grabando || t < g.inicio) {
      if (Math.abs(actual - g.desde) > 25) {
        out.push({ clave: 'giro-inicio', nivel: 'mal', texto: g.desde > 90 ? 'Pon el móvil boca abajo' : 'Pon el móvil derecho' });
      } else {
        out.push({ clave: 'giro-listo', nivel: 'bien', texto: 'Posición de salida correcta' });
      }
    } else {
      const objetivo = giroObjetivo(g, t);
      const bajando = g.hasta < g.desde;
      const delta = actual - objetivo;
      const atrasado = bajando ? delta > 22 : delta < -22;
      const adelantado = bajando ? delta < -22 : delta > 22;
      if (t > g.inicio + g.segundos + 0.4 && Math.abs(actual - g.hasta) > 20) {
        out.push({ clave: 'giro-termina', nivel: 'mal', texto: 'Termina el giro' });
      } else if (atrasado) {
        out.push({ clave: 'giro-rapido', nivel: 'mal', texto: 'Gira más rápido' });
      } else if (adelantado) {
        out.push({ clave: 'giro-lento', nivel: 'aviso', texto: 'Gira más despacio' });
      } else {
        out.push({ clave: 'giro-bien', nivel: 'bien', texto: 'Buen giro' });
      }
    }
  }

  // 2. Inclinación
  if (toma.inclinacion && pitch != null) {
    const [min, max] = toma.inclinacion;
    if (pitch < min - 4) out.push({ clave: 'inclina-arriba', nivel: 'mal', texto: 'Inclina el móvil hacia arriba' });
    else if (pitch > max + 4) out.push({ clave: 'inclina-abajo', nivel: 'mal', texto: 'Inclina el móvil hacia abajo' });
  }

  // 3. Dirección y velocidad (solo grabando, tras el primer segundo)
  if (grabando && t > 0.8) {
    const rango = RANGOS[mov.tipo]?.[mov.vel || 'lento'];
    let velocidad = null;
    let sentidoOk = true;
    if (mov.tipo === 'orbita' || mov.tipo === 'paneo') {
      // órbita a la derecha: caminas a tu derecha → el móvil gira a la izquierda
      const esperado = mov.tipo === 'orbita' ? (mov.dir === 'der' ? 1 : -1) : (mov.dir === 'der' ? -1 : 1);
      velocidad = Math.abs(yaw);
      if (velocidad > 6 && Math.sign(yaw) !== esperado) sentidoOk = false;
    } else if (flujo && (mov.tipo === 'deslizar' || mov.tipo === 'subir' || mov.tipo === 'bajar')) {
      const eje = mov.tipo === 'deslizar' ? flujo.x : flujo.y;
      const esperado = mov.tipo === 'deslizar' ? (mov.dir === 'der' ? 1 : -1) : (mov.tipo === 'subir' ? 1 : -1);
      velocidad = Math.abs(eje);
      if (velocidad > 0.05 && Math.sign(eje) !== esperado) sentidoOk = false;
    }
    if (!sentidoOk) {
      out.push({ clave: 'sentido', nivel: 'mal', texto: textoSentido(mov) });
    } else if (rango && velocidad != null) {
      if (velocidad < rango[0]) out.push({ clave: 'lento', nivel: 'aviso', texto: 'Muévete un poco más rápido' });
      else if (velocidad > rango[1]) out.push({ clave: 'rapido', nivel: 'mal', texto: 'Más despacio' });
    }
    if (mov.tipo === 'estatico') {
      const fl = flujo ? Math.hypot(flujo.x, flujo.y) : 0;
      if (Math.abs(yaw) > 6 || fl > 0.06) out.push({ clave: 'quieto', nivel: 'mal', texto: 'Quieto, no muevas el móvil' });
    }
  }

  // 4. Temblor
  if (temblor > umbralTemblor(mov.tipo)) {
    out.push({ clave: 'temblor', nivel: 'aviso', texto: 'Tiembla: sujeta con las dos manos y pega los codos' });
  }

  // 5. Nivel (horizonte)
  if (toma.nivel !== false && mov.tipo !== 'giro' && mov.tipo !== 'pov' && roll != null) {
    if (roll > 3) out.push({ clave: 'nivel', nivel: 'aviso', texto: 'Endereza: gira un poco a la derecha' });
    else if (roll < -3) out.push({ clave: 'nivel', nivel: 'aviso', texto: 'Endereza: gira un poco a la izquierda' });
  }

  // 6. Luz
  if (brillo != null) {
    const min = toma.luz === 'noche' ? 16 : 40;
    if (brillo < min) {
      out.push({ clave: 'oscuro', nivel: 'aviso', texto: toma.luz === 'noche' ? 'Muy oscuro: acércate a una farola o enciende los faros' : 'Muy oscuro: busca más luz' });
    } else if (brillo > 238 && toma.luz !== 'contraluz') {
      out.push({ clave: 'quemado', nivel: 'aviso', texto: 'Demasiada luz: cambia de ángulo' });
    }
  }

  const orden = { mal: 0, aviso: 1, bien: 2 };
  out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
  return out;
}

function textoSentido(mov) {
  if (mov.tipo === 'orbita') return mov.dir === 'der' ? 'Al revés: camina hacia tu derecha' : 'Al revés: camina hacia tu izquierda';
  if (mov.tipo === 'paneo') return mov.dir === 'der' ? 'Al revés: gira hacia tu derecha' : 'Al revés: gira hacia tu izquierda';
  if (mov.tipo === 'deslizar') return mov.dir === 'der' ? 'Al revés: desliza hacia tu derecha' : 'Al revés: desliza hacia tu izquierda';
  if (mov.tipo === 'subir') return 'Al revés: sube el móvil';
  if (mov.tipo === 'bajar') return 'Al revés: baja el móvil';
  return 'Revisa la dirección';
}

/** Acumula lo que pasó durante una toma para la revisión final. */
export class Resumen {
  constructor(toma) {
    this.toma = toma;
    this.n = 0;
    this.cuenta = {};
    this.velocidades = [];
  }

  agregar(problemas, estado) {
    this.n++;
    const vistas = new Set();
    for (const p of problemas) {
      if (p.nivel === 'bien' || vistas.has(p.clave)) continue;
      vistas.add(p.clave);
      this.cuenta[p.clave] = (this.cuenta[p.clave] || 0) + 1;
    }
    if (estado) this.velocidades.push(Math.abs(estado.yaw || 0));
  }

  /** Lista de comprobaciones para mostrar al terminar. */
  informe(segundos) {
    const toma = this.toma;
    const f = (k) => (this.n ? (this.cuenta[k] || 0) / this.n : 0);
    const items = [];
    const minimo = toma.usa + 0.8;
    items.push(segundos >= minimo
      ? { ok: true, texto: `Duración suficiente (${segundos.toFixed(1)} s)` }
      : { ok: false, texto: `Muy corta: graba al menos ${minimo.toFixed(1)} s` });

    const mov = toma.mov?.tipo || 'estatico';
    if (mov === 'giro') {
      const mal = f('giro-rapido') + f('giro-lento') + f('giro-termina');
      items.push(mal < 0.35 ? { ok: true, texto: 'El giro siguió el ritmo' } : { ok: false, texto: 'El giro no siguió la aguja: repite más suave' });
    }
    if (mov === 'orbita' || mov === 'paneo' || mov === 'deslizar' || mov === 'subir' || mov === 'bajar') {
      items.push(f('sentido') < 0.25 ? { ok: true, texto: 'Dirección correcta' } : { ok: false, texto: 'Te moviste en la dirección contraria' });
      if (f('rapido') > 0.3) items.push({ ok: false, texto: 'Fuiste demasiado rápido' });
      else if (f('lento') > 0.5) items.push({ ok: false, texto: 'Casi no te moviste' });
      else items.push({ ok: true, texto: 'Velocidad buena' });
    }
    if (mov === 'estatico') {
      items.push(f('quieto') < 0.25 ? { ok: true, texto: 'Plano quieto' } : { ok: false, texto: 'El móvil se movió' });
    }
    if (mov !== 'pov') {
      items.push(f('temblor') < 0.3 ? { ok: true, texto: 'Imagen estable' } : { ok: false, texto: 'Hubo temblor' });
    }
    if (toma.inclinacion) {
      const mal = f('inclina-arriba') + f('inclina-abajo');
      items.push(mal < 0.3 ? { ok: true, texto: 'Inclinación correcta' } : { ok: false, texto: f('inclina-arriba') > f('inclina-abajo') ? 'Apuntaste muy abajo' : 'Apuntaste muy arriba' });
    }
    if (toma.nivel !== false && mov !== 'giro' && mov !== 'pov') {
      items.push(f('nivel') < 0.35 ? { ok: true, texto: 'Horizonte recto' } : { ok: false, texto: 'El horizonte salió torcido' });
    }
    if (f('oscuro') > 0.5) items.push({ ok: false, texto: 'Salió muy oscura' });
    if (f('quemado') > 0.5) items.push({ ok: false, texto: 'Salió con demasiada luz' });

    const fallos = items.filter((i) => !i.ok).length;
    return { items, buena: fallos === 0, fallos };
  }
}

/** Decide qué decir en voz alta sin agobiar: problemas persistentes y sin repetir. */
export class Locutor {
  constructor({ persistencia = 1.2, repetir = 4, silencioTrasPaso = 1.6 } = {}) {
    this.persistencia = persistencia;
    this.repetir = repetir;
    this.silencioTrasPaso = silencioTrasPaso;
    this.desde = {};       // clave → primer instante visto de forma continua
    this.dicho = {};       // clave → último instante dicho
    this.ultimoPaso = -Infinity;
  }

  paso(ahora) {
    this.ultimoPaso = ahora;
  }

  /** Devuelve el texto a decir ahora, o null. */
  elegir(problemas, ahora) {
    const activos = new Set();
    for (const p of problemas) {
      if (p.nivel === 'bien') continue;
      activos.add(p.clave);
      if (this.desde[p.clave] == null) this.desde[p.clave] = ahora;
    }
    for (const k of Object.keys(this.desde)) if (!activos.has(k)) delete this.desde[k];
    if (ahora - this.ultimoPaso < this.silencioTrasPaso) return null;
    for (const p of problemas) {
      if (p.nivel === 'bien') continue;
      const visto = ahora - this.desde[p.clave];
      const ultimo = this.dicho[p.clave] ?? -Infinity;
      if (visto >= this.persistencia && ahora - ultimo >= this.repetir) {
        this.dicho[p.clave] = ahora;
        this.ultimoPaso = ahora;
        return p.texto;
      }
    }
    return null;
  }
}
