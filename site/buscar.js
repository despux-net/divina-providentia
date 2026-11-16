// Portada: búsqueda con filtros, lista y mapa.
// Los filtros se guardan en la URL (?q=...&estado=...) para poder compartir
// una búsqueda y para que el botón «atrás» funcione.
(() => {
  const POR_PAGINA = 24;
  const $ = id => document.getElementById(id);
  const campos = {
    q: $('q'), operacion: $('f-operacion'), tipo: $('f-tipo'), estado: $('f-estado'),
    min: $('f-min'), max: $('f-max'), hab: $('f-hab'), orden: $('f-orden')
  };
  let desde = 0;
  let vista = 'lista';
  let mapa = null, capaPuntos = null;
  let peticion = 0;

  DP.opciones(campos.operacion, { venta: 'Venta', alquiler: 'Alquiler' }, 'Venta y alquiler');
  DP.opciones(campos.tipo, DP.TIPOS, 'Todos los tipos');
  DP.opcionesEstados(campos.estado, 'Toda Venezuela');

  // URL → campos
  const params = new URLSearchParams(location.search);
  for (const [k, el] of Object.entries(campos)) if (params.has(k)) el.value = params.get(k);
  if (params.get('vista') === 'mapa') vista = 'mapa';

  function filtros() {
    const num = el => (el.value === '' ? null : Number(el.value));
    const min = num(campos.min), max = num(campos.max);
    return {
      q: campos.q.value.trim() || null,
      p_operacion: campos.operacion.value || null,
      p_tipo: campos.tipo.value || null,
      p_estado: campos.estado.value || null,
      p_precio_min: min,
      p_precio_max: max,
      // El filtro de precio está en dólares; sin él se muestran todas las monedas.
      p_moneda: min != null || max != null ? 'USD' : null,
      p_habitaciones: num(campos.hab),
      p_orden: campos.orden.value || 'recientes'
    };
  }

  function guardarEnUrl() {
    const p = new URLSearchParams();
    for (const [k, el] of Object.entries(campos)) if (el.value && !(k === 'orden' && el.value === 'recientes')) p.set(k, el.value);
    if (vista === 'mapa') p.set('vista', 'mapa');
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  async function buscar(anadir = false) {
    const id = ++peticion;
    if (!anadir) desde = 0;
    guardarEnUrl();
    $('resumen').textContent = 'Buscando…';

    const f = filtros();
    // En el mapa se piden más puntos de una vez y no se pagina.
    const limite = vista === 'mapa' ? 100 : POR_PAGINA + 1;
    const { data, error } = await DP.sb.rpc('buscar_inmuebles', { ...f, p_limite: limite, p_desde: desde });
    if (id !== peticion) return; // llegó tarde: hay una búsqueda más nueva

    if (error) {
      console.error(error);
      $('resumen').textContent = 'No se pudo completar la búsqueda. Inténtalo de nuevo.';
      return;
    }

    const hayMas = vista === 'lista' && data.length > POR_PAGINA;
    const filas = hayMas ? data.slice(0, POR_PAGINA) : data;

    if (vista === 'mapa') pintarMapa(filas);
    else pintarLista(filas, anadir);

    const total = (anadir ? desde : 0) + filas.length;
    $('resumen').textContent = total === 0 ? '' :
      `${total}${hayMas ? '+' : ''} inmueble${total === 1 ? '' : 's'}`;
    $('mas').hidden = !hayMas;
    desde += filas.length;
  }

  function pintarLista(filas, anadir) {
    const cont = $('resultados');
    if (!anadir && filas.length === 0) {
      const hayFiltros = Object.values(filtros()).some((v, i) => v != null && i < 8);
      cont.innerHTML = `<div class="vacio" style="grid-column:1/-1">
        <strong>${hayFiltros ? 'No hay inmuebles con esos filtros' : 'Todavía no hay anuncios'}</strong>
        ${hayFiltros ? 'Prueba a quitar algún filtro o buscar otra zona.' : 'Estamos empezando. Sé el primero en publicar tu inmueble, es gratis.'}
        <p><a class="boton" href="publicar.html">Publicar un inmueble</a></p></div>`;
      return;
    }
    const html = filas.map(DP.tarjeta).join('');
    if (anadir) cont.insertAdjacentHTML('beforeend', html); else cont.innerHTML = html;
  }

  function pintarMapa(filas) {
    if (!mapa) {
      mapa = L.map('mapa').setView(DP.CENTRO_VE, 6);
      DP.capaMapa(mapa);
      capaPuntos = L.layerGroup().addTo(mapa);
    }
    setTimeout(() => mapa.invalidateSize(), 0);
    capaPuntos.clearLayers();
    const conSitio = filas.filter(i => i.lat != null && i.lng != null);
    for (const i of conSitio) {
      const foto = DP.fotoUrl(i.fotos && i.fotos[0]);
      const popup = `<a href="anuncio.html?id=${encodeURIComponent(i.id)}" style="text-decoration:none;color:inherit">
        ${foto ? `<img src="${DP.esc(foto)}" alt="" style="width:200px;height:130px;object-fit:cover;border-radius:6px">` : ''}
        <strong style="display:block;margin-top:4px">${DP.esc(DP.precio(i))}</strong>
        ${DP.esc(i.titulo)}<br><small>${DP.esc(DP.lugar(i))}</small></a>`;
      L.marker([i.lat, i.lng]).bindPopup(popup).addTo(capaPuntos);
    }
    if (conSitio.length) mapa.fitBounds(L.latLngBounds(conSitio.map(i => [i.lat, i.lng])).pad(0.2), { maxZoom: 14 });
    else if (campos.estado.value) mapa.setView(DP.ESTADOS[campos.estado.value], 10);
    else mapa.setView(DP.CENTRO_VE, 6);
  }

  function cambiarVista(v) {
    vista = v;
    $('v-lista').setAttribute('aria-pressed', v === 'lista');
    $('v-mapa').setAttribute('aria-pressed', v === 'mapa');
    $('resultados').hidden = v !== 'lista';
    $('mapa').hidden = v !== 'mapa';
    buscar();
  }

  $('form-busqueda').addEventListener('submit', e => { e.preventDefault(); buscar(); });
  for (const k of ['operacion', 'tipo', 'estado', 'hab', 'orden']) campos[k].addEventListener('change', () => buscar());
  for (const k of ['min', 'max']) campos[k].addEventListener('change', () => buscar());
  $('mas').addEventListener('click', () => buscar(true));
  $('v-lista').addEventListener('click', () => cambiarVista('lista'));
  $('v-mapa').addEventListener('click', () => cambiarVista('mapa'));

  DP.cabecera();
  if (vista === 'mapa') cambiarVista('mapa'); else buscar();
})();
