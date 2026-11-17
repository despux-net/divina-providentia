// Fuente: ViveVen (viveven.com), portal venezolano. robots.txt solo cierra
// /admin, /api, /dashboard y /pagar. El sitemap mezcla páginas y fichas:
// nos quedamos con /propiedad/<id>. Publica schema.org «RealEstateListing».
import { extraerSchemaOrg } from '../schemaorg.mjs';

export const fuente = {
  nombre: 'ViveVen',
  host: 'https://viveven.com',
  sitemaps: ['https://viveven.com/sitemap.xml'],
  filtroFichas: /^https:\/\/viveven\.com\/propiedad\/[0-9a-f-]{36}$/,
  revisarCadaDias: 7,
  retrasoMinimo: 5,
  prioridad: 4,
  minimoSitemap: 20,
  galeria: true,
  extraer: extraerSchemaOrg
};
