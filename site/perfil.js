// Perfil: nombre, @usuario y WhatsApp. Las cuentas antiguas (sin @usuario)
// lo eligen aquí. La RLS solo deja tocar la fila propia.
(async () => {
  const $ = id => document.getElementById(id);
  const session = await DP.cabecera();
  if (!session) { location.href = 'entrar.html?next=perfil.html'; return; }
  if (new URLSearchParams(location.search).get('bienvenida')) $('bienvenida').hidden = false;

  const perfil = await DP.miPerfil();
  $('correo').textContent = `Correo: ${session.user.email}`;
  $('nombre').value = perfil.full_name || '';
  $('usuario').value = perfil.usuario || '';
  $('telefono').value = perfil.phone || '';
  if (!perfil.usuario) DP.mensaje($('msg'), 'Elige un @usuario para completar tu perfil.', 'ok');

  const ayuda = $('ayuda-usuario'), textoAyuda = ayuda.textContent;
  let libre = true, temporizador, consulta = 0;
  $('usuario').addEventListener('input', () => {
    const el = $('usuario');
    const limpio = el.value.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
    if (limpio !== el.value) el.value = limpio;
    clearTimeout(temporizador);
    if (limpio === perfil.usuario) { libre = true; ayuda.textContent = textoAyuda; ayuda.className = 'ayuda'; return; }
    libre = null;
    if (limpio.length < 3) { ayuda.textContent = textoAyuda; ayuda.className = 'ayuda'; return; }
    temporizador = setTimeout(async () => {
      const id = ++consulta;
      const { data } = await DP.sb.rpc('usuario_disponible', { p_usuario: limpio });
      if (id !== consulta) return;
      libre = data;
      ayuda.textContent = data ? `@${limpio} está libre` : `@${limpio} no está disponible`;
      ayuda.className = 'ayuda ' + (data ? 'bien' : 'mal');
    }, 350);
  });

  $('form-perfil').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('msg');
    const nombre = $('nombre').value.trim().replace(/\s+/g, ' ');
    const usuario = $('usuario').value.trim();
    const telefono = $('telefono').value.trim();
    if (nombre.length < 2) return DP.mensaje(msg, 'Escribe tu nombre.');
    if (!/^[a-z0-9_]{3,20}$/.test(usuario)) return DP.mensaje(msg, 'El @usuario debe tener de 3 a 20 letras minúsculas, números o _.');
    if (libre === false) return DP.mensaje(msg, `@${usuario} no está disponible.`);
    if (telefono && telefono.replace(/\D/g, '').length < 10) return DP.mensaje(msg, 'Revisa el número de WhatsApp.');

    $('btn').disabled = true;
    const { error } = await DP.sb.from('profiles')
      .update({ full_name: nombre, usuario, phone: telefono || null })
      .eq('id', session.user.id);
    $('btn').disabled = false;
    if (error) {
      const m = error.message || '';
      return DP.mensaje(msg, /profiles_usuario_unico|duplicate/.test(m) ? `@${usuario} ya está en uso.` : DP.errorCuenta(error));
    }
    Object.assign(perfil, { full_name: nombre, usuario, phone: telefono || null });
    DP._perfil = perfil;
    DP.cabecera();
    DP.mensaje(msg, 'Perfil guardado.', 'ok');
    pintarEnlacePublico();
  });

  // ---------- Perfil público (portafolio) ----------
  function pintarEnlacePublico() {
    if (!perfil.usuario) return;
    $('enlace-publico').innerHTML = `Tu página pública: <a href="creador.html?u=${encodeURIComponent(perfil.usuario)}">vivinati.com/@${DP.esc(perfil.usuario)}</a>`;
    $('enlace-publico').hidden = false;
  }
  pintarEnlacePublico();

  // ---------- Mis alertas ----------
  async function cargarAlertas() {
    const { data, error } = await DP.sb.from('alertas').select('id, nombre, filtros, activa, creado').order('creado', { ascending: false });
    const ul = $('lista-alertas');
    if (error) { ul.innerHTML = '<li class="ayuda">No se pudieron cargar tus alertas.</li>'; return; }
    if (!data.length) { ul.innerHTML = '<li class="ayuda">Aún no tienes alertas.</li>'; return; }
    ul.innerHTML = data.map(a => `<li class="${a.activa ? '' : 'pausada'}">
      <a href="buscar.html?${DP.urlDeFiltros(a.filtros)}">${DP.esc(a.nombre)}</a>
      <span class="estado-alerta">${a.activa ? 'Activa' : 'Pausada'}</span>
      <span class="acciones-alerta">
        <button type="button" class="enlace" data-alternar="${a.id}" data-activa="${a.activa}">${a.activa ? 'Pausar' : 'Reanudar'}</button>
        <button type="button" class="enlace peligro" data-borrar="${a.id}">Borrar</button>
      </span></li>`).join('');
  }
  $('lista-alertas').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.borrar) {
      if (!confirm('¿Borrar esta alerta?')) return;
      await DP.sb.from('alertas').delete().eq('id', b.dataset.borrar);
    } else if (b.dataset.alternar) {
      await DP.sb.from('alertas').update({ activa: b.dataset.activa !== 'true' }).eq('id', b.dataset.alternar);
    }
    cargarAlertas();
  });
  cargarAlertas();
  if (location.hash === '#alertas') setTimeout(() => $('alertas').scrollIntoView(), 300);
})();
