/* Lógica de la TRM: leer la serie, encontrar la tasa vigente, comparar, convertir y dar formato.
   Sin dependencias. Funciona en el navegador (window.TRM) y en Node (pruebas). */
(function (raiz) {
  'use strict';

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  /* ---------- Fechas (texto AAAA-MM-DD, sin horas ni zonas) ---------- */
  function partes(iso) { return { a: +iso.slice(0, 4), m: +iso.slice(5, 7), d: +iso.slice(8, 10) }; }
  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function iso(a, m, d) { return a + '-' + dos(m) + '-' + dos(d); }
  function diasDelMes(a, m) { return new Date(Date.UTC(a, m, 0)).getUTCDate(); }
  function diaSemana(f) { var p = partes(f); return new Date(Date.UTC(p.a, p.m - 1, p.d)).getUTCDay(); }

  /* La misma fecha meses atrás; si ese día no existe (31 de un mes de 30), el último del mes. */
  function restarMeses(f, n) {
    var p = partes(f);
    var total = p.a * 12 + (p.m - 1) - n;
    var a = Math.floor(total / 12), m = total % 12 + 1;
    return iso(a, m, Math.min(p.d, diasDelMes(a, m)));
  }
  function restarAnios(f, n) { return restarMeses(f, 12 * n); }
  function sumarDias(f, n) {
    var p = partes(f);
    var x = new Date(Date.UTC(p.a, p.m - 1, p.d + n));
    return iso(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
  }

  /* Fecha de hoy en Bogotá, sin importar la zona del computador. */
  function hoyBogota(ahora) {
    var t = (ahora || new Date()).getTime() - 5 * 3600 * 1000; // Colombia: UTC−5, sin horario de verano
    var x = new Date(t);
    return iso(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
  }

  function corta(f) { var p = partes(f); return dos(p.d) + '/' + dos(p.m) + '/' + p.a; }
  function larga(f) { var p = partes(f); return p.d + ' de ' + MESES[p.m - 1] + ' de ' + p.a; }
  function conDia(f) { return DIAS[diaSemana(f)] + ' ' + larga(f); }
  function mesCorto(f) { var p = partes(f); return MESES_CORTOS[p.m - 1] + ' ' + p.a; }
  function diaMes(f) { var p = partes(f); return p.d + ' ' + MESES_CORTOS[p.m - 1]; }

  /* ---------- La serie ---------- */
  /* Entrada: el objeto de data/trm.json. Salida: [{desde, hasta, valor}] ordenada. */
  function leerSerie(json) {
    var filas = (json && json.serie) || [];
    var serie = [];
    for (var i = 0; i < filas.length; i++) {
      var f = filas[i];
      var valor = +f[1];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f[0]) || !(valor > 0)) continue;
      serie.push({ desde: f[0], hasta: f[2] || f[0], valor: valor });
    }
    serie.sort(function (x, y) { return x.desde < y.desde ? -1 : x.desde > y.desde ? 1 : 0; });
    return serie;
  }

  /* Índice de la última TRM que empezó a regir en la fecha o antes. -1 si la fecha es anterior a la serie. */
  function indiceEn(serie, f) {
    var lo = 0, hi = serie.length - 1, r = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (serie[mid].desde <= f) { r = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return r;
  }

  /* La TRM que rige en una fecha, con avisos para mostrar. */
  function vigente(serie, f) {
    var i = indiceEn(serie, f);
    if (i < 0) return null;
    var fila = serie[i];
    return {
      indice: i, fila: fila,
      alDia: f <= fila.hasta,                          // falso: los datos no llegan hasta esa fecha
      variosDias: fila.hasta !== fila.desde,           // fines de semana y festivos
      siguiente: i + 1 < serie.length ? serie[i + 1] : null  // ya publicada la de mañana
    };
  }

  function cambio(actual, antes) {
    if (!(actual > 0) || !(antes > 0)) return null;
    var dif = actual - antes;
    return { antes: antes, diferencia: dif, porcentaje: dif / antes * 100 };
  }

  /* Cambios frente a la TRM anterior, hace un mes y hace un año. */
  function cambios(serie, f) {
    var v = vigente(serie, f);
    if (!v) return null;
    var hoy = v.fila.valor;
    var ant = v.indice > 0 ? serie[v.indice - 1] : null;
    var fMes = restarMeses(f, 1), fAnio = restarAnios(f, 1);
    var iMes = indiceEn(serie, fMes), iAnio = indiceEn(serie, fAnio);
    return {
      anterior: ant ? extender(cambio(hoy, ant.valor), { fecha: ant.desde }) : null,
      mes: iMes >= 0 ? extender(cambio(hoy, serie[iMes].valor), { fecha: fMes }) : null,
      anio: iAnio >= 0 ? extender(cambio(hoy, serie[iAnio].valor), { fecha: fAnio }) : null
    };
  }
  function extender(o, mas) { if (!o) return null; for (var k in mas) o[k] = mas[k]; return o; }

  /* Tramo de la serie para la gráfica: '1m', '1a', '5a' o 'todo', hasta la fecha f. */
  var RANGOS = { '1m': 1, '1a': 12, '5a': 60 };
  function tramo(serie, f, clave) {
    var fin = indiceEn(serie, f);
    if (fin < 0) return [];
    if (clave === 'todo' || !RANGOS[clave]) return serie.slice(0, fin + 1);
    var inicio = restarMeses(f, RANGOS[clave]);
    var i = Math.max(0, indiceEn(serie, inicio)); // incluye la TRM que regía al empezar el tramo
    return serie.slice(i, fin + 1);
  }

  function extremos(lista) {
    var min = null, max = null;
    for (var i = 0; i < lista.length; i++) {
      if (!min || lista[i].valor < min.valor) min = lista[i];
      if (!max || lista[i].valor > max.valor) max = lista[i];
    }
    return { min: min, max: max };
  }

  /* ---------- Números ---------- */
  /* Lee lo que escribe la persona: «1.234,56», «1234,5», «1.000», «100.50», «1,000», «1,000.50», «$ 2.000.000».
     Con coma y punto, el último que aparece es el decimal. Con un solo signo, decide por las cifras que lo siguen. */
  function leerNumero(texto) {
    var t = String(texto == null ? '' : texto).replace(/[^\d.,]/g, '');
    if (!t || !/\d/.test(t)) return null;
    var coma = t.lastIndexOf(','), punto = t.lastIndexOf('.');
    if (coma >= 0 && punto >= 0) {
      var dec = coma > punto ? ',' : '.', miles = dec === ',' ? /\./g : /,/g;
      t = t.replace(miles, '');
      if (t.split(dec).length > 2) return null;
      t = t.replace(dec, '.');
    } else if (coma >= 0 || punto >= 0) {
      var signo = coma >= 0 ? ',' : '.';
      var trozos = t.split(signo);
      var esMiles = trozos.length > 2 ||
        (signo === ',' ? /^\d+$/.test(trozos[0]) && /^\d{3}$/.test(trozos[1]) : !/^\d{1,2}$/.test(trozos[1]));
      // Coma: miles solo si la siguen exactamente 3 cifras (1,000); si no, decimal (2,5).
      // Punto: decimal solo si lo siguen 1 o 2 cifras (100.50); si no, miles (1.000), como se escribe en Colombia.
      t = esMiles ? trozos.join('') : trozos[0] + '.' + trozos[1];
    }
    var n = parseFloat(t);
    return isFinite(n) && n >= 0 ? n : null;
  }

  /* 1234567.891 → «1.234.567,89» */
  function numero(n, decimales) {
    if (n == null || !isFinite(n)) return '—';
    var neg = n < 0;
    var s = Math.abs(n).toFixed(decimales);
    var p = s.split('.');
    var entero = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '−' : '') + entero + (p[1] ? ',' + p[1] : '');
  }
  function pesos(n, decimales) { return '$ ' + numero(n, decimales == null ? 0 : decimales); }
  function dolares(n) { return 'US$ ' + numero(n, 2); }
  function porcentaje(n) { return (n > 0 ? '+' : '') + numero(n, 1) + ' %'; }
  function conSigno(n, decimales) { return (n > 0 ? '+' : '') + numero(n, decimales); }

  function aPesos(usd, trm) { return usd == null || !(trm > 0) ? null : Math.round(usd * trm); }
  function aDolares(cop, trm) { return cop == null || !(trm > 0) ? null : Math.round(cop / trm * 100) / 100; }

  /* Diferencia entre lo que da la TRM y lo que da otra tasa (la de la casa de cambio o el banco). */
  function frenteATasa(usd, trm, otra) {
    if (usd == null || !(trm > 0) || !(otra > 0)) return null;
    var aTrm = aPesos(usd, trm), aOtra = aPesos(usd, otra);
    return { pesosTrm: aTrm, pesosOtra: aOtra, diferencia: aOtra - aTrm, porcentaje: (otra - trm) / trm * 100 };
  }

  /* ---------- Gráfica: escalas y marcas ---------- */
  function marcasY(min, max, cuantas) {
    if (!(max > min)) { max = min + 1; }
    var paso = (max - min) / Math.max(1, cuantas);
    var pot = Math.pow(10, Math.floor(Math.log10(paso)));
    var opciones = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < opciones.length; i++) { if (opciones[i] * pot >= paso) { paso = opciones[i] * pot; break; } }
    var lista = [];
    for (var v = Math.ceil(min / paso) * paso; v <= max + 1e-9; v += paso) lista.push(Math.round(v * 100) / 100);
    return lista;
  }

  function diasEntre(a, b) {
    var x = partes(a), y = partes(b);
    return Math.round((Date.UTC(y.a, y.m - 1, y.d) - Date.UTC(x.a, x.m - 1, x.d)) / 86400000);
  }

  /* Puntos de la gráfica en un lienzo de ancho × alto, con márgenes. El eje x es el tiempo real. */
  function puntos(lista, ancho, alto, m) {
    if (!lista.length) return { pts: [], marcas: [], min: 0, max: 0 };
    var ex = extremos(lista);
    var holgura = (ex.max.valor - ex.min.valor) * 0.08 || ex.max.valor * 0.01;
    var marcas = marcasY(ex.min.valor - holgura, ex.max.valor + holgura, 4);
    var yMin = Math.min(marcas[0], ex.min.valor), yMax = Math.max(marcas[marcas.length - 1], ex.max.valor);
    var x0 = lista[0].desde, total = Math.max(1, diasEntre(x0, lista[lista.length - 1].desde));
    var w = ancho - m.izq - m.der, h = alto - m.arr - m.aba;
    var y = function (v) { return m.arr + h - (v - yMin) / (yMax - yMin) * h; };
    var pts = lista.map(function (f) {
      return { x: m.izq + diasEntre(x0, f.desde) / total * w, y: y(f.valor), fila: f };
    });
    return { pts: pts, marcas: marcas.map(function (v) { return { valor: v, y: y(v) }; }), min: yMin, max: yMax };
  }

  var api = {
    restarMeses: restarMeses, restarAnios: restarAnios, sumarDias: sumarDias, hoyBogota: hoyBogota,
    corta: corta, larga: larga, conDia: conDia, mesCorto: mesCorto, diaMes: diaMes, diaSemana: diaSemana, diasEntre: diasEntre,
    leerSerie: leerSerie, indiceEn: indiceEn, vigente: vigente, cambios: cambios, tramo: tramo, extremos: extremos,
    leerNumero: leerNumero, numero: numero, pesos: pesos, dolares: dolares, porcentaje: porcentaje, conSigno: conSigno,
    aPesos: aPesos, aDolares: aDolares, frenteATasa: frenteATasa, marcasY: marcasY, puntos: puntos
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.TRM = api;
})(this);
