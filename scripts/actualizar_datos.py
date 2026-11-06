#!/usr/bin/env python3
"""Baja el histórico de la TRM (dólar en pesos colombianos) y lo guarda en data/.

Fuente (abierta y sin claves):
  Superintendencia Financiera de Colombia, conjunto «Tasa de Cambio Representativa
  del Mercado - TRM» en datos.gov.co (32sa-8pi3). Licencia CC BY-SA 4.0.

Escribe:
  data/trm.json      el histórico compacto: [desde, valor] o [desde, valor, hasta]
  data/corrida.json  cuándo corrió y qué errores hubo

Si la fuente falla o los datos no pasan el control de calidad, deja data/trm.json
como estaba (el del día anterior).

Solo usa la biblioteca estándar de Python 3.9+.
Uso: python scripts/actualizar_datos.py
"""
import json
import socket
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# Algunos equipos de GitHub Actions no alcanzan direcciones IPv6 ("Network is unreachable").
# Se fuerza IPv4 para todas las consultas.
_getaddrinfo = socket.getaddrinfo


def _solo_ipv4(host, port, family=0, *args, **kwargs):
    return _getaddrinfo(host, port, socket.AF_INET, *args, **kwargs)


socket.getaddrinfo = _solo_ipv4

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "data"
AGENTE = "trm-colombia/1.0 (+https://github.com/Estado-X/trm-colombia)"
RECURSO = "https://www.datos.gov.co/resource/32sa-8pi3.json"

# Control de calidad. La TRM más baja de la serie (desde 1991) es de unos 600 pesos
# y la más alta, de unos 5.000: fuera de 300 a 20.000 se considera un error de la fuente.
VALOR_MIN, VALOR_MAX = 300.0, 20000.0
SALTO_MAX = 0.15     # un cambio de más del 15 % entre un día y el siguiente se rechaza
MIN_FILAS = 8000     # el histórico tiene más de 8.000 registros; menos es una respuesta cortada


def bajar(url, intentos=3, espera=120):
    for n in range(1, intentos + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=espera) as r:
                return r.read()
        except Exception as e:  # red o servidor caído: se reintenta
            if n == intentos:
                raise
            print(f"  reintento {n} ({e})", file=sys.stderr)
            time.sleep(5 * n)


def leer_fuente():
    q = urllib.parse.urlencode({
        "$select": "valor,unidad,vigenciadesde,vigenciahasta",
        "$order": "vigenciadesde ASC",
        "$limit": 50000,
    })
    return json.loads(bajar(f"{RECURSO}?{q}"))


def fecha(texto):
    return date.fromisoformat(str(texto)[:10])


def depurar(filas):
    """Revisa y ordena las filas. Devuelve (serie, avisos) o lanza ValueError si no sirven."""
    if not isinstance(filas, list) or len(filas) < MIN_FILAS:
        raise ValueError(f"respuesta incompleta: {len(filas) if isinstance(filas, list) else 'sin lista'} filas")
    avisos = []
    vistas = {}
    for f in filas:
        try:
            desde, hasta = fecha(f["vigenciadesde"]), fecha(f.get("vigenciahasta") or f["vigenciadesde"])
            valor = float(f["valor"])
        except (KeyError, TypeError, ValueError):
            avisos.append(f"fila ilegible descartada: {f}")
            continue
        if f.get("unidad", "COP") != "COP":
            avisos.append(f"unidad distinta de COP descartada: {desde}")
            continue
        if not (VALOR_MIN <= valor <= VALOR_MAX):
            avisos.append(f"valor imposible descartado: {desde} = {valor}")
            continue
        if hasta < desde:
            avisos.append(f"vigencia al revés corregida: {desde}")
            hasta = desde
        if desde in vistas:
            if vistas[desde][1] != valor:
                avisos.append(f"fecha repetida con dos valores, se deja la primera: {desde}")
            continue
        vistas[desde] = (desde, valor, hasta)
    serie = sorted(vistas.values())
    for (d0, v0, h0), (d1, v1, h1) in zip(serie, serie[1:]):
        if d1 <= h0:
            avisos.append(f"vigencias que se cruzan: {d0} a {h0} y {d1}")
        if abs(v1 - v0) / v0 > SALTO_MAX:
            raise ValueError(f"salto imposible entre {d0} ({v0}) y {d1} ({v1})")
    if len(serie) < MIN_FILAS:
        raise ValueError(f"quedaron {len(serie)} filas válidas")
    return serie, avisos


def compactar(serie):
    filas = []
    for desde, valor, hasta in serie:
        fila = [desde.isoformat(), round(valor, 2)]
        if hasta != desde:
            fila.append(hasta.isoformat())
        filas.append(fila)
    return filas


def guardar(nombre, obj):
    (DATOS / nombre).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  data/{nombre} listo")


def main():
    DATOS.mkdir(exist_ok=True)
    errores, avisos = [], []
    ahora = datetime.now(timezone.utc).isoformat(timespec="minutes")
    print("TRM · Superintendencia Financiera (datos.gov.co)")
    try:
        serie, avisos = depurar(leer_fuente())
        anterior = DATOS / "trm.json"
        nueva = compactar(serie)
        viejo = json.loads(anterior.read_text(encoding="utf-8")) if anterior.exists() else None
        if viejo and serie[-1][0].isoformat() < viejo["serie"][-1][0]:
            raise ValueError("la fuente trae menos días que los datos guardados")
        if viejo and viejo.get("serie") == nueva:
            print("  data/trm.json sin cambios")
        else:
            guardar("trm.json", {
              "fuente": "Superintendencia Financiera de Colombia, «Tasa de Cambio Representativa del Mercado - TRM», datos.gov.co (32sa-8pi3)",
              "url": "https://www.datos.gov.co/d/32sa-8pi3",
              "licencia": "CC BY-SA 4.0",
              "actualizado": ahora,
              "formato": "serie: [vigente desde, pesos por dólar] o [vigente desde, pesos por dólar, vigente hasta] cuando la TRM cubre varios días (fines de semana y festivos)",
              "serie": nueva,
            })
    except Exception as e:  # la fuente falló: se conservan los datos anteriores
        errores.append(f"trm: {e}")
        print(f"  ERROR: {e} (se conservan los datos anteriores)", file=sys.stderr)
    for a in avisos[:50]:
        print(f"  aviso: {a}")
    guardar("corrida.json", {"actualizado": ahora, "errores": errores, "avisos": avisos[:50]})
    # Si la fuente falla pero quedan los datos anteriores, la corrida no se marca en rojo:
    # el error queda en data/corrida.json. Solo falla si no hay ningún dato que mostrar.
    if errores and not (DATOS / "trm.json").exists():
        sys.exit(1)


if __name__ == "__main__":
    main()
