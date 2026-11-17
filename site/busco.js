// «Busco inmueble»: lista pública de lo que busca la gente (RPC
// solicitudes_publicas), formulario para publicar la propia búsqueda y
// gestión de «Tus búsquedas». Los anunciantes escriben por el chat.
(async () => {
  const $ = id => document.getElementById(id);
  const session = await DP.cabecera();
  const yo = session && session.user.id;
  const POR_PAGINA = 20;
  let desde = 0;

  DP.opciones($('s-tipo'), DP.TIPOS, 'Cualquier tipo');
  DP.opcionesEstados($('s-estado'), 'Elige un estado');
  DP.opciones($('f-tipo'), DP.TIPOS, 'Todos los tipos');
  DP.opcionesEstados($('f-estado'), 'Toda Venezuela');

  const params = new URLSearchParams(location.search);
  for (const k of ['operacion', 'tipo', 'estado']) if (params.get(k)) $('f-' + k).value = params.get(k);

  const haceCuanto = DP.haceCuanto, que = DP.queBusca, datos = DP.datosBusqueda;

  function tarjeta(s, mia) {
    if (!mia) return DP.tarjetaSolicitud(s, yo);
    const nombre = s.nombre || (s.usuario ? '@' + s.usuario : 'Usuario');
    const perfil = s.usuario ? `creador.html?u=${encodeURIComponent(s.usuario)}` : null;
    return `<article class="solicitud">
      <div class="sol-cab"><strong>${DP.esc(que(s))}</strong>
        <span class="sol-lugar">${DP.esc([s.zona, s.estado].filter(Boolean).join(', '))}</span></div>
      ${datos(s) ? `<p class="sol-datos">${DP.esc(datos(s))}</p>` : ''}
      <p class="sol-texto">${DP.esc(s.descripcion)}</p>
      <div class="sol-pie">
        ${mia ? `<span class="insignia-gris">${s.activo && new Date(s.expira) > new Date() ? `Publicada ${haceCuanto(s.creado)} · caduca el ${new Date(s.expira).toLocaleDateString('es-VE')}` : 'Cerrada'}</span>
          <span class="sol-acciones">
            ${s.activo && new Date(s.expira) > new Date()
              ? `<button type="button" class="enlace" data-cerrar="${s.id}">Ya lo encontré (cerrar)</button>`
              : `<button type="button" class="enlace" data-reabrir="${s.id}">Volver a publicar</button>`}
            <button type="button" class="enlace peligro" data-borrar="${s.id}">Borrar</button></span>`
        : ''}
      </div></article>`;
  }

  // ---------- Lista pública ----------
  async function cargar(mas) {
    if (!mas) desde = 0;
    const { data, error } = await DP.sb.rpc('solicitudes_publicas', {
      p_operacion: $('f-operacion').value || null, p_estado: $('f-estado').value || null,
      p_tipo: $('f-tipo').value || null, p_limite: POR_PAGINA + 1, p_desde: desde
    });
    if (error) { $('lista').innerHTML = '<p class="sub">No se pudo cargar la lista. Inténtalo de nuevo.</p>'; return; }
    const filas = data.slice(0, POR_PAGINA);
    const html = filas.map(s => tarjeta(s, false)).join('');
    $('lista').innerHTML = (mas ? $('lista').innerHTML : '') + html;
    if (!mas && !filas.length) $('lista').innerHTML = '<p class="sub">Todavía no hay búsquedas con estos filtros. ¡Publica la tuya y sé el primero!</p>';
    $('mas').hidden = data.length <= POR_PAGINA;
    desde += filas.length;
    $('resumen-busco').textContent = desde ? `${desde}${data.length > POR_PAGINA ? '+' : ''} ${desde === 1 ? 'búsqueda publicada' : 'búsquedas publicadas'}` : '';
  }
  ['f-operacion', 'f-tipo', 'f-estado'].forEach(id => $(id).addEventListener('change', () => {
    const p = new URLSearchParams();
    for (const k of ['operacion', 'tipo', 'estado']) if ($('f-' + k).value) p.set(k, $('f-' + k).value);
    history.replaceState(null, '', 'busco.html' + (p.toString() ? '?' + p : ''));
    cargar(false);
  }));
  $('mas').addEventListener('click', () => cargar(true));
  cargar(false);

  // ---------- Mapa de la demanda: puntos rojos ----------
  let mapaDemanda = null, capaDemanda = null;
  async function cargarMapaDemanda() {
    const { data } = await DP.sb.rpc('mapa_solicitudes', {
      p_operacion: $('f-operacion').value || null, p_estado: $('f-estado').value || null, p_tipo: $('f-tipo').value || null
    });
    const hay = data && data.length;
    $('mapa-demanda').hidden = !hay; $('leyenda-demanda').hidden = !hay;
    if (!hay) return;
    if (!mapaDemanda) {
      mapaDemanda = L.map('mapa-demanda', { scrollWheelZoom: false }).setView(DP.CENTRO_VE, 6);
      DP.capaMapa(mapaDemanda);
      capaDemanda = L.layerGroup().addTo(mapaDemanda);
    }
    setTimeout(() => mapaDemanda.invalidateSize(), 0);
    capaDemanda.clearLayers();
    for (const s of data) DP.puntoDemanda(s, yo).addTo(capaDemanda);
    mapaDemanda.fitBounds(L.latLngBounds(data.map(s => [s.lat, s.lng])).pad(0.2), { maxZoom: 12 });
  }
  cargarMapaDemanda();
  ['f-operacion', 'f-tipo', 'f-estado'].forEach(id => $(id).addEventListener('change', cargarMapaDemanda));

  // ---------- Tus búsquedas ----------
  async function cargarMias() {
    if (!yo) return;
    const { data } = await DP.sb.from('solicitudes').select('*').eq('user_id', yo).order('creado', { ascending: false });
    $('mis-solicitudes').hidden = !(data && data.length);
    $('lista-mias').innerHTML = (data || []).map(s => tarjeta(s, true)).join('');
  }
  $('lista-mias').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.borrar) {
      if (!confirm('¿Borrar esta búsqueda?')) return;
      await DP.sb.from('solicitudes').delete().eq('id', b.dataset.borrar);
    } else if (b.dataset.cerrar) {
      await DP.sb.from('solicitudes').update({ activo: false }).eq('id', b.dataset.cerrar);
    } else if (b.dataset.reabrir) {
      const { error } = await DP.sb.from('solicitudes').update({ activo: true }).eq('id', b.dataset.reabrir);
      if (error) alert(/máximo 5/.test(error.message) ? 'Puedes tener como máximo 5 búsquedas publicadas.' : 'No se pudo volver a publicar.');
    }
    cargarMias(); cargar(false);
  });
  cargarMias();

  // ---------- Publicar ----------
  const abrir = () => {
    if (!session) { location.href = 'entrar.html?next=' + encodeURIComponent('busco.html#publicar'); return; }
    $('form-solicitud').hidden = false; $('abrir-form').hidden = true;
    prepararMapaPin();
    $('form-solicitud').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ---------- Pin rojo: la zona donde busca ----------
  let mapaPin = null, pin = null;
  const iconoPin = () => L.divIcon({ className: 'icono-pin', html: '<span class="pin-rojo"></span>', iconSize: [26, 34], iconAnchor: [13, 32] });
  function prepararMapaPin() {
    if (mapaPin) { setTimeout(() => mapaPin.invalidateSize(), 0); return; }
    mapaPin = L.map('s-mapa', { scrollWheelZoom: false }).setView(DP.CENTRO_VE, 6);
    DP.capaMapa(mapaPin);
    mapaPin.on('click', e => ponerPin(e.latlng));
    setTimeout(() => mapaPin.invalidateSize(), 0);
  }
  function ponerPin(latlng) {
    if (!pin) {
      pin = L.marker(latlng, { icon: iconoPin(), draggable: true }).addTo(mapaPin);
    } else pin.setLatLng(latlng);
    $('s-ayuda-pin').textContent = 'Pin colocado. Puedes arrastrarlo para ajustarlo.';
    $('s-ayuda-pin').className = 'ayuda bien';
  }
  $('s-estado').addEventListener('change', () => {
    const c = DP.ESTADOS[$('s-estado').value];
    if (mapaPin && c && !pin) mapaPin.setView(c, 11);
  });
  $('abrir-form').addEventListener('click', abrir);
  $('s-cancelar').addEventListener('click', () => { $('form-solicitud').hidden = true; $('abrir-form').hidden = false; });
  if (location.hash === '#publicar' && session) abrir();

  const etiquetaPresupuesto = () => {
    $('l-presupuesto').innerHTML = ($('s-operacion').value === 'alquiler' ? 'Presupuesto máximo al mes en $' : 'Presupuesto máximo en $') + ' <small>(opcional)</small>';
  };
  $('s-operacion').addEventListener('change', etiquetaPresupuesto); etiquetaPresupuesto();
  $('s-descripcion').addEventListener('input', e => { $('s-cuenta').textContent = `${e.target.value.length} / 800 · mínimo 20 caracteres`; });

  $('form-solicitud').addEventListener('submit', async e => {
    e.preventDefault();
    const m = $('s-msg');
    const descripcion = $('s-descripcion').value.trim();
    if (!$('s-estado').value) return DP.mensaje(m, 'Elige el estado donde buscas.');
    if (descripcion.length < 20) return DP.mensaje(m, 'Cuéntanos un poco más (mínimo 20 caracteres).');
    if (!pin) { $('s-mapa').scrollIntoView({ behavior: 'smooth', block: 'center' }); return DP.mensaje(m, 'Marca en el mapa la zona donde buscas (toca el mapa para poner el pin rojo).'); }
    const { lat, lng } = pin.getLatLng();
    if (lat < 0.5 || lat > 12.6 || lng < -73.5 || lng > -59.5) return DP.mensaje(m, 'El pin debe estar dentro de Venezuela.');
    const perfil = await DP.miPerfil();
    if (!perfil || !perfil.usuario) return DP.mensaje(m, 'Antes de publicar, elige tu @usuario en «Mi perfil».');
    $('s-btn').disabled = true;
    const presupuesto = Number($('s-presupuesto').value) || null;
    const { error } = await DP.sb.from('solicitudes').insert({
      operacion: $('s-operacion').value, tipo: $('s-tipo').value || null, estado: $('s-estado').value,
      zona: $('s-zona').value.trim() || null, presupuesto, habitaciones: Number($('s-hab').value) || null, descripcion,
      lat, lng
    });
    $('s-btn').disabled = false;
    if (error) return DP.mensaje(m, /máximo 5/.test(error.message) ? 'Puedes tener como máximo 5 búsquedas publicadas. Cierra alguna antes.' : 'No se pudo publicar. Revisa los datos e inténtalo de nuevo.');
    $('form-solicitud').reset(); etiquetaPresupuesto();
    if (pin) { pin.remove(); pin = null; $('s-ayuda-pin').className = 'ayuda'; }
    cargarMapaDemanda();
    $('form-solicitud').hidden = true; $('abrir-form').hidden = false;
    DP.mensaje($('resumen-busco'), '');
    cargarMias(); cargar(false);
    $('mis-solicitudes').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
