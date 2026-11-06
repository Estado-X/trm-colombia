/* Interfaz: lee data/trm.json, muestra la TRM de hoy, la calculadora y la gráfica.
   Lo único que se carga es el archivo de datos de este mismo sitio; los montos que escribes no salen de tu navegador. */
(function () {
  'use strict';

  var T = window.TRM;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var NS = 'http://www.w3.org/2000/svg';

  var serie = [], hoy = T.hoyBogota(), trmHoy = null, ultimoEditado = 'usd', grafica = null, foco = -1;

  /* ---------------- La TRM de hoy ---------------- */
  function pintarHoy() {
    var v = T.vigente(serie, hoy);
    if (!v) { mostrarError('No hay datos de la TRM para hoy.'); return; }
    trmHoy = v.fila.valor;
    var valor = $('#trm-valor');
    valor.textContent = T.pesos(trmHoy, 2);
    var small = document.createElement('small'); small.textContent = 'por dólar';
    valor.appendChild(small);

    var vig = $('#trm-vigencia');
    if (!v.alDia) {
      vig.textContent = 'Último dato publicado: rigió hasta el ' + T.conDia(v.fila.hasta) + '.';
      nota('Los datos no llegan hasta hoy (' + T.corta(hoy) + '). Puede que la fuente no se haya actualizado: revisa más tarde.', true);
    } else if (v.variosDias) {
      vig.textContent = 'Rige del ' + T.conDia(v.fila.desde) + ' al ' + T.conDia(v.fila.hasta) + '.';
      nota('Los fines de semana y festivos no se calcula la TRM: rige la misma del día hábil siguiente, calculada con las operaciones del último día hábil.', false);
    } else {
      vig.textContent = 'Vigente hoy, ' + T.conDia(v.fila.desde) + '.';
    }

    var c = T.cambios(serie, hoy);
    var ul = $('#cambios');
    ul.textContent = '';
    [['Frente a la anterior', c.anterior, function (x) { return 'la del ' + T.corta(x.fecha) + ': ' + T.pesos(x.antes, 2); }],
     ['En un mes', c.mes, function (x) { return 'el ' + T.corta(x.fecha) + ': ' + T.pesos(x.antes, 2); }],
     ['En un año', c.anio, function (x) { return 'el ' + T.corta(x.fecha) + ': ' + T.pesos(x.antes, 2); }]
    ].forEach(function (it) {
      var li = document.createElement('li');
      var e = document.createElement('span'); e.className = 'etq-c'; e.textContent = it[0];
      li.appendChild(e);
      if (it[1]) {
        var x = it[1];
        var flecha = x.diferencia > 0 ? '▲ ' : x.diferencia < 0 ? '▼ ' : '';
        var n = document.createElement('span');
        n.className = 'cifra ' + (x.diferencia > 0 ? 'sube' : x.diferencia < 0 ? 'baja' : '');
        n.textContent = flecha + T.porcentaje(x.porcentaje);
        n.setAttribute('aria-label', (x.diferencia > 0 ? 'subió ' : x.diferencia < 0 ? 'bajó ' : 'igual ') + T.numero(Math.abs(x.porcentaje), 1) + ' por ciento');
        var d = document.createElement('span'); d.className = 'det';
        d.textContent = T.conSigno(x.diferencia, 2) + ' pesos · ' + it[2](x);
        li.appendChild(n); li.appendChild(d);
      } else {
        var s = document.createElement('span'); s.className = 'det'; s.textContent = 'Sin dato';
        li.appendChild(s);
      }
      ul.appendChild(li);
    });

    var m = $('#trm-manana');
    if (v.alDia && v.siguiente) {
      m.textContent = 'Ya se conoce la siguiente: ' + T.pesos(v.siguiente.valor, 2) + ', que rige desde el ' + T.conDia(v.siguiente.desde) + '.';
      m.hidden = false;
    } else m.hidden = true;
  }

  function nota(t, alerta) {
    var n = $('#trm-nota');
    n.textContent = t; n.hidden = false;
    n.classList.toggle('alerta', !!alerta);
  }

  function mostrarError(t) { var e = $('#error'); e.textContent = t; e.hidden = false; }

  /* ---------------- Calculadora ---------------- */
  function calcular() {
    if (!trmHoy) return;
    var usdIn = $('#usd'), copIn = $('#cop');
    var usd, cop;
    if (ultimoEditado === 'usd') {
      usd = T.leerNumero(usdIn.value);
      cop = T.aPesos(usd, trmHoy);
      copIn.value = cop == null ? '' : T.numero(cop, 0);
    } else {
      cop = T.leerNumero(copIn.value);
      usd = T.aDolares(cop, trmHoy);
      usdIn.value = usd == null ? '' : T.numero(usd, 2);
    }
    $$('.chip-boton').forEach(function (b) { b.classList.toggle('activa', usd != null && +b.getAttribute('data-usd') === usd); });
    var frase = $('#calc-frase');
    if (usd == null || cop == null) { frase.textContent = 'Escribe un monto.'; }
    else {
      frase.textContent = '';
      var b = document.createElement('strong');
      b.textContent = T.dolares(usd) + ' = ' + T.pesos(cop);
      frase.appendChild(b);
      frase.appendChild(document.createTextNode(' a la TRM de hoy (' + T.pesos(trmHoy, 2) + ').'));
    }
    compararOtra(usd);
  }

  function compararOtra(usd) {
    var otra = T.leerNumero($('#otra').value);
    var salida = $('#otra-frase');
    var r = T.frenteATasa(usd, trmHoy, otra);
    salida.classList.remove('alerta');
    if (!r) { salida.textContent = otra ? '' : 'Escribe la tasa que te ofrecen y compárala con la TRM.'; return; }
    if (otra < trmHoy * 0.5 || otra > trmHoy * 1.5) {
      salida.textContent = 'Esa tasa está muy lejos de la TRM: revisa que la escribiste bien.';
      salida.classList.add('alerta');
      return;
    }
    var dif = r.diferencia;
    salida.textContent = 'Por ' + T.dolares(usd) + ' recibirías ' + T.pesos(r.pesosOtra) + ': ' +
      (dif < 0 ? T.pesos(-dif) + ' menos' : dif > 0 ? T.pesos(dif) + ' más' : 'lo mismo') +
      ' que a la TRM (' + T.porcentaje(r.porcentaje) + ').';
  }

  /* ---------------- Gráfica en SVG ---------------- */
  function el(nombre, attrs, padre) {
    var n = document.createElementNS(NS, nombre);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (padre) padre.appendChild(n);
    return n;
  }

  function rango() { var r = document.querySelector('input[name="rango"]:checked'); return r ? r.value : '1a'; }

  function etiquetaX(fecha, clave) { return clave === '1m' ? T.diaMes(fecha) : clave === '1a' ? T.mesCorto(fecha) : String(fecha.slice(0, 4)); }

  function marcasX(lista, clave, cuantas) {
    if (!lista.length) return [];
    var res = [], visto = {};
    var n = lista.length, paso = Math.max(1, Math.floor(n / cuantas));
    for (var i = 0; i < n; i += paso) {
      var e = etiquetaX(lista[i].desde, clave);
      if (!visto[e]) { visto[e] = 1; res.push(i); }
    }
    return res;
  }

  function dibujar() {
    var svg = $('#svg');
    var ancho = Math.max(300, Math.round(svg.getBoundingClientRect().width || 1000));
    var alto = Math.round(svg.getBoundingClientRect().height || 340);
    var angosto = ancho < 560;
    var m = { izq: angosto ? 52 : 64, der: 12, arr: 16, aba: 28 };
    var clave = rango();
    var lista = T.tramo(serie, hoy, clave);
    svg.setAttribute('viewBox', '0 0 ' + ancho + ' ' + alto);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!lista.length) return;
    var g = T.puntos(lista, ancho, alto, m);

    g.marcas.forEach(function (mk) {
      el('line', { x1: m.izq, x2: ancho - m.der, y1: mk.y, y2: mk.y, 'class': 'rejilla' }, svg);
      var t = el('text', { x: m.izq - 8, y: mk.y + 4, 'text-anchor': 'end', 'class': 'eje' }, svg);
      t.textContent = T.numero(mk.valor, 0);
    });
    marcasX(lista, clave, angosto ? 3 : 6).forEach(function (i) {
      var p = g.pts[i];
      if (p.x > ancho - m.der - 20) return;
      var t = el('text', { x: p.x, y: alto - 8, 'text-anchor': i === 0 ? 'start' : 'middle', 'class': 'eje' }, svg);
      t.textContent = etiquetaX(lista[i].desde, clave);
    });

    // Línea en escalera: cada TRM se mantiene hasta que empieza la siguiente.
    var d = '', base = alto - m.aba;
    g.pts.forEach(function (p, i) {
      if (i === 0) d += 'M' + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
      else d += 'H' + p.x.toFixed(1) + 'V' + p.y.toFixed(1);
    });
    var ultimo = g.pts[g.pts.length - 1];
    d += 'H' + (ancho - m.der);
    el('path', { d: d + 'V' + base + 'H' + g.pts[0].x.toFixed(1) + 'Z', 'class': 'area-trm' }, svg);
    el('path', { d: d, 'class': 'linea-trm' }, svg);

    var ex = T.extremos(lista);
    [ex.min, ex.max].forEach(function (f) {
      var p = g.pts[lista.indexOf(f)];
      el('circle', { cx: p.x, cy: p.y, r: 3.5, 'class': 'extremo' }, svg);
    });
    el('circle', { cx: ultimo.x, cy: ultimo.y, r: 4.5, 'class': 'marca' }, svg);

    var guia = el('line', { y1: m.arr, y2: base, 'class': 'guia', visibility: 'hidden' }, svg);
    var punto = el('circle', { r: 5, 'class': 'marca', visibility: 'hidden' }, svg);
    grafica = { pts: g.pts, guia: guia, punto: punto, ancho: ancho, lista: lista };
    foco = -1;
    $('#punto').hidden = true;

    var primero = lista[0];
    $('#grafica-resumen').textContent =
      'Gráfica de la TRM del ' + T.corta(primero.desde) + ' al ' + T.corta(hoy) +
      '. Mínimo: ' + T.pesos(ex.min.valor, 2) + ' (' + T.corta(ex.min.desde) + '). Máximo: ' + T.pesos(ex.max.valor, 2) +
      ' (' + T.corta(ex.max.desde) + '). Hoy: ' + T.pesos(trmHoy, 2) + '.';
  }

  function mostrarPunto(i) {
    if (!grafica || !grafica.pts.length) return;
    i = Math.max(0, Math.min(grafica.pts.length - 1, i));
    foco = i;
    var p = grafica.pts[i], f = p.fila;
    grafica.guia.setAttribute('x1', p.x); grafica.guia.setAttribute('x2', p.x); grafica.guia.setAttribute('visibility', 'visible');
    grafica.punto.setAttribute('cx', p.x); grafica.punto.setAttribute('cy', p.y); grafica.punto.setAttribute('visibility', 'visible');
    var caja = $('#punto');
    caja.textContent = '';
    var fecha = f.hasta !== f.desde ? T.corta(f.desde) + ' al ' + T.corta(f.hasta) : T.corta(f.desde);
    caja.appendChild(document.createTextNode(fecha + ' · '));
    var b = document.createElement('strong'); b.textContent = T.pesos(f.valor, 2); caja.appendChild(b);
    caja.hidden = false;
    var svg = $('#svg'), escala = svg.getBoundingClientRect().width / grafica.ancho;
    var x = p.x * escala, w = caja.offsetWidth, total = svg.getBoundingClientRect().width;
    caja.style.left = Math.max(w / 2, Math.min(total - w / 2, x)) + 'px';
  }

  function ocultarPunto() {
    if (!grafica) return;
    grafica.guia.setAttribute('visibility', 'hidden');
    grafica.punto.setAttribute('visibility', 'hidden');
    $('#punto').hidden = true;
  }

  function indiceCercano(clientX) {
    var svg = $('#svg'), r = svg.getBoundingClientRect();
    var x = (clientX - r.left) * grafica.ancho / r.width;
    var pts = grafica.pts, lo = 0, hi = pts.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (pts[mid].x <= x) lo = mid; else hi = mid - 1; }
    return lo;
  }

  function eventosGrafica() {
    var svg = $('#svg');
    svg.addEventListener('pointermove', function (e) { if (grafica) mostrarPunto(indiceCercano(e.clientX)); });
    svg.addEventListener('pointerdown', function (e) { if (grafica) mostrarPunto(indiceCercano(e.clientX)); });
    svg.addEventListener('pointerleave', ocultarPunto);
    svg.addEventListener('blur', ocultarPunto);
    svg.addEventListener('keydown', function (e) {
      if (!grafica) return;
      var n = grafica.pts.length, salto = Math.max(1, Math.round(n / 20));
      var i = foco < 0 ? n - 1 : foco;
      if (e.key === 'ArrowLeft') i -= 1;
      else if (e.key === 'ArrowRight') i += 1;
      else if (e.key === 'PageUp') i -= salto;
      else if (e.key === 'PageDown') i += salto;
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = n - 1;
      else if (e.key === 'Escape') { ocultarPunto(); return; }
      else return;
      e.preventDefault();
      mostrarPunto(i);
    });
  }

  /* ---------------- Arranque ---------------- */
  function marcarChips() { $$('.chip').forEach(function (o) { o.classList.toggle('activa', o.querySelector('input').checked); }); }

  function iniciar(json) {
    serie = T.leerSerie(json);
    if (!serie.length) { mostrarError('No se pudieron leer los datos de la TRM.'); return; }
    if (json.actualizado) $('#pie-actualizado').textContent = 'Datos actualizados el ' + T.corta(String(json.actualizado).slice(0, 10)) + '.';
    pintarHoy();
    calcular();
    marcarChips();
    dibujar();
  }

  function arrancar() {
    $('#usd').addEventListener('input', function () { ultimoEditado = 'usd'; calcular(); });
    $('#cop').addEventListener('input', function () { ultimoEditado = 'cop'; calcular(); });
    $('#otra').addEventListener('input', function () { calcular(); });
    $$('.chip-boton').forEach(function (b) {
      b.addEventListener('click', function () {
        $('#usd').value = T.numero(+b.getAttribute('data-usd'), 0);
        ultimoEditado = 'usd'; calcular();
      });
    });
    $$('input[name="rango"]').forEach(function (r) { r.addEventListener('change', function () { marcarChips(); dibujar(); }); });
    var espera;
    window.addEventListener('resize', function () { clearTimeout(espera); espera = setTimeout(dibujar, 120); });
    eventosGrafica();

    fetch('data/trm.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(iniciar)
      .catch(function () { mostrarError('No se pudieron cargar los datos de la TRM. Si abriste el archivo directamente, sírvelo con «python -m http.server».'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
