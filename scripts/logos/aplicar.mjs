// Aplica los logos elegidos en Pages CMS (site/contenido/logos.json) al
// publicar la web: cambia la ruta del logo original por la del nuevo en
// todas las páginas y scripts de la carpeta que se publica.
// Uso: node scripts/logos/aplicar.mjs site

import fs from 'node:fs';
import path from 'node:path';

const SITIO = process.argv[2] || 'site';
// Logo original de cada hueco → clave en logos.json
const ORIGINALES = {
  cabecera: 'img/logo-vivinati-v2.png',
  cabecera_movil: 'img/logo-vivinati-blanco-v2.png',
  pie: 'img/sello-vivinati.png',
  banda: 'img/logo-vivinati-banda.png',
  portada_icono: 'img/icono-portada.png',
  portada_logo: 'img/logo-portada.png'
};

let elegidos;
try { elegidos = JSON.parse(fs.readFileSync(path.join(SITIO, 'contenido', 'logos.json'), 'utf8')); }
catch { console.log('Sin site/contenido/logos.json: se dejan los logos originales.'); process.exit(0); }

// Pares «original → nuevo» solo para los que cambiaron y cuyo archivo existe.
const cambios = [];
for (const [clave, original] of Object.entries(ORIGINALES)) {
  const nuevo = String(elegidos[clave] || '').trim().replace(/^\/+/, '');
  if (!nuevo || nuevo === original) continue;
  if (!/^(img|media)\/[\w.\-\/ ]+\.(png|jpe?g|webp|svg|gif)$/i.test(nuevo)) { console.log(`::warning::Logo «${clave}» con ruta no válida: ${nuevo}`); continue; }
  if (!fs.existsSync(path.join(SITIO, nuevo))) { console.log(`::warning::No existe el archivo del logo «${clave}»: ${nuevo}`); continue; }
  cambios.push([original, encodeURI(nuevo)]);
  console.log(`Logo «${clave}»: ${original} → ${nuevo}`);
}
if (!cambios.length) { console.log('Logos sin cambios.'); process.exit(0); }

// Recorre HTML, JS y CSS (incluidas las páginas SEO generadas en subcarpetas).
let tocados = 0;
(function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['media', 'img', 'contenido'].includes(e.name)) recorrer(ruta); continue; }
    if (!/\.(html|js|css|webmanifest)$/.test(e.name)) continue;
    const antes = fs.readFileSync(ruta, 'utf8');
    let despues = antes;
    for (const [original, nuevo] of cambios) despues = despues.split(original).join(nuevo);
    if (despues !== antes) { fs.writeFileSync(ruta, despues); tocados++; }
  }
})(SITIO);
console.log(`Archivos actualizados con los logos nuevos: ${tocados}`);
