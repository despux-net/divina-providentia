// Portada: tarjetas de categoría, cifras en vivo y título de los resultados.
// La búsqueda en sí la hace buscar.js con los mismos campos (#q, #f-tipo…).
(() => {
  const $ = id => document.getElementById(id);
  const irAResultados = () => $('resultados-sec').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Tarjetas de categoría: fijan el tipo y llevan a los resultados.
  document.querySelectorAll('.categoria[data-tipo]').forEach(b => b.addEventListener('click', () => {
    $('f-tipo').value = b.dataset.tipo;
    $('f-tipo').dispatchEvent(new Event('change'));
    irAResultados();
  }));

  // Al buscar desde la portada, bajar a los resultados.
  $('form-busqueda').addEventListener('submit', () => setTimeout(irAResultados, 50));
  if (location.hash === '#resultados-sec' || new URLSearchParams(location.search).get('q')) setTimeout(irAResultados, 300);

  // Título de la sección de resultados según los filtros.
  const PLURAL = {
    apartamento: 'Apartamentos', casa: 'Casas', anexo: 'Anexos', habitacion: 'Habitaciones',
    townhouse: 'Townhouses', local: 'Locales comerciales', oficina: 'Oficinas', terreno: 'Terrenos',
    galpon: 'Galpones', otro: 'Otros inmuebles'
  };
  const titular = () => {
    const tipo = $('f-tipo').value, op = $('f-operacion').value, estado = $('f-estado').value, q = $('q').value.trim();
    let t = tipo ? PLURAL[tipo] || 'Inmuebles' : (op || estado || q ? 'Inmuebles' : 'Anuncios recientes');
    if (op) t += op === 'venta' ? ' en venta' : ' en alquiler';
    if (estado) t += ` en ${estado}`;
    if (q) t += ` · «${q}»`;
    $('titulo-resultados').textContent = t;
  };
  ['f-tipo', 'f-operacion', 'f-estado'].forEach(id => $(id).addEventListener('change', titular));
  $('form-busqueda').addEventListener('submit', titular);
  setTimeout(titular, 0);

  // Cifras en vivo (anuncios activos, webs, estados, con mapa).
  DP.sb.rpc('estadisticas_publicas').then(({ data }) => {
    const c = data && data[0];
    if (!c) return;
    const fmt = n => Number(n).toLocaleString('es-VE');
    document.querySelectorAll('[data-cifra]').forEach(el => {
      const v = c[el.dataset.cifra];
      if (v != null) el.textContent = fmt(v);
    });
  });
})();
