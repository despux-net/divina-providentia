// Fuentes hechas con la plataforma Wasi (redes inmobiliarias venezolanas).
// robots.txt de estas webs permite todo salvo /get-pdf/ y no pide pausa;
// usamos 5 s por cortesía. Sus fichas traen un JSON-LD sencillo
// (@type "house"/"apartment"... con geo y habitaciones) y el precio va en og:title:
//   «VENTA - CASA - LA TRINIDAD - BARUTA - US$230,000 USD»
// Enlaces del tipo /casa-venta-la-trinidad-caracas/10546909
import { sinAcentos, operacionDe, estadoDe, estadoMasCercano } from '../schemaorg.mjs';

const TIPOS = {
  apartamento: 'apartamento', apartaestudio: 'apartamento', penthouse: 'apartamento',
  casa: 'casa', quinta: 'casa', townhouse: 'townhouse', anexo: 'anexo', habitacion: 'habitacion',
  terreno: 'terreno', lote: 'terreno', finca: 'terreno', hacienda: 'terreno', parcela: 'terreno',
  local: 'local', comercial: 'local', oficina: 'oficina', consultorio: 'oficina',
  galpon: 'galpon', bodega: 'galpon', edificio: 'otro', hoteles: 'otro', hotel: 'otro'
};

const textoPlano = h => String(h || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&([a-z])(acute|tilde|uml);/gi, '$1')
  .replace(/\s+/g, ' ').trim();

function meta(html, prop) {
  const m = html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`));
  return m ? textoPlano(m[1]) : null;
}

function extraer(html, url) {
  let d = null;
  for (const [, b] of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const x = JSON.parse(b);
      if (x.url && x.name && x['@type'] !== 'RealEstateAgent') { d = x; break; }
    } catch { /* bloque roto */ }
  }
  if (!d) return null;

  const ruta = new URL(url).pathname.split('/').filter(Boolean);   // [slug, id]
  const slug = sinAcentos(ruta[0] || '');
  const partes = slug.split('-');
  const titulo = textoPlano(d.name);                                 // «VENTA - CASA - LA TRINIDAD - BARUTA»
  const trozos = titulo.split(/\s+-\s+/);
  const ogTitulo = meta(html, 'og:title') || '';

  const operacion = operacionDe(slug.replace(/-/g, ' '), titulo);
  const tipo = TIPOS[partes[0]] || TIPOS[sinAcentos(d['@type'])] || 'otro';

  const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  let lat = num(d.geo && d.geo.latitude), lng = num(d.geo && d.geo.longitude);
  if (lat == null || lng == null || lat < 0 || lat > 13 || lng < -74 || lng > -59) { lat = null; lng = null; }

  // Estado: municipio del título, ciudad del enlace, dirección; si no, el más cercano a las coordenadas.
  const ciudadSlug = partes[partes.length - 1];
  const estado = estadoDe(trozos[trozos.length - 1], trozos.slice(2).join(' '), ciudadSlug, d.address) || estadoMasCercano(lat, lng);
  if (!estado || !operacion) return null;

  const precioTxt = (ogTitulo.match(/(US\$|Bs\.?|\$)\s*([\d.,]+)/i) || []);
  const precio = precioTxt[2] ? Number(precioTxt[2].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')) : null;
  const moneda = /^Bs/i.test(precioTxt[1] || '') ? 'VES' : 'USD';

  let resumen = textoPlano(d.description);
  if (resumen.length > 300) resumen = resumen.slice(0, 297).replace(/\s+\S*$/, '') + '…';

  // El título es texto libre del agente; si viene todo en mayúsculas, se suaviza.
  const limpio = titulo.replace(/\s+/g, ' ').trim();
  const bonito = limpio === limpio.toUpperCase()
    ? limpio.toLowerCase().replace(/^./, c => c.toUpperCase())
    : limpio;

  const habitaciones = num(d.numberOfRooms);
  const imagen = meta(html, 'og:image');

  return {
    titulo: bonito.slice(0, 120),
    descripcion: resumen || null,
    operacion,
    tipo,
    precio: precio && precio > 0 && precio < 1e10 ? precio : null,
    moneda,
    estado,
    ciudad: ciudadSlug ? ciudadSlug.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 60) : null,
    // Zona: lo que hay en el enlace entre la operación y la ciudad (…-venta-la-trinidad-caracas).
    zona: zonaDe(partes),
    habitaciones: habitaciones != null && habitaciones >= 0 && habitaciones <= 50 ? Math.round(habitaciones) : null,
    banos: null,
    metros: null, // el campo floorSize de Wasi no es fiable (sale «2» en casas)
    lat, lng,
    // Wasi carga la galería con JavaScript: en la página solo está la foto principal.
    fotos: imagen && /^https:\/\//.test(imagen) ? [imagen] : [],
    fotos_total: null,
    fuente_modificado: null
  };
}

function zonaDe(partes) {
  const i = partes.findIndex(p => p === 'venta' || p === 'alquiler');
  const z = i >= 0 ? partes.slice(i + 1, -1).join(' ') : '';
  return z ? z.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 80) : null;
}

const wasi = (nombre, host, minimoSitemap = 100) => ({
  nombre, host,
  sitemaps: [`${host}/sitemap.xml`],
  // Sus sitemaps no dicen cuándo cambió cada ficha: se revisan las conocidas cada 14 días.
  revisarCadaDias: 14,
  retrasoMinimo: 5,
  prioridad: 5,
  // Por debajo de esto el sitemap se considera roto y no se desactiva nada.
  minimoSitemap,
  extraer
});

// Webs de inmobiliarias venezolanas hechas con Wasi (pie «Powered by: wasi.co»).
// Todas tienen robots.txt abierto y un sitemap con sus fichas.
// Para añadir otra: comprobar robots.txt, que /sitemap.xml liste fichas
// (…/tipo-operacion-zona-ciudad/12345) y que extraer() las lea.
export const WASI = [
  wasi('RIV', 'https://inmuebles.riv.ve'),
  wasi('Bolsa Inmobiliaria Caracas', 'https://bolsainmobiliariacaracas.com'),
  wasi('RE/MAX Habitat', 'https://remaxhabitat.com'),
  wasi('RE/MAX VIP Las Mercedes', 'https://remaxviplasmercedes.com'),
  wasi('RE/MAX Atlas', 'https://remax-atlas.com', 20),
  wasi('Noguera Inmuebles', 'https://noguerainmuebles.com', 15)
];
export const [riv, bolsaCaracas] = WASI;
