// Mi perfil: foto, datos del perfil, contacto, «Sobre mí», puntuación,
// alertas, datos de acceso y eliminar cuenta. La RLS solo deja tocar la
// fila propia; el teléfono solo es público si la persona lo marca.
(async () => {
  const $ = id => document.getElementById(id);
  const session = await DP.cabecera();
  if (!session) { location.href = 'entrar.html?next=perfil.html'; return; }
  if (new URLSearchParams(location.search).get('bienvenida')) $('bienvenida').hidden = false;

  const perfil = await DP.miPerfil();
  DP.opciones($('tipo-perfil'), DP.TIPOS_PERFIL, 'Elige una opción');
  DP.opcionesEstados($('estado'), 'Elige un estado');

  function rellenar() {
    $('correo').textContent = session.user.email;
    $('nombre').value = perfil.full_name || '';
    $('usuario').value = perfil.usuario || '';
    $('tipo-perfil').value = perfil.tipo_perfil || '';
    $('empresa').value = perfil.empresa || '';
    $('estado').value = perfil.estado || '';
    $('ciudad').value = perfil.ciudad || '';
    $('telefono').value = perfil.phone || '';
    $('instagram').value = perfil.instagram || '';
    $('sitio-web').value = perfil.sitio_web || '';
    $('mostrar-telefono').checked = !!perfil.mostrar_telefono;
    $('biografia').value = perfil.biography || '';
  }
  rellenar();
  const contarBio = () => { $('ayuda-biografia').textContent = `${$('biografia').value.length} / 1.000 caracteres. Cuéntale a la gente a qué te dedicas, en qué zonas trabajas y qué negocios buscas.`; };
  $('biografia').addEventListener('input', contarBio);
  contarBio();
  if (!perfil.usuario) DP.mensaje($('msg'), 'Elige un @usuario para completar tu perfil.', 'ok');

  // ---------- ¿Qué tan completo está el perfil? ----------
  function pintarCompleto() {
    const pasos = [
      [perfil.avatar_url, 'una foto'], [perfil.full_name, 'tu nombre'], [perfil.usuario, 'un @usuario'],
      [perfil.tipo_perfil, 'el tipo de perfil'], [perfil.estado, 'tu estado'],
      [perfil.biography, 'unas líneas «Sobre mí»'], [perfil.phone || perfil.instagram || perfil.sitio_web, 'un contacto']
    ];
    const hechos = pasos.filter(p => p[0]).length, pct = Math.round(hechos / pasos.length * 100);
    const falta = pasos.filter(p => !p[0]).map(p => p[1]);
    $('completo-texto').textContent = pct === 100 ? '¡Tu perfil está completo!' : `Tu perfil está al ${pct} %`;
    $('completo-falta').textContent = falta.length ? `Falta: ${falta.slice(0, 3).join(', ')}${falta.length > 3 ? '…' : ''}` : 'Los perfiles completos generan más confianza.';
    $('completo-relleno').style.width = pct + '%';
    $('completo').classList.toggle('listo', pct === 100);
    $('completo').hidden = false;
  }
  pintarCompleto();

  // ---------- @usuario libre ----------
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
  $('instagram').addEventListener('input', e => {
    const limpio = e.target.value.toLowerCase().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/[^a-z0-9._]/g, '');
    if (limpio !== e.target.value) e.target.value = limpio;
  });

  // ---------- Guardar ----------
  $('form-perfil').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('msg');
    const v = id => $(id).value.trim().replace(/\s+/g, ' ');
    const nombre = v('nombre'), usuario = v('usuario'), telefono = v('telefono');
    let web = v('sitio-web');
    if (web && !/^https?:\/\//i.test(web)) web = 'https://' + web;
    web = web.replace(/^http:\/\//i, 'https://');
    if (nombre.length < 2) return DP.mensaje(msg, 'Escribe tu nombre.');
    if (!/^[a-z0-9_]{3,20}$/.test(usuario)) return DP.mensaje(msg, 'El @usuario debe tener de 3 a 20 letras minúsculas, números o _.');
    if (libre === false) return DP.mensaje(msg, `@${usuario} no está disponible.`);
    if (telefono && telefono.replace(/\D/g, '').length < 10) return DP.mensaje(msg, 'Revisa el número de WhatsApp.');
    if (web && !/^https:\/\/[^\s<>"]+\.[^\s<>"]+$/.test(web)) return DP.mensaje(msg, 'Revisa la dirección de tu página web.');
    if ($('mostrar-telefono').checked && !telefono) return DP.mensaje(msg, 'Escribe tu WhatsApp o desmarca «Mostrar mi WhatsApp».');

    const cambios = {
      full_name: nombre, usuario, phone: telefono || null,
      tipo_perfil: $('tipo-perfil').value || null, empresa: v('empresa') || null,
      estado: $('estado').value || null, ciudad: v('ciudad') || null,
      instagram: v('instagram') || null, sitio_web: web || null,
      mostrar_telefono: $('mostrar-telefono').checked,
      biography: $('biografia').value.trim() || null
    };
    $('btn').disabled = true;
    const { error } = await DP.sb.from('profiles').update(cambios).eq('id', session.user.id);
    $('btn').disabled = false;
    if (error) {
      const m = error.message || '';
      return DP.mensaje(msg, /profiles_usuario_unico|duplicate/.test(m) ? `@${usuario} ya está en uso.`
        : /instagram/.test(m) ? 'Revisa tu usuario de Instagram.'
        : /sitio_web/.test(m) ? 'Revisa la dirección de tu página web.' : DP.errorCuenta(error));
    }
    Object.assign(perfil, cambios);
    DP._perfil = perfil;
    rellenar(); pintarCompleto();
    DP.cabecera();
    DP.mensaje(msg, 'Perfil guardado.', 'ok');
    pintarEnlacePublico();
  });

  // ---------- Avatar: foto cuadrada de 256 px en WebP (~15 KB) ----------
  function pintarAvatar() {
    $('avatar-actual').innerHTML = DP.avatar({ nombre: perfil.full_name || perfil.usuario, avatar_url: perfil.avatar_url }, 112);
    $('quitar-avatar').hidden = !perfil.avatar_url;
  }
  pintarAvatar();
  async function recortar(file) {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) throw new Error('No se pudo leer esa imagen. Usa una foto JPG, PNG o WebP.');
    const lado = Math.min(bmp.width, bmp.height), T = 256;
    const c = Object.assign(document.createElement('canvas'), { width: T, height: T });
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, (bmp.width - lado) / 2, (bmp.height - lado) / 2, lado, lado, 0, 0, T, T);
    let blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.85));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    return blob;
  }
  $('archivo-avatar').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const m = $('msg-avatar');
    try {
      DP.mensaje(m, 'Subiendo foto…', 'ok');
      const blob = await recortar(f);
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      const ruta = `${session.user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await DP.sb.storage.from('avatares').upload(ruta, blob, { contentType: blob.type, cacheControl: '31536000' });
      if (error) throw error;
      const anterior = perfil.avatar_url;
      const { error: e2 } = await DP.sb.from('profiles').update({ avatar_url: ruta }).eq('id', session.user.id);
      if (e2) throw e2;
      if (anterior) DP.sb.storage.from('avatares').remove([anterior]);
      perfil.avatar_url = ruta; DP._perfil = perfil;
      pintarAvatar(); pintarCompleto(); DP.cabecera(); DP.mensaje(m, '¡Foto actualizada!', 'ok');
    } catch (err) { console.error(err); DP.mensaje(m, err.message && !/row-level|policy/i.test(err.message) ? err.message : 'No se pudo subir la foto.'); }
  });
  $('quitar-avatar').addEventListener('click', async () => {
    if (!perfil.avatar_url || !confirm('¿Quitar tu foto?')) return;
    const anterior = perfil.avatar_url;
    await DP.sb.from('profiles').update({ avatar_url: null }).eq('id', session.user.id);
    DP.sb.storage.from('avatares').remove([anterior]);
    perfil.avatar_url = null; DP._perfil = perfil; pintarAvatar(); pintarCompleto(); DP.cabecera();
  });

  // ---------- Mi puntuación acumulada ----------
  DP.resumenEstrellas(session.user.id, $('resumen-estrellas'), {
    pie: perfil.usuario
      ? `Te valoran las personas con las que has conversado por el chat. <a href="creador.html?u=${encodeURIComponent(perfil.usuario)}#valoraciones">Ver los comentarios que te dejaron</a>.`
      : 'Te valoran las personas con las que has conversado por el chat.'
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

  // ---------- Avisos por correo de mensajes nuevos del chat ----------
  $('avisos-chat').checked = perfil.avisos_chat !== false;
  $('avisos-chat').addEventListener('change', async e => {
    const activo = e.target.checked;
    const { error } = await DP.sb.from('profiles').update({ avisos_chat: activo }).eq('id', session.user.id);
    if (error) { e.target.checked = !activo; return DP.mensaje($('msg-avisos'), 'No se pudo guardar. Inténtalo de nuevo.'); }
    perfil.avisos_chat = activo; DP._perfil = perfil;
    DP.mensaje($('msg-avisos'), activo ? 'Te avisaremos por correo de los mensajes nuevos.' : 'Ya no te enviaremos avisos de mensajes.', 'ok');
  });

  // ---------- Datos de acceso: cambiar correo ----------
  $('form-correo').addEventListener('submit', async e => {
    e.preventDefault();
    const m = $('msg-correo'), nuevo = $('correo-nuevo').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevo)) return DP.mensaje(m, 'Escribe un correo válido.');
    if (nuevo === session.user.email) return DP.mensaje(m, 'Ese ya es tu correo.');
    $('btn-correo').disabled = true;
    const { error } = await DP.sb.auth.updateUser({ email: nuevo }, { emailRedirectTo: location.origin + '/perfil.html' });
    $('btn-correo').disabled = false;
    if (error) return DP.mensaje(m, DP.errorCuenta(error));
    $('correo-nuevo').value = '';
    DP.mensaje(m, `Listo. Te enviamos un enlace de confirmación a ${nuevo} (y un aviso a tu correo actual). El cambio se aplica cuando lo confirmes.`, 'ok');
  });

  // ---------- Eliminar cuenta ----------
  $('confirmar-borrado').addEventListener('input', e => { $('btn-eliminar').disabled = e.target.value.trim().toUpperCase() !== 'ELIMINAR'; });
  $('btn-eliminar').addEventListener('click', async () => {
    if (!confirm('Última confirmación: ¿eliminar tu cuenta y todo su contenido para siempre?')) return;
    const m = $('msg-eliminar'), uid = session.user.id;
    $('btn-eliminar').disabled = true;
    DP.mensaje(m, 'Borrando tus fotos y tus datos…', 'ok');
    try {
      for (const bucket of ['inmuebles', 'avatares']) {
        for (let vuelta = 0; vuelta < 20; vuelta++) {
          const { data } = await DP.sb.storage.from(bucket).list(uid, { limit: 1000 });
          const rutas = (data || []).filter(f => f.id).map(f => `${uid}/${f.name}`);
          if (!rutas.length) break;
          const { error } = await DP.sb.storage.from(bucket).remove(rutas);
          if (error) break;
        }
      }
      const { error } = await DP.sb.rpc('eliminar_mi_cuenta');
      if (error) throw error;
      try { indexedDB.deleteDatabase('vivinati-chat'); localStorage.removeItem('dp_favoritos'); } catch { /* nada */ }
      await DP.sb.auth.signOut().catch(() => {});
      location.href = 'index.html';
    } catch (err) {
      console.error(err);
      $('btn-eliminar').disabled = false;
      DP.mensaje(m, err.message || 'No se pudo eliminar la cuenta. Inténtalo de nuevo.');
    }
  });

  // ---------- Menú lateral: marcar la sección visible ----------
  const enlaces = [...document.querySelectorAll('.menu-cuenta a[data-seccion]')];
  const marcar = id => enlaces.forEach(a => a.classList.toggle('activo', a.dataset.seccion === id));
  marcar('datos');
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(entradas => {
      const vis = entradas.filter(x => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) marcar(vis.target.id);
    }, { rootMargin: '-15% 0px -70% 0px' });
    enlaces.forEach(a => { const s = $(a.dataset.seccion); if (s) obs.observe(s); });
  }
  if (location.hash && $(location.hash.slice(1))) setTimeout(() => $(location.hash.slice(1)).scrollIntoView(), 300);
})();
