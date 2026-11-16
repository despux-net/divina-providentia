// Lector sencillo de robots.txt (RFC 9309).
// Elige el grupo cuyo User-agent coincide con nuestro bot; si no hay, el de «*».
// Dentro del grupo gana la regla más larga que encaje; a igualdad, Allow.

export function leerRobots(texto, nombreBot) {
  const grupos = [];
  let actual = null;
  let ultimaFueAgente = false;
  for (const bruta of texto.split(/\r?\n/)) {
    const linea = bruta.replace(/#.*/, '').trim();
    const m = linea.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const campo = m[1].toLowerCase();
    const valor = m[2].trim();
    if (campo === 'user-agent') {
      if (!ultimaFueAgente) { actual = { agentes: [], reglas: [], retraso: null }; grupos.push(actual); }
      actual.agentes.push(valor.toLowerCase());
      ultimaFueAgente = true;
      continue;
    }
    ultimaFueAgente = false;
    if (!actual) continue;
    if (campo === 'allow' || campo === 'disallow') {
      if (valor) actual.reglas.push({ permitir: campo === 'allow', patron: valor });
    } else if (campo === 'crawl-delay') {
      const n = Number(valor);
      if (Number.isFinite(n)) actual.retraso = n;
    }
  }

  const bot = nombreBot.toLowerCase();
  const propios = grupos.filter(g => g.agentes.some(a => a !== '*' && bot.includes(a)));
  const elegidos = propios.length ? propios : grupos.filter(g => g.agentes.includes('*'));
  const reglas = elegidos.flatMap(g => g.reglas);
  const retrasos = elegidos.map(g => g.retraso).filter(n => n != null);

  return {
    retrasoSegundos: retrasos.length ? Math.max(...retrasos) : null,
    permitido(url) {
      const u = new URL(url);
      const ruta = u.pathname + u.search;
      let mejor = null;
      for (const r of reglas) {
        if (!encaja(r.patron, ruta)) continue;
        if (!mejor || r.patron.length > mejor.patron.length ||
            (r.patron.length === mejor.patron.length && r.permitir)) mejor = r;
      }
      return !mejor || mejor.permitir;
    }
  };
}

function encaja(patron, ruta) {
  const anclado = patron.endsWith('$');
  const cuerpo = anclado ? patron.slice(0, -1) : patron;
  const re = cuerpo.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp('^' + re + (anclado ? '$' : '')).test(ruta);
}
