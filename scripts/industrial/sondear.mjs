// Revisa la web de cada proveedor candidato (una sola visita, despacio):
// robots.txt, plataforma (Shopify / WooCommerce / otra), cuántas fichas de
// producto tiene en su sitemap y qué catálogos PDF enlaza. No guarda nada:
// imprime un JSON para decidir qué se indexa y qué va al directorio.
//   node scripts/industrial/sondear.mjs dominio1 dominio2 … > sondeo.json
import { leerRobots } from '../indexador/robots.mjs';

const UA = 'Mozilla/5.0 (compatible; VivinatiBot/1.0; +https://vivinati.com/realestate/bot.html)';
const dormir = ms => new Promise(r => setTimeout(r, ms));
async function pedir(url, ms = 20000) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
    return { estado: r.status, url: r.url, tipo: r.headers.get('content-type') || '', texto: r.status === 200 ? await r.text() : '' };
  } catch (e) { return { estado: 0, url, tipo: '', texto: '', error: e.message }; }
}
const locs = xml => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
const PRODUCTO = /\/(producto|productos|product|products|tienda|shop|item|articulo)s?\/[^/?#]+\/?$/i;

async function sondear(dominio) {
  const base = /^https?:\/\//.test(dominio) ? dominio.replace(/\/$/, '') : `https://${dominio}`;
  const out = { dominio, base, problemas: [] };
  const portada = await pedir(base + '/');
  out.estado = portada.estado;
  if (portada.estado !== 200) { out.problemas.push(`portada ${portada.estado} ${portada.error || ''}`); return out; }
  out.base = new URL(portada.url).origin;
  out.titulo = (portada.texto.match(/<title[^>]*>([^<]{0,140})/i) || [])[1]?.trim();
  out.descripcion = (portada.texto.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,300})/i) || [])[1];
  out.venezuela = /venezuela|caracas|valencia|maracaibo|maracay|barquisimeto|carabobo|zulia|miranda|lara|aragua|anzo[aá]tegui|bol[ií]var/i.test(portada.texto);
  const rob = await pedir(out.base + '/robots.txt');
  const robots = leerRobots(rob.estado === 200 ? rob.texto : '', 'VivinatiBot');
  out.robotsPermite = robots.permitido(out.base + '/');
  out.shopify = /cdn\.shopify\.com|Shopify\.theme/i.test(portada.texto);
  out.woocommerce = /woocommerce|wp-content\/plugins\/woocommerce/i.test(portada.texto);
  out.wordpress = /wp-content|wp-includes/i.test(portada.texto);

  // Sitemaps
  const sitemaps = [...rob.texto.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(m => m[1]);
  for (const s of ['/sitemap.xml', '/sitemap_index.xml', '/product-sitemap.xml', '/wp-sitemap.xml']) if (!sitemaps.includes(out.base + s)) sitemaps.push(out.base + s);
  const urls = new Set(), vistos = new Set();
  for (let i = 0; i < sitemaps.length && vistos.size < 12; i++) {
    const sm = sitemaps[i];
    if (vistos.has(sm)) continue;
    vistos.add(sm);
    const r = await pedir(sm);
    if (r.estado !== 200 || !/<(urlset|sitemapindex)/.test(r.texto)) continue;
    for (const l of locs(r.texto)) {
      if (/\.xml(\?|$)/.test(l)) { if (/product|producto|page|post-type|sitemap/i.test(l) && !sitemaps.includes(l)) sitemaps.push(l); }
      else urls.add(l);
    }
    await dormir(800);
  }
  const productos = [...urls].filter(u => PRODUCTO.test(u) && robots.permitido(u));
  out.urlsSitemap = urls.size;
  out.fichasProducto = productos.length;
  out.ejemplos = productos.slice(0, 3);

  // Shopify / WooCommerce Store API
  if (out.shopify) {
    const r = await pedir(out.base + '/products.json?limit=1');
    out.shopifyProductosJson = r.estado === 200 && /"products"/.test(r.texto);
  }
  if (out.wordpress) {
    const r = await pedir(out.base + '/wp-json/wc/store/v1/products?per_page=1');
    out.wooStoreApi = r.estado === 200 && r.texto.trim().startsWith('[') && r.texto.length > 5;
    out.wooTotal = out.wooStoreApi ? null : undefined;
  }
  // Una ficha de ejemplo: ¿tiene schema.org Product?
  if (productos[0]) {
    const r = await pedir(productos[0]);
    out.fichaSchemaProduct = /"@type"\s*:\s*"Product"/.test(r.texto);
    out.fichaPrecio = /"price"\s*:\s*"?\d/.test(r.texto) || /itemprop="price"/.test(r.texto);
  }
  // Catálogos PDF en la portada y en páginas que parecen de catálogo
  const pdfs = new Set();
  const buscarPdf = (html, desde) => {
    for (const m of html.matchAll(/href=["']([^"']+\.pdf(\?[^"']*)?)["']/gi)) {
      try { pdfs.add(new URL(m[1], desde).href); } catch { /* nada */ }
    }
  };
  buscarPdf(portada.texto, out.base + '/');
  const paginasCatalogo = [...new Set([...portada.texto.matchAll(/href=["']([^"'#]*(catalog|descarg|download|brochure|ficha)[^"'#]*)["']/gi)]
    .map(m => { try { return new URL(m[1], out.base + '/').href; } catch { return null; } })
    .filter(u => u && u.startsWith(out.base) && !/\.pdf/i.test(u)))].slice(0, 4);
  for (const p of paginasCatalogo) {
    if (!robots.permitido(p)) continue;
    const r = await pedir(p);
    if (r.estado === 200) buscarPdf(r.texto, p);
    await dormir(800);
  }
  out.paginasCatalogo = paginasCatalogo;
  out.pdfs = [...pdfs].filter(u => robots.permitido(u)).slice(0, 15);
  return out;
}

const dominios = process.argv.slice(2);
const resultados = [];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (dominios.length) {
    const d = dominios.shift();
    const r = await sondear(d);
    resultados.push(r);
    console.error(`${d}: ${r.estado} prod=${r.fichasProducto ?? '-'} pdf=${(r.pdfs || []).length} shopify=${!!r.shopifyProductosJson} woo=${!!r.wooStoreApi} schema=${!!r.fichaSchemaProduct} ve=${r.venezuela} robots=${r.robotsPermite}`);
  }
}));
console.log(JSON.stringify(resultados, null, 1));
