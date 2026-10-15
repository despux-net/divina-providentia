// ===================================================================
// DIVINA PROVIDENTIA — PRODUCTOS ENTRE PAGES CMS Y SUPABASE
//
// La tienda y el cobro leen los productos de Supabase: ahí se comprueba
// el precio, el stock y si algo está publicado antes de cobrar. Pages CMS
// edita archivos. Este script es el puente, y solo lo ejecutan los
// workflows de GitHub:
//
//   node scripts/cms/productos.mjs sync [archivo …]
//       Sube a Supabase lo editorial de los archivos indicados (o de
//       todos): nombre, descripción, fotos, categoría, oculto, agotado.
//
//   node scripts/cms/productos.mjs printful
//       Reimporta todo lo que hay en la tienda de Printful y después
//       exporta.
//
//   node scripts/cms/productos.mjs export
//       Crea el archivo de cada producto que aún no lo tenga y refresca,
//       en todos, los datos que mandan Printful o el panel (precio,
//       tallas, colores). Lo editorial del archivo no se toca: en eso
//       manda Pages CMS.
//
// Necesita SUPABASE_SERVICE_ROLE_KEY en el entorno.
// ===================================================================

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PROJECT_URL = 'https://nzwtafacdpdgulzcwntx.supabase.co';
const SUPABASE_URL = process.env.SUPABASE_URL || PROJECT_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIR = 'content/productos';
const STORAGE = `${PROJECT_URL}/storage/v1/object/public/products/`;
const CATEGORIES = ['tees', 'caps', 'hoodies', 'headwear'];

if (!KEY) {
    // La línea ::error:: sale en el resumen del run de GitHub, sin abrir el log.
    console.error('::error title=Falta el secreto SUPABASE_SERVICE_ROLE_KEY::Añádelo en GitHub → Settings → Secrets and variables → Actions (la clave service_role legacy de Supabase, la que empieza por eyJ).');
    process.exit(1);
}

// La web pública vive en el dominio de CNAME. Las fotos que sube Pages CMS
// quedan en /media/… y en la base se guardan con el dominio delante: el
// cobro de Stripe y los avisos de Telegram las abren desde fuera de la web.
const SITE = 'https://' + (await readFile('CNAME', 'utf8')).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');

async function api(ruta, opciones = {}) {
    const respuesta = await fetch(`${SUPABASE_URL}${ruta}`, {
        ...opciones,
        headers: {
            apikey: KEY,
            Authorization: `Bearer ${KEY}`,
            'Content-Type': 'application/json',
            ...(opciones.headers || {})
        }
    });
    const texto = await respuesta.text();
    let datos;
    try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
    if (!respuesta.ok) {
        const detalle = (datos && (datos.error || datos.message)) || texto;
        throw new Error(`${opciones.method || 'GET'} ${ruta} → ${respuesta.status}: ${detalle}`);
    }
    return datos;
}

// ---------------- Rutas de las fotos ----------------

// De la base al CMS: lo que en la base es un nombre de archivo suelto vive
// en el bucket de productos, y lo que apunta a /media de la propia web se
// devuelve como ruta para que Pages CMS lo reconozca como suyo.
function imageToCms(src) {
    const s = String(src || '').trim();
    if (!s) return '';
    if (s.startsWith(SITE + '/media/')) return s.slice(SITE.length);
    if (/^https?:\/\//i.test(s) || s.startsWith('/')) return s;
    return STORAGE + s;
}

function imageToDb(src) {
    const s = String(src || '').trim();
    if (!s) return '';
    if (s.startsWith('/')) return SITE + s;
    return s;
}

// ---------------- Archivos ----------------

function fileFor(id) {
    return path.join(DIR, `${id}.json`);
}

async function readEntry(archivo) {
    return JSON.parse(await readFile(archivo, 'utf8'));
}

async function writeEntry(archivo, entrada) {
    await writeFile(archivo, JSON.stringify(entrada, null, 2) + '\n', 'utf8');
}

// Lo que no se edita en Pages CMS: se enseña como referencia y se rehace
// en cada exportación.
function readOnlyInfo(p) {
    return {
        price: Number(p.price),
        currency: p.currency,
        sizes: Array.isArray(p.sizes) ? p.sizes : [],
        colors: (Array.isArray(p.colors) ? p.colors : []).map(c => c && c.name).filter(Boolean),
        fulfillment: p.fulfillment
    };
}

function entryFromDb(p) {
    const gallery = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
    return {
        id: p.id,
        name: p.name || '',
        description: p.description || '',
        category: p.category || 'tees',
        hidden: p.published !== true,
        soldOut: p.available === false,
        images: gallery.map(imageToCms).filter(Boolean),
        material: p.material || '',
        care: p.care || '',
        info: readOnlyInfo(p)
    };
}

// ---------------- sync: archivos → Supabase ----------------

function patchFromEntry(e) {
    const name = String(e.name || '').trim();
    if (!name) throw new Error('el nombre está vacío');

    const images = (Array.isArray(e.images) ? e.images : [])
        .map(imageToDb)
        .filter(Boolean);

    const patch = {
        name: name.slice(0, 120),
        description: String(e.description || '').trim().slice(0, 2000) || null,
        images,
        image: images[0] || null,
        published: e.hidden !== true,
        available: e.soldOut !== true,
        material: String(e.material || '').trim().slice(0, 600) || null,
        care: String(e.care || '').trim().slice(0, 600) || null,
        updated_at: new Date().toISOString()
    };
    if (CATEGORIES.includes(e.category)) patch.category = e.category;
    return patch;
}

async function sync(archivos) {
    const lista = archivos.length
        ? archivos.filter(a => a.endsWith('.json'))
        : (await readdir(DIR)).filter(a => a.endsWith('.json')).map(a => path.join(DIR, a));

    let fallos = 0;
    for (const archivo of lista) {
        // Un archivo borrado en el mismo commit no tiene nada que subir.
        if (!existsSync(archivo)) continue;
        try {
            const entrada = await readEntry(archivo);
            const id = Number(entrada.id);
            if (!Number.isInteger(id) || id <= 0) {
                throw new Error('no tiene id; los productos nuevos entran con «Actualizar desde Printful»');
            }
            const filas = await api(`/rest/v1/products?id=eq.${id}`, {
                method: 'PATCH',
                headers: { Prefer: 'return=representation' },
                body: JSON.stringify(patchFromEntry(entrada))
            });
            if (!filas || !filas.length) throw new Error(`no existe el producto ${id} en Supabase`);
            console.log(`✓ ${archivo}: ${filas[0].name}${entrada.hidden ? ' (oculto)' : ''}${entrada.soldOut ? ' (agotado)' : ''}`);
        } catch (error) {
            fallos++;
            console.error(`✗ ${archivo}: ${error.message}`);
        }
    }
    if (fallos) process.exit(1);
}

// ---------------- export: Supabase → archivos ----------------

async function exportAll() {
    await mkdir(DIR, { recursive: true });
    const productos = await api('/rest/v1/products?select=*&order=id');

    for (const p of productos) {
        const archivo = fileFor(p.id);
        if (existsSync(archivo)) {
            const entrada = await readEntry(archivo);
            entrada.info = readOnlyInfo(p);
            await writeEntry(archivo, entrada);
            console.log(`· ${archivo}: datos de Printful al día`);
        } else {
            await writeEntry(archivo, entryFromDb(p));
            console.log(`+ ${archivo}: ${p.name}${p.published ? '' : ' (entra oculto, revísalo)'}`);
        }
    }
}

// ---------------- printful: reimportar la tienda ----------------

async function printfulImport() {
    const llamar = body => api('/functions/v1/printful-import', {
        method: 'POST',
        body: JSON.stringify(body)
    });

    const { products } = await llamar({ action: 'list' });
    let fallos = 0;

    for (const p of products || []) {
        try {
            const r = await llamar({ action: 'import', syncProductId: p.syncProductId });
            console.log(`${r.created ? '+ nuevo' : '· actualizado'}: ${r.name} — ${r.price} ${r.currency}, tallas ${r.sizes.join('/')}`);
        } catch (error) {
            fallos++;
            console.error(`✗ ${p.name}: ${error.message}`);
        }
    }

    await exportAll();
    if (fallos) process.exit(1);
}

// ---------------- arranque ----------------

const [orden, ...resto] = process.argv.slice(2);

if (orden === 'sync') await sync(resto);
else if (orden === 'export') await exportAll();
else if (orden === 'printful') await printfulImport();
else {
    console.error('Uso: node scripts/cms/productos.mjs sync [archivos…] | export | printful');
    process.exit(1);
}
