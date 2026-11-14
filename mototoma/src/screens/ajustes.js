import { ajustes, guardarAjustes } from '../storage.js';
import { activarVibracion, activarVoz, hablar } from '../native.js';
import { ICONOS_UI, toast } from '../ui.js';

const INTERRUPTORES = [
  { k: 'voz', t: 'Indicaciones por voz', d: 'Te dice qué hacer mientras grabas.' },
  { k: 'vozGrabando', t: 'Voz también durante la grabación', d: 'La voz queda en el audio del clip. Desactívalo si quieres el sonido real limpio (motor, escape).' },
  { k: 'vibracion', t: 'Vibración', d: 'Vibra al empezar, al cortar y en los avisos.' },
  { k: 'pararSola', t: 'Parar sola', d: 'Corta la grabación cuando ya tienes los segundos necesarios.' },
  { k: 'cuadricula', t: 'Cuadrícula', d: 'Líneas de tercios para encuadrar.' },
  { k: 'fantasma', t: 'Transparencia de referencia', d: 'Muestra el fotograma de referencia encima de la cámara.' },
];

export function pantallaAjustes(root, { ir }) {
  const a = ajustes();
  root.innerHTML = `<main class="screen">
    <header class="topbar">
      <button class="btn-icon" data-atras aria-label="Volver">${ICONOS_UI.atras}</button>
      <h1>Ajustes</h1>
    </header>
    <div class="panel">
      ${INTERRUPTORES.map((s) => `<div class="setting"><div>${s.t}<small>${s.d}</small></div>
        <label class="switch"><input type="checkbox" data-k="${s.k}" ${a[s.k] ? 'checked' : ''} aria-label="${s.t}"><i></i></label></div>`).join('')}
      <div class="setting"><div>Calidad<small>1080p ocupa más pero se ve mejor en TikTok.</small></div>
        <select data-sel="calidad"><option value="1080">1080p</option><option value="720">720p</option></select></div>
      <div class="setting"><div>Cuenta atrás<small>Segundos para colocarte antes de grabar.</small></div>
        <select data-sel="cuentaAtras"><option value="0">Sin cuenta</option><option value="3">3 s</option><option value="5">5 s</option></select></div>
    </div>
    <div class="row section">
      <button class="btn" data-probar>Probar la voz</button>
    </div>
    <section class="section">
      <h2>Sobre MotoToma</h2>
      <div class="panel small">
        <p style="margin-top:0">Versión 1.0. Los edits "De tus vídeos" se crearon analizando fotograma a fotograma los edits que compartiste: cortes, duración de cada plano, ritmo y efectos.</p>
        <p>La guía usa los sensores del móvil (inclinación, giro y temblor) y el movimiento de la imagen. Todo funciona sin internet y sin coste.</p>
      </div>
    </section>
  </main>`;

  root.querySelector('[data-atras]').addEventListener('click', () => ir('#/', true));
  root.querySelectorAll('[data-k]').forEach((i) => i.addEventListener('change', () => {
    guardarAjustes({ [i.dataset.k]: i.checked });
    if (i.dataset.k === 'voz') activarVoz(i.checked);
    if (i.dataset.k === 'vibracion') activarVibracion(i.checked);
  }));
  root.querySelectorAll('[data-sel]').forEach((s) => {
    s.value = String(a[s.dataset.sel]);
    s.addEventListener('change', () => {
      const v = s.dataset.sel === 'cuentaAtras' ? Number(s.value) : s.value;
      guardarAjustes({ [s.dataset.sel]: v });
    });
  });
  root.querySelector('[data-probar]').addEventListener('click', () => {
    if (!ajustes().voz) {
      toast('La voz está desactivada');
      return;
    }
    hablar('Camina hacia tu izquierda rodeando la moto, despacio.');
  });
}
