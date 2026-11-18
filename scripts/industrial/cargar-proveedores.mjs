// Sube el directorio scripts/industrial/proveedores.json a la tabla «proveedores»
// (crea o actualiza por slug). Los que se quiten del archivo no se borran: se
// desactivan. Lo ejecuta el workflow del indexador antes de indexar.
//   SUPABASE_SERVICE_ROLE_KEY=… node scripts/industrial/cargar-proveedores.mjs
import fs from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nzwtafacdpdgulzcwntx.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Falta SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const api = async (ruta, opciones = {}) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${ruta}`, { ...opciones,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
};

const lista = JSON.parse(fs.readFileSync(new URL('./proveedores.json', import.meta.url), 'utf8'));
const filas = lista.map(p => ({
  slug: p.slug, nombre: p.nombre, web: p.web, descripcion: p.descripcion || null,
  categorias: p.categorias || [], marcas: p.marcas || [], estado: p.estado || null, ciudad: p.ciudad || null,
  catalogos: (p.catalogos || []).map(([titulo, url]) => ({ titulo, url })),
  fuente_productos: p.fuente || null, activo: p.activo !== false, revisado_en: new Date().toISOString()
}));
await api('/proveedores?on_conflict=slug', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(filas) });
const slugs = filas.map(f => f.slug);
await api(`/proveedores?slug=not.in.(${slugs.join(',')})&activo=eq.true`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ activo: false }) });
console.log(`Directorio: ${filas.length} proveedores.`);
