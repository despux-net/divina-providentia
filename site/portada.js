// Portada: el buscador envía a buscar.html (formulario normal, sin JS),
// aquí solo se rellenan los desplegables, los anuncios recientes y las cifras.
(() => {
  const $ = id => document.getElementById(id);
  DP.opciones($('f-operacion'), { venta: 'En venta', alquiler: 'En alquiler' }, 'Venta y alquiler');
  DP.opciones($('f-tipo'), DP.TIPOS, 'Todos los tipos');
  // No enviar campos vacíos (la URL queda limpia: buscar.html?q=Chacao).
  $('form-busqueda').addEventListener('submit', () => {
    for (const el of $('form-busqueda').querySelectorAll('[name]')) if (!el.value) el.disabled = true;
  });
  window.addEventListener('pageshow', () => $('form-busqueda').querySelectorAll('[name]').forEach(el => { el.disabled = false; }));

  DP.cabecera();

  // Anuncios recientes (8).
  DP.sb.rpc('buscar_inmuebles', { p_limite: 8 }).then(({ data, error }) => {
    const cont = $('recientes');
    if (error || !data) { cont.innerHTML = '<div class="vacio" style="grid-column:1/-1">No se pudieron cargar los anuncios.</div>'; return; }
    cont.innerHTML = data.map(DP.tarjeta).join('');
  });

  // Cifras en vivo (anuncios activos, webs, estados, con mapa).
  DP.sb.rpc('estadisticas_publicas').then(({ data }) => {
    const c = data && data[0];
    if (!c) return;
    document.querySelectorAll('[data-cifra]').forEach(el => {
      const v = c[el.dataset.cifra];
      if (v != null) el.textContent = Number(v).toLocaleString('es-VE');
    });
  });
})();
