// Página de búsqueda (buscar.html): barra de filtros, columna lateral y resultados.
// Los filtros viven en la URL (?q=...&tipo=...&estado=...) para poder
// compartir una búsqueda y para que «atrás» funcione.
(() => {
  const POR_PAGINA = 24;
  const $ = id => document.getElementById(id);
  const campos = {
    q: $('q'), operacion: $('f-operacion'), tipo: $('f-tipo'), estado: $('f-estado'),
    min: $('f-min'), max: $('f-max'), hab: $('f-hab'), orden: $('f-orden'),
    m2min: $('f-m2min'), m2max: $('f-m2max'), banos: $('f-banos'), dias: $('f-dias')
  };
  // Casillas de «Más filtros» (en la URL como ?estac=1&fotos=1…)
  const casillas = { estac: $('f-estac'), fotos: $('f-fotos'), vivinati: $('f-vivinati'), bajadas: $('f-bajadas') };
  const PLURAL = {
    apartamento: 'Apartamentos', casa: 'Casas', anexo: 'Anexos', habitacion: 'Habitaciones',
    townhouse: 'Townhouses', local: 'Locales', oficina: 'Oficinas', terreno: 'Terrenos',
    galpon: 'Galpones', otro: 'Otros'
  };
  const ORDEN_TIPOS = ['apartamento', 'casa', 'townhouse', 'anexo', 'habitacion', 'local', 'oficina', 'galpon', 'terreno', 'otro'];
  const fmt = n => Number(n).toLocaleString('es-VE');

  let desde = 0, vista = 'lista', soloFavoritos = false;
  let mapa = null, capaPuntos = null, peticion = 0;

  DP.opciones(campos.operacion, { venta: 'En venta', alquiler: 'En alquiler', concepto: 'Conceptos 3D' }, 'Venta y alquiler');
  // Los proyectos conceptuales tienen su propia galería (conceptos.html).
  const irAConceptos = () => {
    const p = new URLSearchParams();
    if (campos.q.value.trim()) p.set('q', campos.q.value.trim());
    if (campos.estado.value) p.set('estado', campos.estado.value);
    location.href = 'conceptos.html' + (p.toString() ? '?' + p : '');
  };
  // Interruptor «Incluir proyectos conceptuales de la zona» (apagado por defecto).
  // Ya no se mezclan en la búsqueda: viven solo en conceptos.html.
  const conceptos = { checked: false, addEventListener() {} };
  DP.opciones(campos.tipo, DP.TIPOS, 'Todos los tipos');
  DP.opcionesEstados(campos.estado, 'Toda Venezuela');

  // URL → campos
  const params = new URLSearchParams(location.search);
  for (const [k, el] of Object.entries(campos)) if (params.has(k)) el.value = params.get(k);
  if (params.get('vista') === 'mapa') vista = 'mapa';
  if (params.get('fav') === '1') soloFavoritos = true;
  for (const [k, el] of Object.entries(casillas)) el.checked = params.get(k) === '1';
  if (campos.operacion.value === 'concepto') irAConceptos();

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
      p_incluir_conceptos: conceptos.checked,
      p_metros_min: num(campos.m2min),
      p_metros_max: num(campos.m2max),
      p_banos: num(campos.banos),
      p_dias: num(campos.dias),
      p_estacionamiento: casillas.estac.checked || null,
      p_con_fotos: casillas.fotos.checked || null,
      p_solo_vivinati: casillas.vivinati.checked || null,
      p_bajo_precio: casillas.bajadas.checked || null
    };
  }

  function guardarEnUrl() {
    const p = new URLSearchParams();
    for (const [k, el] of Object.entries(campos)) if (el.value && !(k === 'orden' && el.value === 'recientes')) p.set(k, el.value);
    if (vista === 'mapa') p.set('vista', 'mapa');
    if (soloFavoritos) p.set('fav', '1');
    if (conceptos.checked) p.set('conceptos', '1');
    for (const [k, el] of Object.entries(casillas)) if (el.checked) p.set(k, '1');
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
    document.title = `${t} — Vivinati`;
    const precio = $('d-precio').querySelector('summary');
    precio.textContent = f.p_precio_min != null || f.p_precio_max != null
      ? `$${fmt(f.p_precio_min || 0)} – ${f.p_precio_max != null ? '$' + fmt(f.p_precio_max) : 'más'}` : 'Precio';
    $('d-precio').classList.toggle('activa', f.p_precio_min != null || f.p_precio_max != null);
    for (const el of [campos.tipo, campos.operacion, campos.hab, campos.estado]) el.classList.toggle('activa', !!el.value);
    // «Más filtros (3)»: cuántos hay puestos
    const extra = [campos.m2min, campos.m2max, campos.banos, campos.dias].filter(el => el.value).length +
      Object.values(casillas).filter(el => el.checked).length;
    $('d-mas').querySelector('summary').textContent = extra ? `Más filtros (${extra})` : 'Más filtros';
    $('d-mas').classList.toggle('activa', extra > 0);
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
    ponerNotaMapa();

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
    if (!anadir) { desde = 0; notaMapa = ''; contar(); }
    guardarEnUrl();
    titular();
    if (!anadir) $('resumen').textContent = 'Buscando…';

    // El mapa tiene su propia consulta: solo anuncios con ubicación.
    if (vista === 'mapa' && !soloFavoritos) { await cargarMapa(id); return; }

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

    pintarLista(filas, anadir);
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

  // ---------- Mapa ----------
  // Puntos azules (en canvas, para que miles de puntos vayan fluidos).
  // Ordenador: al pasar el cursor sale un globito con foto y precio; clic → anuncio.
  // Móvil (sin cursor): el primer toque abre el globito con botón «Ver anuncio».
  const sinCursor = window.matchMedia('(hover: none)').matches;
  const ESTILO_PUNTO = { radius: 7, color: '#ffffff', weight: 2, fillColor: '#1976d2', fillOpacity: 0.95 };
  const ESTILO_ACTIVO = { radius: 10, fillColor: '#0d47a1' };

  function globito(i) {
    const foto = DP.fotoUrl(i.foto);
    return `<div class="globo-mapa">
      ${foto ? `<img src="${DP.esc(foto)}" alt="" referrerpolicy="no-referrer">` : '<div class="globo-sinfoto">Sin fotos</div>'}
      <div class="globo-texto">
        <strong>${DP.esc(DP.precio(i))}</strong>
        <span class="globo-tipo">${DP.esc(DP.TIPOS[i.tipo] || '')} · ${DP.esc(DP.OPERACIONES[i.operacion] || '')}</span>
        <span class="globo-lugar">${DP.esc(DP.lugar(i))}</span>
        ${sinCursor ? `<a class="boton peq" href="anuncio.html?id=${encodeURIComponent(i.id)}">Ver anuncio</a>` : ''}
      </div></div>`;
  }

  let capaDemanda = null;
  async function cargarMapa(id) {
    if (!mapa) {
      mapa = L.map('mapa', { preferCanvas: true }).setView(DP.CENTRO_VE, 6);
      DP.capaMapa(mapa);
      capaPuntos = L.layerGroup().addTo(mapa);
      // Capa propia por encima de los puntos azules, para que no queden tapados.
      mapa.createPane('demanda').style.zIndex = 450;
      capaDemanda = L.layerGroup().addTo(mapa);
      $('ver-demanda').addEventListener('change', e => { if (e.target.checked) capaDemanda.addTo(mapa); else capaDemanda.remove(); });
    }
    $('leyenda-mapa').hidden = false;
    // Puntos rojos: lo que busca la gente («Busco inmueble») con los mismos filtros.
    DP.sb.rpc('mapa_solicitudes', {
      p_operacion: ['venta', 'alquiler'].includes(campos.operacion.value) ? campos.operacion.value : null,
      p_estado: campos.estado.value || null, p_tipo: campos.tipo.value || null
    }).then(async ({ data: dem }) => {
      if (id !== peticion) return;
      capaDemanda.clearLayers();
      const { data: { session } } = await DP.sb.auth.getSession();
      for (const s of dem || []) DP.puntoDemanda(s, session && session.user.id, 'demanda').addTo(capaDemanda);
    });
    setTimeout(() => mapa.invalidateSize(), 0);
    const { data, error } = await DP.sb.rpc('mapa_inmuebles', filtros());
    if (id !== peticion) return;
    if (error) { console.error(error); $('resumen').textContent = 'No se pudo cargar el mapa. Inténtalo de nuevo.'; return; }

    capaPuntos.clearLayers();
    for (const i of data) {
      const punto = L.circleMarker([i.lat, i.lng], ESTILO_PUNTO).addTo(capaPuntos);
      const ir = () => { location.href = `anuncio.html?id=${encodeURIComponent(i.id)}`; };
      if (sinCursor) {
        punto.bindPopup(globito(i), { className: 'popup-globo', closeButton: false, offset: [0, -4], maxWidth: 240 });
      } else {
        punto.bindTooltip(globito(i), { direction: 'top', offset: [0, -8], className: 'tooltip-globo', opacity: 1 });
        punto.on('click', ir);
        punto.on('mouseover', () => { punto.setStyle(ESTILO_ACTIVO); punto.bringToFront(); mapa.getContainer().style.cursor = 'pointer'; });
        punto.on('mouseout', () => { punto.setStyle(ESTILO_PUNTO); mapa.getContainer().style.cursor = ''; });
      }
    }
    if (data.length) mapa.fitBounds(L.latLngBounds(data.map(i => [i.lat, i.lng])).pad(0.1), { maxZoom: 14 });
    else if (campos.estado.value) mapa.setView(DP.ESTADOS[campos.estado.value], 10);
    else mapa.setView(DP.CENTRO_VE, 6);

    $('mas').hidden = true;
    // El total de la búsqueda lo pinta contar(); aquí se aclara cuántos salen en el mapa.
    notaMapa = data.length
      ? `<b>${fmt(data.length)}</b> en el mapa · solo aparecen los anuncios que tienen ubicación`
      : 'Ningún anuncio con ubicación para estos filtros. Prueba la vista de lista.';
    ponerNotaMapa();
  }

  let notaMapa = '';
  function ponerNotaMapa() {
    const r = $('resumen');
    if (vista !== 'mapa' || !notaMapa || r.textContent === 'Buscando…' || r.querySelector('.nota-mapa')) return;
    r.insertAdjacentHTML('beforeend', ` <span class="nota-mapa">· ${notaMapa}</span>`);
  }

  function cambiarVista(v) {
    vista = v;
    $('v-lista').setAttribute('aria-pressed', v === 'lista');
    $('v-mapa').setAttribute('aria-pressed', v === 'mapa');
    $('resultados').hidden = v !== 'lista';
    $('mapa').hidden = v !== 'mapa';
    $('leyenda-mapa').hidden = v !== 'mapa' || soloFavoritos;
    buscar();
  }

  const nuevaBusqueda = () => { soloFavoritos = false; buscar(); };
  function limpiar() {
    for (const [k, el] of Object.entries(campos)) el.value = k === 'orden' ? 'recientes' : '';
    conceptos.checked = false;
    for (const el of Object.values(casillas)) el.checked = false;
    nuevaBusqueda();
  }

  // ---------- Eventos ----------
  $('form-busqueda').addEventListener('submit', e => { e.preventDefault(); $('d-precio').open = false; nuevaBusqueda(); });
  for (const k of ['tipo', 'estado', 'hab']) campos[k].addEventListener('change', nuevaBusqueda);
  campos.operacion.addEventListener('change', () => (campos.operacion.value === 'concepto' ? irAConceptos() : nuevaBusqueda()));
  conceptos.addEventListener('change', nuevaBusqueda);
  for (const el of [campos.m2min, campos.m2max, campos.banos, campos.dias, ...Object.values(casillas)]) el.addEventListener('change', nuevaBusqueda);
  $('d-mas').querySelector('[data-cerrar]').addEventListener('click', () => { $('d-mas').open = false; });
  document.addEventListener('click', e => { if (!e.target.closest('#d-mas')) $('d-mas').open = false; });

  // ---------- Alertas: «Avísame de anuncios nuevos» con estos filtros ----------
  $('crear-alerta').addEventListener('click', async () => {
    const msg = (t, tipo) => { $('msg-alerta').innerHTML = t ? `<div class="mensaje ${tipo}">${t}</div>` : ''; };
    const { data: { session } } = await DP.sb.auth.getSession();
    if (!session) {
      msg(`Para recibir avisos por correo necesitas una cuenta gratuita. <a href="entrar.html?next=${encodeURIComponent('buscar.html' + location.search)}">Entra</a> o <a href="registro.html">crea tu cuenta</a>.`, 'error');
      return;
    }
    const f = Object.fromEntries(Object.entries(filtros()).filter(([, v]) => v !== null && v !== false && v !== ''));
    const nombre = $('titulo-resultados').textContent.slice(0, 150);
    const b = $('crear-alerta'); b.disabled = true;
    const { error } = await DP.sb.from('alertas').insert({ nombre, filtros: f });
    b.disabled = false;
    if (error) return msg(DP.esc(/máximo de 5/.test(error.message) ? error.message : 'No se pudo crear la alerta. Inténtalo de nuevo.'), 'error');
    msg(`<strong>¡Listo!</strong> Te escribiremos a <b>${DP.esc(session.user.email)}</b> cuando aparezcan anuncios nuevos de «${DP.esc(nombre)}». Gestiona tus alertas en <a href="perfil.html#alertas">tu perfil</a>.`, 'ok');
  });
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
