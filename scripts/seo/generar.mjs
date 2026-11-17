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
const ctx = { window: { supabase: { createClient: () => nada }, addEventListener: () => {} }, matchMedia: nada, document: nada, localStorage: nada, location: nada, navigator: nada, console, URL, URLSearchParams, CustomEvent: function () {} };
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
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="#005CA7">
  <link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="icon" href="favicon.png">
  <link rel="stylesheet" href="estilos.css?v=${(fs.readFileSync(path.join(SITIO, 'index.html'), 'utf8').match(/estilos\.css\?v=(\d+)/) || [])[1] || 1}">
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body>
  <header class="cabecera">
    <div class="cabecera-int">
      <a class="marca" href="index.html" aria-label="Vivinati — inicio"><picture><source media="(max-width: 560px)" srcset="img/logo-vivinati-blanco-v2.png"><img src="img/logo-vivinati-v2.png" alt="Vivinati" width="195" height="22"></picture></a>
      <nav class="nav">
        <a href="buscar.html">Buscar</a><a href="conceptos.html">Conceptos 3D</a>
        <a href="busco.html">Busco inmueble</a>
        <a href="sobre.html">Quiénes somos</a>
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
      ['Precio del m² por zona', 'precios/'],
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

// 3b) Páginas de precios por zona: /precios/, /precios/<estado>/, /precios/<estado>/<ciudad>/
//     Mediana del precio por m² y del precio total, por tipo, en venta y alquiler (USD).
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ahora = new Date();
const periodo = `${MESES[ahora.getUTCMonth()]} ${ahora.getUTCFullYear()}`;
const versionDe = nombre => (fs.readFileSync(path.join(SITIO, 'index.html'), 'utf8').match(new RegExp(nombre.replace('.', '\\.') + '\\?v=(\\d+)')) || [])[1] || 1;

// Todos los anuncios activos con precio en USD (sin repetir: una copia por huella).
const muestras = [];
{
  const vistos = new Set();
  for (let desde = 0; ; desde += 1000) {
    const lote = await tabla(`inmuebles?select=huella,operacion,tipo,estado,ciudad,precio,metros&activo=eq.true&moneda=eq.USD&precio=gt.0&operacion=in.(venta,alquiler)&order=id&offset=${desde}&limit=1000`);
    for (const i of lote) {
      if (vistos.has(i.huella)) continue;
      vistos.add(i.huella);
      const m2 = i.metros >= 15 && i.metros <= 5000 ? i.precio / i.metros : null;
      const razonable = i.operacion === 'venta' ? (!m2 || (m2 >= 30 && m2 <= 15000)) : (!m2 || (m2 >= 0.5 && m2 <= 80));
      if (razonable) muestras.push({ ...i, m2 });
    }
    if (lote.length < 1000) break;
  }
}
const mediana = v => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const dinero = (n, dec = 0) => '$' + Number(n).toLocaleString('es-VE', { maximumFractionDigits: dec, minimumFractionDigits: dec });
function tablaPrecios(lista) {
  const filas = Object.keys(PLURAL).map(tipo => {
    const celdas = ['venta', 'alquiler'].map(op => {
      const g = lista.filter(i => i.tipo === tipo && i.operacion === op);
      const m2 = g.map(i => i.m2).filter(Boolean);
      return {
        m2: m2.length >= 3 ? mediana(m2) : null, nm2: m2.length,
        total: g.length >= 3 ? mediana(g.map(i => Number(i.precio))) : null, n: g.length
      };
    });
    return { tipo, celdas };
  }).filter(f => f.celdas.some(c => c.m2 || c.total));
  if (!filas.length) return '';
  const celda = (c, op) => `<td>${c.m2 ? `<b>${dinero(c.m2, op === 'alquiler' ? 1 : 0)}</b>/m²` : '—'}</td><td>${c.total ? dinero(c.total) + (op === 'alquiler' ? '/mes' : '') : '—'}<span class="n">${c.n ? ` · ${fmt(c.n)} anuncios` : ''}</span></td>`;
  return `<div class="tabla-precios-env"><table class="tabla-precios">
    <thead><tr><th rowspan="2">Tipo</th><th colspan="2">En venta</th><th colspan="2">En alquiler (al mes)</th></tr>
    <tr><th>Precio por m²</th><th>Precio típico</th><th>Por m²</th><th>Alquiler típico</th></tr></thead>
    <tbody>${filas.map(f => `<tr><th>${esc(PLURAL[f.tipo])}</th>${celda(f.celdas[0], 'venta')}${celda(f.celdas[1], 'alquiler')}</tr>`).join('')}</tbody>
  </table></div>`;
}
function paginaPrecios({ titulo, h1, desc, url, migas, intro, tabla: t, enlaces }) {
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: migas.map(([n, u], k) => ({ '@type': 'ListItem', position: k + 1, name: n, item: DOMINIO + u })) };
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="/">
  <title>${esc(titulo)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${DOMINIO}${url}">
  <meta property="og:site_name" content="Vivinati">
  <meta property="og:title" content="${esc(h1)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${DOMINIO}${url}">
  <meta property="og:image" content="${DOMINIO}/img/og-vivinati.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="#005CA7">
  <link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="estilos.css?v=${versionDe('estilos.css')}">
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body>
  <header class="cabecera">
    <div class="cabecera-int">
      <a class="marca" href="index.html" aria-label="Vivinati — inicio"><picture><source media="(max-width: 560px)" srcset="img/logo-vivinati-blanco-v2.png"><img src="img/logo-vivinati-v2.png" alt="Vivinati" width="195" height="22"></picture></a>
      <nav class="nav">
        <a href="buscar.html">Buscar</a><a href="conceptos.html">Conceptos 3D</a>
        <a href="busco.html">Busco inmueble</a>
        <a href="sobre.html">Quiénes somos</a>
        <span data-nav-sesion></span>
        <a class="boton peq" href="publicar.html">Publicar gratis</a>
      </nav>
    </div>
  </header>
  <main class="contenedor seo-pagina">
    <nav class="migas" aria-label="Estás en">${migas.map(([n, u], k) => k === migas.length - 1 ? `<span>${esc(n)}</span>` : `<a href="${u.slice(1)}">${esc(n)}</a>`).join(' › ')}</nav>
    <h1>${esc(h1)}</h1>
    <p class="seo-intro">${intro}</p>
    ${t || '<p>Aún no hay suficientes anuncios con precio y metros para calcular una referencia fiable.</p>'}
    <p class="aviso">Medianas calculadas cada día con los anuncios activos en Vivinati que indican precio en dólares
      (y metros, para el precio por m²). Mostramos una cifra solo si hay al menos 3 anuncios. Es una referencia, no una tasación.</p>
    ${enlaces}
  </main>
  <footer class="pie"></footer>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>
  <script src="comun.js?v=${versionDe('comun.js')}"></script>
  <script>DP.cabecera();</script>
</body>
</html>
`;
}
const paginasPrecios = [];
{
  const escribir = (url, html) => {
    const archivo = path.join(SITIO, url, 'index.html');
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, html);
    paginasPrecios.push(url);
  };
  fs.rmSync(path.join(SITIO, 'precios'), { recursive: true, force: true });
  const porEstado = {};
  for (const i of muestras) (porEstado[i.estado] ||= []).push(i);
  const estadosOrden = Object.entries(porEstado).filter(([, v]) => v.length >= 5).sort((a, b) => b[1].length - a[1].length);
  const listaEnlaces = (t, l) => l.length ? `<section class="seo-enlaces"><h2>${esc(t)}</h2><ul>${l.map(([n, u, c]) =>
    `<li><a href="${u.slice(1)}">${esc(n)}</a>${c ? ` <span>${fmt(c)}</span>` : ''}</li>`).join('')}</ul></section>` : '';
  const estadosEnlaces = estadosOrden.map(([e, v]) => [`Precios en ${lugarTxt(e)}`, `/precios/${slug(e)}/`, v.length]);

  // Venezuela
  escribir('/precios/', paginaPrecios({
    titulo: `Precio del m² en Venezuela por estado · ${periodo} — Vivinati`,
    h1: `Precio del metro cuadrado en Venezuela · ${periodo}`,
    desc: `¿Cuánto cuesta el m² en Venezuela? Precio por m² y precio típico de apartamentos, casas, locales y terrenos en venta y alquiler, por estado. Datos de ${fmt(muestras.length)} anuncios, actualizados cada día.`,
    url: '/precios/', migas: [['Inicio', '/'], ['Precios por zona', '/precios/']],
    intro: `Referencias de precio calculadas con <b>${fmt(muestras.length)}</b> anuncios activos de inmobiliarias y particulares de todo el país. Elige un estado para ver el detalle por ciudad.`,
    tabla: tablaPrecios(muestras),
    enlaces: listaEnlaces('Precios por estado', estadosEnlaces)
  }));
  // Estados y ciudades
  for (const [estado, lista] of estadosOrden) {
    const porCiudad = {};
    for (const i of lista) if (i.ciudad) (porCiudad[i.ciudad] ||= []).push(i);
    const ciudades = Object.entries(porCiudad).filter(([, v]) => v.length >= 10).sort((a, b) => b[1].length - a[1].length);
    const ciudadesEnlaces = ciudades.map(([c, v]) => [`Precios en ${c}`, `/precios/${slug(estado)}/${slug(c)}/`, v.length]);
    const buscarEn = Object.keys(OPS).filter(op => existe.has(ruta(op, null, estado))).map(op => [titular(op, null, estado), ruta(op, null, estado)]);
    escribir(`/precios/${slug(estado)}/`, paginaPrecios({
      titulo: `Precio del m² en ${lugarTxt(estado)} · ${periodo} — Vivinati`,
      h1: `Precio del metro cuadrado en ${lugarTxt(estado)} · ${periodo}`,
      desc: `Precio por m² y precio típico de apartamentos, casas y locales en venta y alquiler en ${lugarTxt(estado)}. Calculado con ${fmt(lista.length)} anuncios, actualizado cada día.`,
      url: `/precios/${slug(estado)}/`, migas: [['Inicio', '/'], ['Precios por zona', '/precios/'], [lugarTxt(estado), `/precios/${slug(estado)}/`]],
      intro: `Referencias de precio en ${esc(lugarTxt(estado))} calculadas con <b>${fmt(lista.length)}</b> anuncios activos.`,
      tabla: tablaPrecios(lista),
      enlaces: listaEnlaces('Por ciudad o municipio', ciudadesEnlaces) + listaEnlaces('Ver los anuncios', buscarEn) +
        listaEnlaces('Otros estados', estadosEnlaces.filter(([, u]) => u !== `/precios/${slug(estado)}/`))
    }));
    for (const [ciudad, lc] of ciudades) {
      const url = `/precios/${slug(estado)}/${slug(ciudad)}/`;
      escribir(url, paginaPrecios({
        titulo: `Precio del m² en ${ciudad}, ${estado} · ${periodo} — Vivinati`,
        h1: `Precio del metro cuadrado en ${ciudad} · ${periodo}`,
        desc: `¿Cuánto cuesta el m² en ${ciudad} (${estado})? Precio por m² y precio típico de inmuebles en venta y alquiler, con ${fmt(lc.length)} anuncios. Actualizado cada día.`,
        url, migas: [['Inicio', '/'], ['Precios por zona', '/precios/'], [lugarTxt(estado), `/precios/${slug(estado)}/`], [ciudad, url]],
        intro: `Referencias de precio en ${esc(ciudad)} (${esc(estado)}) calculadas con <b>${fmt(lc.length)}</b> anuncios activos.`,
        tabla: tablaPrecios(lc),
        enlaces: listaEnlaces(`Otras ciudades de ${lugarTxt(estado)}`, ciudadesEnlaces.filter(([, u]) => u !== url)) + listaEnlaces('Ver los anuncios', buscarEn)
      }));
    }
  }
}

// 4) sitemap.xml: páginas públicas + búsquedas + anuncios publicados en Vivinati.
const propios = await tabla('inmuebles?select=id,actualizado&origen=eq.usuario&activo=eq.true&order=actualizado.desc&limit=5000');
const urls = [
  ['/', 'daily', '1.0'], ['/buscar.html', 'daily', '0.9'], ['/conceptos.html', 'daily', '0.8'],
  ['/publicar.html', 'monthly', '0.6'], ['/bot.html', 'yearly', '0.3'], ['/condiciones.html', 'yearly', '0.3'],
  ['/sobre.html', 'yearly', '0.4'], ['/contacto.html', 'yearly', '0.4'], ['/seguridad.html', 'monthly', '0.5'], ['/busco.html', 'daily', '0.6'], ['/privacidad.html', 'yearly', '0.3'],
  ...paginas.map(p => [ruta(p.op, p.tipo, p.estado), 'daily', p.estado && p.tipo ? '0.6' : '0.7']),
  ...paginasPrecios.map(u => [u, 'weekly', '0.6'])
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
Disallow: /baja.html

Sitemap: ${DOMINIO}/sitemap.xml
`);

console.log(`SEO: ${paginas.length} páginas de búsqueda, ${propios.length} anuncios propios y ${urls.length} direcciones en sitemap.xml`);
