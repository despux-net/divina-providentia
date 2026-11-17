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
  // Vuelta de Google: las cuentas nuevas aún no tienen @usuario → a elegirlo.
  if (params.get('oauth') && session) {
    const p = await DP.miPerfil();
    location.href = p && p.usuario ? destino : 'perfil.html?bienvenida=1';
    return;
  }
  if (session) { location.href = destino; return; }
  DP.botonesSociales($('sociales'), destino);
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
    if (!error) {
      btn.disabled = true; btn.textContent = 'Preparando tu chat cifrado…';
      try {
        const r = await DP.e2e.desbloquear(clave);
        if (r === 'contraseña') await DP.e2e.nuevasClaves(clave);
      } catch (err) { console.error(err); /* el chat pedirá la contraseña más tarde */ }
      location.href = destino; return;
    }
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
  // El correo puede venir del registro («ese correo ya tiene cuenta»), sin pasar por la URL.
  let emailGuardado = '';
  try { emailGuardado = sessionStorage.getItem('dp_email') || ''; sessionStorage.removeItem('dp_email'); } catch { /* nada */ }

  const verOlvido = (mostrar) => {
    $('bloque-entrar').hidden = mostrar;
    $('bloque-olvido').hidden = !mostrar;
    $('form-olvido').hidden = false;
    $('olvido-enviado').hidden = true;
    if (mostrar) {
      $('email-olvido').value = $('email').value || emailGuardado;
      if (!robotOlvido) robotOlvido = DP.antirrobot($('antirrobot-olvido'));
      $('email-olvido').focus();
    }
  };
  $('link-olvido').addEventListener('click', e => { e.preventDefault(); verOlvido(true); });
  $('volver-entrar').addEventListener('click', () => verOlvido(false));
  $('olvido-volver').addEventListener('click', () => verOlvido(false));
  if (params.get('olvido')) verOlvido(true);

  async function pedirEnlace(email) {
    const { error } = await DP.sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/restablecer.html`, captchaToken: robotOlvido.token()
    });
    robotOlvido.reiniciar();
    return error;
  }

  // Tras enviar: confirmación y botón de reenviar con espera de 60 s
  // (Supabase no deja pedir otro enlace al mismo correo antes de un minuto).
  let esperaId;
  function mostrarEnviado(email) {
    $('form-olvido').hidden = true;
    $('olvido-email').textContent = email;
    $('olvido-enviado').hidden = false;
    const b = $('olvido-reenviar');
    let s = 60;
    b.disabled = true; b.textContent = `Reenviar (${s})`;
    clearInterval(esperaId);
    esperaId = setInterval(() => {
      s--;
      if (s > 0) { b.textContent = `Reenviar (${s})`; return; }
      clearInterval(esperaId);
      b.disabled = false; b.textContent = 'Reenviar el correo';
    }, 1000);
  }

  $('form-olvido').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('msg-olvido');
    const email = $('email-olvido').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return DP.mensaje(msg, 'Revisa el correo electrónico.');
    if (robotOlvido.activo && !robotOlvido.token()) return DP.mensaje(msg, 'Marca la casilla «No soy un robot».');
    const btn = $('btn-olvido');
    btn.disabled = true; btn.textContent = 'Enviando…';
    const error = await pedirEnlace(email);
    btn.disabled = false; btn.textContent = 'Enviar enlace';
    // Mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados.
    if (error && !/not found/i.test(error.message || '')) return DP.mensaje(msg, DP.errorCuenta(error));
    DP.mensaje(msg, '');
    mostrarEnviado(email);
  });

  // Reenviar: hace falta volver a pasar el «No soy un robot», así que se vuelve al formulario.
  $('olvido-reenviar').addEventListener('click', () => {
    $('olvido-enviado').hidden = true;
    $('form-olvido').hidden = false;
    DP.mensaje($('msg-olvido'), 'Marca de nuevo «No soy un robot» y pulsa «Enviar enlace».', 'ok');
  });
})();
