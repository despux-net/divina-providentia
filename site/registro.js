// Registro: nombre, @usuario, correo, contraseña (×2), «no soy un robot».
// La cuenta queda pendiente hasta que la persona abre el enlace del correo.
// La base de datos vuelve a comprobar el @usuario al crear el perfil
// (trigger handle_new_user), así que aquí solo se avisa antes.
(async () => {
  const $ = id => document.getElementById(id);
  const session = await DP.cabecera();
  if (session) { location.href = 'perfil.html'; return; }

  const robot = DP.antirrobot($('antirrobot'));
  const ayudaUsuario = $('ayuda-usuario');
  const textoAyuda = ayudaUsuario.textContent;
  let usuarioLibre = null, consulta = 0, temporizador;

  // @usuario: minúsculas al vuelo y comprobación de que está libre.
  $('usuario').addEventListener('input', () => {
    const el = $('usuario');
    const limpio = el.value.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
    if (limpio !== el.value) el.value = limpio;
    usuarioLibre = null;
    clearTimeout(temporizador);
    if (limpio.length < 3) { ayudaUsuario.textContent = textoAyuda; ayudaUsuario.className = 'ayuda'; return; }
    ayudaUsuario.textContent = 'Comprobando…'; ayudaUsuario.className = 'ayuda';
    temporizador = setTimeout(async () => {
      const id = ++consulta;
      const { data, error } = await DP.sb.rpc('usuario_disponible', { p_usuario: limpio });
      if (id !== consulta) return;
      usuarioLibre = error ? null : data;
      ayudaUsuario.textContent = error ? textoAyuda : data ? `@${limpio} está libre` : `@${limpio} no está disponible`;
      ayudaUsuario.className = 'ayuda ' + (error ? '' : data ? 'bien' : 'mal');
    }, 350);
  });

  // ¿Coinciden las contraseñas?
  const comprobarIguales = () => {
    const a = $('clave').value, b = $('clave2').value, ayuda = $('ayuda-clave2');
    if (!b) { ayuda.textContent = ''; return; }
    ayuda.textContent = a === b ? 'Coinciden' : 'No coinciden';
    ayuda.className = 'ayuda ' + (a === b ? 'bien' : 'mal');
  };
  $('clave').addEventListener('input', comprobarIguales);
  $('clave2').addEventListener('input', comprobarIguales);
  $('ver-clave').addEventListener('change', e => {
    $('clave').type = $('clave2').type = e.target.checked ? 'text' : 'password';
  });

  $('form-registro').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('msg');
    const nombre = $('nombre').value.trim().replace(/\s+/g, ' ');
    const usuario = $('usuario').value.trim();
    const email = $('email').value.trim().toLowerCase();
    const clave = $('clave').value, clave2 = $('clave2').value;

    if (nombre.length < 2) return DP.mensaje(msg, 'Escribe tu nombre.');
    if (!/^[a-z0-9_]{3,20}$/.test(usuario)) return DP.mensaje(msg, 'El @usuario debe tener de 3 a 20 letras minúsculas, números o _.');
    if (usuarioLibre === false) return DP.mensaje(msg, `@${usuario} no está disponible. Elige otro.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return DP.mensaje(msg, 'Revisa el correo electrónico.');
    const problema = DP.problemaContrasena(clave);
    if (problema) return DP.mensaje(msg, problema);
    if (clave !== clave2) return DP.mensaje(msg, 'Las dos contraseñas no coinciden.');
    if (robot.activo && !robot.token()) return DP.mensaje(msg, 'Marca la casilla «No soy un robot».');

    const btn = $('btn');
    btn.disabled = true; btn.textContent = 'Creando cuenta…';
    DP.mensaje(msg, '');

    const { data, error } = await DP.sb.auth.signUp({
      email, password: clave,
      options: {
        data: { usuario, nombre },
        emailRedirectTo: `${location.origin}/entrar.html?activada=1`,
        captchaToken: robot.token()
      }
    });
    btn.disabled = false; btn.textContent = 'Crear cuenta';
    robot.reiniciar();

    if (error) return DP.mensaje(msg, DP.errorCuenta(error));
    // Si el correo ya tenía cuenta, Supabase responde «bien» pero sin identidades
    // (para no revelar qué correos existen). Lo decimos sin confirmar nada.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return DP.mensaje(msg, 'Si ese correo ya tiene cuenta, entra con tu contraseña o recupérala desde «Entrar».');
    }
    if (data.session) { location.href = 'perfil.html'; return; } // verificación desactivada en Supabase
    $('form-registro').hidden = true;
    $('hecho-email').textContent = email;
    $('hecho').hidden = false;
  });
})();
