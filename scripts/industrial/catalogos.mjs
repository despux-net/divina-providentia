// Busca catálogos (PDF) en la web de cada proveedor del directorio y los añade
// a su ficha. Solo lee la portada y hasta 4 páginas de «catálogo / descargas»,
// respeta robots.txt y va despacio. Los catálogos se ENLAZAN (se abren o se
// descargan desde la web del proveedor); Vivinati no guarda copias.
//
// Filtro estricto: solo archivos que por su nombre o su enlace son catálogos,
// listas de precios, fichas técnicas o tablas de producto. Nunca documentos de
// la empresa o de personas (RIF, cédulas, declaraciones, certificados…).
//   SUPABASE_SERVICE_ROLE_KEY=… node scripts/industrial/catalogos.mjs
//   PRUEBA=1 node scripts/industrial/catalogos.mjs   (solo muestra lo que encontraría)
import { leerRobots } from '../indexador/robots.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nzwtafacdpdgulzcwntx.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRUEBA = !!process.env.PRUEBA;
const UA = 'Mozilla/5.0 (compatible; VivinatiBot/1.0; +https://vivinati.com/realestate/bot.html)';
const ANON = (await (await import('node:fs')).promises.readFile(new URL('../../site/comun.js', import.meta.url), 'utf8')).match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];
const CLAVE = KEY || ANON;
if (!PRUEBA && !KEY) { console.error('Falta SUPABASE_SERVICE_ROLE_KEY (o usa PRUEBA=1).'); process.exit(1); }

const dormir = ms => new Promise(r => setTimeout(r, ms));
const llano = s => decodeURIComponent(String(s || '')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SI = /catalog|lista[ -_]?de[ -_]?precios|lista[ -_]?de[ -_]?productos|brochure|ficha[ -_]?tecnica|fichas[ -_]?tecnicas|tabla|portafolio[ -_]?de[ -_]?productos|linea[ -_]?de[ -_]?productos|manual[ -_]?de[ -_]?seleccion/;
const NO = /rif|cedula|islr|declaracion|iso[ -_]?9001|certificad|constancia|acta|registro[ -_]?mercantil|factura|contrato|privacidad|terminos|politica|garantia|solvencia|planilla|curriculum|cv[ -_.]|nomina|balance|estados[ -_]?financieros|poder|autorizacion/;

async function pedir(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
    return { estado: r.status, url: r.url, texto: r.status === 200 && /html/i.test(r.headers.get('content-type') || '') ? await r.text() : '' };
  } catch { return { estado: 0, url, texto: '' }; }
}
async function api(ruta, opciones = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${ruta}`, { ...opciones,
    headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

// Enlaces de una página: [{url, texto}]
const enlaces = (html, desde) => [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)].map(m => {
  try { return { url: new URL(m[1].replace(/&amp;/g, '&'), desde).href, texto: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }; } catch { return null; }
}).filter(Boolean);
const ENTIDADES = { aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', amp: '&', quot: '"', nbsp: ' ' };
const decodificar = t => t.replace(/&([a-zA-Z]+);?/g, (m, n) => ENTIDADES[n] ?? m).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)));
const tituloDe = (e) => {
  const archivo = decodeURIComponent(e.url.split('/').pop().replace(/\.pdf.*$/i, '')).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const texto = decodificar(e.texto || '').trim();
  // «Descargar», «Catálogo español», «Ver PDF»… no dicen qué es: se usa el nombre del archivo
  const generico = !texto || texto.length < 4 || /^(descargar|download|ver|aqu[ií]|pdf|cat[aá]logo( (en )?(espa[nñ]ol|pdf|ingl[eé]s|completo))?)\b/i.test(texto) && texto.split(' ').length <= 5;
  const t = generico ? archivo.charAt(0).toUpperCase() + archivo.slice(1) : texto;
  return t.slice(0, 80);
};

const proveedores = await api('/proveedores?select=slug,nombre,web,catalogos&activo=eq.true&order=slug');
for (const p of proveedores) {
  const base = new URL(p.web).origin;
  const rob = await pedir(base + '/robots.txt');
  const robots = leerRobots(rob.estado === 200 ? rob.texto : '', 'VivinatiBot');
  if (!robots.permitido(base + '/')) continue;
  const portada = await pedir(p.web);
  if (portada.estado !== 200) { console.log(`${p.slug}: su web no responde (${portada.estado})`); continue; }
  const dominio = new URL(portada.url).hostname.replace(/^www\./, '');
  const todos = enlaces(portada.texto, portada.url);
  const paginas = [...new Set(todos.filter(e => !/\.pdf/i.test(e.url) && /catalog|descarga|download|brochure|ficha|productos/i.test(llano(e.url + ' ' + e.texto)) && new URL(e.url).hostname.replace(/^www\./, '') === dominio).map(e => e.url))].slice(0, 4);
  for (const u of paginas) {
    if (!robots.permitido(u)) continue;
    await dormir(1500);
    const r = await pedir(u);
    if (r.estado === 200) todos.push(...enlaces(r.texto, r.url));
  }
  const encontrados = new Map();
  for (const e of todos) {
    if (!/\.pdf(\?|$)/i.test(e.url)) continue;
    const host = new URL(e.url).hostname.replace(/^www\./, '');
    if (host !== dominio && !host.endsWith('.' + dominio)) continue;            // solo archivos de su propia web
    const clave = llano(e.url + ' ' + e.texto);
    if (!SI.test(clave) || NO.test(clave) || !robots.permitido(e.url)) continue;
    if (!encontrados.has(e.url)) encontrados.set(e.url, { titulo: tituloDe(e), url: e.url });
  }
  const actuales = Array.isArray(p.catalogos) ? p.catalogos : [];
  const nuevos = [...encontrados.values()].filter(c => !actuales.some(a => a.url === c.url));
  if (nuevos.length) {
    console.log(`${p.slug}: ${nuevos.length} catálogo(s) nuevo(s)`); nuevos.forEach(c => console.log(`   ${c.titulo} — ${c.url}`));
    if (!PRUEBA) await api(`/proveedores?slug=eq.${p.slug}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ catalogos: [...actuales, ...nuevos].slice(0, 30), revisado_en: new Date().toISOString() }) });
  }
  await dormir(2000);
}
console.log('Catálogos revisados.');
