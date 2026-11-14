// Pantalla de rodaje: cámara + guía en tiempo real + revisión de la toma.
import { ALTURAS, getEdit, nombreArchivo, usoEnEdit } from '../catalog.js';
import { icono } from '../art.js';
import { Analizador, capturarFotograma } from '../analyzer.js';
import { Camara, elegirMime, Grabadora } from '../camera.js';
import { evaluar, giroObjetivo, Locutor, Movimiento, RANGOS, Resumen } from '../guide.js';
import { activarVibracion, activarVoz, callar, guardarVideo, hablar, orientacion, pantallaEncendida, vibrar } from '../native.js';
import { ajustes, guardarImagen, leerImagen, marcarToma, progresoEdit } from '../storage.js';
import { esc, flechaMovimiento, formatoDe, ICONOS_UI, pitido, seg, timelineHTML, toast } from '../ui.js';
import { describirMovimiento } from './detalle.js';

const PITCH_RANGO = 60;

export function camara(root, { params, ir, reemplazar }) {
  const edit = getEdit(params[0]);
  if (!edit) {
    ir('#/', true);
    return null;
  }
  let idx = Math.max(0, Math.min(edit.tomas.length - 1, Number(params[1]) || 0));
  const a = ajustes();
  activarVoz(a.voz);
  activarVibracion(a.vibracion);
  const formato = formatoDe(edit);
  const toma = () => edit.tomas[idx];

  root.innerHTML = `<div class="cam">
    <div class="cam-frame">
      <video playsinline muted autoplay></video>
      <img class="cam-ghost" alt="" hidden>
      <div class="cam-grid" hidden></div>
      <div class="cam-box"></div>
      <div class="cam-horizon"></div>
      <div class="cam-dial" hidden></div>
    </div>
    <div class="cam-pitch" hidden><div class="lbl">Inclinación</div><div class="zone"></div><div class="zero"></div><div class="mark"></div></div>
    <div class="cam-top">
      <button class="btn-icon" data-salir aria-label="Salir">${ICONOS_UI.atras}</button>
      <div class="cam-title"><b></b><small></small></div>
      <button class="btn-icon" data-lente aria-label="Cambiar lente" hidden>${ICONOS_UI.lente}</button>
      <button class="btn-icon" data-linterna aria-label="Linterna" aria-pressed="false" hidden>${ICONOS_UI.linterna}</button>
      <button class="btn-icon" data-fantasma aria-label="Transparencia" aria-pressed="false" hidden>${ICONOS_UI.fantasma}</button>
      <button class="btn-icon" data-cuadricula aria-label="Cuadrícula" aria-pressed="${a.cuadricula}">${ICONOS_UI.cuadricula}</button>
      <button class="btn-icon" data-ficha aria-label="Ficha de la toma">${ICONOS_UI.info}</button>
    </div>
    <div class="cam-side">
      <div class="cam-hints"></div>
      <div class="cam-move"><div class="arrow"></div><div class="meter"><div class="zone"></div><div class="needle"></div></div></div>
    </div>
    <div class="cam-cue"><div class="paso"></div><br><div class="alerta" hidden></div></div>
    <div class="cam-time"></div>
    <div class="cam-bottom">
      <button class="btn-icon nav-btn" data-ant aria-label="Toma anterior">${ICONOS_UI.ant}</button>
      <button class="rec-btn" data-rec aria-label="Grabar">
        <svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="38" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="5"/>
        <circle class="ring" cx="42" cy="42" r="38" fill="none" stroke="#3ddc84" stroke-width="5" stroke-linecap="round" stroke-dasharray="238.8" stroke-dashoffset="238.8"/></svg>
        <div class="core"></div>
      </button>
      <button class="btn-icon nav-btn" data-sig aria-label="Toma siguiente">${ICONOS_UI.sig}</button>
    </div>
    <div class="cam-count" hidden></div>
    <div class="cam-layer" hidden></div>
  </div>`;

  const q = (s) => root.querySelector(s);
  const el = {
    cam: q('.cam'), frame: q('.cam-frame'), video: q('video'), ghost: q('.cam-ghost'), grid: q('.cam-grid'),
    box: q('.cam-box'), horizon: q('.cam-horizon'), dial: q('.cam-dial'), pitch: q('.cam-pitch'),
    pitchZone: q('.cam-pitch .zone'), pitchMark: q('.cam-pitch .mark'),
    titulo: q('.cam-title b'), sub: q('.cam-title small'), hints: q('.cam-hints'),
    moveArrow: q('.cam-move .arrow'), move: q('.cam-move'), meterZone: q('.meter .zone'), needle: q('.meter .needle'),
    paso: q('.cam-cue .paso'), alerta: q('.cam-cue .alerta'), tiempo: q('.cam-time'),
    rec: q('[data-rec]'), ring: q('.ring'), ant: q('[data-ant]'), sig: q('[data-sig]'),
    lente: q('[data-lente]'), linterna: q('[data-linterna]'), fantasma: q('[data-fantasma]'), cuadricula: q('[data-cuadricula]'),
    count: q('.cam-count'), layer: q('.cam-layer'),
  };

  const camara = new Camara(el.video);
  const analizador = new Analizador();
  const mov = new Movimiento();
  let estado = 'iniciando';      // iniciando | preview | cuenta | grabando | revisando | error
  let info = null;
  let fpsActual = null;
  let grabadora = null;
  let resumen = null;
  let locutor = null;
  let pasoIdx = -1;
  let problemas = [];
  let flujo = { x: 0, y: 0 };
  let brillo = null;
  let primerCuadro = null;
  let sensores = false;
  let ultimoAnalisis = 0;
  let raf = 0;
  let cuentaTimer = 0;
  let ghostOn = a.fantasma;
  let ghostSrc = null;
  let gridOn = a.cuadricula;
  let vivo = true;
  let resultado = null;

  // ------------------------------------------------------------ cámara
  async function arrancar(deviceId = null) {
    estado = 'iniciando';
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('sin cámara'), { name: 'NoMediaDevices' });
      info = await camara.iniciar({ calidad: a.calidad, fps: toma().fps, deviceId });
      if (!vivo) {
        camara.detener();
        return;
      }
      fpsActual = toma().fps;
      estado = 'preview';
      el.lente.hidden = camara.lentes.length < 2;
      el.linterna.hidden = !info.linterna;
      ajustarMarco();
      pintarHints();
    } catch (e) {
      if (!vivo) return;
      estado = 'error';
      mostrarError(e);
    }
  }

  function ajustarMarco() {
    const vw = el.video.videoWidth || (formato === 'vertical' ? 9 : 16);
    const vh = el.video.videoHeight || (formato === 'vertical' ? 16 : 9);
    const W = root.clientWidth || innerWidth;
    const H = root.clientHeight || innerHeight;
    const k = Math.min(W / vw, H / vh);
    const w = vw * k;
    const h = vh * k;
    Object.assign(el.frame.style, { width: `${w}px`, height: `${h}px`, left: `${(W - w) / 2}px`, top: `${(H - h) / 2}px` });
  }

  function mostrarError(e) {
    const permiso = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
    const texto = permiso
      ? 'MotoToma necesita permiso para usar la cámara y el micrófono. Si lo negaste, ve a Ajustes del móvil → Aplicaciones → MotoToma → Permisos y actívalos.'
      : e && e.name === 'NoMediaDevices'
        ? 'Este dispositivo no permite usar la cámara desde la app.'
        : 'No pude abrir la cámara. Cierra otras apps que la estén usando y vuelve a intentarlo.';
    el.layer.hidden = false;
    el.layer.innerHTML = `<div class="cam-msg"><div><h2>Cámara no disponible</h2><p class="muted">${esc(texto)}</p>
      <div class="row"><button class="btn primary" data-reintentar>Reintentar</button><button class="btn" data-volver>Volver</button></div></div></div>`;
    el.layer.querySelector('[data-reintentar]').addEventListener('click', () => {
      el.layer.hidden = true;
      arrancar();
    });
    el.layer.querySelector('[data-volver]').addEventListener('click', salir);
  }

  // ------------------------------------------------------------ sensores
  let ultimoT = 0;
  const alMoverse = (e) => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    const t = e.timeStamp / 1000;
    const dt = ultimoT ? Math.min(0.1, Math.max(0.004, t - ultimoT)) : 1 / 60;
    ultimoT = t;
    sensores = true;
    mov.muestra({ g: { x: g.x, y: g.y, z: g.z }, rot: e.rotationRate, anguloPantalla: anguloPantalla(), dt });
  };
  function anguloPantalla() {
    if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
    return Number(window.orientation) || 0;
  }

  // ------------------------------------------------------------ interfaz de la toma
  async function prepararToma() {
    const t = toma();
    el.titulo.textContent = `Toma ${idx + 1}/${edit.tomas.length} · ${t.nombre}`;
    el.sub.textContent = `${ALTURAS[t.altura] || t.altura} · ${t.distancia} · ${describirMovimiento(t.mov)}`;
    el.ant.disabled = idx === 0;
    el.sig.disabled = idx === edit.tomas.length - 1;

    const c = t.encuadre?.caja;
    if (c) {
      Object.assign(el.box.style, { left: `${c[0]}%`, top: `${c[1]}%`, width: `${c[2]}%`, height: `${c[3]}%`, display: '' });
      el.box.innerHTML = `${icono(t.encuadre.icono)}<span>${esc(t.encuadre.etiqueta)}</span>`;
    } else {
      el.box.style.display = 'none';
    }

    const esGiro = t.mov.tipo === 'giro';
    el.dial.hidden = !esGiro;
    el.horizon.hidden = esGiro || t.mov.tipo === 'pov' || t.nivel === false;
    el.pitch.hidden = !t.inclinacion;
    if (t.inclinacion) {
      const [min, max] = t.inclinacion;
      const top = ((PITCH_RANGO - Math.min(PITCH_RANGO, max)) / (2 * PITCH_RANGO)) * 100;
      const alto = ((Math.min(PITCH_RANGO, max) - Math.max(-PITCH_RANGO, min)) / (2 * PITCH_RANGO)) * 100;
      Object.assign(el.pitchZone.style, { top: `${top}%`, height: `${Math.max(3, alto)}%` });
    }

    el.moveArrow.innerHTML = `${flechaMovimiento(t.mov)}<span>${esc(describirMovimiento(t.mov))}</span>`;
    const rango = rangoMedidor(t);
    el.meterZone.parentElement.hidden = !rango;
    if (rango) {
      Object.assign(el.meterZone.style, { left: `${(rango.zona[0] / rango.max) * 100}%`, width: `${((rango.zona[1] - rango.zona[0]) / rango.max) * 100}%` });
    }

    el.paso.textContent = t.pasos[0]?.txt || t.objetivo;
    el.alerta.hidden = true;
    el.tiempo.textContent = `Graba ${t.graba} s`;
    el.ring.style.strokeDashoffset = '238.8';

    // transparencia: toma con la que debe coincidir o fotograma de referencia
    ghostSrc = null;
    if (t.coincide) ghostSrc = await leerImagen(`cuadro:${edit.id}:${t.coincide.toma}:${t.coincide.cuadro}`);
    if (!ghostSrc) ghostSrc = await leerImagen(`ref:${edit.id}:${t.id}`);
    if (!vivo) return;
    el.fantasma.hidden = !ghostSrc;
    pintarFantasma();
    pintarHints();

    if (fpsActual != null && fpsActual !== t.fps && estado !== 'error') await arrancar(camara.deviceId);
  }

  function rangoMedidor(t) {
    const tipo = t.mov.tipo;
    if (tipo === 'estatico') return { zona: [0, 6], max: 30, fuente: 'yaw' };
    const r = RANGOS[tipo]?.[t.mov.vel || 'lento'];
    if (!r) return null;
    const fuente = tipo === 'orbita' || tipo === 'paneo' ? 'yaw' : tipo === 'deslizar' ? 'x' : 'y';
    return { zona: r, max: r[1] * 1.6, fuente };
  }

  function pintarFantasma() {
    const ver = ghostOn && !!ghostSrc;
    el.fantasma.setAttribute('aria-pressed', String(ver));
    el.ghost.hidden = !ver;
    if (ver && el.ghost.getAttribute('src') !== ghostSrc) el.ghost.src = ghostSrc;
  }

  function pintarHints() {
    const t = toma();
    const h = [];
    if (estado === 'grabando') h.push('<span class="hint rec">● GRABANDO</span>');
    if (info) {
      const res = `${Math.min(info.ancho, info.alto) >= 1000 ? '1080p' : `${Math.min(info.ancho, info.alto)}p`}`;
      h.push(`<span class="hint">${res}${info.fps ? ` · ${info.fps} fps` : ''}</span>`);
      if (t.fps === 60 && info.fps && info.fps < 50) h.push(`<span class="hint warn">Tu cámara da ${info.fps} fps: la cámara lenta será menos suave</span>`);
      const vertical = info.alto > info.ancho;
      if (formato === 'vertical' && !vertical) h.push('<span class="hint warn">La imagen sale horizontal: gira el móvil</span>');
      if (formato === 'horizontal' && vertical) h.push('<span class="hint warn">Gira el móvil a horizontal</span>');
      if (!info.audio) h.push('<span class="hint warn">Sin micrófono: se grabará sin sonido</span>');
    }
    if (estado !== 'grabando' && t.fps === 60) h.push('<span class="hint">Para cámara lenta</span>');
    if (!sensores && estado === 'preview' && performance.now() > arranque + 2500) h.push('<span class="hint warn">Sin sensores de movimiento</span>');
    if (estado !== 'grabando' && !elegirMime(true)?.includes('mp4')) h.push('<span class="hint">Se guarda en WebM</span>');
    el.hints.innerHTML = h.join('');
  }
  const arranque = performance.now();

  // ------------------------------------------------------------ bucle de la guía
  function bucle(ms) {
    if (!vivo) return;
    raf = requestAnimationFrame(bucle);
    const ahora = ms / 1000;
    const t = toma();

    if (ahora - ultimoAnalisis >= 0.1 && el.video.readyState >= 2) {
      ultimoAnalisis = ahora;
      const r = analizador.procesar(el.video, ahora);
      if (r) {
        flujo = r.flujo;
        brillo = r.brillo;
      }
      guiar(ahora);
    }

    // horizonte
    if (mov.roll != null && !el.horizon.hidden) {
      el.horizon.style.transform = `translate(-50%, -50%) rotate(${mov.roll.toFixed(1)}deg)`;
      el.horizon.classList.toggle('ok', Math.abs(mov.roll) <= 3);
    }
    // inclinación
    if (mov.pitch != null && t.inclinacion) {
      const p = Math.max(-PITCH_RANGO, Math.min(PITCH_RANGO, mov.pitch));
      el.pitchMark.style.top = `${((PITCH_RANGO - p) / (2 * PITCH_RANGO)) * 100}%`;
      const dentro = mov.pitch >= t.inclinacion[0] - 4 && mov.pitch <= t.inclinacion[1] + 4;
      el.pitchMark.classList.toggle('ok', dentro);
      el.pitchMark.classList.toggle('bad', !dentro);
    }
    // giro
    if (t.mov.tipo === 'giro' && t.giro) pintarDial(t);
    // medidor de movimiento
    const rango = rangoMedidor(t);
    if (rango) {
      const v = rango.fuente === 'yaw' ? Math.abs(mov.yaw) : Math.abs(rango.fuente === 'x' ? flujo.x : flujo.y);
      el.needle.style.left = `${Math.min(100, (v / rango.max) * 100)}%`;
    }
    // tiempo
    if (estado === 'grabando' && grabadora) {
      const s = grabadora.segundos;
      el.tiempo.textContent = `${s.toFixed(1)} / ${t.graba} s`;
      el.ring.style.strokeDashoffset = String(238.8 * (1 - Math.min(1, s / t.graba)));
      if (!primerCuadro && s > 0.2) primerCuadro = capturarFotograma(el.video);
    }
  }

  function pintarDial(t) {
    const actual = mov.roll == null ? 0 : Math.abs(mov.roll);
    const tt = estado === 'grabando' && grabadora ? grabadora.segundos : 0;
    const objetivo = estado === 'grabando' ? giroObjetivo(t.giro, tt) : t.giro.desde;
    const punto = (ang, r) => {
      const rad = (ang - 90) * (Math.PI / 180);
      return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)];
    };
    const [ax, ay] = punto(actual, 40);
    const [ox, oy] = punto(objetivo, 40);
    const cerca = Math.abs(actual - objetivo) < 22;
    el.dial.innerHTML = `<svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="40" fill="rgba(0,0,0,.35)" stroke="rgba(255,255,255,.5)" stroke-width="1.5"/>
      <text x="50" y="7" fill="#fff" font-size="5" text-anchor="middle">0°</text>
      <text x="50" y="98" fill="#fff" font-size="5" text-anchor="middle">180°</text>
      <circle cx="${ox}" cy="${oy}" r="6" fill="rgba(61,220,132,.85)"/>
      <line x1="50" y1="50" x2="${ax}" y2="${ay}" stroke="${cerca ? '#3ddc84' : '#fff'}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="50" cy="50" r="3" fill="#fff"/>
      <text x="50" y="62" fill="#fff" font-size="7" font-weight="700" text-anchor="middle">${Math.round(actual)}°</text>
    </svg>`;
  }

  function guiar(ahora) {
    const t = toma();
    const grabando = estado === 'grabando' && grabadora;
    const tt = grabando ? grabadora.segundos : null;
    problemas = evaluar(t, { pitch: mov.pitch, roll: mov.roll, yaw: mov.yaw, temblor: mov.temblor, flujo, brillo }, tt);

    if (grabando) {
      resumen.agregar(problemas, { yaw: mov.yaw });
      // pasos de la toma
      let i = -1;
      t.pasos.forEach((p, k) => { if (p.t <= tt) i = k; });
      if (i !== pasoIdx && i >= 0) {
        pasoIdx = i;
        el.paso.textContent = t.pasos[i].txt;
        if (i > 0 || tt > 0.5) {
          if (a.vozGrabando) hablar(t.pasos[i].txt);
          locutor.paso(ahora);
        }
      }
      // avisos por voz
      const decir = locutor.elegir(problemas, ahora);
      if (decir && a.vozGrabando) {
        hablar(decir);
        vibrar('aviso');
      }
      if (a.pararSola && tt >= t.graba) detener(true);
    }

    const top = problemas.find((p) => p.nivel !== 'bien') || problemas[0];
    if (top && estado !== 'revisando') {
      el.alerta.hidden = false;
      el.alerta.className = `alerta ${top.nivel}`;
      el.alerta.textContent = top.texto;
    } else if (estado === 'preview' && sensores) {
      el.alerta.hidden = false;
      el.alerta.className = 'alerta bien';
      el.alerta.textContent = 'Listo: pulsa grabar';
    } else if (grabando && sensores) {
      el.alerta.hidden = false;
      el.alerta.className = 'alerta bien';
      el.alerta.textContent = 'Así, muy bien';
    } else {
      el.alerta.hidden = true;
    }
  }

  // ------------------------------------------------------------ grabación
  function pulsarGrabar() {
    if (estado === 'preview') empezarCuenta();
    else if (estado === 'cuenta') cancelarCuenta();
    else if (estado === 'grabando') detener(false);
  }

  function empezarCuenta() {
    const t = toma();
    const n = Number(a.cuentaAtras) || 0;
    hablar(t.pasos[0]?.txt || t.objetivo);
    if (!n) {
      empezar();
      return;
    }
    estado = 'cuenta';
    let k = n;
    el.count.hidden = false;
    el.count.textContent = String(k);
    pitido(660);
    cuentaTimer = setInterval(() => {
      k--;
      if (k <= 0) {
        clearInterval(cuentaTimer);
        el.count.hidden = true;
        empezar();
      } else {
        el.count.textContent = String(k);
        pitido(660);
      }
    }, 1000);
  }

  function cancelarCuenta() {
    clearInterval(cuentaTimer);
    el.count.hidden = true;
    estado = 'preview';
    callar();
  }

  function empezar() {
    if (!camara.stream) return;
    const t = toma();
    try {
      grabadora = new Grabadora(camara.stream, { calidad: a.calidad });
      grabadora.iniciar();
    } catch {
      toast('No se pudo empezar a grabar en este dispositivo');
      estado = 'preview';
      return;
    }
    estado = 'grabando';
    resumen = new Resumen(t);
    locutor = new Locutor();
    pasoIdx = 0;
    primerCuadro = null;
    analizador.reiniciar();
    el.paso.textContent = t.pasos[0]?.txt || t.objetivo;
    el.cam.classList.add('recording');
    el.rec.setAttribute('aria-label', 'Parar');
    el.ant.disabled = true;
    el.sig.disabled = true;
    orientacion('bloquear');
    vibrar('fuerte');
    pintarHints();
  }

  async function detener(auto) {
    if (estado !== 'grabando' || !grabadora) return;
    estado = 'revisando';
    const ultimo = capturarFotograma(el.video);
    const primero = primerCuadro || ultimo;
    const g = grabadora;
    grabadora = null;
    el.cam.classList.remove('recording');
    el.rec.setAttribute('aria-label', 'Grabar');
    pintarHints();
    if (auto) {
      callar();
      hablar('¡Corta!');
    }
    vibrar('exito');
    const res = await g.detener();
    orientacion(formato);
    if (!vivo) return;
    if (!res || !res.blob.size) {
      toast('La grabación salió vacía. Inténtalo otra vez.');
      volverAPreview();
      return;
    }
    resultado = { ...res, primero, ultimo, informe: resumen.informe(res.segundos) };
    mostrarRevision();
  }

  function volverAPreview() {
    estado = 'preview';
    el.layer.hidden = true;
    el.layer.innerHTML = '';
    el.ant.disabled = idx === 0;
    el.sig.disabled = idx === edit.tomas.length - 1;
    el.ring.style.strokeDashoffset = '238.8';
    el.tiempo.textContent = `Graba ${toma().graba} s`;
    el.paso.textContent = toma().pasos[0]?.txt || toma().objetivo;
    pintarHints();
  }

  function mostrarRevision() {
    const t = toma();
    const r = resultado;
    const url = URL.createObjectURL(r.blob);
    r.url = url;
    const { items, buena } = r.informe;
    el.layer.hidden = false;
    el.layer.innerHTML = `<div class="cam-scrim"></div><div class="sheet" role="dialog" aria-label="Revisión de la toma">
      <div class="grip"></div>
      <h2>Toma ${idx + 1} · ${esc(t.nombre)}</h2>
      <video class="review-video" src="${url}" playsinline controls loop autoplay muted></video>
      <div class="verdict ${buena ? 'ok' : 'bad'}">${buena ? '¡Toma buena!' : 'Se puede mejorar'}</div>
      <ul class="clean checks">${items.map((i) => `<li class="${i.ok ? '' : 'bad'}">${esc(i.texto)}</li>`).join('')}</ul>
      <p class="muted small">En el edit se usan ${seg(usoEnEdit(edit, t.id) || t.usa)} de esta toma. ${esc(t.montaje || '')}</p>
      <div class="row">
        <button class="btn" data-repetir>Repetir</button>
        <button class="btn ${buena ? 'primary' : ''}" data-guardar>${buena ? 'Guardar y seguir' : 'Guardar igualmente'}</button>
      </div>
    </div>`;
    hablar(buena ? 'Toma buena' : `Revisa: ${(items.find((i) => !i.ok) || {}).texto || ''}`, { interrumpir: false });
    el.layer.querySelector('[data-repetir]').addEventListener('click', () => {
      URL.revokeObjectURL(url);
      resultado = null;
      volverAPreview();
    });
    el.layer.querySelector('[data-guardar]').addEventListener('click', guardar);
  }

  async function guardar() {
    const t = toma();
    const r = resultado;
    const boton = el.layer.querySelector('[data-guardar]');
    const repetir = el.layer.querySelector('[data-repetir]');
    boton.disabled = true;
    repetir.disabled = true;
    const nombre = nombreArchivo(edit, t, new Date(), r.ext);
    try {
      const { ubicacion } = await guardarVideo(r.blob, nombre, r.mime, (p) => { boton.textContent = `Guardando… ${Math.round(p * 100)}%`; });
      marcarToma(edit.id, t.id, { archivo: nombre, buena: r.informe.buena });
      if (r.primero) await guardarImagen(`cuadro:${edit.id}:${t.id}:primero`, r.primero);
      if (r.ultimo) await guardarImagen(`cuadro:${edit.id}:${t.id}:ultimo`, r.ultimo);
      toast(`Guardada en ${ubicacion}`);
    } catch (e) {
      boton.disabled = false;
      repetir.disabled = false;
      boton.textContent = 'Reintentar guardar';
      toast(`No se pudo guardar: ${e?.message || 'error'}`, 4000);
      return;
    }
    URL.revokeObjectURL(r.url);
    resultado = null;
    volverAPreview();
    // siguiente toma pendiente
    const p = progresoEdit(edit.id);
    const despues = edit.tomas.findIndex((x, k) => k > idx && !p[x.id]);
    const antes = edit.tomas.findIndex((x) => !p[x.id]);
    const sig = despues >= 0 ? despues : antes;
    if (sig < 0) {
      hablar('¡Tienes todas las tomas!', { interrumpir: false });
      ir(`#/montaje/${edit.id}`);
      return;
    }
    irA(sig);
  }

  function irA(i) {
    if (estado === 'grabando' || estado === 'cuenta') return;
    idx = Math.max(0, Math.min(edit.tomas.length - 1, i));
    reemplazar(`#/rodar/${edit.id}/${idx}`);
    prepararToma();
  }

  // ------------------------------------------------------------ ficha
  function mostrarFicha() {
    const t = toma();
    el.layer.hidden = false;
    el.layer.innerHTML = `<div class="cam-scrim" data-cerrar></div><div class="sheet" role="dialog" aria-label="Ficha de la toma">
      <div class="grip"></div>
      <h2>Toma ${idx + 1} · ${esc(t.nombre)}</h2>
      <p>${esc(t.objetivo)}</p>
      <div class="meta">
        <span class="tag">${esc(ALTURAS[t.altura] || t.altura)}</span>
        <span class="tag">${esc(t.distancia)}</span>
        <span class="tag">${esc(describirMovimiento(t.mov))}</span>
        <span class="tag">Graba ${t.graba} s</span>
        <span class="tag">Se usan ${seg(usoEnEdit(edit, t.id) || t.usa)}</span>
        <span class="tag">${t.fps} fps</span>
      </div>
      <h3 style="margin:16px 0 6px">Paso a paso</h3>
      <ol class="steps">${t.pasos.map((p) => `<li><b>${seg(p.t)}</b> · ${esc(p.txt)}</li>`).join('')}</ol>
      ${t.consejos.length ? `<h3 style="margin:16px 0 6px">Consejos</h3><ul class="dots">${t.consejos.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      <h3 style="margin:16px 0 6px">Dónde va en el edit</h3>
      ${timelineHTML(edit, { marcar: t.id })}
      <p class="muted small">${esc(t.montaje || '')}</p>
      <button class="btn block" data-cerrar>Cerrar</button>
    </div>`;
    el.layer.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrarCapa));
  }

  function cerrarCapa() {
    if (estado === 'revisando') return;
    el.layer.hidden = true;
    el.layer.innerHTML = '';
  }

  // ------------------------------------------------------------ salida
  function salir() {
    ir(`#/edit/${edit.id}`, true);
  }

  // ------------------------------------------------------------ eventos
  el.rec.addEventListener('click', pulsarGrabar);
  el.ant.addEventListener('click', () => irA(idx - 1));
  el.sig.addEventListener('click', () => irA(idx + 1));
  q('[data-salir]').addEventListener('click', () => {
    if (estado === 'grabando') {
      detener(false);
      return;
    }
    salir();
  });
  q('[data-ficha]').addEventListener('click', () => {
    if (estado === 'preview') mostrarFicha();
  });
  el.fantasma.addEventListener('click', () => {
    ghostOn = !ghostOn;
    pintarFantasma();
  });
  el.cuadricula.addEventListener('click', () => {
    gridOn = !gridOn;
    el.grid.hidden = !gridOn;
    el.cuadricula.setAttribute('aria-pressed', String(gridOn));
  });
  el.grid.hidden = !gridOn;
  el.lente.addEventListener('click', async () => {
    if (estado !== 'preview') return;
    try {
      info = await camara.siguienteLente({ calidad: a.calidad, fps: toma().fps });
      if (info) toast('Lente cambiada');
      el.linterna.hidden = !info?.linterna;
      ajustarMarco();
      pintarHints();
    } catch {
      toast('No se pudo cambiar de lente');
      arrancar();
    }
  });
  el.linterna.addEventListener('click', async () => {
    const on = !camara.linternaOn;
    if (await camara.linterna(on)) el.linterna.setAttribute('aria-pressed', String(on));
  });
  el.video.addEventListener('loadedmetadata', ajustarMarco);
  el.video.addEventListener('resize', () => {
    ajustarMarco();
    if (camara.stream) {
      info = camara.info();
      pintarHints();
    }
  });
  const alRedimensionar = () => ajustarMarco();
  window.addEventListener('resize', alRedimensionar);
  window.addEventListener('devicemotion', alMoverse);
  const alOcultar = () => {
    if (document.hidden && estado === 'grabando') detener(false);
  };
  document.addEventListener('visibilitychange', alOcultar);

  // ------------------------------------------------------------ inicio
  orientacion(formato);
  pantallaEncendida(true);
  prepararToma().then(() => arrancar());
  raf = requestAnimationFrame(bucle);
  const hintsTimer = setInterval(() => { if (estado === 'preview') pintarHints(); }, 3000);

  return {
    alVolver() {
      if (estado === 'grabando') {
        detener(false);
        return true;
      }
      if (estado === 'cuenta') {
        cancelarCuenta();
        return true;
      }
      if (estado === 'revisando') {
        toast('Primero guarda o repite la toma');
        return true;
      }
      if (!el.layer.hidden && estado !== 'revisando' && estado !== 'error') {
        cerrarCapa();
        return true;
      }
      return false;
    },
    limpiar() {
      vivo = false;
      cancelAnimationFrame(raf);
      clearInterval(cuentaTimer);
      clearInterval(hintsTimer);
      window.removeEventListener('resize', alRedimensionar);
      window.removeEventListener('devicemotion', alMoverse);
      document.removeEventListener('visibilitychange', alOcultar);
      if (resultado?.url) URL.revokeObjectURL(resultado.url);
      camara.detener();
      callar();
      orientacion('libre');
      pantallaEncendida(false);
    },
  };
}
