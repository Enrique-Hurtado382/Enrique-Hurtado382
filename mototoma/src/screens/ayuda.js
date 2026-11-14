import { guardarAjustes } from '../storage.js';
import { ICONOS_UI } from '../ui.js';

const PASOS = [
  ['1. Elige un edit', 'Cada edit del catálogo es una receta: qué tomas grabar, en qué orden y cuánto dura cada una. Los marcados "De tus vídeos" salen de los edits que compartiste.'],
  ['2. Graba toma a toma', 'La cámara te muestra dónde poner la moto (recuadro), a qué altura y hacia dónde moverte. Las instrucciones aparecen en pantalla y te las dice en voz alta.'],
  ['3. Sigue los indicadores', 'La barra de la derecha es la inclinación: mantén la marca en la zona verde. La línea del centro es el horizonte: se pone verde cuando está recto. Abajo a la izquierda ves la dirección y la velocidad del movimiento.'],
  ['4. Revisa y guarda', 'Al cortar, la app revisa la toma: duración, temblor, dirección, velocidad e inclinación. Si sale bien, se guarda en tu galería con su número de toma.'],
  ['5. Monta en tu editor', 'En "Cómo montarlo" tienes la línea de tiempo con los cortes en el ritmo, el color y los efectos para hacerlo en CapCut o el editor que uses.'],
];

export function ayuda(root, { ir }) {
  guardarAjustes({ visto: true });
  root.innerHTML = `<main class="screen">
    <header class="topbar">
      <button class="btn-icon" data-atras aria-label="Volver">${ICONOS_UI.atras}</button>
      <h1>Cómo funciona</h1>
    </header>
    ${PASOS.map(([t, d]) => `<div class="panel"><h3 style="margin-bottom:6px">${t}</h3><div class="muted">${d}</div></div>`).join('')}
    <div class="panel" style="margin-top:10px"><h3 style="margin-bottom:6px">Consejos</h3>
      <ul class="dots muted">
        <li>Limpia la lente antes de cada sesión.</li>
        <li>Toca el botón de la transparencia (dos rectángulos) para ver la referencia o la toma con la que tiene que coincidir.</li>
        <li>Si tu móvil tiene gran angular, cambia de lente con el botón de la cámara.</li>
        <li>Graba siempre un poco más de lo necesario: la app ya cuenta con ese margen.</li>
      </ul>
    </div>
    <div class="row section"><button class="btn primary" data-empezar>Ver los edits</button></div>
  </main>`;
  root.querySelector('[data-atras]').addEventListener('click', () => ir('#/', true));
  root.querySelector('[data-empezar]').addEventListener('click', () => ir('#/', true));
}
