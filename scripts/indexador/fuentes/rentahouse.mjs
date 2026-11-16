// Fuente: Rent-A-House Venezuela (rentahouse.com.ve)
// Sitemap público de fichas + datos schema.org de cada ficha.
// robots.txt pide Crawl-delay: 10. Es fuente original: gana a las copias.
import { extraerSchemaOrg } from '../schemaorg.mjs';

export const fuente = {
  nombre: 'Rent-A-House',
  host: 'https://rentahouse.com.ve',
  sitemaps: ['https://rentahouse.com.ve/sitemap-rentahouse.com.ve-property-details.xml'],
  retrasoMinimo: 10,
  prioridad: 10,
  extraer: extraerSchemaOrg
};
