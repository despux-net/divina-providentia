// Indexador de Vivinati Industrial: productos que proveedores venezolanos
// publican en su propia web. Igual que el de Real Estate: respeta robots.txt,
// se identifica (VivinatiBot), va despacio, no copia datos de contacto y
// enlaza siempre a la web original. Cada fuente se explica en su bloque.
//
//   SUPABASE_SERVICE_ROLE_KEY=… node scripts/industrial/indexar.mjs
//   PRUEBA=3 node scripts/industrial/indexar.mjs      (solo muestra 3 por fuente, no guarda)
import { leerRobots } from '../indexador/robots.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nzwtafacdpdgulzcwntx.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRUEBA = Number(process.env.PRUEBA || 0);
const BOT = 'VivinatiBot';
const UA = `Mozilla/5.0 (compatible; ${BOT}/1.0; +https://vivinati.com/realestate/bot.html)`;
const FIN = Date.now() + Number(process.env.MAX_MINUTOS || 50) * 60_000;
if (!PRUEBA && !KEY) { console.error('Falta SUPABASE_SERVICE_ROLE_KEY (o usa PRUEBA=3).'); process.exit(1); }

const dormir = ms => new Promise(r => setTimeout(r, ms));
const sinHtml = t => String(t || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|li|h\d|div)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
// No se copian teléfonos, correos ni enlaces de WhatsApp: para contactar, la web original.
const sinContacto = t => t == null ? t : String(t)
  .replace(/https?:\/\/(wa\.me|api\.whatsapp\.com)\S*/gi, '')
  .replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, '')
  .replace(/\+?\d[\d\s().-]{8,}\d/g, m => (m.replace(/\D/g, '').length >= 10 ? '' : m))
  .replace(/[ \t]{2,}/g, ' ').trim() || null;
const recortar = (t, n) => (t && t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t);

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

// ---------- Fuentes ----------
const FUENTES = [
  {
    // Camozzi Venezuela S.A.: filial oficial del fabricante italiano de neumática
    // y automatización. Tienda Shopify con catálogo público (/products.json).
    nombre: 'Camozzi Venezuela', host: 'https://camozzi.shop', retraso: 3000, minimo: 100,
    async *productos() {
      for (let pagina = 1; pagina <= 60; pagina++) {
        const r = await pedir(`${this.host}/products.json?limit=250&page=${pagina}`, { json: true });
        if (r.estado !== 200) throw new Error(`products.json respondió ${r.estado}`);
        const lista = JSON.parse(r.texto).products || [];
        if (!lista.length) return;
        for (const p of lista) {
          const v = (p.variants || [])[0] || {};
          const precio = Number(v.price);
          yield {
            url_original: `${this.host}/products/${p.handle}`,
            // Su descripción es la misma en todas las fichas (horario, pagos, envíos): se resume.
            titulo: recortar(p.title, 120),
            descripcion: `${p.title}. Componente original Camozzi de ${(p.product_type || 'neumática').toLowerCase()}${v.sku ? `, referencia ${v.sku}` : ''}. Disponibilidad, precio actualizado, formas de pago y envío en la web de Camozzi Venezuela.`,
            precio: precio > 0 ? precio : null, moneda: 'USD', unidad: 'unidad', condicion: 'nuevo',
            marca: 'Camozzi', modelo: v.sku ? String(v.sku).replace(/^CCC\./, '').slice(0, 60) : null,
            categoria: 'automatizacion', estado: 'Zulia', ciudad: 'Maracaibo', envios: false,
            fotos: (p.images || []).map(i => i.src).filter(s => /^https:\/\//.test(s)).slice(0, 4)
          };
        }
        await dormir(this.retraso);
      }
    }
  },
  {
    // FRASAM (Servicios y Rodamientos FRASAM, C.A., Ciudad Guayana): rodamientos y
    // componentes industriales. Cada producto tiene su página con schema.org Product.
    nombre: 'FRASAM', host: 'https://frasam.net', retraso: 4000, minimo: 100,
    async *productos() {
      const sm = await pedir(`${this.host}/sitemap.xml`);
      if (sm.estado !== 200) throw new Error(`sitemap respondió ${sm.estado}`);
      const urls = [...sm.texto.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()).filter(u => /\/producto\/[^/]+$/.test(u));
      for (const url of urls) {
        if (this.yaVistos && this.yaVistos.has(url)) { yield { url_original: url, soloVisto: true }; continue; }
        const r = await pedir(url);
        await dormir(this.retraso);
        if (r.estado !== 200) continue;
        const ld = [...r.texto.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)]
          .map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
        const prod = ld.flatMap(x => x['@graph'] || [x]).find(x => x['@type'] === 'Product');
        if (!prod || !prod.name) continue;
        const of = Array.isArray(prod.offers) ? prod.offers[0] : (prod.offers || {});
        const precio = Number(of.price);
        const img = (Array.isArray(prod.image) ? prod.image[0] : prod.image) ||
          (r.texto.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
        const marca = typeof prod.brand === 'string' ? prod.brand : prod.brand && prod.brand.name;
        yield {
          url_original: url, titulo: recortar(prod.name, 120),
          descripcion: recortar(String(prod.description || '').replace(/Consult[aá] por WhatsApp[^.]*\./gi, '').trim(), 3000),
          precio: precio > 0 ? precio : null, moneda: of.priceCurrency === 'VES' ? 'VES' : 'USD', unidad: 'unidad',
          condicion: /UsedCondition/.test(of.itemCondition || '') ? 'usado' : 'nuevo',
          marca: marca ? String(marca).slice(0, 60) : null, modelo: prod.sku ? String(prod.sku).slice(0, 60) : null,
          categoria: 'repuestos', estado: 'Bolívar', ciudad: 'Ciudad Guayana', envios: true,
          fotos: img && /^https:\/\//.test(img) ? [img] : []
        };
      }
    }
  }
];

// ---------- Trabajo ----------
for (const f of FUENTES) {
  if (Date.now() > FIN) break;
  console.log(`\n== ${f.nombre}`);
  try {
    const rob = await pedir(`${f.host}/robots.txt`);
    const robots = leerRobots(rob.estado === 200 ? rob.texto : '', BOT);
    if (robots.retrasoSegundos) f.retraso = Math.max(f.retraso, robots.retrasoSegundos * 1000);
    if (!PRUEBA) {
      // Las fichas ya conocidas se vuelven a leer cada 14 días; mientras, solo se marcan como vistas.
      const conocidos = await api(`/productos?select=url_original,visto_en&fuente=eq.${encodeURIComponent(f.nombre)}&limit=20000`);
      const hace14 = Date.now() - 14 * 864e5;
      f.yaVistos = new Set(conocidos.filter(c => c.visto_en && new Date(c.visto_en) > hace14).map(c => c.url_original));
    }
    const ahora = new Date().toISOString();
    const vistos = [], lote = [];
    let n = 0;
    const guardar = async () => {
      if (!lote.length) return;
      await api('/productos?on_conflict=url_original', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(lote.splice(0)) });
    };
    for await (const p of f.productos()) {
      if (Date.now() > FIN) { console.log('  Se acabó el tiempo; sigue en la próxima pasada.'); break; }
      if (!robots.permitido(p.url_original)) continue;
      vistos.push(p.url_original);
      if (p.soloVisto) continue;
      if (!p.titulo || p.titulo.length < 5) continue;
      const fila = { ...p, titulo: sinContacto(p.titulo), descripcion: sinContacto(p.descripcion), origen: 'externo', fuente: f.nombre,
        operacion: 'venta', activo: true, visto_en: ahora, user_id: null, whatsapp: null };
      if (PRUEBA) { console.log(JSON.stringify(fila).slice(0, 400)); if (++n >= PRUEBA) break; continue; }
      lote.push(fila); n++;
      if (lote.length >= 100) await guardar();
    }
    if (PRUEBA) continue;
    await guardar();
    // Las ya conocidas que siguen en la web: se marcan como vistas
    const soloVistas = vistos.filter(u => f.yaVistos.has(u));
    for (let i = 0; i < soloVistas.length; i += 150) {
      await api(`/productos?url_original=in.(${soloVistas.slice(i, i + 150).map(u => `"${u.replace(/"/g, '')}"`).join(',')})`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ visto_en: ahora, activo: true }) });
    }
    // Las que ya no están en la web se desactivan (si la lista se leyó entera y es razonable)
    if (Date.now() < FIN && vistos.length >= f.minimo) {
      const r = await api(`/productos?fuente=eq.${encodeURIComponent(f.nombre)}&activo=eq.true&visto_en=lt.${ahora}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ activo: false }) });
      console.log(`  Retirados (ya no están en su web): ${(r || []).length}`);
    }
    console.log(`  Guardados o actualizados: ${n}. Vistos en su web: ${vistos.length}.`);
  } catch (e) {
    console.error(`  Error en ${f.nombre}: ${e.message}`);
  }
}
