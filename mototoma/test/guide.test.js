import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluar, giroHorizontal, giroObjetivo, Locutor, Movimiento, norm180, orientacion, Resumen } from '../src/guide.js';
import { estimarDesplazamiento } from '../src/analyzer.js';

const G = 9.81;
const cerca = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('norm180', () => {
  assert.equal(norm180(190), -170);
  assert.equal(norm180(-180), 180);
  assert.equal(norm180(360), 0);
});

test('orientación: móvil vertical y recto', () => {
  const o = orientacion({ x: 0, y: G, z: 0 });
  cerca(o.pitch, 0);
  cerca(o.roll, 0);
});

test('orientación: apuntando al cielo y al suelo', () => {
  // pantalla hacia abajo → la cámara trasera mira al cielo
  cerca(orientacion({ x: 0, y: 0, z: -G }).pitch, 90);
  cerca(orientacion({ x: 0, y: 0, z: G }).pitch, -90);
  // 20° hacia arriba
  const r = (20 * Math.PI) / 180;
  cerca(orientacion({ x: 0, y: G * Math.cos(r), z: -G * Math.sin(r) }).pitch, 20);
});

test('orientación: girado en sentido horario da roll negativo', () => {
  const r = (10 * Math.PI) / 180;
  // girado 10° en sentido horario: arriba del mundo en ejes del móvil = (-sin, cos)
  cerca(orientacion({ x: -G * Math.sin(r), y: G * Math.cos(r), z: 0 }).roll, -10);
});

test('orientación: boca abajo = 180', () => {
  cerca(Math.abs(orientacion({ x: 0, y: -G, z: 0 }).roll), 180);
});

test('orientación: en horizontal se corrige con el ángulo de pantalla', () => {
  // móvil girado 90° antihorario (horizontal normal): arriba del mundo = +x del móvil
  const o = orientacion({ x: G, y: 0, z: 0 }, 90);
  cerca(o.roll, 0);
});

test('giro horizontal: girar a la izquierda es positivo en vertical y horizontal', () => {
  // vertical: girar sobre el eje y del móvil (gamma)
  assert.ok(giroHorizontal({ alpha: 0, beta: 0, gamma: 20 }, { x: 0, y: G, z: 0 }) > 19);
  // horizontal: el eje vertical del mundo es el x del móvil (beta)
  assert.ok(giroHorizontal({ alpha: 0, beta: 20, gamma: 0 }, { x: G, y: 0, z: 0 }) > 19);
});

const orbitaDer = { mov: { tipo: 'orbita', dir: 'der', vel: 'lento' }, inclinacion: [-10, 10], usa: 2 };

test('evaluar: órbita en el sentido correcto y velocidad buena no da error', () => {
  const p = evaluar(orbitaDer, { pitch: 0, roll: 0, yaw: 15, temblor: 2, brillo: 120 }, 2);
  assert.equal(p.filter((x) => x.nivel !== 'bien').length, 0);
});

test('evaluar: órbita al revés avisa', () => {
  const p = evaluar(orbitaDer, { pitch: 0, roll: 0, yaw: -15, temblor: 2, brillo: 120 }, 2);
  assert.equal(p[0].clave, 'sentido');
});

test('evaluar: demasiado rápido y mal inclinado', () => {
  const p = evaluar(orbitaDer, { pitch: 30, roll: 0, yaw: 60, temblor: 2, brillo: 120 }, 2);
  const claves = p.map((x) => x.clave);
  assert.ok(claves.includes('inclina-abajo'));
  assert.ok(claves.includes('rapido'));
});

test('evaluar: deslizar usa el movimiento de la imagen', () => {
  const t = { mov: { tipo: 'deslizar', dir: 'izq', vel: 'lento' }, usa: 1 };
  assert.equal(evaluar(t, { roll: 0, flujo: { x: 0.2, y: 0 } }, 2)[0].clave, 'sentido');
  assert.equal(evaluar(t, { roll: 0, flujo: { x: -0.1, y: 0 } }, 2).length, 0);
});

test('evaluar: estático detecta movimiento', () => {
  const t = { mov: { tipo: 'estatico' }, usa: 1 };
  assert.equal(evaluar(t, { roll: 0, yaw: 20 }, 2)[0].clave, 'quieto');
});

test('evaluar: nivel torcido', () => {
  const t = { mov: { tipo: 'estatico' }, usa: 1 };
  assert.equal(evaluar(t, { roll: 8, yaw: 0 }, 2)[0].clave, 'nivel');
});

test('evaluar: giro sigue la aguja', () => {
  const t = { mov: { tipo: 'giro' }, giro: { desde: 180, hasta: 0, inicio: 1, segundos: 2 }, nivel: false, usa: 3 };
  assert.equal(evaluar(t, { roll: 10 }, null)[0].clave, 'giro-inicio');
  assert.equal(evaluar(t, { roll: 178 }, null)[0].clave, 'giro-listo');
  cerca(giroObjetivo(t.giro, 2), 90);
  assert.equal(evaluar(t, { roll: 170 }, 2)[0].clave, 'giro-rapido');
  assert.equal(evaluar(t, { roll: -95 }, 2)[0].clave, 'giro-bien');
  assert.equal(evaluar(t, { roll: 20 }, 2)[0].clave, 'giro-lento');
});

test('evaluar: poca luz', () => {
  const t = { mov: { tipo: 'estatico' }, usa: 1, luz: 'noche' };
  assert.ok(evaluar(t, { roll: 0, yaw: 0, brillo: 8 }, 2).some((x) => x.clave === 'oscuro'));
  assert.ok(!evaluar(t, { roll: 0, yaw: 0, brillo: 25 }, 2).some((x) => x.clave === 'oscuro'));
});

test('Movimiento suaviza y mide temblor', () => {
  const m = new Movimiento();
  for (let i = 0; i < 120; i++) m.muestra({ g: { x: 0, y: G, z: 0 }, rot: { alpha: 0, beta: 0, gamma: 15 }, dt: 1 / 60 });
  cerca(m.yaw, 15, 1);
  assert.ok(m.temblor < 2);
  const n = new Movimiento();
  for (let i = 0; i < 120; i++) n.muestra({ g: { x: 0, y: G, z: 0 }, rot: { alpha: 0, beta: i % 2 ? 60 : -60, gamma: 0 }, dt: 1 / 60 });
  assert.ok(n.temblor > 20, `temblor ${n.temblor}`);
});

test('Resumen: toma buena y toma mala', () => {
  const t = { mov: { tipo: 'estatico' }, usa: 2, inclinacion: [-5, 5] };
  const bien = new Resumen(t);
  for (let i = 0; i < 30; i++) bien.agregar([], { yaw: 0 });
  assert.equal(bien.informe(4).buena, true);
  const mal = new Resumen(t);
  for (let i = 0; i < 30; i++) mal.agregar([{ clave: 'quieto', nivel: 'mal' }], { yaw: 20 });
  const inf = mal.informe(1.5);
  assert.equal(inf.buena, false);
  assert.ok(inf.items.some((x) => !x.ok && /corta/i.test(x.texto)));
});

test('Locutor: solo habla de problemas persistentes y no repite', () => {
  const l = new Locutor({ persistencia: 1, repetir: 4, silencioTrasPaso: 0 });
  const p = [{ clave: 'nivel', nivel: 'aviso', texto: 'Endereza' }];
  assert.equal(l.elegir(p, 0), null);
  assert.equal(l.elegir(p, 0.5), null);
  assert.equal(l.elegir(p, 1.1), 'Endereza');
  assert.equal(l.elegir(p, 2), null);
  assert.equal(l.elegir(p, 5.2), 'Endereza');
});

test('estimarDesplazamiento encuentra el movimiento con precisión subpíxel', () => {
  const w = 128;
  const h = 72;
  const img = (ox, oy) => {
    const a = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const X = x - ox;
        const Y = y - oy;
        a[y * w + x] = 128 + 60 * Math.sin(X * 0.31) + 50 * Math.cos(Y * 0.27) + 10 * Math.sin((X + Y) * 0.13);
      }
    }
    return a;
  };
  const d = estimarDesplazamiento(img(0, 0), img(2, -1), w, h, 5);
  cerca(d.dx, 2, 0.15);
  cerca(d.dy, -1, 0.15);
  const s = estimarDesplazamiento(img(0, 0), img(1.5, 0), w, h, 5);
  cerca(s.dx, 1.5, 0.25);
});
