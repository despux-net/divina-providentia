// Lector común de anuncios en formato schema.org (JSON-LD «RealEstateListing»),
// el formato que los portales publican para Google y otros buscadores.
// Admite las dos formas que hemos visto:
//  - Rent-A-House: datos de la vivienda dentro de «about».
//  - HabitaOne: @type ["RealEstateListing","Apartment"] con todo arriba y «geo».

const ESTADOS = {
  'distrito metropolitano': 'Distrito Capital', 'distrito capital': 'Distrito Capital',
  'la gran caracas': 'Distrito Capital', 'caracas': 'Distrito Capital',
  'amazonas': 'Amazonas', 'anzoategui': 'Anzoátegui', 'apure': 'Apure', 'aragua': 'Aragua',
  'barinas': 'Barinas', 'bolivar': 'Bolívar', 'carabobo': 'Carabobo', 'cojedes': 'Cojedes',
  'delta amacuro': 'Delta Amacuro', 'falcon': 'Falcón', 'guarico': 'Guárico',
  'la guaira': 'La Guaira', 'vargas': 'La Guaira', 'lara': 'Lara', 'merida': 'Mérida',
  'miranda': 'Miranda', 'monagas': 'Monagas', 'nueva esparta': 'Nueva Esparta',
  'portuguesa': 'Portuguesa', 'sucre': 'Sucre', 'tachira': 'Táchira', 'trujillo': 'Trujillo',
  'yaracuy': 'Yaracuy', 'zulia': 'Zulia'
};

// Palabra (del enlace, del tipo schema.org o de «Tipo de propiedad») → nuestro tipo.
const TIPOS = {
  apartamento: 'apartamento', apartment: 'apartamento', penthouse: 'apartamento', estudio: 'apartamento',
  casa: 'casa', house: 'casa', singlefamilyresidence: 'casa', quinta: 'casa', chalet: 'casa',
  townhouse: 'townhouse', anexo: 'anexo', habitacion: 'habitacion', room: 'habitacion',
  terreno: 'terreno', parcela: 'terreno', finca: 'terreno', hacienda: 'terreno', lote: 'terreno',
  local: 'local', comercial: 'local', negocio: 'local', fondo: 'local',
  oficina: 'oficina', consultorio: 'oficina', galpon: 'galpon', deposito: 'galpon', edificio: 'otro'
};

// Ciudades y municipios frecuentes → estado (para fuentes que no dan el estado).
const CIUDADES = {
  'caracas': 'Distrito Capital', 'libertador': 'Distrito Capital',
  'baruta': 'Miranda', 'chacao': 'Miranda', 'el hatillo': 'Miranda', 'los teques': 'Miranda',
  'guarenas': 'Miranda', 'guatire': 'Miranda', 'charallave': 'Miranda', 'ocumare del tuy': 'Miranda',
  'san antonio de los altos': 'Miranda', 'higuerote': 'Miranda', 'cua': 'Miranda', 'santa teresa del tuy': 'Miranda',
  'valencia': 'Carabobo', 'naguanagua': 'Carabobo', 'san diego': 'Carabobo', 'guacara': 'Carabobo',
  'puerto cabello': 'Carabobo', 'los guayos': 'Carabobo', 'tocuyito': 'Carabobo',
  'maracay': 'Aragua', 'turmero': 'Aragua', 'la victoria': 'Aragua', 'cagua': 'Aragua',
  'maracaibo': 'Zulia', 'cabimas': 'Zulia', 'ciudad ojeda': 'Zulia', 'san francisco': 'Zulia',
  'barquisimeto': 'Lara', 'cabudare': 'Lara', 'carora': 'Lara',
  'merida': 'Mérida', 'el vigia': 'Mérida', 'san cristobal': 'Táchira', 'tariba': 'Táchira',
  'puerto ordaz': 'Bolívar', 'ciudad guayana': 'Bolívar', 'ciudad bolivar': 'Bolívar', 'san felix': 'Bolívar',
  'barcelona': 'Anzoátegui', 'lecheria': 'Anzoátegui', 'puerto la cruz': 'Anzoátegui', 'el tigre': 'Anzoátegui',
  'maturin': 'Monagas', 'porlamar': 'Nueva Esparta', 'pampatar': 'Nueva Esparta', 'margarita': 'Nueva Esparta',
  'cumana': 'Sucre', 'carupano': 'Sucre', 'coro': 'Falcón', 'punto fijo': 'Falcón', 'tucacas': 'Falcón',
  'chichiriviche': 'Falcón', 'acarigua': 'Portuguesa', 'araure': 'Portuguesa', 'guanare': 'Portuguesa',
  'san felipe': 'Yaracuy', 'valera': 'Trujillo', 'san juan de los morros': 'Guárico', 'calabozo': 'Guárico',
  'catia la mar': 'La Guaira', 'macuto': 'La Guaira', 'caraballeda': 'La Guaira',
  'tinaquillo': 'Cojedes', 'tucupita': 'Delta Amacuro', 'puerto ayacucho': 'Amazonas', 'san fernando de apure': 'Apure'
};

// Capitales aproximadas (igual que site/comun.js) para el estado más cercano a unas coordenadas.
const CAPITALES = {
  'Amazonas': [5.66, -67.62], 'Anzoátegui': [10.13, -64.68], 'Apure': [7.89, -67.47], 'Aragua': [10.25, -67.60],
  'Barinas': [8.62, -70.21], 'Bolívar': [8.12, -63.55], 'Carabobo': [10.16, -68.00], 'Cojedes': [9.66, -68.58],
  'Delta Amacuro': [9.06, -62.05], 'Distrito Capital': [10.49, -66.88], 'Falcón': [11.40, -69.67],
  'Guárico': [9.91, -67.35], 'La Guaira': [10.60, -66.93], 'Lara': [10.07, -69.32], 'Mérida': [8.59, -71.15],
  'Miranda': [10.34, -66.70], 'Monagas': [9.75, -63.18], 'Nueva Esparta': [10.96, -63.85], 'Portuguesa': [9.04, -69.74],
  'Sucre': [10.46, -64.17], 'Táchira': [7.77, -72.22], 'Trujillo': [9.37, -70.44], 'Yaracuy': [10.34, -68.74], 'Zulia': [10.65, -71.64]
};

// Busca un estado o ciudad conocida dentro de los textos dados (en orden).
export function estadoDe(...textos) {
  for (const t of textos) {
    const x = ' ' + sinAcentos(t).replace(/[^a-z]+/g, ' ') + ' ';
    for (const [k, v] of Object.entries(ESTADOS)) if (x.includes(` ${k} `)) return v;
    for (const [k, v] of Object.entries(CIUDADES)) if (x.includes(` ${k} `)) return v;
  }
  return null;
}

export function estadoMasCercano(lat, lng) {
  if (lat == null || lng == null) return null;
  let mejor = null, d = Infinity;
  for (const [e, [a, b]] of Object.entries(CAPITALES)) {
    const x = (a - lat) ** 2 + (b - lng) ** 2;
    if (x < d) { d = x; mejor = e; }
  }
  return mejor;
}

// Fotos que se guardan de cada anuncio externo; el resto se ven en el original.
export const MAX_FOTOS = 8;

export const sinAcentos = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function bloquesJsonLd(html) {
  const salida = [];
  for (const [, json] of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const x = JSON.parse(json);
      for (const it of Array.isArray(x) ? x : x['@graph'] || [x]) salida.push(it);
    } catch { /* bloque roto: se ignora */ }
  }
  return salida;
}

export function operacionDe(...pistas) {
  for (const p of pistas) {
    const x = sinAcentos(p);
    const alquiler = /leaseout|\blease\b|alquiler|arriendo|\brenta\b/.test(x);
    const venta = /#sell\b|\bsell\b|venta|vendo|se vende/.test(x);
    if (alquiler && !venta) return 'alquiler';
    if (venta && !alquiler) return 'venta';
  }
  return null;
}

const esListado = it => [].concat(it['@type'] || []).includes('RealEstateListing');
// Algunas webs describen la vivienda directamente (sin «RealEstateListing»).
const VIVIENDAS = ['SingleFamilyResidence', 'House', 'Apartment', 'Residence', 'Accommodation'];
const esVivienda = it => [].concat(it['@type'] || []).some(t => VIVIENDAS.includes(t)) && it.address && it.name;

function tipoDe(...pistas) {
  for (const p of pistas) {
    for (const palabra of sinAcentos(p).split(/[^a-z]+/)) if (TIPOS[palabra]) return TIPOS[palabra];
  }
  return 'otro';
}

export function extraerSchemaOrg(html, url) {
  const bloques = bloquesJsonLd(html);
  const d = bloques.find(esListado) || bloques.find(esVivienda);
  if (!d) return null;

  const about = d.about || {};
  const casa = { ...d, ...about };            // los datos pueden estar arriba o en «about»
  const dir = casa.address || {};
  const oferta = [].concat(d.offers || [])[0] || {};
  const extra = Object.fromEntries([].concat(d.additionalProperty || [])
    .map(p => [sinAcentos(p.name), p.value]));
  const slug = decodeURIComponent(new URL(url).pathname).toLowerCase();

  const estado = ESTADOS[sinAcentos(dir.addressRegion)] || estadoDe(dir.addressRegion, dir.addressLocality);
  const tipos = [].concat(casa['@type'] || []).filter(t => t !== 'RealEstateListing');
  const tipo = tipoDe(extra['tipo de propiedad'], slug.split('/').pop().split(/[_-]/)[0], ...tipos, d.name);
  // La operación sale de la pista más fiable que la diga: oferta, propiedad
  // «Tipo de operación», enlace, título y, por último, inicio de la descripción.
  const operacion = operacionDe(oferta.businessFunction, extra['tipo de operacion'], slug, d.name,
    String(d.description || '').slice(0, 120));
  if (!estado || !operacion || !d.name) return null;

  const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const entero = v => { const n = num(v); return n != null && n >= 0 && n <= 50 ? Math.round(n) : null; };
  const precio = num(oferta.price);
  const moneda = String(oferta.priceCurrency || 'USD').toUpperCase();
  const metros = num(casa.floorSize && casa.floorSize.value);
  const imagenes = [].concat(d.image || []).map(i => (typeof i === 'string' ? i : i && (i.contentUrl || i.url)));

  const geo = casa.geo || {};
  let lat = num(geo.latitude), lng = num(geo.longitude);
  if (lat == null || lng == null || lat < 0 || lat > 13 || lng < -74 || lng > -59) { lat = null; lng = null; }

  // Solo un fragmento de la descripción y hasta MAX_FOTOS fotos (como hace un
  // buscador): el texto completo y la galería entera están en el original.
  let resumen = String(d.description || '').replace(/[*#_]+/g, '').replace(/\s+/g, ' ').trim();
  if (resumen.length > 300) resumen = resumen.slice(0, 297).replace(/\s+\S*$/, '') + '…';

  const zona = (casa.containedInPlace && casa.containedInPlace.name) || dir.streetAddress;
  const fotosValidas = [...new Set(imagenes.filter(u => /^https:\/\//.test(u || '')))];

  return {
    titulo: String(d.name).slice(0, 120),
    descripcion: resumen || null,
    operacion,
    tipo,
    precio: precio != null && precio > 0 ? precio : null,
    moneda: moneda === 'VES' || moneda === 'VEF' ? 'VES' : 'USD',
    estado,
    ciudad: dir.addressLocality ? String(dir.addressLocality).slice(0, 60) : null,
    zona: zona ? String(zona).slice(0, 80) : null,
    habitaciones: entero(casa.numberOfBedrooms ?? casa.numberOfRooms),
    banos: entero(casa.numberOfBathroomsTotal),
    metros: metros != null && metros > 0 && metros < 1e8 ? metros : null,
    lat, lng,
    fotos: fotosValidas.slice(0, MAX_FOTOS),
    fotos_total: fotosValidas.length || null,
    fuente_modificado: d.dateModified || d.datePosted || null
  };
}
