// Fuente: ZonaVen (zonaven.com), portal venezolano con anuncios de agentes
// y particulares. robots.txt permite las fichas; sitemaps con fecha de cambio.
// Publica schema.org «RealEstateListing» (con geo, precio y galería).
// Sus descripciones traen el WhatsApp del agente: indexar.mjs lo quita.
import { extraerSchemaOrg } from '../schemaorg.mjs';

export const fuente = {
  nombre: 'ZonaVen',
  host: 'https://zonaven.com',
  indiceSitemaps: 'https://zonaven.com/sitemap.xml',
  filtroSitemaps: /sitemap-listings-\d+\.xml$/,
  filtroFichas: /^https:\/\/zonaven\.com\/(venta|alquiler)\/[^/]+$/,
  retrasoMinimo: 5,
  prioridad: 4,
  galeria: true,
  extraer: extraerSchemaOrg
};
