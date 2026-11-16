// DIVINA PROVIDENTIA — INDEXADOR DE ANUNCIOS EXTERNOS
//
// Recorre las fuentes de ./fuentes/ A LA VEZ (cada web con su propio ritmo),
// descarga las fichas nuevas o cambiadas y las guarda en la tabla inmuebles
// como origen 'externo'.
//
// Reglas de buena conducta (no tocar sin pensarlo):
//  - Se lee robots.txt de cada fuente y se obedece (Disallow y Crawl-delay).
//  - Nunca más de una petición a la vez por fuente, con pausa entre ellas.
//  - Si una fuente responde 403/429/503, se deja en paz hasta la próxima pasada.
//  - El bot se identifica y explica en https://divinaprovidentia.com/bot.html.
//  - Solo se guarda un resumen, una foto y el enlace al original.
//
// Uso:  node scripts/indexador/indexar.mjs              (todas las fuentes)
//       node scripts/indexador/indexar.mjs --prueba 3   (3 fichas por fuente, no guarda)
//       node scripts/indexador/indexar.mjs --solo HabitaOne
// Entorno: SUPABASE_SERVICE_ROLE_KEY (obligatorio salvo en --prueba),
//          MAX_FICHAS (por fuente y ejecución; por defecto, sin límite salvo el tiempo),
//          MAX_MINUTOS (por defecto 320).

import { leerRobots } from './robots.mjs';
import { fuente as rentahouse } from './fuentes/rentahouse.mjs';
import { fuente as inmuebleoferta } from './fuentes/inmuebleoferta.mjs';
import { WASI } from './fuentes/wasi.mjs';

// HabitaOne (habitaone.com) queda fuera: su Cloudflare bloquea a los bots
// (403) y no lo vamos a sortear. Además copia anuncios de otros portales.
const TODAS = [rentahouse, inmuebleoferta, ...WASI];
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nzwtafacdpdgulzcwntx.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT = 'DivinaProvidentiaBot';
const UA = `Mozilla/5.0 (compatible; ${BOT}/1.0; +https://divinaprovidentia.com/bot.html)`;
const LOTE = 10; // se guarda cada 10 fichas para que aparezcan pronto en la web

const args = process.argv.slice(2);
const opcion = n => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const PRUEBA = args.includes('--prueba') ? Number(opcion('--prueba') || 3) : 0;
const SOLO = opcion('--solo');
const FUENTES = SOLO ? TODAS.filter(f => f.nombre === SOLO) : TODAS;
const MAX_FICHAS = PRUEBA || Number(process.env.MAX_FICHAS || Infinity);
const FIN = Date.now() + Number(process.env.MAX_MINUTOS || 320) * 60_000;

const dormir = ms => new Promise(r => setTimeout(r, ms));
const hora = () => new Date().toISOString().slice(11, 19);

if (!PRUEBA && !KEY) {
  console.error('::error title=Falta el secreto SUPABASE_SERVICE_ROLE_KEY::Añádelo en GitHub → Settings → Secrets and variables → Actions.');
  process.exit(1);
}

// ---------- Supabase (REST con la clave de servicio) ----------
async function api(ruta, opciones = {}) {
  for (let intento = 1; ; intento++) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1${ruta}`, {
      ...opciones,
      headers: {
        apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json',
        ...(opciones.headers || {})
      }
    });
    if (r.ok) return r.status === 204 ? null : r.json().catch(() => null);
    const texto = (await r.text()).slice(0, 300);
    if (intento >= 3 || r.status < 500) throw new Error(`Supabase ${r.status}: ${texto}`);
    await dormir(5000 * intento);
  }
}

async function conocidos(nombre) {
  const mapa = new Map();
  for (let desde = 0; ; desde += 1000) {
    const filas = await api(
      `/inmuebles?select=id,url_original,fuente_modificado,activo,visto_en,fotos_total&origen=eq.externo&fuente=eq.${encodeURIComponent(nombre)}&order=id`,
      { headers: { Range: `${desde}-${desde + 999}` } });
    for (const f of filas) mapa.set(f.url_original, f);
    if (filas.length < 1000) return mapa;
  }
}

const guardar = filas => filas.length && api('/inmuebles?on_conflict=url_original', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(filas)
});

async function desactivar(ids) {
  for (let i = 0; i < ids.length; i += 200) {
    await api(`/inmuebles?id=in.(${ids.slice(i, i + 200).join(',')})`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ activo: false })
    });
  }
}

// ---------- Descargas educadas ----------
async function descargar(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xml' },
    redirect: 'follow', signal: AbortSignal.timeout(60_000)
  });
  return { estado: r.status, texto: r.ok ? await r.text() : '' };
}

function leerSitemap(xml) {
  return [...xml.matchAll(/<url>\s*<loc>\s*([^<\s]+)\s*<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)]
    .map(([, loc, lastmod]) => ({ url: loc.trim(), lastmod: lastmod ? new Date(lastmod.trim()) : null }));
}

// ---------- Una fuente ----------
async function indexar(f) {
  const log = (...a) => console.log(hora(), `[${f.nombre}]`, ...a);
  const robotsRes = await descargar(`${f.host}/robots.txt`);
  const robots = leerRobots(robotsRes.estado === 200 ? robotsRes.texto : '', BOT);
  const pausa = Math.max(robots.retrasoSegundos ?? 0, f.retrasoMinimo) * 1000;
  const pedir = async url => { await dormir(pausa); return descargar(url); };

  // Lista de sitemaps de fichas
  let sitemaps = f.sitemaps || [];
  if (f.indiceSitemaps) {
    if (!robots.permitido(f.indiceSitemaps)) { log('robots.txt no permite el índice de sitemaps; se salta.'); return; }
    const ind = await pedir(f.indiceSitemaps);
    if (ind.estado !== 200) throw new Error(`Índice de sitemaps respondió ${ind.estado}`);
    sitemaps = [...ind.texto.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]).filter(u => f.filtroSitemaps.test(u));
  }
  const entradas = [];
  for (const sm of sitemaps) {
    if (!robots.permitido(sm)) continue;
    const r = await pedir(sm);
    if (r.estado !== 200) throw new Error(`Sitemap ${sm} respondió ${r.estado}`);
    entradas.push(...leerSitemap(r.texto).filter(e => robots.permitido(e.url)));
  }
  if (entradas.length < (f.minimoSitemap ?? 100) && !PRUEBA) throw new Error(`Sitemaps sospechosamente cortos (${entradas.length}); no se toca nada.`);
  log(`${entradas.length} fichas permitidas en ${sitemaps.length} sitemap(s). Pausa: ${pausa / 1000}s`);

  const yaEstan = PRUEBA ? new Map() : await conocidos(f.nombre);
  log(`Ya indexadas: ${yaEstan.size}`);

  if (!PRUEBA) {
    // Mantiene la prioridad de la fuente al día (decide qué copia se ve si hay duplicados).
    await api(`/inmuebles?fuente=eq.${encodeURIComponent(f.nombre)}&prioridad=neq.${f.prioridad}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ prioridad: f.prioridad })
    });
    // Lo que ya no está en el sitemap se da por retirado.
    const enSitemap = new Set(entradas.map(e => e.url));
    const retirados = [...yaEstan.values()].filter(k => k.activo && !enSitemap.has(k.url_original)).map(k => k.id);
    if (retirados.length) { await desactivar(retirados); log(`Desactivadas por desaparecer del sitemap: ${retirados.length}`); }
  }

  // Pendientes: nuevas, o cambiadas según la fecha del sitemap. Primero lo más reciente.
  const pendientes = entradas.filter(e => {
    const k = yaEstan.get(e.url);
    if (!k || !k.activo) return true;
    // Fuentes con galería: lo guardado antes de traer varias fotos se vuelve a leer.
    if (f.galeria && k.fotos_total == null) return true;
    if (e.lastmod) return !k.fuente_modificado || e.lastmod > new Date(k.fuente_modificado);
    // Sin fecha en el sitemap: se vuelve a mirar cada «revisarCadaDias».
    return f.revisarCadaDias != null &&
      (!k.visto_en || Date.now() - new Date(k.visto_en) > f.revisarCadaDias * 864e5);
  }).sort((a, b) => (b.lastmod?.getTime() || 0) - (a.lastmod?.getTime() || 0));
  log(`Pendientes: ${pendientes.length}`);

  let hechas = 0, guardadas = 0, fallos = 0, lote = [], muertos = [];
  for (const e of pendientes) {
    if (hechas >= MAX_FICHAS || Date.now() + pausa > FIN) break;
    hechas++;
    let res;
    try { res = await pedir(e.url); } catch (err) { fallos++; log('Error de red:', e.url, err.message); continue; }
    if (res.estado === 404 || res.estado === 410) { const k = yaEstan.get(e.url); if (k) muertos.push(k.id); continue; }
    if ([403, 429, 503].includes(res.estado)) { log(`La fuente respondió ${res.estado}; se deja en paz hasta la próxima pasada.`); break; }
    if (res.estado !== 200) { fallos++; continue; }

    const datos = f.extraer(res.texto, e.url);
    if (!datos) { fallos++; continue; }
    const fila = {
      ...datos, origen: 'externo', fuente: f.nombre, url_original: e.url, whatsapp: null,
      activo: true, visto_en: new Date().toISOString(), prioridad: f.prioridad,
      fuente_modificado: datos.fuente_modificado || (e.lastmod ? e.lastmod.toISOString() : null)
    };
    if (PRUEBA) { console.log(JSON.stringify(fila, null, 1)); continue; }
    lote.push(fila);
    if (lote.length >= LOTE) {
      await guardar(lote); guardadas += lote.length; lote = [];
      if (guardadas % 100 === 0) log(`… ${hechas} descargadas, ${guardadas} guardadas`);
    }
  }
  if (!PRUEBA) {
    await guardar(lote); guardadas += lote.length;
    if (muertos.length) await desactivar(muertos);
  }
  log(`Fin: ${hechas} descargadas, ${guardadas} guardadas, ${fallos} sin datos o con error, ${muertos.length} retiradas. Quedan ${Math.max(0, pendientes.length - hechas)}.`);
  if (hechas > 20 && fallos / hechas > 0.5) {
    console.log(`::warning title=${f.nombre}::Más de la mitad de las fichas no se pudieron leer. ¿Cambió la web de la fuente?`);
  }
}

// Todas las fuentes a la vez: cada una respeta su propio ritmo.
const resultados = await Promise.allSettled(FUENTES.map(indexar));
resultados.forEach((r, i) => {
  if (r.status === 'rejected') { console.log(`::error title=${FUENTES[i].nombre}::${r.reason.message}`); process.exitCode = 1; }
});
