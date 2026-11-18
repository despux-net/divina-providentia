// Página pública de una persona o empresa: creador.html?u=usuario
// (y vivinati.com/@usuario, que 404.html redirige aquí).
// Cada cuenta tiene dos perfiles independientes: Real Estate (por defecto) e
// Industrial (&m=industrial). Nunca se muestra el correo; el WhatsApp solo si
// la persona marcó «Mostrar mi WhatsApp» en ese perfil.
(async () => {
  const $ = id => document.getElementById(id);
  DP.cabecera();
  const params = new URLSearchParams(location.search);
  const u = (params.get('u') || '').toLowerCase().replace(/^@/, '');
  let mercado = params.get('m') === 'industrial' ? 'industrial' : 'realestate';
  const pedir = m => DP.sb.rpc('perfil_mercado', { p_usuario: u, p_mercado: m });
  const { data } = /^[a-z0-9_]{3,20}$/.test(u) ? await pedir(mercado) : { data: null };
  let p = data && data[0];
  if (!p) { $('no-existe').hidden = false; return; }
  // Sin perfil de Real Estate pero con Industrial: se muestra Industrial.
  if (mercado === 'realestate' && !p.tiene_realestate && p.tiene_industrial) {
    mercado = 'industrial';
    const r = await pedir('industrial');
    p = r.data[0];
  }
  const IND_ = mercado === 'industrial';

  // Pestañas solo si tiene los dos perfiles
  if (p.tiene_industrial && p.tiene_realestate) {
    $('tab-realestate').href = `/creador.html?u=${encodeURIComponent(p.usuario)}`;
    $('tab-industrial').href = `/creador.html?u=${encodeURIComponent(p.usuario)}&m=industrial`;
    $('tab-' + mercado).setAttribute('aria-current', 'page');
    $('pestanas').hidden = false;
  }

  const nombre = p.nombre || '@' + p.usuario;
  document.title = `${nombre} (@${p.usuario})${IND_ ? ' · Industrial' : ''} — Vivinati`;
  $('nombre').textContent = nombre;
  $('usuario').textContent = '@' + p.usuario + (IND_ ? ' · Vivinati Industrial' : '');
  $('avatar').innerHTML = DP.avatar({ nombre, avatar_url: p.avatar_url }, 88);
  $('valoracion').innerHTML = DP.estrellas(p.estrellas, p.valoraciones) +
    (p.miembro_desde ? ` <span class="insignia-gris">· En Vivinati desde ${new Date(p.miembro_desde + 'T12:00:00').toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })}</span>` : '');
  const etiquetas = DP.etiquetasPerfil(p);
  if (etiquetas) { $('etiquetas').innerHTML = etiquetas; $('etiquetas').hidden = false; }
  $('contactos').innerHTML = DP.contactosPerfil(p);
  if (p.biografia) { $('biografia').textContent = p.biografia; $('sobre-mi').hidden = false; }

  // Información profesional
  const pro = [
    ['Empresa', p.empresa], ['Cargo', p.cargo], ['RIF', p.rif], ['Dirección', p.direccion],
    [IND_ ? 'Registro o certificaciones' : 'Registro o colegiatura', p.registro],
    ['Experiencia', p.anios_experiencia != null ? `${p.anios_experiencia} ${p.anios_experiencia === 1 ? 'año' : 'años'}` : null],
    ['Especialidades', (p.especialidades || []).join(', ')], ['Horario', p.horario]
  ].filter(([, v]) => v);
  if (pro.length) {
    $('datos-profesionales').innerHTML = pro.map(([k, v]) => `<div><dt>${DP.esc(k)}</dt><dd>${DP.esc(v)}</dd></div>`).join('');
    $('profesional').hidden = false;
  }
  document.querySelector('meta[name="description"]').setAttribute('content',
    (p.biografia || `Perfil de ${nombre} en Vivinati ${IND_ ? 'Industrial' : 'Real Estate'}.`).slice(0, 160));
  $('perfil').hidden = false;

  // Publicaciones del mercado que se está viendo
  let total = 0;
  if (IND_) {
    const { data: prods } = await DP.sb.rpc('buscar_productos', { p_vendedor: p.id, p_limite: 60 });
    total = (prods || []).length;
    if (total) { $('lista-productos').innerHTML = prods.map(IND.tarjeta).join(''); $('bloque-productos').hidden = false; }
    $('resumen').textContent = [p.tipo_perfil && DP.TIPOS_PERFIL_IND[p.tipo_perfil], `${total} ${total === 1 ? 'publicación' : 'publicaciones'} en Industrial`].filter(Boolean).join(' · ');
  } else {
    const { data: filas } = await DP.sb.from('inmuebles').select('*').eq('user_id', p.id).eq('activo', true)
      .order('creado', { ascending: false }).limit(60);
    const todos = filas || [];
    total = todos.length;
    const conceptos = todos.filter(DP.esConcepto), inmuebles = todos.filter(i => !DP.esConcepto(i));
    if (conceptos.length) { $('lista-conceptos').innerHTML = conceptos.map(DP.tarjeta).join(''); $('bloque-conceptos').hidden = false; }
    if (inmuebles.length) { $('lista-inmuebles').innerHTML = inmuebles.map(DP.tarjeta).join(''); $('bloque-inmuebles').hidden = false; }
    // Resumen: «Estudiante · UCV · Revit, Blender»
    const c = conceptos[0];
    const herr = [...new Set(conceptos.flatMap(x => x.herramientas || []))].slice(0, 6);
    $('resumen').textContent = [
      c && DP.ROLES[c.rol_autor], c && c.institucion,
      herr.length ? herr.join(', ') : null,
      `${todos.length} ${todos.length === 1 ? 'publicación' : 'publicaciones'}`
    ].filter(Boolean).join(' · ');
  }
  if (!total) $('sin-nada').hidden = false;

  // ---------- Valoraciones ----------
  const { data: { session } } = await DP.sb.auth.getSession();
  if (session && session.user.id !== p.id) { $('escribir').href = `/chat.html?con=${p.id}`; $('escribir').hidden = false; }
  async function cargarResenas() {
    const { data: rs } = await DP.sb.rpc('resenas_de', { p_usuario: p.id, p_limite: 30 });
    $('titulo-resenas').textContent = rs && rs.length ? `Valoraciones (${rs.length})` : 'Valoraciones';
    $('resenas').innerHTML = rs && rs.length ? rs.map(r => `<article class="resena">
        <div class="resena-cab">${DP.avatar({ nombre: r.autor_nombre || r.autor_usuario, avatar_url: r.autor_avatar }, 34)}
          <div><strong>${DP.esc(r.autor_nombre || '@' + r.autor_usuario)}</strong><br>${DP.cincoEstrellas(r.estrellas)}</div>
          <span class="fecha">${new Date(r.creado).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
        ${r.comentario ? `<p>${DP.esc(r.comentario)}</p>` : ''}</article>`).join('')
      : '<p class="ayuda">Todavía nadie ha valorado a esta persona.</p>';
  }
  cargarResenas();
  DP.resumenEstrellas(p.id, $('resumen-estrellas'));

  // Solo puede valorar quien ha conversado con esta persona (los dos escribieron).
  if (session && session.user.id !== p.id) {
    const { data: puede } = await DP.sb.rpc('puede_valorar', { p_usuario: p.id });
    if (puede) {
      const { data: mia } = await DP.sb.from('valoraciones').select('*').eq('autor_id', session.user.id).eq('usuario_id', p.id).maybeSingle();
      let elegidas = mia ? mia.estrellas : 0;
      $('valorar').innerHTML = `<form class="form-valorar" id="form-valorar">
        <strong>${mia ? 'Tu valoración' : 'Valora a ' + DP.esc(nombre.split(' ')[0])}</strong>
        <div class="elegir-estrellas" role="radiogroup" aria-label="Estrellas">${[1, 2, 3, 4, 5].map(n =>
          `<button type="button" data-n="${n}" aria-label="${n} estrella${n > 1 ? 's' : ''}">★</button>`).join('')}</div>
        <textarea id="comentario" maxlength="600" rows="3" placeholder="Cuenta cómo fue el trato (opcional)">${DP.esc(mia && mia.comentario || '')}</textarea>
        <div id="msg-valorar"></div>
        <p style="margin:0"><button class="boton peq" type="submit">${mia ? 'Guardar cambios' : 'Publicar valoración'}</button></p></form>`;
      const pintarEstrellas = () => document.querySelectorAll('.elegir-estrellas button').forEach(b => b.classList.toggle('on', Number(b.dataset.n) <= elegidas));
      pintarEstrellas();
      document.querySelector('.elegir-estrellas').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        elegidas = Number(b.dataset.n); pintarEstrellas();
      });
      $('form-valorar').addEventListener('submit', async e => {
        e.preventDefault();
        if (!elegidas) return DP.mensaje($('msg-valorar'), 'Elige de 1 a 5 estrellas.');
        const fila = { autor_id: session.user.id, usuario_id: p.id, estrellas: elegidas,
          comentario: $('comentario').value.trim() || null, actualizado: new Date().toISOString() };
        const { error } = mia
          ? await DP.sb.from('valoraciones').update(fila).eq('id', mia.id)
          : await DP.sb.from('valoraciones').insert(fila);
        if (error) return DP.mensaje($('msg-valorar'), 'No se pudo guardar la valoración.');
        DP.mensaje($('msg-valorar'), '¡Gracias! Tu valoración ya está publicada.', 'ok');
        cargarResenas();
      });
    } else if (location.hash === '#valorar') {
      $('valorar').innerHTML = '<p class="ayuda">Podrás valorar a esta persona cuando ambos se hayan escrito por el chat de Vivinati.</p>';
    }
    if (location.hash === '#valorar') $('valoraciones').scrollIntoView();
  }

  const enlace = `${location.origin}/@${p.usuario}` + (IND_ ? '?m=industrial' : '');
  $('compartir').addEventListener('click', async () => {
    if (navigator.share) return navigator.share({ title: document.title, url: enlace }).catch(() => {});
    try { await navigator.clipboard.writeText(enlace); $('compartir').textContent = '¡Enlace copiado!'; }
    catch { window.prompt('Copia este enlace:', enlace); }
  });
})();
