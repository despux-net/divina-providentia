// DIVINA PROVIDENTIA — INDEXADOR DE ANUNCIOS EXTERNOS
//
// Recorre las fuentes de ./fuentes/, descarga las fichas nuevas o cambiadas
// y las guarda en la tabla inmuebles como origen 'externo'.
//
// Reglas de buena conducta (no tocar sin pensarlo):
//  - Se lee robots.txt de cada fuente y se obedece (Disallow y Crawl-delay).
//  - Nunca más de una petición a la vez por fuente, con pausa entre ellas.
//  - El bot se identifica y explica en https://divinaprovidentia.com/bot.html.
//  - Solo se guarda un resumen, una foto y el enlace al original.
//
// Uso:  node scripts/indexador/indexar.mjs            (todas las fuentes)
//       node scripts/indexador/indexar.mjs --prueba 3 (descarga 3 fichas y no guarda nada)
// Entorno: SUPABASE_SERVICE_ROLE_KEY (obligatorio salvo en --prueba),
//          MAX_FICHAS (por fuente y ejecución, por defecto 1500),
//          MAX_MINUTOS (por defecto 300).

import { leerRobots } from './robots.mjs';
import { fuente as rentahouse } from './fuentes/rentahouse.mjs';

const FUENTES = [rentahouse];
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nzwtafacdpdgulzcwntx.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT = 'DivinaProvidentiaBot';
const UA = `Mozilla/5.0 (compatible; ${BOT}/1.0; +https://divinaprovidentia.com/bot.html)`;

const args = process.argv.slice(2);
const PRUEBA = args.includes('--prueba') ? Number(args[args.indexOf('--prueba') + 1] || 3) : 0;
const MAX_FICHAS = PRUEBA || Number(process.env.MAX_FICHAS || 1500);
const FIN = Date.now() + Number(process.env.MAX_MINUTOS || 300) * 60_000;

const dormir = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (!PRUEBA && !KEY) {
  console.error('::error title=Falta el secreto SUPABASE_SERVICE_ROLE_KEY::Añádelo en GitHub → Settings → Secrets and variables → Actions.');
  process.exit(1);
}

// ---------- Supabase (REST con la clave de servicio) ----------
async function api(ruta, opciones = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${ruta}`, {
    ...opciones,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json',
      ...(opciones.headers || {})
    }
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

async function conocidos(nombre) {
  const mapa = new Map();
  for (let desde = 0; ; desde += 1000) {
    const filas = await api(
      `/inmuebles?select=id,url_original,fuente_modificado,activo&origen=eq.externo&fuente=eq.${encodeURIComponent(nombre)}&order=id`,
      { headers: { Range: `${desde}-${desde + 999}` } });
    for (const f of filas) mapa.set(f.url_original, f);
    if (filas.length < 1000) return mapa;
  }
}

async function guardar(filas) {
  if (!filas.length) return;
  await api('/inmuebles?on_conflict=url_original', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(filas)
  });
}

async function desactivar(ids) {
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    await api(`/inmuebles?id=in.(${lote.join(',')})`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ activo: false })
    });
  }
}

// ---------- Descargas educadas ----------
async function descargar(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xml' }, redirect: 'follow' });
  return { estado: r.status, texto: r.ok ? await r.text() : '' };
}

function leerSitemap(xml) {
  return [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)]
    .map(([, loc, lastmod]) => ({ url: loc.trim(), lastmod: lastmod ? new Date(lastmod.trim()) : null }));
}

// ---------- Una fuente ----------
async function indexar(f) {
  log(`== ${f.nombre}`);
  const robotsRes = await descargar(`${f.host}/robots.txt`);
  const robots = leerRobots(robotsRes.estado === 200 ? robotsRes.texto : '', BOT);
  const pausa = Math.max(robots.retrasoSegundos ?? 0, f.retrasoMinimo) * 1000;
  if (!robots.permitido(f.sitemap)) { log('robots.txt no permite leer el sitemap; se salta la fuente.'); return; }

  await dormir(pausa);
  const sm = await descargar(f.sitemap);
  if (sm.estado !== 200) throw new Error(`Sitemap respondió ${sm.estado}`);
  const entradas = leerSitemap(sm.texto).filter(e => robots.permitido(e.url));
  if (entradas.length < 100 && !PRUEBA) throw new Error(`Sitemap sospechosamente corto (${entradas.length}); no se toca nada.`);
  log(`Sitemap: ${entradas.length} fichas permitidas. Pausa entre peticiones: ${pausa / 1000}s`);

  const yaEstan = PRUEBA ? new Map() : await conocidos(f.nombre);
  log(`Ya indexadas: ${yaEstan.size}`);

  // Pendientes: nuevas, o cambiadas según la fecha del sitemap. Primero lo más reciente.
  const pendientes = entradas.filter(e => {
    const k = yaEstan.get(e.url);
    if (!k) return true;
    if (!k.activo) return true;
    return e.lastmod && (!k.fuente_modificado || e.lastmod > new Date(k.fuente_modificado));
  }).sort((a, b) => (b.lastmod?.getTime() || 0) - (a.lastmod?.getTime() || 0));
  log(`Pendientes: ${pendientes.length}. En esta ejecución, hasta ${MAX_FICHAS}.`);

  // Lo que ya no está en el sitemap se da por retirado.
  if (!PRUEBA) {
    const enSitemap = new Set(entradas.map(e => e.url));
    const retirados = [...yaEstan.values()].filter(k => k.activo && !enSitemap.has(k.url_original)).map(k => k.id);
    if (retirados.length) { await desactivar(retirados); log(`Desactivados por desaparecer del sitemap: ${retirados.length}`); }
  }

  let hechas = 0, guardadas = 0, fallos = 0, lote = [], muertos = [];
  const ahora = () => new Date().toISOString();
  for (const e of pendientes) {
    if (hechas >= MAX_FICHAS || Date.now() > FIN) break;
    await dormir(pausa);
    hechas++;
    let res;
    try { res = await descargar(e.url); } catch (err) { fallos++; log('Error de red:', e.url, err.message); continue; }
    if (res.estado === 404 || res.estado === 410) {
      const k = yaEstan.get(e.url); if (k) muertos.push(k.id); continue;
    }
    if (res.estado === 429 || res.estado === 503) { log(`La fuente pide calma (${res.estado}); se para aquí.`); break; }
    if (res.estado !== 200) { fallos++; continue; }

    const datos = f.extraer(res.texto, e.url);
    if (!datos) { fallos++; continue; }
    const fila = {
      ...datos, origen: 'externo', fuente: f.nombre, url_original: e.url, whatsapp: null,
      activo: true, visto_en: ahora(),
      fuente_modificado: datos.fuente_modificado || (e.lastmod ? e.lastmod.toISOString() : null)
    };
    if (PRUEBA) { console.log(JSON.stringify(fila, null, 1)); continue; }
    lote.push(fila);
    if (lote.length >= 50) { await guardar(lote); guardadas += lote.length; lote = []; log(`… ${hechas} descargadas, ${guardadas} guardadas`); }
  }
  if (!PRUEBA) {
    await guardar(lote); guardadas += lote.length;
    if (muertos.length) await desactivar(muertos);
  }
  log(`Fin ${f.nombre}: ${hechas} descargadas, ${guardadas} guardadas, ${fallos} sin datos o con error, ${muertos.length} retiradas.`);
  if (hechas > 20 && fallos / hechas > 0.5) {
    console.log(`::warning title=${f.nombre}::Más de la mitad de las fichas no se pudieron leer. ¿Cambió la web de la fuente?`);
  }
}

for (const f of FUENTES) {
  try { await indexar(f); }
  catch (err) { console.log(`::error title=${f.nombre}::${err.message}`); process.exitCode = 1; }
}
