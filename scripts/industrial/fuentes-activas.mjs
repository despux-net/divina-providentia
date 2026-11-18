// Imprime en una línea los nombres de las fuentes activas (para el workflow).
import fs from 'node:fs';
const fuentes = JSON.parse(fs.readFileSync(new URL('./fuentes.json', import.meta.url), 'utf8'));
console.log(JSON.stringify(fuentes.filter(f => f.activa !== false).map(f => f.nombre)));
