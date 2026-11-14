import { getEdit, nombreArchivo } from '../catalog.js';
import { progresoEdit } from '../storage.js';
import { abrirGaleria, esNativo } from '../native.js';
import { colorToma, enlazarTimeline, esc, ICONOS_UI, seg, textoSegmento, timelineHTML } from '../ui.js';

export function montaje(root, { params, ir }) {
  const edit = getEdit(params[0]);
  if (!edit) {
    ir('#/', true);
    return;
  }
  const p = progresoEdit(edit.id);
  const hechas = edit.tomas.filter((t) => p[t.id]).length;

  root.innerHTML = `<main class="screen">
    <header class="topbar">
      <button class="btn-icon" data-atras aria-label="Volver">${ICONOS_UI.atras}</button>
      <h1>Montaje · ${esc(edit.nombre)}</h1>
    </header>

    ${hechas === edit.tomas.length ? '<div class="panel" style="border-color:#1f5c3a;background:#0d2117"><b>¡Tienes todas las tomas!</b> Ya puedes montar el edit en tu editor.</div>' : `<div class="panel"><b>${hechas} de ${edit.tomas.length} tomas grabadas.</b> Puedes ir viendo cómo se monta mientras tanto.</div>`}

    <section class="section">
      <h2>Línea de tiempo</h2>
      <div class="panel">
        ${timelineHTML(edit)}
        <div class="tl-info small">Toca un tramo para ver qué toma va ahí. Las rayitas son los golpes del ritmo (${edit.bpm} BPM).</div>
      </div>
      <div class="panel">
        <ul class="clean seg-list">
          ${edit.estructura.map((s) => {
            const color = s.toma ? colorToma(edit, s.toma) : '#333';
            return `<li><span class="t"><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${color};margin-right:6px"></i>${seg(s.desde)}</span><span>${textoSegmento(edit, s).replace(/^<b>.*?<\/b> · /, '')}</span></li>`;
          }).join('')}
        </ul>
      </div>
    </section>

    <section class="section">
      <h2>Paso a paso</h2>
      <div class="panel"><ol class="steps">${edit.montaje.map((m) => `<li>${esc(m)}</li>`).join('')}</ol></div>
    </section>

    <section class="section">
      <h2>Efectos</h2>
      <div class="panel"><ul class="dots">${edit.efectos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>
    </section>

    <section class="section">
      <h2>Color</h2>
      <div class="panel">
        <p class="muted small" style="margin-top:0">En CapCut: selecciona un clip → Ajustar. Luego "Aplicar a todo".</p>
        <table class="color">${edit.color.map((c) => `<tr><td>${esc(c.ajuste)}</td><td>${esc(c.valor)}</td></tr>`).join('')}</table>
      </div>
    </section>

    <section class="section">
      <h2>Música</h2>
      <div class="panel">${esc(edit.musica)}</div>
    </section>

    <section class="section">
      <h2>Tus archivos</h2>
      <div class="panel">
        <p class="muted small" style="margin-top:0">${esNativo ? 'Están en la galería, en el álbum MotoToma (carpeta Movies/MotoToma).' : 'Se descargaron en la carpeta de descargas.'} Van numerados en el orden de las tomas.</p>
        <ul class="clean seg-list">
          ${edit.tomas.map((t, i) => {
            const d = p[t.id];
            return `<li><span class="t">T${String(i + 1).padStart(2, '0')}</span><span>${esc(t.nombre)}<br><span class="muted small">${d ? esc(d.archivo || nombreArchivo(edit, t)) : 'Sin grabar'}</span></span></li>`;
          }).join('')}
        </ul>
        <div class="row" style="margin-top:12px">
          ${esNativo ? `<button class="btn" data-galeria>${ICONOS_UI.galeria} Abrir galería</button>` : ''}
          <button class="btn" data-rodar>Volver a grabar</button>
        </div>
      </div>
    </section>
  </main>`;

  root.querySelector('[data-atras]').addEventListener('click', () => ir(`#/edit/${edit.id}`, true));
  root.querySelector('[data-rodar]').addEventListener('click', () => ir(`#/edit/${edit.id}`, true));
  root.querySelector('[data-galeria]')?.addEventListener('click', () => abrirGaleria());
  enlazarTimeline(root, edit, root.querySelector('.tl-info'));
}
