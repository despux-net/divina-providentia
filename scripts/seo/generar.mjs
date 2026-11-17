// Genera, en el momento de publicar, lo que Google necesita para encontrar
// Vivinati (no se guarda en el repo: se crea dentro de site/ en el
// despliegue de GitHub Actions, que además se repite cada día):
//
//  1. Páginas estáticas de búsquedas frecuentes, con los anuncios ya escritos
//     en el HTML (Google las lee sin ejecutar JavaScript):
//       /inmuebles/venta/                       Inmuebles en venta en Venezuela
//       /inmuebles/alquiler/zulia/              Inmuebles en alquiler en Zulia
//       /inmuebles/venta/apartamentos/          Apartamentos en venta en Venezuela
//       /inmuebles/venta/casas/miranda/         Casas en venta en Miranda
//  2. sitemap.xml con todas las páginas públicas y los anuncios publicados
//     en Vivinati (venta, alquiler y conceptos 3D).
//  3. robots.txt que apunta al sitemap y aparta las páginas privadas.
//  4. En index.html, el bloque «Búsquedas populares» (enlaces internos).
//
// Uso: node scripts/seo/generar.mjs [carpeta del sitio, por defecto site]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SITIO = path.resolve(process.argv[2] || 'site');
const DOMINIO = 'https://vivinati.com';
const HOY = new Date().toISOString().slice(0, 10);
const comun = fs.readFileSync(path.join(SITIO, 'comun.js'), 'utf8');
const URL_SB = comun.match(/SUPABASE_URL = '([^']+)'/)[1];
const CLAVE = comun.match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];   // pública a propósito (la protege la RLS)

// ---------- Reutilizamos DP (comun.js) para que las tarjetas sean idénticas ----------
// Un «objeto que lo acepta todo» hace de navegador: comun.js se carga sin
// tocar nada real y nos quedamos con DP.tarjeta, DP.precio, DP.TIPOS…
const nada = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : nada), apply: () => nada, construct: () => nada });
const ctx = { window: { supabase: { createClient: () => nada } }, document: nada, localStorage: nada, location: nada, navigator: nada, console, URL, URLSearchParams, CustomEvent: function () {} };
vm.createContext(ctx);
vm.runInContext(comun, ctx);
const DP = ctx.window.DP;
DP.esFavorito = () => false;

// ---------- Supabase (solo lectura, con la clave pública) ----------
async function rpc(nombre, args) {
  for (let intento = 1; ; intento++) {
    const r = await fetch(`${URL_SB}/rest/v1/rpc/${nombre}`, {
      method: 'POST',
      headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    if (r.ok) return r.json();
    if (intento >= 3) throw new Error(`${nombre}: HTTP ${r.status} ${await r.text()}`);
    await new Promise(res => setTimeout(res, 1500 * intento));
  }
}
async function tabla(consulta) {
  const r = await fetch(`${URL_SB}/rest/v1/${consulta}`, { headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` } });
  if (!r.ok) throw new Error(`${consulta}: HTTP ${r.status}`);
  return r.json();
}

// ---------- Nombres y direcciones ----------
const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const OPS = { venta: { ruta: 'venta', en: 'en venta', verbo: 'Compra' }, alquiler: { ruta: 'alquiler', en: 'en alquiler', verbo: 'Alquila' } };
const PLURAL = {
  apartamento: 'Apartamentos', casa: 'Casas', townhouse: 'Townhouses', anexo: 'Anexos', habitacion: 'Habitaciones',
  local: 'Locales comerciales', oficina: 'Oficinas', galpon: 'Galpones', terreno: 'Terrenos'
};
const TIPO_SLUG = {
  apartamento: 'apartamentos', casa: 'casas', townhouse: 'townhouses', anexo: 'anexos', habitacion: 'habitaciones',
  local: 'locales', oficina: 'oficinas', galpon: 'galpones', terreno: 'terrenos'
};
// Cómo lo escribe la gente en Google
const ALIAS = { 'Distrito Capital': 'Caracas (Distrito Capital)', 'Nueva Esparta': 'Margarita (Nueva Esparta)', 'La Guaira': 'La Guaira (Vargas)' };
const lugarTxt = e => (e ? ALIAS[e] || e : 'Venezuela');
const esc = DP.esc;
const fmt = n => Number(n).toLocaleString('es-VE');

function ruta(op, tipo, estado) {
  return '/inmuebles/' + [OPS[op].ruta, tipo && TIPO_SLUG[tipo], estado && slug(estado)].filter(Boolean).join('/') + '/';
}
function titular(op, tipo, estado) {
  return `${tipo ? PLURAL[tipo] : 'Inmuebles'} ${OPS[op].en} en ${lugarTxt(estado)}`;
}

// ---------- Plantilla de página ----------
function pagina({ op, tipo, estado, total, filas, hermanos }) {
  const h1 = titular(op, tipo, estado);
  const titulo = `${h1}${total ? ` · ${fmt(total)} anuncios` : ''} — Vivinati`;
  const que = tipo ? PLURAL[tipo].toLowerCase() : 'apartamentos, casas, anexos, locales y terrenos';
  const desc = `${fmt(total)} ${que} ${OPS[op].en} en ${lugarTxt(estado)}. Anuncios de inmobiliarias y particulares en un solo buscador, con fotos, precios en dólares y mapa. Actualizado cada día.`;
  const url = DOMINIO + ruta(op, tipo, estado);
  const buscar = '/buscar.html?' + new URLSearchParams(Object.entries({ operacion: op, tipo, estado }).filter(([, v]) => v)).toString();
  const migas = [
    ['Inicio', '/'],
    [`Inmuebles ${OPS[op].en}`, ruta(op)],
    ...(tipo ? [[`${PLURAL[tipo]} ${OPS[op].en}`, ruta(op, tipo)]] : []),
    ...(estado ? [[lugarTxt(estado), ruta(op, tipo, estado)]] : [])
  ];
  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: migas.map(([n, u], k) => ({ '@type': 'ListItem', position: k + 1, name: n, item: DOMINIO + u }))
    },
    {
      '@context': 'https://schema.org', '@type': 'ItemList', name: h1, numberOfItems: filas.length,
      itemListElement: filas.map((i, k) => ({ '@type': 'ListItem', position: k + 1, url: `${DOMINIO}/anuncio.html?id=${i.id}`, name: i.titulo }))
    }
  ];
  const enlaces = (titulo2, lista) => lista.length ? `<section class="seo-enlaces"><h2>${esc(titulo2)}</h2><ul>${lista.map(([t, u, n]) =>
    `<li><a href="${u}">${esc(t)}</a>${n ? ` <span>${fmt(n)}</span>` : ''}</li>`).join('')}</ul></section>` : '';
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="/">
  <title>${esc(titulo)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${url}">
  <meta property="og:site_name" content="Vivinati">
  <meta property="og:title" content="${esc(h1)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${DOMINIO}/img/og-vivinati.png">
  <meta property="og:locale" content="es_VE">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="icon" href="favicon.png">
  <link rel="stylesheet" href="estilos.css?v=${(fs.readFileSync(path.join(SITIO, 'index.html'), 'utf8').match(/estilos\.css\?v=(\d+)/) || [])[1] || 1}">
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body>
  <header class="cabecera">
    <div class="cabecera-int">
      <a class="marca" href="index.html" aria-label="Vivinati — inicio"><picture><source media="(max-width: 560px)" srcset="img/logo-vivinati-blanco.png"><img src="img/logo-vivinati.png" alt="Vivinati" width="194" height="36"></picture></a>
      <nav class="nav">
        <a href="buscar.html">Buscar</a><a href="conceptos.html">Conceptos 3D</a>
        <span data-nav-sesion></span>
        <a class="boton peq" href="publicar.html">Publicar gratis</a>
      </nav>
    </div>
  </header>
  <main class="contenedor seo-pagina">
    <nav class="migas" aria-label="Estás en">${migas.map(([n, u], k) => k === migas.length - 1 ? `<span>${esc(n)}</span>` : `<a href="${u.slice(1)}">${esc(n)}</a>`).join(' › ')}</nav>
    <h1>${esc(h1)}</h1>
    <p class="seo-intro">${OPS[op].verbo} ${esc(que)} en ${esc(lugarTxt(estado))}: hoy hay <b>${fmt(total)}</b> ${total === 1 ? 'anuncio' : 'anuncios'} de las principales inmobiliarias y de particulares, reunidos en Vivinati. Contacta directo por WhatsApp o en la web original.</p>
    <p><a class="boton" href="${buscar.slice(1)}">Ver los ${fmt(total)} en el buscador, con filtros y mapa</a></p>
    <div class="rejilla resultados-cuatro">${filas.map(DP.tarjeta).join('')}</div>
    ${enlaces(estado ? 'Busca también en otros estados' : 'Por estado', hermanos.estados)}
    ${enlaces('Por tipo de inmueble', hermanos.tipos)}
    ${enlaces('Otras búsquedas', hermanos.otras)}
  </main>
  <footer class="pie"></footer>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>
  <script src="comun.js?v=${(fs.readFileSync(path.join(SITIO, 'index.html'), 'utf8').match(/comun\.js\?v=(\d+)/) || [])[1] || 1}"></script>
  <script>DP.cabecera();</script>
</body>
</html>
`;
}

// ---------- Trabajo ----------
async function enParalelo(tareas, n = 6) {
  const res = []; let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < tareas.length) { const i = k++; res[i] = await tareas[i](); } }));
  return res;
}

const destino = path.join(SITIO, 'inmuebles');
fs.rmSync(destino, { recursive: true, force: true });

// 1) Conteos para decidir qué páginas tienen contenido de verdad.
const conteos = {};   // conteos[op][tipo|'*'] = { total, por_estado, por_tipo }
for (const op of Object.keys(OPS)) {
  conteos[op] = { '*': await rpc('conteos_busqueda', { p_operacion: op }) };
  for (const tipo of Object.keys(PLURAL)) {
    if ((conteos[op]['*'].por_tipo || {})[tipo]) conteos[op][tipo] = await rpc('conteos_busqueda', { p_operacion: op, p_tipo: tipo });
  }
}

const paginas = [];   // { op, tipo, estado, total }
for (const op of Object.keys(OPS)) {
  const base = conteos[op]['*'];
  if (base.total) paginas.push({ op, tipo: null, estado: null, total: base.total });
  for (const [estado, n] of Object.entries(base.por_estado || {})) if (n >= 1) paginas.push({ op, tipo: null, estado, total: n });
  for (const tipo of Object.keys(PLURAL)) {
    const c = conteos[op][tipo];
    if (!c || !c.total) continue;
    paginas.push({ op, tipo, estado: null, total: c.total });
    for (const [estado, n] of Object.entries(c.por_estado || {})) if (n >= 3) paginas.push({ op, tipo, estado, total: n });
  }
}
const existe = new Set(paginas.map(p => ruta(p.op, p.tipo, p.estado)));
const total = (op, tipo, estado) => (paginas.find(p => p.op === op && p.tipo === tipo && p.estado === estado) || {}).total;

// 2) Escribir cada página con sus anuncios.
await enParalelo(paginas.map(p => async () => {
  const filas = await rpc('buscar_inmuebles', { p_operacion: p.op, p_tipo: p.tipo, p_estado: p.estado, p_limite: 24 });
  const otraOp = p.op === 'venta' ? 'alquiler' : 'venta';
  const estadosDe = (op, tipo) => paginas.filter(x => x.op === op && x.tipo === tipo && x.estado)
    .sort((a, b) => b.total - a.total).map(x => [x.estado, ruta(op, tipo, x.estado).slice(1), x.total]);
  const hermanos = {
    estados: estadosDe(p.op, p.tipo).filter(([e]) => e !== p.estado),
    tipos: Object.keys(PLURAL).filter(t => t !== p.tipo && existe.has(ruta(p.op, t, p.estado)))
      .map(t => [`${PLURAL[t]} ${OPS[p.op].en}${p.estado ? ' en ' + lugarTxt(p.estado) : ''}`, ruta(p.op, t, p.estado).slice(1), total(p.op, t, p.estado)]),
    otras: [
      existe.has(ruta(otraOp, p.tipo, p.estado)) && [titular(otraOp, p.tipo, p.estado), ruta(otraOp, p.tipo, p.estado).slice(1)],
      p.estado && [titular(p.op, p.tipo, null), ruta(p.op, p.tipo, null).slice(1)],
      ['Conceptos 3D: proyectos y renders del talento emergente', 'conceptos.html']
    ].filter(Boolean)
  };
  const archivo = path.join(SITIO, ruta(p.op, p.tipo, p.estado), 'index.html');
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, pagina({ ...p, filas, hermanos }));
}));

// 3) Bloque «Búsquedas populares» en la portada (enlaces internos).
const populares = paginas.filter(p => p.estado && !p.tipo).sort((a, b) => b.total - a.total).slice(0, 12)
  .concat(paginas.filter(p => p.tipo && !p.estado).sort((a, b) => b.total - a.total).slice(0, 8));
const indexRuta = path.join(SITIO, 'index.html');
const index = fs.readFileSync(indexRuta, 'utf8');
const bloque = populares.map(p => `<li><a href="${ruta(p.op, p.tipo, p.estado).slice(1)}">${esc(titular(p.op, p.tipo, p.estado))}</a></li>`).join('');
fs.writeFileSync(indexRuta, index.replace(/<!--POPULARES-->[\s\S]*?<!--\/POPULARES-->/, `<!--POPULARES-->${bloque}<!--/POPULARES-->`));

// 4) sitemap.xml: páginas públicas + búsquedas + anuncios publicados en Vivinati.
const propios = await tabla('inmuebles?select=id,actualizado&origen=eq.usuario&activo=eq.true&order=actualizado.desc&limit=5000');
const urls = [
  ['/', 'daily', '1.0'], ['/buscar.html', 'daily', '0.9'], ['/conceptos.html', 'daily', '0.8'],
  ['/publicar.html', 'monthly', '0.6'], ['/bot.html', 'yearly', '0.3'],
  ...paginas.map(p => [ruta(p.op, p.tipo, p.estado), 'daily', p.estado && p.tipo ? '0.6' : '0.7'])
].map(([u, f, pr]) => `<url><loc>${DOMINIO}${u}</loc><lastmod>${HOY}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`)
  .concat(propios.map(i => `<url><loc>${DOMINIO}/anuncio.html?id=${i.id}</loc><lastmod>${String(i.actualizado).slice(0, 10)}</lastmod><priority>0.5</priority></url>`));
fs.writeFileSync(path.join(SITIO, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);

// 5) robots.txt
fs.writeFileSync(path.join(SITIO, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /entrar.html
Disallow: /registro.html
Disallow: /restablecer.html
Disallow: /perfil.html
Disallow: /mis-anuncios.html

Sitemap: ${DOMINIO}/sitemap.xml
`);

console.log(`SEO: ${paginas.length} páginas de búsqueda, ${propios.length} anuncios propios y ${urls.length} direcciones en sitemap.xml`);
