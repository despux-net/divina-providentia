// Entrar con correo y contraseña. También:
//  - llegada desde el enlace de activación (?activada=1): Supabase deja la sesión abierta;
//  - «¿Olvidaste tu contraseña?» → correo con enlace a restablecer.html;
//  - reenviar el correo de activación si la cuenta aún no está activa.
(async () => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const destino = DP.siguiente();
  $('link-registro').href = 'registro.html' + (params.get('next') ? '?next=' + encodeURIComponent(destino) : '');

  // El enlace del correo trae la sesión en la URL; supabase-js la recoge solo.
  const { data: { session } } = await DP.sb.auth.getSession();
  await DP.cabecera();
  if (params.get('activada') && session) {
    $('activada').hidden = false;
    $('bloque-entrar').hidden = true;
    setTimeout(() => { location.href = 'perfil.html?bienvenida=1'; }, 1800);
    return;
  }
  if (session) { location.href = destino; return; }
  const errorEnlace = new URLSearchParams(location.hash.slice(1)).get('error_description');
  if (errorEnlace) DP.mensaje($('msg'), 'El enlace no es válido o ya caducó. Entra con tu contraseña o pide uno nuevo.');

  let robot = DP.antirrobot($('antirrobot'));
  let robotOlvido = null;

  $('form-entrar').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('msg');
    const email = $('email').value.trim().toLowerCase(), clave = $('clave').value;
    if (!email || !clave) return DP.mensaje(msg, 'Escribe tu correo y tu contraseña.');
    if (robot.activo && !robot.token()) return DP.mensaje(msg, 'Marca la casilla «No soy un robot».');
    const btn = $('btn');
    btn.disabled = true; btn.textContent = 'Entrando…';
    const { error } = await DP.sb.auth.signInWithPassword({ email, password: clave, options: { captchaToken: robot.token() } });
    btn.disabled = false; btn.textContent = 'Entrar';
    robot.reiniciar();
    if (!error) { location.href = destino; return; }
    DP.mensaje(msg, DP.errorCuenta(error));
    $('btn-reenviar').hidden = !/Email not confirmed/i.test(error.message || '');
  });

  $('btn-reenviar').addEventListener('click', async () => {
    const msg = $('msg');
    if (robot.activo && !robot.token()) return DP.mensaje(msg, 'Marca la casilla «No soy un robot» y pulsa de nuevo.');
    const { error } = await DP.sb.auth.resend({
      type: 'signup', email: $('email').value.trim().toLowerCase(),
      options: { emailRedirectTo: `${location.origin}/entrar.html?activada=1`, captchaToken: robot.token() }
    });
    robot.reiniciar();
    DP.mensaje(msg, error ? DP.errorCuenta(error) : 'Te reenviamos el correo de activación. Revisa también «Spam».', error ? 'error' : 'ok');
  });

  // ---------- Recuperar contraseña ----------
  $('link-olvido').addEventListener('click', e => {
    e.preventDefault();
    $('bloque-entrar').hidden = true;
    $('bloque-olvido').hidden = false;
    $('email-olvido').value = $('email').value;
    if (!robotOlvido) robotOlvido = DP.antirrobot($('antirrobot-olvido'));
  });
  $('volver-entrar').addEventListener('click', () => {
    $('bloque-olvido').hidden = true;
    $('bloque-entrar').hidden = false;
  });
  $('form-olvido').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('msg-olvido');
    const email = $('email-olvido').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return DP.mensaje(msg, 'Revisa el correo electrónico.');
    if (robotOlvido.activo && !robotOlvido.token()) return DP.mensaje(msg, 'Marca la casilla «No soy un robot».');
    const btn = $('btn-olvido');
    btn.disabled = true;
    const { error } = await DP.sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/restablecer.html`, captchaToken: robotOlvido.token()
    });
    btn.disabled = false;
    robotOlvido.reiniciar();
    // Mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados.
    DP.mensaje(msg, error && !/not found/i.test(error.message || '') ? DP.errorCuenta(error)
      : 'Si hay una cuenta con ese correo, te llegará un enlace para elegir una contraseña nueva.', error ? 'error' : 'ok');
  });
})();
