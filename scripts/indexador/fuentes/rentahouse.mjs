// Fuente: Rent-A-House Venezuela (rentahouse.com.ve)
// Usa su sitemap público de fichas y los datos schema.org (JSON-LD
// «RealEstateListing») que la propia web publica para los buscadores.

export const fuente = {
  nombre: 'Rent-A-House',
  host: 'https://rentahouse.com.ve',
  sitemap: 'https://rentahouse.com.ve/sitemap-rentahouse.com.ve-property-details.xml',
  retrasoMinimo: 10,
  extraer
};

// Región que usa la fuente → estado de nuestra lista (site/comun.js).
const ESTADOS = {
  'distrito metropolitano': 'Distrito Capital', 'distrito capital': 'Distrito Capital',
  'amazonas': 'Amazonas', 'anzoategui': 'Anzoátegui', 'apure': 'Apure', 'aragua': 'Aragua',
  'barinas': 'Barinas', 'bolivar': 'Bolívar', 'carabobo': 'Carabobo', 'cojedes': 'Cojedes',
  'delta amacuro': 'Delta Amacuro', 'falcon': 'Falcón', 'guarico': 'Guárico',
  'la guaira': 'La Guaira', 'vargas': 'La Guaira', 'lara': 'Lara', 'merida': 'Mérida',
  'miranda': 'Miranda', 'monagas': 'Monagas', 'nueva esparta': 'Nueva Esparta',
  'portuguesa': 'Portuguesa', 'sucre': 'Sucre', 'tachira': 'Táchira', 'trujillo': 'Trujillo',
  'yaracuy': 'Yaracuy', 'zulia': 'Zulia'
};

// Primera palabra del enlace (apartamento_en_venta_en_…) → nuestro tipo.
const TIPOS = {
  apartamento: 'apartamento', casa: 'casa', quinta: 'casa', townhouse: 'townhouse',
  anexo: 'anexo', habitacion: 'habitacion', terreno: 'terreno', parcela: 'terreno',
  finca: 'terreno', hacienda: 'terreno', local: 'local', comercial: 'local',
  oficina: 'oficina', galpon: 'galpon', edificio: 'otro', consultorio: 'oficina'
};

const sinAcentos = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function extraer(html, url) {
  const bloques = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let d = null;
  for (const [, json] of bloques) {
    try {
      const x = JSON.parse(json);
      if (x['@type'] === 'RealEstateListing') { d = x; break; }
    } catch { /* bloque roto: se ignora */ }
  }
  if (!d) return null;

  const about = d.about || {};
  const dir = about.address || {};
  const oferta = d.offers || {};
  const slug = new URL(url).pathname.slice(1).toLowerCase();

  const estado = ESTADOS[sinAcentos(dir.addressRegion)];
  const tipo = TIPOS[slug.split('_')[0]] || 'otro';
  const fn = String(oferta.businessFunction || '');
  const operacion = /LeaseOut|Lease/i.test(fn) || slug.includes('_en_alquiler_') ? 'alquiler'
    : /Sell/i.test(fn) || slug.includes('_en_venta_') ? 'venta' : null;
  if (!estado || !operacion || !d.name) return null;

  const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const entero = v => { const n = num(v); return n != null && n >= 0 && n <= 50 ? Math.round(n) : null; };
  const precio = num(oferta.price);
  const moneda = String(oferta.priceCurrency || 'USD').toUpperCase();
  const metros = num(about.floorSize && about.floorSize.value);
  const imagenes = Array.isArray(d.image) ? d.image : d.image ? [d.image] : [];

  // Solo un fragmento de la descripción (como hace un buscador): el texto
  // completo y el resto de fotos están en el anuncio original.
  let resumen = String(d.description || '').replace(/\s+/g, ' ').trim();
  if (resumen.length > 300) resumen = resumen.slice(0, 297).replace(/\s+\S*$/, '') + '…';

  return {
    titulo: String(d.name).slice(0, 120),
    descripcion: resumen || null,
    operacion,
    tipo,
    precio: precio != null && precio > 0 ? precio : null,
    moneda: moneda === 'VES' || moneda === 'VEF' ? 'VES' : 'USD',
    estado,
    ciudad: dir.addressLocality ? String(dir.addressLocality).slice(0, 60) : null,
    zona: about.containedInPlace && about.containedInPlace.name ? String(about.containedInPlace.name).slice(0, 80) : null,
    habitaciones: entero(about.numberOfBedrooms ?? about.numberOfRooms),
    banos: entero(about.numberOfBathroomsTotal),
    metros: metros != null && metros > 0 && metros < 1e8 ? metros : null,
    fotos: imagenes.filter(u => /^https:\/\//.test(u)).slice(0, 1),
    fuente_modificado: d.dateModified || d.datePosted || null
  };
}
