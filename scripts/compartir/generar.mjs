// Páginas para compartir: vivinati.com/a/<id>/
// WhatsApp, Facebook, Telegram… no ejecutan JavaScript: leen solo las
// etiquetas «og:» del HTML. Por eso, al publicar la web, se crea una página
// mínima por anuncio con su foto, precio y zona, que manda a la persona a la
// ficha completa (anuncio.html?id=…). No se indexa en Google (noindex).
// Uso: node scripts/compartir/generar.mjs site

import fs from 'node:fs';
import path from 'node:path';

const SITIO = process.argv[2] || 'site';
const comun = fs.readFileSync(path.join(SITIO, 'comun.js'), 'utf8');
const URL_SB = (comun.match(/SUPABASE_URL = '([^']+)'/) || [])[1] || 'https://nzwtafacdpdgulzcwntx.supabase.co';
const CLAVE = comun.match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];   // pública a propósito (la protege la RLS)
const BASE = 'https://vivinati.com';

const TIPOS = { apartamento: 'Apartamento', casa: 'Casa', townhouse: 'Townhouse', anexo: 'Anexo', habitacion: 'Habitación',
  terreno: 'Terreno', local: 'Local', oficina: 'Oficina', galpon: 'Galpón', otro: 'Inmueble' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const foto = p => !p ? null : /^https:\/\//.test(p) ? p
  : `${URL_SB}/storage/v1/object/public/inmuebles/${p.split('/').map(encodeURIComponent).join('/')}`;
const precio = i => {
  if (i.operacion === 'concepto') return 'Proyecto conceptual';
  if (i.precio == null) return 'Precio a consultar';
  const n = Number(i.precio).toLocaleString('es-VE', { maximumFractionDigits: 0 });
  const t = i.moneda === 'VES' ? `Bs. ${n}` : `$${n}`;
  return i.operacion === 'alquiler' ? `${t} /mes` : t;
};

const filas = [];
for (let desde = 0; ; desde += 1000) {
  const r = await fetch(`${URL_SB}/rest/v1/inmuebles?select=id,titulo,operacion,tipo,precio,moneda,estado,ciudad,zona,habitaciones,banos,metros,fotos&activo=eq.true&order=id`,
    { headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`, Range: `${desde}-${desde + 999}` } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const lote = await r.json();
  filas.push(...lote);
  if (lote.length < 1000) break;
}

const carpeta = path.join(SITIO, 'a');
fs.rmSync(carpeta, { recursive: true, force: true });
for (const i of filas) {
  if (!/^[0-9a-f-]{36}$/i.test(i.id)) continue;
  const lugar = [i.zona, i.ciudad, i.estado].filter(Boolean).join(', ');
  const op = i.operacion === 'venta' ? 'en venta' : i.operacion === 'alquiler' ? 'en alquiler' : '';
  const titulo = `${precio(i)} · ${i.titulo || `${TIPOS[i.tipo] || 'Inmueble'} ${op}`}`.slice(0, 120);
  const datos = [i.habitaciones != null && `${i.habitaciones} hab.`, i.banos != null && `${i.banos} baños`,
    i.metros != null && `${Number(i.metros).toLocaleString('es-VE')} m²`].filter(Boolean).join(' · ');
  const descripcion = [`${TIPOS[i.tipo] || 'Inmueble'} ${op}`.trim(), lugar, datos].filter(Boolean).join(' — ');
  const img = foto(Array.isArray(i.fotos) ? i.fotos[0] : null) || `${BASE}/img/icono-512.png`;
  const destino = `/anuncio.html?id=${i.id}`;
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} — Vivinati</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${BASE}${destino}">
<meta name="description" content="${esc(descripcion)}">
<meta property="og:site_name" content="Vivinati">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_VE">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${BASE}/a/${i.id}/">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${destino}">
<script>location.replace(${JSON.stringify(destino)});</script>
</head><body><p><a href="${destino}">Ver el anuncio en Vivinati</a></p></body></html>
`;
  fs.mkdirSync(path.join(carpeta, i.id), { recursive: true });
  fs.writeFileSync(path.join(carpeta, i.id, 'index.html'), html);
}
console.log(`Páginas para compartir: ${filas.length}`);
