import { ALTURAS, getEdit, MOVIMIENTOS, VELOCIDADES } from '../catalog.js';
import { portada } from '../art.js';
import { capturarFotograma } from '../analyzer.js';
import { ajustes, borrarImagenes, guardarAjustes, guardarImagen, leerImagen, progresoEdit, reiniciarEdit } from '../storage.js';
import { colorToma, enlazarTimeline, esc, formatoDe, ICONOS_UI, seg, timelineHTML, toast } from '../ui.js';

export function describirMovimiento(mov) {
  const base = MOVIMIENTOS[mov.tipo] || mov.tipo;
  const dir = mov.dir === 'der' ? ' hacia tu derecha' : mov.dir === 'izq' ? ' hacia tu izquierda' : '';
  const vel = mov.vel && mov.tipo !== 'estatico' ? `, ${VELOCIDADES[mov.vel]}` : '';
  return `${base}${dir}${vel}`;
}

function esperar(el, ev, ms = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tiempo')), ms);
    el.addEventListener(ev, () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

/** Saca un fotograma por toma del vídeo de referencia y lo guarda para el fantasma. */
async function procesarReferencia(edit, archivo, alProgreso) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const url = URL.createObjectURL(archivo);
  video.src = url;
  try {
    await esperar(video, 'loadeddata', 15000);
    // despierta el decodificador (algunos Android devuelven negro sin esto)
    const limite = (ms) => new Promise((r) => setTimeout(r, ms));
    await Promise.race([video.play().catch(() => {}), limite(1200)]);
    video.pause();
    const tomas = edit.tomas.filter((t) => t.ref != null);
    let n = 0;
    for (const t of tomas) {
      video.currentTime = Math.min(t.ref, Math.max(0, video.duration - 0.05));
      await esperar(video, 'seeked', 6000).catch(() => {});
      // espera a que el fotograma esté decodificado (con límite: fuera de pantalla puede no avisar)
      await Promise.race([
        new Promise((r) => (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => r()) : setTimeout(r, 150))),
        limite(350),
      ]);
      await limite(60);
      const img = capturarFotograma(video, 540);
      if (img) {
        await guardarImagen(`ref:${edit.id}:${t.id}`, img);
        n++;
      }
      alProgreso(n / tomas.length);
    }
    return { n, duracion: video.duration };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
  }
}

export function detalle(root, { params, ir }) {
  const edit = getEdit(params[0]);
  if (!edit) {
    ir('#/', true);
    return;
  }

  const pintar = async () => {
    const p = progresoEdit(edit.id);
    const formato = formatoDe(edit);
    const hechas = edit.tomas.filter((t) => p[t.id]).length;
    const siguiente = Math.max(0, edit.tomas.findIndex((t) => !p[t.id]));
    const conRef = edit.tomas.some((t) => t.ref != null);

    root.innerHTML = `<main class="screen">
      <header class="topbar">
        <button class="btn-icon" data-atras aria-label="Volver">${ICONOS_UI.atras}</button>
        <h1>${esc(edit.nombre)}</h1>
      </header>
      <div class="detail-art">${portada(edit)}</div>
      <div class="detail-head">
        <h2>${esc(edit.nombre)}</h2>
        <p>${esc(edit.lema)}</p>
        <p class="muted small">${esc(edit.inspirado)}</p>
      </div>

      <div class="facts">
        <div class="fact"><span>Formato</span>
          <div class="seg" role="group" aria-label="Formato">
            <button data-formato="vertical" aria-pressed="${formato === 'vertical'}">9:16</button>
            <button data-formato="horizontal" aria-pressed="${formato === 'horizontal'}">16:9</button>
          </div>
        </div>
        <div class="fact"><span>Duración</span><b>${seg(edit.duracion)}</b></div>
        <div class="fact"><span>Ritmo</span><b>${edit.bpm} BPM</b></div>
        <div class="fact"><span>Cuándo</span><b>${esc(edit.momento)}</b></div>
        <div class="fact"><span>Quién</span><b>${esc(edit.personas)}</b></div>
        <div class="fact"><span>Tomas</span><b>${hechas} / ${edit.tomas.length}</b></div>
      </div>

      <div class="row section">
        <button class="btn primary" data-rodar="${siguiente}">${hechas ? (hechas === edit.tomas.length ? 'Repetir tomas' : 'Seguir grabando') : 'Empezar a grabar'}</button>
        <button class="btn" data-montaje>Cómo montarlo</button>
      </div>

      ${edit.seguridad ? `<div class="panel warning section"><b>Seguridad.</b> ${esc(edit.seguridad)}</div>` : ''}

      <section class="section">
        <h2>Qué necesitas</h2>
        <div class="panel"><ul class="dots">${edit.necesitas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
      </section>

      <section class="section">
        <h2>Cómo es el edit</h2>
        <div class="panel">
          ${timelineHTML(edit)}
          <div class="tl-info small muted">Toca un tramo para ver qué toma va ahí.</div>
        </div>
      </section>

      <section class="section">
        <h2>Tomas que vas a grabar</h2>
        ${edit.tomas.map((t, i) => {
          const hecho = p[t.id];
          return `<button class="shot" data-rodar="${i}">
            <div class="shot-num" style="background:${colorToma(edit, t.id)}">${i + 1}</div>
            <div>
              <h3>${esc(t.nombre)}</h3>
              <p>${esc(t.objetivo)}</p>
              <div class="meta">
                <span class="tag">${esc(ALTURAS[t.altura] || t.altura)}</span>
                <span class="tag">${esc(describirMovimiento(t.mov))}</span>
                <span class="tag">Graba ${t.graba} s</span>
                ${t.fps === 60 ? '<span class="tag">60 fps</span>' : ''}
              </div>
            </div>
            <div class="shot-state ${hecho ? 'done' : ''}">${hecho ? '✓ Grabada' : 'Grabar'}</div>
          </button>`;
        }).join('')}
      </section>

      ${conRef ? `<section class="section">
        <h2>Vídeo de referencia</h2>
        <div class="panel">
          <p style="margin-top:0">Si tienes el edit original en tu móvil, cárgalo. La app saca un fotograma de cada plano y lo muestra en transparencia mientras grabas, para que copies el encuadre exacto.</p>
          <p class="muted small">El vídeo no sale de tu móvil.</p>
          <div class="row">
            <button class="btn" data-ref>Cargar vídeo de referencia</button>
            <button class="btn ghost" data-quitar-ref hidden>Quitar</button>
          </div>
          <input type="file" accept="video/*" hidden data-archivo>
          <div class="thumbs" data-thumbs></div>
        </div>
      </section>` : ''}

      <section class="section">
        <button class="btn ghost small" data-reiniciar>Reiniciar el progreso de este edit</button>
      </section>
    </main>`;

    const $ = (s) => root.querySelector(s);
    $('[data-atras]').addEventListener('click', () => ir('#/', true));
    root.querySelectorAll('[data-rodar]').forEach((b) => b.addEventListener('click', () => ir(`#/rodar/${edit.id}/${b.dataset.rodar}`)));
    $('[data-montaje]').addEventListener('click', () => ir(`#/montaje/${edit.id}`));
    enlazarTimeline(root, edit, $('.tl-info'));
    root.querySelectorAll('[data-formato]').forEach((b) => b.addEventListener('click', () => {
      const a = ajustes();
      guardarAjustes({ formatos: { ...a.formatos, [edit.id]: b.dataset.formato } });
      pintar();
    }));
    $('[data-reiniciar]').addEventListener('click', async () => {
      if (!confirm('¿Borrar el progreso de este edit? Los vídeos ya guardados en tu galería no se borran.')) return;
      reiniciarEdit(edit.id);
      await borrarImagenes(`cuadro:${edit.id}:`);
      pintar();
    });

    if (conRef) {
      const thumbs = $('[data-thumbs]');
      const quitar = $('[data-quitar-ref]');
      const mostrar = async () => {
        const imgs = [];
        for (const t of edit.tomas) {
          if (t.ref == null) continue;
          const src = await leerImagen(`ref:${edit.id}:${t.id}`);
          if (src) imgs.push(`<img src="${src}" alt="${esc(t.nombre)}">`);
        }
        thumbs.innerHTML = imgs.join('');
        quitar.hidden = !imgs.length;
      };
      mostrar();
      const input = $('[data-archivo]');
      $('[data-ref]').addEventListener('click', () => input.click());
      quitar.addEventListener('click', async () => {
        await borrarImagenes(`ref:${edit.id}:`);
        mostrar();
      });
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        if (!f) return;
        const btn = $('[data-ref]');
        btn.disabled = true;
        try {
          const r = await procesarReferencia(edit, f, (x) => { btn.textContent = `Procesando… ${Math.round(x * 100)}%`; });
          if (Math.abs(r.duracion - edit.duracion) > 2.5) {
            toast(`Ojo: este vídeo dura ${seg(r.duracion)} y el edit ${seg(edit.duracion)}. ¿Es el mismo?`, 5000);
          } else {
            toast(`Listo: ${r.n} fotogramas de referencia`);
          }
        } catch {
          toast('No pude leer ese vídeo. Prueba con otro archivo.');
        }
        btn.disabled = false;
        btn.textContent = 'Cargar vídeo de referencia';
        input.value = '';
        mostrar();
      });
    }
  };
  pintar();
}

