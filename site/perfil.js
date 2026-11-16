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
  });
})();
