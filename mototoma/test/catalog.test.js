import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALTURAS, EDITS, golpes, MOVIMIENTOS, nombreArchivo, usoEnEdit } from '../src/catalog.js';
import { RANGOS } from '../src/guide.js';

test('hay 8 edits con ids únicos', () => {
  assert.equal(EDITS.length, 8);
  assert.equal(new Set(EDITS.map((e) => e.id)).size, EDITS.length);
});

for (const e of EDITS) {
  test(`edit ${e.id}: estructura coherente`, () => {
    assert.ok(['vertical', 'horizontal'].includes(e.formato));
    assert.ok(e.bpm > 60 && e.bpm < 200);
    assert.ok(e.dificultad >= 1 && e.dificultad <= 3);
    const ids = new Set(e.tomas.map((t) => t.id));
    assert.equal(ids.size, e.tomas.length, 'ids de toma únicos');

    // la línea de tiempo es continua, empieza en 0 y termina en la duración
    assert.equal(e.estructura[0].desde, 0);
    for (let i = 1; i < e.estructura.length; i++) {
      assert.ok(Math.abs(e.estructura[i].desde - e.estructura[i - 1].hasta) < 1e-6, `hueco en el segmento ${i}`);
    }
    assert.ok(Math.abs(e.estructura.at(-1).hasta - e.duracion) < 1e-6, 'termina en la duración');
    for (const s of e.estructura) {
      assert.ok(s.hasta > s.desde, 'segmento con duración');
      if (s.toma !== null) assert.ok(ids.has(s.toma), `toma desconocida ${s.toma}`);
    }
    // todas las tomas se usan en el edit
    for (const t of e.tomas) assert.ok(usoEnEdit(e, t.id) > 0, `toma sin usar: ${t.id}`);
    if (e.drop != null) assert.ok(e.drop > 0 && e.drop < e.duracion);
  });

  for (const t of e.tomas) {
    test(`toma ${e.id}/${t.id}: datos válidos`, () => {
      assert.ok(ALTURAS[t.altura], `altura ${t.altura}`);
      assert.ok(MOVIMIENTOS[t.mov.tipo], `movimiento ${t.mov.tipo}`);
      if (RANGOS[t.mov.tipo]) assert.ok(RANGOS[t.mov.tipo][t.mov.vel || 'lento'], 'velocidad válida');
      if (['orbita', 'paneo', 'deslizar'].includes(t.mov.tipo)) assert.ok(['der', 'izq'].includes(t.mov.dir), 'dirección');
      assert.ok(t.graba > t.usa, 'se graba más de lo que se usa');
      assert.ok(t.graba >= 3 && t.graba <= 10);
      assert.ok([30, 60].includes(t.fps));
      assert.ok(t.pasos.length >= 1 && t.pasos[0].t === 0, 'el primer paso empieza en 0');
      for (const p of t.pasos) assert.ok(p.t < t.graba, 'paso dentro de la toma');
      if (t.inclinacion) assert.ok(t.inclinacion[0] < t.inclinacion[1]);
      if (t.encuadre?.caja) {
        const [x, y, w, h] = t.encuadre.caja;
        assert.ok(x >= 0 && y >= 0 && x + w <= 100 && y + h <= 100, 'recuadro dentro de la pantalla');
      }
      if (t.mov.tipo === 'giro') {
        assert.ok(t.giro && t.giro.inicio + t.giro.segundos < t.graba, 'el giro cabe en la toma');
      }
      if (t.coincide) assert.ok(e.tomas.some((x) => x.id === t.coincide.toma));
      if (t.ref != null) assert.ok(t.ref >= 0 && t.ref <= e.duracion, 'referencia dentro del vídeo');
    });
  }
}

test('golpes de ritmo', () => {
  const e = EDITS.find((x) => x.id === 'hora-dorada');
  const g = golpes(e);
  assert.equal(g[0], 0);
  assert.ok(Math.abs(g[1] - 60 / 103) < 0.001);
  assert.ok(g.at(-1) <= e.duracion);
});

test('nombre de archivo ordenado', () => {
  const e = EDITS[0];
  const n = nombreArchivo(e, e.tomas[2], new Date(2026, 10, 14, 9, 5, 7));
  assert.equal(n, 'MotoToma_orbita-nocturna_T03_orbita_20261114_090507.mp4');
});
