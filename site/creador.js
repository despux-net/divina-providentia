// Página pública de un creador: creador.html?u=usuario (y vivinati.com/@usuario,
// que 404.html redirige aquí). Muestra su portafolio de conceptos 3D y sus
// inmuebles activos. Nunca se muestra el correo ni el teléfono del perfil.
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
  $('avatar').textContent = nombre.replace('@', '').charAt(0).toUpperCase();
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

  const enlace = `${location.origin}/@${p.usuario}`;
  $('compartir').addEventListener('click', async () => {
    if (navigator.share) return navigator.share({ title: document.title, url: enlace }).catch(() => {});
    try { await navigator.clipboard.writeText(enlace); $('compartir').textContent = '¡Enlace copiado!'; }
    catch { window.prompt('Copia este enlace:', enlace); }
  });
})();
