// Pruebas sin dependencias: node --test pruebas/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../assets/trm.js');

// Serie de control: valores publicados por la Superintendencia Financiera (datos.gov.co, 32sa-8pi3).
// El sábado 31 oct 2026 la TRM rige hasta el martes 3 nov (domingo y lunes festivo de por medio).
const control = { serie: [
  ['2025-11-06', 3800.00],
  ['2026-10-06', 3200.00],
  ['2026-10-29', 3162.35],
  ['2026-10-30', 3166.91],
  ['2026-10-31', 3182.99, '2026-11-03'],
  ['2026-11-04', 3235.59],
  ['2026-11-05', 3221.19],
  ['2026-11-06', 3228.26]
] };
const S = T.leerSerie(control);

test('la TRM vigente en un día hábil', () => {
  const v = T.vigente(S, '2026-11-05');
  assert.strictEqual(v.fila.valor, 3221.19);
  assert.strictEqual(v.alDia, true);
  assert.strictEqual(v.variosDias, false);
  assert.strictEqual(v.siguiente.valor, 3228.26);
});

test('fin de semana y festivo: rige la que se fijó antes, hasta el martes', () => {
  for (const f of ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']) {
    const v = T.vigente(S, f);
    assert.strictEqual(v.fila.valor, 3182.99, f);
    assert.strictEqual(v.variosDias, true);
    assert.strictEqual(v.alDia, true);
  }
});

test('datos atrasados: avisa que no llegan hasta hoy', () => {
  const v = T.vigente(S, '2026-11-09');
  assert.strictEqual(v.fila.valor, 3228.26);
  assert.strictEqual(v.alDia, false);
  assert.strictEqual(T.vigente(S, '1990-01-01'), null);
});

test('cambios frente a la anterior, al mes y al año', () => {
  const c = T.cambios(S, '2026-11-06');
  assert.strictEqual(c.anterior.antes, 3221.19);
  assert.strictEqual(Math.round(c.anterior.diferencia * 100) / 100, 7.07);
  assert.strictEqual(c.mes.antes, 3200.00);       // 6 oct 2026
  assert.strictEqual(c.mes.fecha, '2026-10-06');
  assert.strictEqual(c.anio.antes, 3800.00);      // 6 nov 2025
  assert.strictEqual(T.numero(c.anio.porcentaje, 1), '−15,0');
});

test('restar meses respeta los meses cortos y los bisiestos', () => {
  assert.strictEqual(T.restarMeses('2026-03-31', 1), '2026-02-28');
  assert.strictEqual(T.restarMeses('2024-03-31', 1), '2024-02-29');
  assert.strictEqual(T.restarMeses('2026-01-15', 1), '2025-12-15');
  assert.strictEqual(T.restarAnios('2028-02-29', 1), '2027-02-28');
});

test('hoy en Bogotá aunque el reloj esté en UTC', () => {
  // 6 nov 2026, 03:00 UTC = 5 nov 2026, 10:00 p. m. en Bogotá
  assert.strictEqual(T.hoyBogota(new Date(Date.UTC(2026, 10, 6, 3, 0))), '2026-11-05');
  assert.strictEqual(T.hoyBogota(new Date(Date.UTC(2026, 10, 6, 5, 0))), '2026-11-06');
});

test('leer montos como los escribe la gente en Colombia', () => {
  const casos = [['500', 500], ['1.000', 1000], ['1.234,56', 1234.56], ['1234,5', 1234.5], ['100.50', 100.5],
    ['$ 2.000.000', 2000000], ['US$ 1.500', 1500], ['3.228,26', 3228.26], ['', null], ['abc', null], ['0', 0]];
  for (const [t, n] of casos) assert.strictEqual(T.leerNumero(t), n, t);
});

test('formato colombiano: punto de miles y coma decimal', () => {
  assert.strictEqual(T.pesos(3228.26, 2), '$ 3.228,26');
  assert.strictEqual(T.pesos(1614130), '$ 1.614.130');
  assert.strictEqual(T.dolares(1000), 'US$ 1.000,00');
  assert.strictEqual(T.porcentaje(0.2195), '+0,2 %');
  assert.strictEqual(T.corta('2026-11-06'), '06/11/2026');
  assert.strictEqual(T.conDia('2026-11-06'), 'viernes 6 de noviembre de 2026');
});

test('calculadora en los dos sentidos (caso de control: US$ 500 a 3.228,26)', () => {
  assert.strictEqual(T.aPesos(500, 3228.26), 1614130);
  assert.strictEqual(T.aDolares(1614130, 3228.26), 500);
  assert.strictEqual(T.aDolares(1000000, 3228.26), 309.76);
  assert.strictEqual(T.aPesos(null, 3228.26), null);
});

test('comparar con la tasa que ofrece la casa de cambio', () => {
  const r = T.frenteATasa(500, 3228.26, 3100);
  assert.strictEqual(r.pesosOtra, 1550000);
  assert.strictEqual(r.diferencia, -64130);
});

test('tramos de la gráfica', () => {
  assert.strictEqual(T.tramo(S, '2026-11-06', 'todo').length, 8);
  const mes = T.tramo(S, '2026-11-06', '1m');
  assert.strictEqual(mes[0].desde, '2026-10-06'); // la que regía al empezar el mes
  assert.strictEqual(mes[mes.length - 1].desde, '2026-11-06');
  assert.strictEqual(T.tramo(S, '2026-11-06', '1a')[0].desde, '2025-11-06');
});

test('puntos de la gráfica dentro del lienzo', () => {
  const g = T.puntos(T.tramo(S, '2026-11-06', 'todo'), 1000, 340, { izq: 60, der: 10, arr: 10, aba: 30 });
  assert.strictEqual(g.pts[0].x, 60);
  assert.strictEqual(g.pts[g.pts.length - 1].x, 990);
  for (const p of g.pts) assert.ok(p.y >= 10 && p.y <= 310, 'y fuera del lienzo');
  assert.ok(g.marcas.length >= 3);
});

test('los datos del repo: sin huecos, sin fechas repetidas y con valores posibles', () => {
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'trm.json'), 'utf8'));
  const s = T.leerSerie(json);
  assert.ok(s.length > 8000);
  assert.strictEqual(s[0].desde, '1991-12-02');
  for (let i = 1; i < s.length; i++) {
    assert.ok(s[i].desde > s[i - 1].desde, 'fecha repetida o desordenada: ' + s[i].desde);
    assert.strictEqual(T.sumarDias(s[i - 1].hasta, 1), s[i].desde, 'hueco antes de ' + s[i].desde);
    assert.ok(s[i].valor > 300 && s[i].valor < 20000);
  }
});
