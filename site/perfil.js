// Mi perfil. Una sola cuenta (correo, contraseña y @usuario) con DOS perfiles
// públicos independientes: Real Estate (tabla profiles) e Industrial (tabla
// perfiles_industrial). /perfil.html edita el de Real Estate y
// /perfil.html?m=industrial el de Industrial. Lo demás (alertas, avisos,
// correo, eliminar cuenta) es de la cuenta y se comparte.
(async () => {
  const $ = id => document.getElementById(id);
  const session = await DP.cabecera();
  const MERCADO = new URLSearchParams(location.search).get('m') === 'industrial' ? 'industrial' : 'realestate';
  const IND_ = MERCADO === 'industrial';
  if (!session) { location.href = '/entrar.html?next=' + encodeURIComponent('/perfil.html' + location.search); return; }
  if (new URLSearchParams(location.search).get('bienvenida')) $('bienvenida').hidden = false;

  const cuenta = await DP.miPerfil();            // profiles: @usuario, avisos… y el perfil de Real Estate
  let perfil;                                      // los datos del mercado que se edita, con nombres comunes
  if (IND_) {
    const { data } = await DP.sb.from('perfiles_industrial').select('*').eq('user_id', session.user.id).maybeSingle();
    const i = data || {};
    perfil = { nombre: i.nombre, avatar_url: i.avatar_url, tipo_perfil: i.tipo_perfil, empresa: i.empresa, cargo: i.cargo, rif: i.rif,
      estado: i.estado, ciudad: i.ciudad, direccion: i.direccion, telefono: i.telefono, mostrar_telefono: i.mostrar_telefono,
      instagram: i.instagram, sitio_web: i.sitio_web, linkedin: i.linkedin, biografia: i.biografia, registro: i.registro,
      anios_experiencia: i.anios_experiencia, especialidades: i.especialidades, horario: i.horario, existe: !!data };
  } else {
    const c = cuenta;
    perfil = { nombre: c.full_name, avatar_url: c.avatar_url, tipo_perfil: c.tipo_perfil, empresa: c.empresa, cargo: c.cargo, rif: c.rif,
      estado: c.estado, ciudad: c.ciudad, direccion: c.direccion, telefono: c.phone, mostrar_telefono: c.mostrar_telefono,
      instagram: c.instagram, sitio_web: c.sitio_web, linkedin: c.linkedin, biografia: c.biography, registro: c.registro,
      anios_experiencia: c.anios_experiencia, especialidades: c.especialidades, horario: c.horario, existe: true };
  }

  // ---------- Pestañas y textos según el mercado ----------
  $('tab-' + MERCADO).setAttribute('aria-current', 'page');
  $('nota-mercado').textContent = IND_
    ? 'Este es tu perfil en Vivinati Industrial. Es independiente del de Real Estate: puedes usar otro nombre, foto, empresa y datos. Tu @usuario, tu correo y tu contraseña son los mismos.'
    : 'Este es tu perfil en Vivinati Real Estate. Tu perfil de Industrial es independiente: edítalo en la otra pestaña. Tu @usuario, tu correo y tu contraseña son los mismos.';
  DP.opciones($('tipo-perfil'), IND_ ? DP.TIPOS_PERFIL_IND : DP.TIPOS_PERFIL, 'Elige una opción');
  DP.opcionesEstados($('estado'), 'Elige un estado');
  if (IND_) {
    $('label-empresa').innerHTML = 'Empresa <small>(opcional)</small>';
    $('empresa').placeholder = 'Ej.: Suministros Industriales del Centro, C.A.';
    $('ciudad').placeholder = 'Ej.: Valencia, zona industrial Castillito';
    $('label-registro').textContent = 'Registro o certificaciones';
    $('registro').placeholder = 'Ej.: ISO 9001, distribuidor autorizado';
    $('especialidades').placeholder = 'Ej.: neumática, automatización, motores eléctricos, rodamientos';
    $('biografia').placeholder = 'Ej.: Distribuidores de componentes neumáticos y de automatización desde 2008. Stock en Valencia, envíos a todo el país. Atendemos a fábricas de alimentos, plásticos y metalmecánica.';
    document.querySelector('label[for="nombre"]').innerHTML = 'Nombre <small>(se verá en tus publicaciones de Industrial)</small>';
  }

  function rellenar() {
    $('correo').textContent = session.user.email;
    $('nombre').value = perfil.nombre || '';
    $('usuario').value = cuenta.usuario || '';
    $('tipo-perfil').value = perfil.tipo_perfil || '';
    $('empresa').value = perfil.empresa || '';
    $('cargo').value = perfil.cargo || '';
    $('rif').value = perfil.rif || '';
    $('estado').value = perfil.estado || '';
    $('ciudad').value = perfil.ciudad || '';
    $('direccion').value = perfil.direccion || '';
    $('registro').value = perfil.registro || '';
    $('anios').value = perfil.anios_experiencia ?? '';
    $('especialidades').value = (perfil.especialidades || []).join(', ');
    $('horario').value = perfil.horario || '';
    $('telefono').value = perfil.telefono || '';
    $('instagram').value = perfil.instagram || '';
    $('sitio-web').value = perfil.sitio_web || '';
    $('linkedin').value = perfil.linkedin || '';
    $('mostrar-telefono').checked = !!perfil.mostrar_telefono;
    $('biografia').value = perfil.biografia || '';
  }
  // Primera vez en Industrial: se proponen nombre, WhatsApp y estado de la cuenta (se pueden cambiar).
  if (IND_ && !perfil.existe) Object.assign(perfil, { nombre: cuenta.full_name, telefono: cuenta.phone, estado: cuenta.estado });
  rellenar();
  const contarBio = () => { $('ayuda-biografia').textContent = `${$('biografia').value.length} / 1.000 caracteres. Cuéntale a la gente a qué te dedicas, ${IND_ ? 'qué productos o servicios ofreces y a qué industrias atiendes' : 'en qué zonas trabajas y qué negocios buscas'}.`; };
  $('biografia').addEventListener('input', contarBio);
  contarBio();
  if (!cuenta.usuario) DP.mensaje($('msg'), 'Elige un @usuario para completar tu perfil.', 'ok');
  else if (IND_ && !perfil.existe) DP.mensaje($('msg'), 'Aún no has guardado tu perfil de Industrial. Revisa los datos y pulsa «Guardar cambios».', 'ok');

  // ---------- ¿Qué tan completo está el perfil? ----------
  function pintarCompleto() {
    const pasos = [
      [perfil.avatar_url, IND_ ? 'un logo o foto' : 'una foto'], [perfil.nombre, 'tu nombre'], [cuenta.usuario, 'un @usuario'],
      [perfil.tipo_perfil, 'el tipo de perfil'], [perfil.estado, 'tu estado'],
      [perfil.biografia, 'unas líneas «Sobre mí»'], [perfil.telefono || perfil.instagram || perfil.sitio_web, 'un contacto'],
      [perfil.empresa || perfil.cargo || (perfil.especialidades || []).length, 'información profesional']
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
    if (limpio === cuenta.usuario) { libre = true; ayuda.textContent = textoAyuda; ayuda.className = 'ayuda'; return; }
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
  const comoHttps = u => { u = (u || '').trim(); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u; return u.replace(/^http:\/\//i, 'https://'); };
  $('form-perfil').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('msg');
    const v = id => $(id).value.trim().replace(/\s+/g, ' ');
    const nombre = v('nombre'), usuario = v('usuario'), telefono = v('telefono');
    const web = comoHttps(v('sitio-web')), linkedin = comoHttps(v('linkedin'));
    const anios = $('anios').value === '' ? null : Number($('anios').value);
    const especialidades = [...new Set(v('especialidades').split(',').map(x => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
    const biografia = $('biografia').value.trim() || null;
    if (nombre.length < 2) return DP.mensaje(msg, 'Escribe tu nombre.');
    if (!/^[a-z0-9_]{3,20}$/.test(usuario)) return DP.mensaje(msg, 'El @usuario debe tener de 3 a 20 letras minúsculas, números o _.');
    if (libre === false) return DP.mensaje(msg, `@${usuario} no está disponible.`);
    if (telefono && telefono.replace(/\D/g, '').length < 10) return DP.mensaje(msg, 'Revisa el número de WhatsApp.');
    if (web && !/^https:\/\/[^\s<>"]+\.[^\s<>"]+$/.test(web)) return DP.mensaje(msg, 'Revisa la dirección de tu página web.');
    if (linkedin && !/^https:\/\/[^\s<>"]+\.[^\s<>"]+$/.test(linkedin)) return DP.mensaje(msg, 'Revisa el enlace de LinkedIn.');
    if (anios != null && !(anios >= 0 && anios <= 80)) return DP.mensaje(msg, 'Revisa los años de experiencia.');
    if ($('mostrar-telefono').checked && !telefono) return DP.mensaje(msg, 'Escribe tu WhatsApp o desmarca «Mostrar mi WhatsApp».');

    const datos = {
      tipo_perfil: $('tipo-perfil').value || null, empresa: v('empresa') || null, cargo: v('cargo') || null,
      rif: v('rif').toUpperCase() || null, estado: $('estado').value || null, ciudad: v('ciudad') || null,
      direccion: v('direccion') || null, registro: v('registro') || null, anios_experiencia: anios,
      especialidades: especialidades.length ? especialidades : null, horario: v('horario') || null,
      instagram: v('instagram') || null, sitio_web: web || null, linkedin: linkedin || null,
      mostrar_telefono: $('mostrar-telefono').checked
    };
    $('btn').disabled = true;
    let error;
    if (IND_) {
      // El @usuario vive en la cuenta; el resto, en el perfil de Industrial.
      if (usuario !== cuenta.usuario) ({ error } = await DP.sb.from('profiles').update({ usuario }).eq('id', session.user.id));
      if (!error) ({ error } = await DP.sb.from('perfiles_industrial').upsert({
        user_id: session.user.id, ...datos, nombre, telefono: telefono || null, biografia
      }));
    } else {
      ({ error } = await DP.sb.from('profiles').update({
        ...datos, full_name: nombre, usuario, phone: telefono || null, biography: biografia
      }).eq('id', session.user.id));
    }
    $('btn').disabled = false;
    if (error) {
      const m = error.message || '';
      return DP.mensaje(msg, /profiles_usuario_unico|duplicate/.test(m) ? `@${usuario} ya está en uso.`
        : /instagram/.test(m) ? 'Revisa tu usuario de Instagram.'
        : /sitio_web/.test(m) ? 'Revisa la dirección de tu página web.'
        : /linkedin/.test(m) ? 'Revisa el enlace de LinkedIn.' : DP.errorCuenta(error));
    }
    Object.assign(perfil, datos, { nombre, telefono, biografia, existe: true });
    cuenta.usuario = usuario;
    if (!IND_) Object.assign(cuenta, datos, { full_name: nombre, phone: telefono || null, biography: biografia });
    DP._perfil = cuenta;
    rellenar(); pintarCompleto();
    DP.cabecera();
    DP.mensaje(msg, 'Perfil guardado.', 'ok');
    pintarEnlacePublico();
  });

  // ---------- Avatar (o logo): foto cuadrada de 256 px en WebP (~15 KB) ----------
  function pintarAvatar() {
    $('avatar-actual').innerHTML = DP.avatar({ nombre: perfil.nombre || cuenta.usuario, avatar_url: perfil.avatar_url }, 112);
    $('quitar-avatar').hidden = !perfil.avatar_url;
  }
  pintarAvatar();
  function guardarAvatar(ruta) {
    if (IND_) return DP.sb.from('perfiles_industrial').upsert({ user_id: session.user.id, avatar_url: ruta });
    return DP.sb.from('profiles').update({ avatar_url: ruta }).eq('id', session.user.id);
  }
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
      const ruta = `${session.user.id}/${IND_ ? 'industrial' : 'avatar'}-${Date.now()}.${ext}`;
      const { error } = await DP.sb.storage.from('avatares').upload(ruta, blob, { contentType: blob.type, cacheControl: '31536000' });
      if (error) throw error;
      const anterior = perfil.avatar_url;
      const { error: e2 } = await guardarAvatar(ruta);
      if (e2) throw e2;
      if (anterior) DP.sb.storage.from('avatares').remove([anterior]);
      perfil.avatar_url = ruta; perfil.existe = true; if (!IND_) { cuenta.avatar_url = ruta; DP._perfil = cuenta; }
      pintarAvatar(); pintarCompleto(); DP.cabecera(); DP.mensaje(m, '¡Foto actualizada!', 'ok');
    } catch (err) { console.error(err); DP.mensaje(m, err.message && !/row-level|policy/i.test(err.message) ? err.message : 'No se pudo subir la foto.'); }
  });
  $('quitar-avatar').addEventListener('click', async () => {
    if (!perfil.avatar_url || !confirm('¿Quitar tu foto?')) return;
    const anterior = perfil.avatar_url;
    await guardarAvatar(null);
    DP.sb.storage.from('avatares').remove([anterior]);
    perfil.avatar_url = null; if (!IND_) { cuenta.avatar_url = null; DP._perfil = cuenta; } pintarAvatar(); pintarCompleto(); DP.cabecera();
  });

  // ---------- Mi puntuación acumulada ----------
  DP.resumenEstrellas(session.user.id, $('resumen-estrellas'), {
    pie: cuenta.usuario
      ? `Te valoran las personas con las que has conversado por el chat. <a href="/creador.html?u=${encodeURIComponent(cuenta.usuario)}#valoraciones">Ver los comentarios que te dejaron</a>.`
      : 'Te valoran las personas con las que has conversado por el chat.'
  });

  // ---------- Perfil público (portafolio) ----------
  function pintarEnlacePublico() {
    if (!cuenta.usuario) return;
    const url = `/creador.html?u=${encodeURIComponent(cuenta.usuario)}${IND_ ? '&m=industrial' : ''}`;
    $('enlace-publico').innerHTML = `Tu página pública en ${IND_ ? 'Industrial' : 'Real Estate'}: <a href="${url}">vivinati.com/@${DP.esc(cuenta.usuario)}${IND_ ? ' (Industrial)' : ''}</a>`;
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
      <a href="/realestate/buscar.html?${DP.urlDeFiltros(a.filtros)}">${DP.esc(a.nombre)}</a>
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
  $('avisos-chat').checked = cuenta.avisos_chat !== false;
  $('avisos-chat').addEventListener('change', async e => {
    const activo = e.target.checked;
    const { error } = await DP.sb.from('profiles').update({ avisos_chat: activo }).eq('id', session.user.id);
    if (error) { e.target.checked = !activo; return DP.mensaje($('msg-avisos'), 'No se pudo guardar. Inténtalo de nuevo.'); }
    cuenta.avisos_chat = activo; DP._perfil = cuenta;
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
      location.href = '/';
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
