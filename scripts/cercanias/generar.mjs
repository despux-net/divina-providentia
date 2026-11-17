// «Cerca de»: busca en OpenStreetMap (Overpass, gratis) los colegios,
// farmacias, transporte… alrededor de cada zona con anuncios y lo guarda en
// la tabla cercanias (zonas de ~500 m). La ficha del anuncio lo lee de ahí,
// así no depende de que Overpass responda en ese momento.
// Buena conducta: una consulta a la vez, pausa de 10 s, y si el servidor está
// saturado se espera más (hasta el siguiente intento o la próxima pasada).
// Entorno: SUPABASE_SERVICE_ROLE_KEY. Opcional: MAX_ZONAS (por defecto 300).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nzwtafacdpdgulzcwntx.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_ZONAS = Number(process.env.MAX_ZONAS || 300);
const RENOVAR_DIAS = 90;
const UA = 'VivinatiBot/1.0 (+https://vivinati.com/bot.html)';
const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
if (!KEY) { console.error('::error::Falta SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const dormir = ms => new Promise(r => setTimeout(r, ms));
const cab = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
// Celda de ~550 m: el mismo cálculo está en site/anuncio.js.
export const celdaDe = (lat, lng) => `${(Math.round(lat / 0.005) * 0.005).toFixed(3)},${(Math.round(lng / 0.005) * 0.005).toFixed(3)}`;

const CATS = [
  ['educacion', t => /^(school|kindergarten|university|college)$/.test(t.amenity)],
  ['salud', t => /^(hospital|clinic|doctors)$/.test(t.amenity)],
  ['farmacia', t => t.amenity === 'pharmacy'],
  ['compras', t => /^(supermarket|mall|department_store)$/.test(t.shop)],
  ['transporte', t => t.station === 'subway' || t.railway === 'station' || t.railway === 'subway_entrance' || t.public_transport === 'station'],
  ['parque', t => t.leisure === 'park' || t.place === 'square'],
  ['banco', t => t.amenity === 'bank']
];

async function overpass(lat, lng) {
  const a = `(around:1500,${lat},${lng})`;
  const q = `[out:json][timeout:25];(nwr${a}[amenity~"^(school|kindergarten|university|college|hospital|clinic|doctors|pharmacy|bank)$"][name];` +
    `nwr${a}[shop~"^(supermarket|mall|department_store)$"][name];nwr${a}[station=subway];nwr${a}[railway~"^(station|subway_entrance)$"];` +
    `nwr${a}[public_transport=station][name];nwr${a}[leisure=park][name];nwr${a}[place=square][name];);out center tags 300;`;
  for (let intento = 0; intento < 3; intento++) {
    for (const s of SERVIDORES) {
      try {
        const r = await fetch(s, { method: 'POST', body: 'data=' + encodeURIComponent(q),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(40_000) });
        if (r.ok) return (await r.json()).elements || [];
      } catch { /* siguiente servidor */ }
      await dormir(5_000);
    }
    await dormir(60_000 * (intento + 1));   // todos saturados: esperar más
  }
  return null;
}

function resumir(elementos) {
  const vistos = new Set(), salida = [];
  for (const e of elementos) {
    const t = e.tags || {}, la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
    if (la == null || lo == null) continue;
    const cat = CATS.find(([, f]) => f(t));
    const nombre = String(t.name || '').trim().slice(0, 80);
    if (!cat || (!nombre && cat[0] !== 'transporte')) continue;
    const llave = cat[0] + '|' + (nombre || 'estación').toLowerCase();
    if (vistos.has(llave)) continue;
    vistos.add(llave);
    salida.push({ c: cat[0], n: nombre || 'Estación', la: +la.toFixed(5), lo: +lo.toFixed(5) });
  }
  return salida.slice(0, 200);
}

// Zonas con anuncios activos y coordenadas
const celdas = new Map();
for (let desde = 0; ; desde += 1000) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/inmuebles?select=lat,lng&activo=eq.true&lat=not.is.null&lng=not.is.null&order=id`,
    { headers: { ...cab, Range: `${desde}-${desde + 999}` } });
  const filas = await r.json();
  for (const f of filas) { const c = celdaDe(f.lat, f.lng); celdas.set(c, (celdas.get(c) || 0) + 1); }
  if (filas.length < 1000) break;
}
const hechas = new Map();
for (let desde = 0; ; desde += 1000) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/cercanias?select=celda,actualizado&order=celda`, { headers: { ...cab, Range: `${desde}-${desde + 999}` } });
  const filas = await r.json();
  for (const f of filas) hechas.set(f.celda, new Date(f.actualizado));
  if (filas.length < 1000) break;
}
const limite = Date.now() - RENOVAR_DIAS * 864e5;
// Primero las zonas con más anuncios y las que nunca se hicieron.
const pendientes = [...celdas.entries()].filter(([c]) => !hechas.has(c) || hechas.get(c) < limite)
  .sort((a, b) => (hechas.has(a[0]) - hechas.has(b[0])) || b[1] - a[1]).map(([c]) => c);
console.log(`Zonas con anuncios: ${celdas.size} · ya guardadas: ${hechas.size} · pendientes: ${pendientes.length} · esta pasada: ${Math.min(MAX_ZONAS, pendientes.length)}`);

let ok = 0, fallos = 0;
for (const c of pendientes.slice(0, MAX_ZONAS)) {
  const [lat, lng] = c.split(',').map(Number);
  const elementos = await overpass(lat, lng);
  if (!elementos) { fallos++; console.log(`Sin respuesta para ${c}; se intentará en la próxima pasada.`); if (fallos >= 5) break; continue; }
  const datos = resumir(elementos);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/cercanias?on_conflict=celda`, {
    method: 'POST', headers: { ...cab, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ celda: c, datos, actualizado: new Date().toISOString() })
  });
  if (r.ok) ok++; else console.log(`No se pudo guardar ${c}: ${r.status}`);
  if (ok % 25 === 0 && ok) console.log(`… ${ok} zonas guardadas`);
  await dormir(10_000);
}
console.log(`Fin: ${ok} zonas guardadas, ${fallos} sin respuesta.`);
