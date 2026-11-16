// Elegir contraseña nueva. Se llega:
//  - desde el correo «Elige una contraseña nueva» (Supabase abre una sesión de recuperación), o
//  - desde «Cambiar contraseña» en el perfil (sesión normal).
(async () => {
  const $ = id => document.getElementById(id);

  // Si el enlace caducó o ya se usó, Supabase lo indica en la URL (#error=...).
  const hash = new URLSearchParams(location.hash.slice(1));
  const errorEnlace = hash.get('error_code') || hash.get('error');

  const { data: { session } } = await DP.sb.auth.getSession();
  DP.cabecera();
  if (errorEnlace || !session) { $('sin-enlace').hidden = false; return; }

  $('para-quien').textContent = `Cuenta: ${session.user.email}`;
  $('para-quien').hidden = false;
  $('form-clave').hidden = false;
  $('clave').focus();

  const comprobar = () => {
    const a = $('clave').value, b = $('clave2').value;
    const ayuda1 = $('ayuda-clave'), ayuda2 = $('ayuda-clave2');
    if (a) {
      const problema = DP.problemaContrasena(a);
      ayuda1.textContent = problema || 'Contraseña válida';
      ayuda1.className = 'ayuda ' + (problema ? 'mal' : 'bien');
    } else { ayuda1.textContent = 'Mínimo 8 caracteres, con letras y números'; ayuda1.className = 'ayuda'; }
    if (b) {
      ayuda2.textContent = a === b ? 'Coinciden' : 'No coinciden';
      ayuda2.className = 'ayuda ' + (a === b ? 'bien' : 'mal');
    } else ayuda2.textContent = '';
  };
  $('clave').addEventListener('input', comprobar);
  $('clave2').addEventListener('input', comprobar);

  $('form-clave').addEventListener('submit', async e => {
    e.preventDefault();
    const clave = $('clave').value, clave2 = $('clave2').value;
    const problema = DP.problemaContrasena(clave);
    if (problema) return DP.mensaje($('msg'), problema);
    if (clave !== clave2) return DP.mensaje($('msg'), 'Las dos contraseñas no coinciden.');
    $('btn').disabled = true; $('btn').textContent = 'Guardando…';
    const { error } = await DP.sb.auth.updateUser({ password: clave });
    $('btn').disabled = false; $('btn').textContent = 'Guardar contraseña';
    if (error) return DP.mensaje($('msg'), DP.errorCuenta(error));
    // Si alguien más tenía la contraseña vieja, pierde su sesión.
    await DP.sb.auth.signOut({ scope: 'others' }).catch(() => {});
    $('form-clave').hidden = true;
    $('para-quien').hidden = true;
    $('hecho').hidden = false;
  });
})();
