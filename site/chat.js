// Mensajes entre usuarios (chat.html), cifrados de extremo a extremo.
//   chat.html               → lista de conversaciones
//   chat.html?c=<id>        → abre una conversación
//   chat.html?con=<usuario>&anuncio=<id> → abre (o crea) la conversación con esa persona
// El servidor solo guarda texto cifrado; aquí se descifra con la clave de
// este navegador (ver cifrado.js).
(async () => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const { data: { session } } = await DP.sb.auth.getSession();
  if (!session) { location.href = 'entrar.html?next=' + encodeURIComponent('chat.html' + location.search); return; }
  DP.cabecera();
  const yo = session.user.id;
  let convs = [], actual = null, canal = null;

  const hora = t => {
    const d = new Date(t), hoy = new Date();
    return d.toDateString() === hoy.toDateString()
      ? d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  };

  // ---------- 1) ¿Puede este navegador leer los mensajes? ----------
  async function prepararClaves() {
    const estado = await DP.e2e.estado();
    if (estado === 'lista') return true;
    $('sin-conversacion').hidden = true;
    $('desbloquear').hidden = false;
    // Cuentas creadas con Google: no tienen contraseña de Vivinati, así que
    // el respaldo de la clave del chat se protege con una «clave del chat».
    const sinContraseña = !((session.user.app_metadata || {}).providers || []).includes('email');
    if (sinContraseña) {
      $('etiqueta-clave').textContent = 'Clave del chat';
      $('clave').autocomplete = estado === 'sin-claves' ? 'new-password' : 'current-password';
      $('texto-desbloquear').textContent = estado === 'sin-claves'
        ? 'Entraste con Google, así que crea una clave para tu chat cifrado (mínimo 8 caracteres). Te la pediremos al abrir tus mensajes en otro teléfono u ordenador. Guárdala bien: Vivinati no la conoce y no puede recuperarla.'
        : 'Para leer tus mensajes en este navegador, escribe la clave del chat que creaste la primera vez. Solo se usa aquí, en tu dispositivo.';
    } else if (estado === 'sin-claves') {
      // Nunca se crearon claves (cuenta anterior al chat): hace falta entrar con la contraseña.
      $('texto-desbloquear').textContent = 'Para activar tu chat cifrado, vuelve a entrar con tu correo y contraseña (solo esta vez).';
      $('form-desbloquear').hidden = true;
      $('volver-a-entrar').hidden = false;
      $('btn-reentrar').addEventListener('click', async () => {
        await DP.sb.auth.signOut();
        location.href = 'entrar.html?next=' + encodeURIComponent('chat.html' + location.search);
      });
    }
    return new Promise(listo => {
      $('form-desbloquear').addEventListener('submit', async e => {
        e.preventDefault();
        if (sinContraseña && estado === 'sin-claves' && $('clave').value.length < 8) return DP.mensaje($('msg-desbloquear'), 'La clave del chat debe tener al menos 8 caracteres.');
        const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Abriendo…';
        const r = await DP.e2e.desbloquear($('clave').value).catch(() => 'error');
        b.disabled = false; b.textContent = 'Abrir mis mensajes';
        if (r === 'ok' || r === 'nueva') { $('desbloquear').hidden = true; $('clave').value = ''; listo(true); }
        else DP.mensaje($('msg-desbloquear'), r === 'contraseña' ? (sinContraseña ? 'Esa no es la clave de tu chat. Inténtalo de nuevo.' : 'Esa no es tu contraseña. Inténtalo de nuevo.') : 'No se pudo abrir el chat.');
      });
    });
  }

  // ---------- 2) Lista de conversaciones ----------
  async function cargarLista() {
    const { data, error } = await DP.sb.rpc('mis_conversaciones');
    if (error) { $('lista').innerHTML = '<li class="chat-vacio-lista">No se pudieron cargar tus mensajes.</li>'; return; }
    convs = data || [];
    $('lista').innerHTML = convs.length ? convs.map(c => `<li><button type="button" data-c="${c.id}" aria-current="${actual && actual.id === c.id}">
        ${DP.avatar({ nombre: c.otro_nombre || c.otro_usuario, avatar_url: c.otro_avatar }, 44)}
        <span class="info"><strong>${DP.esc(c.otro_nombre || '@' + c.otro_usuario)}</strong>
          <span>${DP.esc(c.inmueble_titulo || '@' + c.otro_usuario)}</span><span>${hora(c.ultimo)}</span></span>
        ${c.no_leidos ? `<span class="contador">${c.no_leidos}</span>` : ''}</button></li>`).join('')
      : '<li class="chat-vacio-lista">Aún no tienes conversaciones. Escribe a alguien desde un anuncio publicado en Vivinati.</li>';
  }
  $('lista').addEventListener('click', e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    abrir(convs.find(c => c.id === b.dataset.c));
  });
  $('volver').addEventListener('click', () => { $('app').classList.remove('viendo'); history.replaceState(null, '', 'chat.html'); });

  // ---------- 3) Una conversación ----------
  function pintarMensaje(m, texto) {
    const mia = m.emisor_id === yo;
    const div = document.createElement('div');
    div.className = `burbuja ${mia ? 'mia' : 'suya'}`;
    div.dataset.id = m.id;
    div.innerHTML = (texto == null ? '<em>No se puede descifrar este mensaje (se envió con una clave anterior).</em>' : DP.esc(texto).replace(/\n/g, '<br>')) +
      `<span class="hora">${hora(m.creado)}${mia && m.leido_en ? ' · Leído' : ''}</span>`;
    $('mensajes').appendChild(div);
    // Aviso de seguridad (una vez por conversación) si te piden pagos o adelantos.
    if (!mia && texto && DP.pareceEstafa(texto) && !$('mensajes').querySelector('.aviso-estafa')) {
      const aviso = document.createElement('div');
      aviso.className = 'aviso-estafa';
      aviso.setAttribute('role', 'note');
      aviso.innerHTML = '<strong>⚠️ Cuidado con los pagos por adelantado</strong>No envíes dinero, reservas ni depósitos sin haber visitado el inmueble y comprobado quién es el propietario. Vivinati nunca te pedirá pagos. <a href="seguridad.html" target="_blank" rel="noopener">Cómo evitar estafas</a>';
      $('mensajes').appendChild(aviso);
    }
  }
  async function abrir(c) {
    if (!c) return;
    actual = c;
    history.replaceState(null, '', 'chat.html?c=' + c.id);
    $('app').classList.add('viendo');
    $('sin-conversacion').hidden = true;
    $('vista-conv').hidden = false;
    $('vista-conv').style.display = 'contents';
    $('conv-avatar').innerHTML = DP.avatar({ nombre: c.otro_nombre || c.otro_usuario, avatar_url: c.otro_avatar }, 40);
    $('conv-nombre').innerHTML = `<a href="creador.html?u=${encodeURIComponent(c.otro_usuario)}">${DP.esc(c.otro_nombre || '@' + c.otro_usuario)}</a>`;
    const a = $('conv-anuncio');
    a.hidden = !c.inmueble_id;
    if (c.inmueble_id) { a.href = 'anuncio.html?id=' + c.inmueble_id; a.textContent = c.inmueble_titulo || 'Ver anuncio'; }
    document.querySelectorAll('#lista [data-c]').forEach(b => b.setAttribute('aria-current', b.dataset.c === c.id));

    $('mensajes').innerHTML = '<p class="chat-seguridad">Descifrando…</p>';
    const { data } = await DP.sb.from('mensajes').select('*').eq('conversacion_id', c.id).order('creado', { ascending: true }).limit(300);
    if (actual !== c) return;
    $('mensajes').innerHTML = '';
    for (const m of data || []) pintarMensaje(m, await DP.e2e.descifrar(m, c.otro_id));
    if (!data || !data.length) $('mensajes').innerHTML = '<p class="chat-seguridad">Escribe el primer mensaje. Solo tú y esta persona podrán leerlo.</p>';
    $('mensajes').scrollTop = $('mensajes').scrollHeight;
    DP.sb.rpc('marcar_leidos', { p_conv: c.id }).then(() => { c.no_leidos = 0; cargarLista(); DP.contarMensajes && DP.contarMensajes(); });

    // Código de seguridad para comprobar el cifrado en persona o por teléfono
    try {
      const codigo = await DP.e2e.codigo(c.otro_id);
      $('seguridad').innerHTML = `🔒 Cifrado de extremo a extremo · <button type="button" class="enlace" id="ver-codigo">Código de seguridad</button>`;
      $('ver-codigo').addEventListener('click', () => alert(`Código de seguridad de esta conversación:\n\n${codigo}\n\nSi tu contacto ve el mismo código en su pantalla, nadie más puede leer vuestros mensajes.`));
    } catch {
      $('seguridad').textContent = 'Esta persona aún no ha activado su chat cifrado: podrá leerte cuando entre en Vivinati.';
    }
    // ¿Ya se puede valorar? (los dos han escrito)
    DP.sb.rpc('puede_valorar', { p_usuario: c.otro_id }).then(({ data: puede }) => {
      const v = $('conv-valorar');
      v.hidden = !puede;
      v.href = `creador.html?u=${encodeURIComponent(c.otro_usuario)}#valorar`;
    });
    $('texto').focus();
  }

  $('texto').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('form-msg').requestSubmit(); } });
  $('form-msg').addEventListener('submit', async e => {
    e.preventDefault();
    const texto = $('texto').value.trim();
    if (!texto || !actual) return;
    const b = e.target.querySelector('button'); b.disabled = true;
    try {
      await DP.e2e.enviar(actual.otro_id, actual.inmueble_id, texto, actual.id);
      $('texto').value = '';
    } catch (err) {
      alert(err.message === 'sin-clave-otro'
        ? 'Esta persona aún no ha activado su chat cifrado. Podrás escribirle cuando entre en Vivinati.'
        : (err.message || 'No se pudo enviar.'));
    }
    b.disabled = false; $('texto').focus();
  });

  // ---------- 4) Mensajes nuevos en tiempo real ----------
  function escuchar() {
    canal = DP.sb.channel('mensajes-' + yo)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, async ({ new: m }) => {
        if (actual && m.conversacion_id === actual.id) {
          const vacio = $('mensajes').querySelector('.chat-seguridad');
          if (vacio) vacio.remove();
          if (!$('mensajes').querySelector(`[data-id="${m.id}"]`)) pintarMensaje(m, await DP.e2e.descifrar(m, actual.otro_id));
          $('mensajes').scrollTop = $('mensajes').scrollHeight;
          if (m.emisor_id !== yo) DP.sb.rpc('marcar_leidos', { p_conv: actual.id });
        }
        cargarLista();
      })
      .subscribe();
  }

  // ---------- Arranque ----------
  if (!(await prepararClaves())) return;
  await cargarLista();
  escuchar();
  if (params.get('con')) {
    const { data: cid, error } = await DP.sb.rpc('abrir_conversacion', { p_otro: params.get('con'), p_inmueble: params.get('anuncio') || null });
    if (error) { alert(error.message); return; }
    await cargarLista();
    abrir(convs.find(c => c.id === cid));
  } else if (params.get('c')) {
    abrir(convs.find(c => c.id === params.get('c')));
  }
})();
