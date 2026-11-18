"""Robot diario de calidad de los anuncios externos.

1) Antispam: retira lo que no es un inmueble (lo decide la base de datos).
2) Portadas con cara: marca como «relegado» los anuncios externos cuya primera
foto muestra a una persona (cartel de un agente, foto de perfil…). Siguen
existiendo y saliendo en las búsquedas, pero van al final del orden
«recientes» (portada y buscador).

Usa YuNet, el detector de caras de OpenCV (red neuronal pequeña, gratis y
local: las fotos no se envían a nadie; modelo de github.com/opencv/opencv_zoo,
licencia MIT). Solo cuentan las caras grandes y claras (≥ 10 % del lado corto
de la foto, confianza ≥ 0,85): las de un cartel, no una persona lejana. Cada foto se revisa una vez; se
vuelve a revisar si el anuncio cambia de foto de portada.

Uso:
  SUPABASE_SERVICE_ROLE_KEY=… python scripts/portadas/revisar.py   (guarda en Supabase)
  python scripts/portadas/revisar.py --sql salida.sql              (solo lee y escribe SQL)
"""
import json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np

RAIZ = Path(__file__).resolve().parents[2]
URL = os.environ.get('SUPABASE_URL', 'https://nzwtafacdpdgulzcwntx.supabase.co')
ANON = re.search(r"SUPABASE_ANON_KEY = '([^']+)'", (RAIZ / 'site' / 'comun.js').read_text('utf8')).group(1)
SERVICIO = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
SALIDA_SQL = sys.argv[sys.argv.index('--sql') + 1] if '--sql' in sys.argv else None
MUESTRA = '--muestra' in sys.argv
if not SALIDA_SQL and not SERVICIO:
    sys.exit('Falta SUPABASE_SERVICE_ROLE_KEY (o usa --sql).')
CLAVE = SERVICIO or ANON
MAX_FOTOS = int(os.environ.get('MAX_FOTOS', '20000'))
CARA_MINIMA = 0.10
MODELO = str(Path(__file__).with_name('face_detection_yunet_2023mar.onnx'))


def api(ruta, metodo='GET', cuerpo=None):
    for intento in range(1, 4):
        req = urllib.request.Request(f'{URL}/rest/v1{ruta}', method=metodo,
                                     data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
                                     headers={'apikey': CLAVE, 'Authorization': f'Bearer {CLAVE}',
                                              'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                datos = r.read()
                return json.loads(datos) if datos else None
        except urllib.error.HTTPError as e:
            if intento == 3 or e.code < 500:
                raise RuntimeError(f'Supabase {e.code}: {e.read()[:300]!r}')
        except urllib.error.URLError:
            if intento == 3:
                raise
        time.sleep(4 * intento)


def revisar(url):
    """'cara', 'limpia' o 'error'."""
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'VivinatiBot/1.0 (+https://vivinati.com/realestate/bot.html)'})
        with urllib.request.urlopen(req, timeout=20) as r:
            datos = r.read(15_000_000)
        img = cv2.imdecode(np.frombuffer(datos, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            return 'error'
        escala = 640 / max(img.shape[:2])
        if escala < 1:
            img = cv2.resize(img, None, fx=escala, fy=escala, interpolation=cv2.INTER_AREA)
        alto, ancho = img.shape[:2]
        detector = cv2.FaceDetectorYN.create(MODELO, '', (ancho, alto), score_threshold=0.85)
        _, caras = detector.detect(img)
        lado = min(alto, ancho) * CARA_MINIMA
        grandes = [] if caras is None else [c for c in caras if min(c[2], c[3]) >= lado]
        return 'cara' if grandes else 'limpia'
    except Exception:
        return 'error'


# 0) Antispam: retira lo que no es un inmueble (blog, servicios, preguntas
#    sin datos). La regla vive en la base de datos: public.es_spam_inmueble.
if SERVICIO:
    print(f'Retirados como spam: {api("/rpc/limpiar_spam", "POST", {})}')

# 1) Anuncios externos activos
filas = []
while True:
    lote = api(f'/inmuebles?select=id,fuente,fotos,foto_huella,relegado&activo=eq.true&origen=eq.externo&order=id&offset={len(filas)}&limit=1000')
    filas += lote
    if len(lote) < 1000:
        break
print(f'Anuncios externos activos: {len(filas)}')

# 2) Revisar las portadas nuevas o cambiadas
pendientes = [f for f in filas if f['fotos'] and (f['foto_huella'] or '').partition('|')[2] != f['fotos'][0]][:MAX_FOTOS]
print(f'Portadas por revisar: {len(pendientes)}')
with ThreadPoolExecutor(8) as hilos:
    for n, (f, estado) in enumerate(zip(pendientes, hilos.map(lambda f: revisar(f['fotos'][0]), pendientes)), 1):
        f['nueva_huella'] = f'{estado}|{f["fotos"][0]}'
        if n % 1000 == 0:
            print(f'  {n} portadas…', flush=True)

# 3) Decidir
cambios = []
por_fuente = {}
for f in filas:
    huella = f.get('nueva_huella') or f['foto_huella'] or ''
    relegar = huella.startswith('cara|') and huella.partition('|')[2] == (f['fotos'] or [None])[0]
    if relegar:
        por_fuente[f['fuente']] = por_fuente.get(f['fuente'], 0) + 1
        if MUESTRA:
            print(f'  cara · {f["fuente"]}: {f["fotos"][0]}')
    if f.get('nueva_huella') or f['relegado'] != relegar:
        cambios.append((f['id'], f.get('nueva_huella') or f['foto_huella'], relegar))
for fuente, n in sorted(por_fuente.items(), key=lambda x: -x[1]):
    print(f'  {fuente}: {n} con cara en la portada')
print(f'Relegados: {sum(por_fuente.values())}. Filas que cambian: {len(cambios)}')

# 4) Guardar
if SALIDA_SQL:
    lit = lambda s: 'null' if s is None else "'" + str(s).replace("'", "''") + "'"
    partes = []
    for i in range(0, len(cambios), 1500):
        valores = ','.join(f'({lit(c[0])}::uuid, {lit(c[1])}, {str(c[2]).lower()})' for c in cambios[i:i + 1500])
        partes.append(f'update public.inmuebles i set foto_huella = v.h, relegado = v.r from (values {valores}) v(id, h, r) where i.id = v.id;')
    Path(SALIDA_SQL).write_text('\n\n'.join(partes) + '\n', 'utf8')
    print(f'SQL escrito en {SALIDA_SQL}')
else:
    with ThreadPoolExecutor(6) as hilos:
        list(hilos.map(lambda c: api(f'/inmuebles?id=eq.{c[0]}', 'PATCH', {'foto_huella': c[1], 'relegado': c[2]}), cambios))
    print('Guardado.')
