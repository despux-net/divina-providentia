// Página pública de un creador: creador.html?u=usuario (y vivinati.com/@usuario,
// que 404.html redirige aquí). Muestra su portafolio de conceptos 3D y sus
// inmuebles activos. Nunca se muestra el correo; el WhatsApp solo si la
// persona marcó «Mostrar mi WhatsApp en mi perfil público».
(async () => {
  const $ = id => document.getElementById(id);
  DP.cabecera();
  const u = (new URLSearchParams(location.search).get('u') || '').toLowerCase().replace(/^@/, '');
  const { data } = /^[a-z0-9_]{3,20}$/.test(u) ? await DP.sb.rpc('perfil_por_usuario', { p_usuario: u }) : { data: null };
  const p = data && data[0];
  if (!p) { $('no-existe').hidden = false; return; }

  const nombre = p.nombre || '@' + p.usuario;
  document.title = `${nombre} (@${p.usuario}) — Vivinati`;
  $('nombre').textContent = nombre;
  $('usuario').textContent = '@' + p.usuario;
  $('avatar').innerHTML = DP.avatar({ nombre, avatar_url: p.avatar_url }, 88);
  $('valoracion').innerHTML = DP.estrellas(p.estrellas, p.valoraciones) +
    (p.miembro_desde ? ` <span class="insignia-gris">· En Vivinati desde ${new Date(p.miembro_desde + 'T12:00:00').toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })}</span>` : '');
  const etiquetas = DP.etiquetasPerfil(p);
  if (etiquetas) { $('etiquetas').innerHTML = etiquetas; $('etiquetas').hidden = false; }
  $('contactos').innerHTML = DP.contactosPerfil(p);
  if (p.biografia) { $('biografia').textContent = p.biografia; $('sobre-mi').hidden = false; }
  document.querySelector('meta[name="description"]').setAttribute('content',
    (p.biografia || `Perfil de ${nombre} en Vivinati: inmuebles y proyectos en Venezuela.`).slice(0, 160));
  $('perfil').hidden = false;

  const { data: filas } = await DP.sb.from('inmuebles').select('*').eq('user_id', p.id).eq('activo', true)
    .order('creado', { ascending: false }).limit(60);
  const todos = filas || [];
  const conceptos = todos.filter(DP.esConcepto), inmuebles = todos.filter(i => !DP.esConcepto(i));
  if (conceptos.length) { $('lista-conceptos').innerHTML = conceptos.map(DP.tarjeta).join(''); $('bloque-conceptos').hidden = false; }
  if (inmuebles.length) { $('lista-inmuebles').innerHTML = inmuebles.map(DP.tarjeta).join(''); $('bloque-inmuebles').hidden = false; }
  if (!todos.length) $('sin-nada').hidden = false;

  // Resumen: «Estudiante · UCV · Revit, Blender»
  const c = conceptos[0];
  const herr = [...new Set(conceptos.flatMap(x => x.herramientas || []))].slice(0, 6);
  $('resumen').textContent = [
    c && DP.ROLES[c.rol_autor], c && c.institucion,
    herr.length ? herr.join(', ') : null,
    `${todos.length} ${todos.length === 1 ? 'publicación' : 'publicaciones'}`
  ].filter(Boolean).join(' · ');

  // ---------- Valoraciones ----------
  const { data: { session } } = await DP.sb.auth.getSession();
  if (session && session.user.id !== p.id) { $('escribir').href = `chat.html?con=${p.id}`; $('escribir').hidden = false; }
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

  const enlace = `${location.origin}/@${p.usuario}`;
  $('compartir').addEventListener('click', async () => {
    if (navigator.share) return navigator.share({ title: document.title, url: enlace }).catch(() => {});
    try { await navigator.clipboard.writeText(enlace); $('compartir').textContent = '¡Enlace copiado!'; }
    catch { window.prompt('Copia este enlace:', enlace); }
  });
})();
