// Página de búsqueda (buscar.html): barra de filtros, columna lateral y resultados.
// Los filtros viven en la URL (?q=...&tipo=...&estado=...) para poder
// compartir una búsqueda y para que «atrás» funcione.
(() => {
  const POR_PAGINA = 24;
  const $ = id => document.getElementById(id);
  const campos = {
    q: $('q'), operacion: $('f-operacion'), tipo: $('f-tipo'), estado: $('f-estado'),
    min: $('f-min'), max: $('f-max'), hab: $('f-hab'), orden: $('f-orden')
  };
  const PLURAL = {
    apartamento: 'Apartamentos', casa: 'Casas', anexo: 'Anexos', habitacion: 'Habitaciones',
    townhouse: 'Townhouses', local: 'Locales', oficina: 'Oficinas', terreno: 'Terrenos',
    galpon: 'Galpones', otro: 'Otros'
  };
  const ORDEN_TIPOS = ['apartamento', 'casa', 'townhouse', 'anexo', 'habitacion', 'local', 'oficina', 'galpon', 'terreno', 'otro'];
  const fmt = n => Number(n).toLocaleString('es-VE');

  let desde = 0, vista = 'lista', soloFavoritos = false;
  let mapa = null, capaPuntos = null, peticion = 0;

  DP.opciones(campos.operacion, { venta: 'En venta', alquiler: 'En alquiler' }, 'Venta y alquiler');
  DP.opciones(campos.tipo, DP.TIPOS, 'Todos los tipos');
  DP.opcionesEstados(campos.estado, 'Toda Venezuela');

  // URL → campos
  const params = new URLSearchParams(location.search);
  for (const [k, el] of Object.entries(campos)) if (params.has(k)) el.value = params.get(k);
  if (params.get('vista') === 'mapa') vista = 'mapa';
  if (params.get('fav') === '1') soloFavoritos = true;

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
      p_habitaciones: num(campos.hab)
    };
  }

  function guardarEnUrl() {
    const p = new URLSearchParams();
    for (const [k, el] of Object.entries(campos)) if (el.value && !(k === 'orden' && el.value === 'recientes')) p.set(k, el.value);
    if (vista === 'mapa') p.set('vista', 'mapa');
    if (soloFavoritos) p.set('fav', '1');
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  // Título grande y píldora «Precio» marcada si hay rango.
  function titular() {
    const f = filtros();
    let t;
    if (soloFavoritos) t = 'Mis favoritos';
    else {
      t = f.p_tipo ? PLURAL[f.p_tipo] || 'Inmuebles' : 'Inmuebles';
      if (f.p_operacion) t += f.p_operacion === 'venta' ? ' en venta' : ' en alquiler';
      t += f.p_estado ? ` en ${f.p_estado}` : ' en Venezuela';
      if (f.q) t += ` · «${f.q}»`;
    }
    $('titulo-resultados').textContent = t;
    document.title = `${t} — Divina Providentia`;
    const precio = $('d-precio').querySelector('summary');
    precio.textContent = f.p_precio_min != null || f.p_precio_max != null
      ? `$${fmt(f.p_precio_min || 0)} – ${f.p_precio_max != null ? '$' + fmt(f.p_precio_max) : 'más'}` : 'Precio';
    $('d-precio').classList.toggle('activa', f.p_precio_min != null || f.p_precio_max != null);
    for (const el of [campos.tipo, campos.operacion, campos.hab, campos.estado]) el.classList.toggle('activa', !!el.value);
  }

  // ---------- Conteos: total, píldoras por tipo y lista de estados ----------
  async function contar() {
    if (soloFavoritos) return;
    const f = filtros();
    const { data, error } = await DP.sb.rpc('conteos_busqueda', f);
    if (error || !data) return;
    const todos = Object.values(data.por_tipo || {}).reduce((a, b) => a + b, 0);
    $('resumen').innerHTML = `<b>${fmt(data.total)}</b> ${data.total === 1 ? 'inmueble' : 'inmuebles'}` +
      (f.p_tipo ? ` · ${fmt(todos)} en todas las categorías` : '') +
      (f.p_estado ? ` en ${DP.esc(f.p_estado)}` : '');

    // Píldoras de tipo (las que tienen anuncios), como «Wohnungen (1883)».
    const pills = ORDEN_TIPOS.filter(t => data.por_tipo[t]).map(t =>
      `<button type="button" class="pill-tipo" data-tipo="${t}" aria-pressed="${f.p_tipo === t}">${PLURAL[t]} (${fmt(data.por_tipo[t])})</button>`);
    $('pills-tipo').innerHTML = pills.join('');

    // Estados con su número de anuncios.
    const estados = Object.entries(data.por_estado || {}).sort((a, b) => b[1] - a[1]);
    $('lista-estados').innerHTML = estados.length
      ? estados.map(([e, n]) => `<li><button type="button" class="enlace${f.p_estado === e ? ' activo' : ''}" data-estado="${DP.esc(e)}">${DP.esc(e)}</button><span>${fmt(n)}</span></li>`).join('')
      : '<li class="ayuda">Sin anuncios con estos filtros</li>';
  }

  // ---------- Resultados ----------
  async function buscar(anadir = false) {
    const id = ++peticion;
    if (!anadir) { desde = 0; contar(); }
    guardarEnUrl();
    titular();
    if (!anadir) $('resumen').textContent = 'Buscando…';

    let data, error;
    if (soloFavoritos) {
      const ids = DP.favoritos();
      ({ data, error } = ids.length
        ? await DP.sb.from('inmuebles').select('*').in('id', ids).eq('activo', true)
        : { data: [], error: null });
      if (data) data.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    } else {
      const limite = vista === 'mapa' ? 100 : POR_PAGINA + 1;
      ({ data, error } = await DP.sb.rpc('buscar_inmuebles', { ...filtros(), p_orden: campos.orden.value || 'recientes', p_limite: limite, p_desde: desde }));
    }
    if (id !== peticion) return; // llegó tarde: hay una búsqueda más nueva

    if (error) {
      console.error(error);
      $('resumen').textContent = 'No se pudo completar la búsqueda. Inténtalo de nuevo.';
      return;
    }
    const hayMas = !soloFavoritos && vista === 'lista' && data.length > POR_PAGINA;
    const filas = hayMas ? data.slice(0, POR_PAGINA) : data;

    if (vista === 'mapa') pintarMapa(filas);
    else pintarLista(filas, anadir);
    if (soloFavoritos) $('resumen').innerHTML = `<b>${fmt(filas.length)}</b> ${filas.length === 1 ? 'anuncio guardado' : 'anuncios guardados'} · <button type="button" class="enlace" id="salir-favoritos">Volver a la búsqueda</button>`;
    $('mas').hidden = !hayMas;
    desde += filas.length;
  }

  function pintarLista(filas, anadir) {
    const cont = $('resultados');
    if (!anadir && filas.length === 0) {
      cont.innerHTML = soloFavoritos
        ? `<div class="vacio" style="grid-column:1/-1"><strong>Aún no tienes favoritos</strong>Pulsa el ♥ de cualquier anuncio para guardarlo aquí.</div>`
        : `<div class="vacio" style="grid-column:1/-1"><strong>No hay inmuebles con esos filtros</strong>
            Prueba a quitar algún filtro o a buscar en otra zona.
            <p><button type="button" class="boton sec" id="vacio-limpiar">Quitar filtros</button></p></div>`;
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
        ${foto ? `<img src="${DP.esc(foto)}" alt="" referrerpolicy="no-referrer" style="width:200px;height:130px;object-fit:cover;border-radius:6px">` : ''}
        <strong style="display:block;margin-top:4px;color:#1976d2">${DP.esc(DP.precio(i))}</strong>
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

  const nuevaBusqueda = () => { soloFavoritos = false; buscar(); };
  function limpiar() {
    for (const [k, el] of Object.entries(campos)) el.value = k === 'orden' ? 'recientes' : '';
    nuevaBusqueda();
  }

  // ---------- Eventos ----------
  $('form-busqueda').addEventListener('submit', e => { e.preventDefault(); $('d-precio').open = false; nuevaBusqueda(); });
  for (const k of ['operacion', 'tipo', 'estado', 'hab']) campos[k].addEventListener('change', nuevaBusqueda);
  campos.orden.addEventListener('change', () => buscar());
  for (const k of ['min', 'max']) campos[k].addEventListener('change', nuevaBusqueda);
  $('d-precio').querySelector('[data-cerrar]').addEventListener('click', () => { $('d-precio').open = false; });
  // Cerrar el desplegable de precio al hacer clic fuera.
  document.addEventListener('click', e => { if (!e.target.closest('#d-precio')) $('d-precio').open = false; });
  $('limpiar').addEventListener('click', limpiar);
  $('mas').addEventListener('click', () => buscar(true));
  $('v-lista').addEventListener('click', () => cambiarVista('lista'));
  $('v-mapa').addEventListener('click', () => cambiarVista('mapa'));

  $('pills-tipo').addEventListener('click', e => {
    const b = e.target.closest('[data-tipo]'); if (!b) return;
    campos.tipo.value = campos.tipo.value === b.dataset.tipo ? '' : b.dataset.tipo;
    nuevaBusqueda();
  });
  $('lista-estados').addEventListener('click', e => {
    const b = e.target.closest('[data-estado]'); if (!b) return;
    campos.estado.value = campos.estado.value === b.dataset.estado ? '' : b.dataset.estado;
    nuevaBusqueda();
    $('resultados-sec').scrollIntoView({ behavior: 'smooth' });
  });
  document.addEventListener('click', e => {
    if (e.target.id === 'vacio-limpiar') limpiar();
    if (e.target.id === 'salir-favoritos') nuevaBusqueda();
  });

  // Favoritos
  const pintarNumFavoritos = () => { $('num-favoritos').textContent = DP.favoritos().length; };
  document.addEventListener('dp:favoritos', () => { pintarNumFavoritos(); if (soloFavoritos) buscar(); });
  $('ver-favoritos').addEventListener('click', () => { soloFavoritos = true; cambiarVista('lista'); });
  $('vaciar-favoritos').addEventListener('click', () => {
    if (!DP.favoritos().length) return;
    try { localStorage.removeItem('dp_favoritos'); } catch { /* nada */ }
    document.dispatchEvent(new CustomEvent('dp:favoritos', { detail: [] }));
    document.querySelectorAll('.corazon[aria-pressed=true]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  });
  pintarNumFavoritos();

  DP.cabecera();
  if (vista === 'mapa') cambiarVista('mapa'); else buscar();
})();
