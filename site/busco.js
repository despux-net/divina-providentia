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

  const haceCuanto = f => {
    const d = Math.floor((Date.now() - new Date(f)) / 864e5);
    return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
  };
  const que = s => {
    const tipo = s.tipo ? (DP.TIPOS[s.tipo] || 'inmueble').toLowerCase() : 'inmueble';
    return `Busca ${tipo} ${s.operacion === 'venta' ? 'para comprar' : 'en alquiler'}`;
  };
  const datos = s => [
    s.presupuesto ? `Hasta $${Number(s.presupuesto).toLocaleString('es-VE')}${s.operacion === 'alquiler' ? ' /mes' : ''}` : null,
    s.habitaciones ? `${s.habitaciones}+ hab.` : null
  ].filter(Boolean).join(' · ');

  function tarjeta(s, mia) {
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
        : `<span class="sol-autor">${perfil ? `<a href="${perfil}" class="sin-subrayado">` : ''}${DP.avatar({ nombre, avatar_url: s.avatar_url }, 28)}${perfil ? '</a>' : ''}
            ${perfil ? `<a href="${perfil}">${DP.esc(nombre)}</a>` : DP.esc(nombre)}
            ${s.valoraciones ? DP.estrellas(s.estrellas, s.valoraciones, true) : ''}
            <span class="insignia-gris">· ${haceCuanto(s.creado)}</span></span>
          ${s.user_id === yo ? '' : `<a class="boton peq" href="chat.html?con=${encodeURIComponent(s.user_id)}">Escribirle</a>`}`}
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
    $('form-solicitud').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
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
    const perfil = await DP.miPerfil();
    if (!perfil || !perfil.usuario) return DP.mensaje(m, 'Antes de publicar, elige tu @usuario en «Mi perfil».');
    $('s-btn').disabled = true;
    const presupuesto = Number($('s-presupuesto').value) || null;
    const { error } = await DP.sb.from('solicitudes').insert({
      operacion: $('s-operacion').value, tipo: $('s-tipo').value || null, estado: $('s-estado').value,
      zona: $('s-zona').value.trim() || null, presupuesto, habitaciones: Number($('s-hab').value) || null, descripcion
    });
    $('s-btn').disabled = false;
    if (error) return DP.mensaje(m, /máximo 5/.test(error.message) ? 'Puedes tener como máximo 5 búsquedas publicadas. Cierra alguna antes.' : 'No se pudo publicar. Revisa los datos e inténtalo de nuevo.');
    $('form-solicitud').reset(); etiquetaPresupuesto();
    $('form-solicitud').hidden = true; $('abrir-form').hidden = false;
    DP.mensaje($('resumen-busco'), '');
    cargarMias(); cargar(false);
    $('mis-solicitudes').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
