// Contacto: guarda el mensaje en la tabla contacto_web (solo el admin la lee
// en Supabase). Muestra el correo y las redes si están en ajustes_sitio.
(async () => {
  const $ = id => document.getElementById(id);
  const session = await DP.cabecera();
  const params = new URLSearchParams(location.search);
  if (params.get('motivo') && [...$('c-motivo').options].some(o => o.value === params.get('motivo'))) $('c-motivo').value = params.get('motivo');
  if (params.get('enlace') && /^https?:\/\//.test(params.get('enlace'))) $('c-enlace').value = params.get('enlace').slice(0, 300);

  if (session) {
    const p = await DP.miPerfil();
    if (p && p.full_name) $('c-nombre').value = p.full_name;
    $('c-correo').value = session.user.email || '';
  }

  DP.ajustes().then(a => {
    const correo = a.correo_contacto;
    if (correo && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(correo)) {
      $('correo-publico').innerHTML = `También puedes escribirnos a <a href="mailto:${DP.esc(correo)}">${DP.esc(correo)}</a>.`;
      $('correo-publico').hidden = false;
    }
    const redes = DP.iconosRedes(a), caja = document.querySelector('main [data-redes]');
    if (redes) { caja.innerHTML = redes; caja.hidden = false; }
  });

  const robot = DP.antirrobot($('antirrobot'));

  $('c-mensaje').addEventListener('input', e => { $('c-cuenta').textContent = `${e.target.value.length.toLocaleString('es-VE')} / 2.000`; });

  $('form-contacto').addEventListener('submit', async e => {
    e.preventDefault();
    const m = $('c-msg');
    const nombre = $('c-nombre').value.trim().replace(/\s+/g, ' ');
    const correo = $('c-correo').value.trim().toLowerCase();
    const mensaje = $('c-mensaje').value.trim();
    let enlace = $('c-enlace').value.trim();
    if (enlace && !/^https?:\/\//i.test(enlace)) enlace = 'https://' + enlace;
    if (nombre.length < 2) return DP.mensaje(m, 'Escribe tu nombre.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return DP.mensaje(m, 'Revisa tu correo: lo necesitamos para responderte.');
    if (mensaje.length < 10) return DP.mensaje(m, 'Cuéntanos un poco más (mínimo 10 caracteres).');
    if (enlace && !DP.urlSegura(enlace)) return DP.mensaje(m, 'Revisa el enlace.');
    if (robot.activo && !robot.token()) return DP.mensaje(m, 'Marca la casilla «No soy un robot».');

    $('c-btn').disabled = true; $('c-btn').textContent = 'Enviando…';
    // Se envía por la función «contacto», que comprueba el «No soy un robot» con Cloudflare.
    const { error } = await DP.sb.functions.invoke('contacto', {
      body: { nombre, correo, motivo: $('c-motivo').value, mensaje, enlace: enlace || null, token: robot.token() }
    });
    $('c-btn').disabled = false; $('c-btn').textContent = 'Enviar mensaje';
    robot.reiniciar();
    if (error) {
      let codigo = '';
      try { codigo = (await error.context.json()).error; } catch { /* sin detalle */ }
      return DP.mensaje(m, codigo === 'demasiados'
        ? 'Ya recibimos varios mensajes tuyos en la última hora. Espera un poco antes de enviar otro.'
        : codigo === 'robot' ? 'No pudimos comprobar que no eres un robot. Marca de nuevo la casilla e inténtalo otra vez.'
        : 'No se pudo enviar. Revisa los datos e inténtalo de nuevo.');
    }
    $('form-contacto').reset();
    if (session && DP._perfil) { $('c-nombre').value = DP._perfil.full_name || ''; $('c-correo').value = session.user.email || ''; }
    DP.mensaje(m, '¡Mensaje enviado! Te responderemos a tu correo.', 'ok');
  });
})();
