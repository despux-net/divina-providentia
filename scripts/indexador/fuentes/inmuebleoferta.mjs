// Fuente: Inmueble Oferta (inmuebleoferta.com.ve), WordPress con sitemaps por tipo.
// robots.txt solo cierra /wp-admin/ y no pide pausa; usamos 5 s por cortesía.
// Publica schema.org «RealEstateListing» estándar.
import { extraerSchemaOrg } from '../schemaorg.mjs';

export const fuente = {
  nombre: 'Inmueble Oferta',
  host: 'https://inmuebleoferta.com.ve',
  indiceSitemaps: 'https://inmuebleoferta.com.ve/sitemap_index.xml',
  filtroSitemaps: /property-sitemap\d*\.xml$/,
  retrasoMinimo: 5,
  prioridad: 5,
  galeria: true, // publica todas sus fotos en schema.org: guardamos hasta 8
  extraer: extraerSchemaOrg
};
