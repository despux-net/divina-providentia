// Indexador de Vivinati Industrial: productos que proveedores venezolanos
// publican en su propia web. Igual que el de Real Estate: respeta robots.txt,
// se identifica (VivinatiBot), va despacio, no copia datos de contacto y
// enlaza siempre a la web original.
//
// Las fuentes están en fuentes.json. Tipos que entiende:
//   shopify  → /products.json (catálogo público de las tiendas Shopify)
//   woo      → /wp-json/wc/store/v1/products (API pública de WooCommerce)
//   schema   → fichas del sitemap con datos schema.org «Product»
//
//   SUPABASE_SERVICE_ROLE_KEY=… node scripts/industrial/indexar.mjs
//   PRUEBA=3 node scripts/industrial/indexar.mjs [nombre]   (muestra 3 por fuente, no guarda)
import fs from 'node:fs';
import { leerRobots } from '../indexador/robots.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nzwtafacdpdgulzcwntx.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRUEBA = Number(process.env.PRUEBA || 0);
const SOLO = process.argv[2] || null;
const BOT = 'VivinatiBot';
const UA = `Mozilla/5.0 (compatible; ${BOT}/1.0; +https://vivinati.com/realestate/bot.html)`;
const FIN = Date.now() + Number(process.env.MAX_MINUTOS || 50) * 60_000;
if (!PRUEBA && !KEY) { console.error('Falta SUPABASE_SERVICE_ROLE_KEY (o usa PRUEBA=3).'); process.exit(1); }
const FUENTES = JSON.parse(fs.readFileSync(new URL('./fuentes.json', import.meta.url), 'utf8'))
  .filter(f => f.activa !== false && (!SOLO || f.nombre === SOLO));

const dormir = ms => new Promise(r => setTimeout(r, ms));
const sinHtml = t => String(t || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|li|h\d|div)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
// No se copian teléfonos, correos ni enlaces de WhatsApp: para contactar, la web original.
const sinContacto = t => t == null ? t : String(t)
  .replace(/https?:\/\/(wa\.me|api\.whatsapp\.com)\S*/gi, '')
  .replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, '')
  .replace(/\+?\d[\d\s().-]{8,}\d/g, m => (m.replace(/\D/g, '').length >= 10 ? '' : m))
  .replace(/[ \t]{2,}/g, ' ').trim() || null;
const recortar = (t, n) => (t && t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t);
const llano = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Categoría según el nombre del producto (si la fuente no fija una)
const REGLAS = [
  ['automatizacion', /cilindro|valvula|electrovalvula|racor|neumatic|plc|sensor|variador|actuador|frl|presostato|controlador|rele|temporizador|vacio|manifold/],
  ['energia', /cable|breaker|interruptor|tablero|contactor|luminaria|bombillo|lampara|transformador|generador|planta electrica|tomacorriente|enchufe|panel solar|bateria|ups|conductor/],
  ['repuestos', /rodamiento|chumacera|correa|reten|estopera|sello|motor|bomba|reductor|acople|polea|cadena|pinon|engranaje|manguera|filtro|empacadura/],
  ['materiales', /cabilla|tubo|tuberia|lamina|viga|perfil|cemento|bloque|angulo|pletina|malla|acero|hierro|pvc|codo|tee|brida|niple|cerámica|pintura/],
  ['seguridad', /casco|guante|bota|lente|mascarilla|respirador|arnes|chaleco|protector auditivo|extintor|careta/],
  ['herramientas', /taladro|esmeril|amoladora|llave|destornillador|alicate|soldador|maquina de soldar|electrodo|compresor|sierra|martillo|disco de corte|broca|pulidora/],
  ['materias-primas', /resina|solvente|acido|alcohol|quimic|polimero|pigmento|aditivo|lubricante|aceite|grasa|soda caustica/],
  ['maquinaria-pesada', /excavadora|retroexcavadora|montacargas|grua|cargador|compactador|vibrocompactador/]
];
const categoriaDe = (titulo, porDefecto) => (REGLAS.find(([, r]) => r.test(llano(titulo))) || [porDefecto || 'otros'])[0];

async function pedir(url, { json = false } = {}) {
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/html,application/xml' }, signal: AbortSignal.timeout(30000) });
      if (r.status === 429 || r.status >= 500) { await dormir(15000 * intento); continue; }
      return { estado: r.status, texto: await r.text() };
    } catch { await dormir(5000 * intento); }
  }
  return { estado: 0, texto: '' };
}
async function api(ruta, opciones = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${ruta}`, {
    ...opciones, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) }
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

// ---------- Lectores por tipo de web ----------
const LECTORES = {
  async *shopify(f) {
    for (let pagina = 1; pagina <= 80; pagina++) {
      const r = await pedir(`${f.host}/products.json?limit=250&page=${pagina}`, { json: true });
      if (r.estado !== 200) throw new Error(`products.json respondió ${r.estado}`);
      const lista = JSON.parse(r.texto).products || [];
      if (!lista.length) return;
      for (const p of lista) {
        const v = (p.variants || [])[0] || {};
        const precio = Number(v.price);
        yield {
          url_original: `${f.host}/products/${p.handle}`, titulo: p.title,
          descripcion: f.descripcion === 'resumen'
            ? `${p.title}. ${p.product_type ? p.product_type + '. ' : ''}Disponibilidad, precio actualizado, formas de pago y envío en la web de ${f.nombre}.`
            : sinHtml(p.body_html),
          precio: precio > 0 ? precio : null, moneda: f.moneda || 'USD',
          marca: f.marca || (p.vendor && llano(p.vendor) !== llano(f.nombre) ? p.vendor : null), modelo: v.sku || null,
          fotos: (p.images || []).map(i => i.src), pista: [p.product_type, ...(p.tags || [])].join(' ')
        };
      }
      await dormir(f.retraso);
    }
  },
  async *woo(f) {
    for (let pagina = 1; pagina <= 200; pagina++) {
      const r = await pedir(`${f.host}/wp-json/wc/store/v1/products?per_page=100&page=${pagina}`, { json: true });
      if (r.estado === 400 && pagina > 1) return;                       // pasó la última página
      if (r.estado !== 200) throw new Error(`Store API respondió ${r.estado}`);
      const lista = JSON.parse(r.texto);
      if (!Array.isArray(lista) || !lista.length) return;
      for (const p of lista) {
        const pr = p.prices || {};
        const dec = Number(pr.currency_minor_unit ?? 2);
        const precio = pr.price ? Number(pr.price) / 10 ** dec : null;
        yield {
          url_original: p.permalink, titulo: sinHtml(p.name),
          descripcion: sinHtml(p.short_description || p.description),
          precio: precio > 0 ? precio : null, moneda: pr.currency_code === 'VES' || pr.currency_code === 'VEF' ? 'VES' : 'USD',
          marca: f.marca || null, modelo: p.sku || null,
          fotos: (p.images || []).map(i => i.src), pista: (p.categories || []).map(c => c.name).join(' ')
        };
      }
      await dormir(f.retraso);
    }
  },
  async *schema(f) {
    const sm = await pedir(f.sitemap || `${f.host}/sitemap.xml`);
    if (sm.estado !== 200) throw new Error(`sitemap respondió ${sm.estado}`);
    let urls = [...sm.texto.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
    // Índices de sitemaps: se abren los que parecen de productos
    for (const hijo of urls.filter(u => /\.xml(\?|$)/.test(u) && /product|producto/i.test(u)).slice(0, 20)) {
      const r = await pedir(hijo);
      if (r.estado === 200) urls.push(...[...r.texto.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&')));
      await dormir(1000);
    }
    const filtro = new RegExp(f.filtro || '/(producto|product)s?/[^/]+/?$', 'i');
    urls = [...new Set(urls.filter(u => !/\.xml(\?|$)/.test(u) && filtro.test(u)))];
    for (const url of urls) {
      if (f.yaVistos && f.yaVistos.has(url)) { yield { url_original: url, soloVisto: true }; continue; }
      const r = await pedir(url);
      await dormir(f.retraso);
      if (r.estado !== 200) continue;
      const ld = [...r.texto.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)]
        .map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
      const todos = ld.flatMap(x => Array.isArray(x) ? x : (x['@graph'] || [x]));
      let prod = todos.find(x => [].concat(x['@type']).includes('Product'));
      if (!prod || !prod.name) {
        // Sin schema.org: se usan las etiquetas «og:» de la ficha (título, descripción, foto)
        const meta = p => (r.texto.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)["']`, 'i')) ||
          r.texto.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${p}["']`, 'i')) || [])[1];
        const nombre = meta('og:title');
        if (!nombre) continue;
        // Solo se quita el nombre de la tienda si va tras «|» (un guion suele ser parte del producto: «380 - 500V»)
        prod = { name: nombre.replace(/\s*\|\s*[^|]{2,40}$/, ''), description: meta('og:description') || meta('description'),
          image: meta('og:image'), offers: { price: meta('product:price:amount'), priceCurrency: meta('product:price:currency') } };
      }
      const of = [].concat(prod.offers || [])[0] || {};
      const precio = Number(of.price ?? of.lowPrice);
      const img = [].concat(prod.image || []).map(i => (typeof i === 'object' ? i.url : i))[0];
      const marca = typeof prod.brand === 'string' ? prod.brand : prod.brand && prod.brand.name;
      yield {
        url_original: url, titulo: sinHtml(prod.name),
        descripcion: sinHtml(String(prod.description || '').replace(/Consult[aá] por WhatsApp[^.]*\./gi, '')),
        precio: precio > 0 ? precio : null, moneda: of.priceCurrency === 'VES' ? 'VES' : 'USD',
        marca: f.marca || marca || null, modelo: prod.sku || prod.mpn || null,
        condicion: /UsedCondition/.test(of.itemCondition || '') ? 'usado' : 'nuevo',
        fotos: img && !/opengraph-image/.test(img) ? [img] : [], pista: prod.category || ''
      };
    }
  }
};

// ---------- Trabajo ----------
for (const f of FUENTES) {
  if (Date.now() > FIN) break;
  f.retraso = f.retraso || 3000;
  console.log(`\n== ${f.nombre} (${f.tipo})`);
  try {
    const rob = await pedir(`${f.host}/robots.txt`);
    const robots = leerRobots(rob.estado === 200 ? rob.texto : '', BOT);
    if (robots.retrasoSegundos) f.retraso = Math.max(f.retraso, robots.retrasoSegundos * 1000);
    if (!robots.permitido(f.host + '/')) { console.log('  Su robots.txt no lo permite: se salta.'); continue; }
    if (!PRUEBA) {
      // Las fichas ya conocidas (tipo schema) se vuelven a leer cada 14 días; mientras, solo se marcan como vistas.
      const conocidos = await api(`/productos?select=url_original,visto_en&fuente=eq.${encodeURIComponent(f.nombre)}&limit=50000`);
      const hace14 = Date.now() - 14 * 864e5;
      f.yaVistos = new Set(conocidos.filter(c => c.visto_en && new Date(c.visto_en) > hace14).map(c => c.url_original));
    }
    const ahora = new Date().toISOString();
    const vistos = [], lote = [];
    let n = 0, completa = true;
    // Una misma imagen en 3 o más productos es un «sin foto» genérico de la tienda, no una foto real.
    const usoFoto = new Map(), genericas = new Set();
    const esGenerica = u => {
      const k = (usoFoto.get(u) || 0) + 1;
      usoFoto.set(u, k);
      if (k >= 3) genericas.add(u);
      return k >= 3;
    };
    const guardar = async () => {
      if (!lote.length) return;
      await api('/productos?on_conflict=url_original', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(lote.splice(0)) });
    };
    for await (const p of LECTORES[f.tipo](f)) {
      if (Date.now() > FIN) { console.log('  Se acabó el tiempo; sigue en la próxima pasada.'); completa = false; break; }
      if (!p.url_original || !/^https:\/\//.test(p.url_original) || !robots.permitido(p.url_original)) continue;
      vistos.push(p.url_original);
      if (p.soloVisto) continue;
      // «Láminas de acero - Maploca» → «Láminas de acero» (el nombre de la tienda ya va aparte)
      const sinTienda = String(p.titulo || '').replace(new RegExp(`\\s*[|–-]\\s*${f.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '');
      const titulo = recortar(sinContacto(sinTienda), 120);
      if (!titulo || titulo.length < 5) continue;
      const fila = {
        url_original: p.url_original, titulo,
        descripcion: recortar(sinContacto(p.descripcion), 3000),
        precio: p.precio, moneda: p.moneda || 'USD', unidad: 'unidad', condicion: p.condicion || 'nuevo',
        marca: p.marca ? String(p.marca).slice(0, 60) : null, modelo: p.modelo ? String(p.modelo).slice(0, 60) : null,
        categoria: f.categoria && f.categoria !== 'auto' ? f.categoria : categoriaDe(`${titulo} ${p.pista || ''}`, f.categoriaPorDefecto),
        estado: f.estado, ciudad: f.ciudad || null, envios: !!f.envios,
        fotos: (p.fotos || []).filter(u => /^https:\/\//.test(u || '') && !esGenerica(u)).slice(0, 4),
        origen: 'externo', fuente: f.nombre, operacion: 'venta', activo: true, visto_en: ahora, user_id: null, whatsapp: null
      };
      if (PRUEBA) { console.log(JSON.stringify(fila).slice(0, 360)); if (++n >= PRUEBA) break; continue; }
      lote.push(fila); n++;
      if (lote.length >= 100) await guardar();
    }
    if (PRUEBA) continue;
    await guardar();
    // Las dos primeras fichas guardadas con la imagen genérica también se limpian
    for (const u of genericas) {
      await api(`/productos?fuente=eq.${encodeURIComponent(f.nombre)}&fotos=cs.${encodeURIComponent(`{"${u.replace(/"/g, '')}"}`)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ fotos: [] }) });
    }
    const soloVistas = vistos.filter(u => f.yaVistos.has(u));
    for (let i = 0; i < soloVistas.length; i += 150) {
      await api(`/productos?url_original=in.(${soloVistas.slice(i, i + 150).map(u => `"${u.replace(/"/g, '')}"`).join(',')})`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ visto_en: ahora, activo: true }) });
    }
    // Lo que ya no está en su web se desactiva (solo si la lista se leyó entera y es razonable)
    if (completa && vistos.length >= (f.minimo ?? 20)) {
      const r = await api(`/productos?fuente=eq.${encodeURIComponent(f.nombre)}&activo=eq.true&visto_en=lt.${ahora}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ activo: false }) });
      console.log(`  Retirados (ya no están en su web): ${(r || []).length}`);
    }
    console.log(`  Guardados o actualizados: ${n}. Vistos en su web: ${vistos.length}.`);
  } catch (e) {
    console.error(`  Error en ${f.nombre}: ${e.message}`);
  }
}
