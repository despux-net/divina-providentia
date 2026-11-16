// Lista de los anuncios de quien tiene la sesión: pausar, editar, borrar.
(async () => {
  const $ = id => document.getElementById(id);
  const session = await DP.cabecera();
  if (!session) { location.href = 'publicar.html'; return; }
  const uid = session.user.id;

  async function cargar() {
    const { data, error } = await DP.sb.from('inmuebles').select('*').eq('user_id', uid).order('creado', { ascending: false });
    if (error) { $('lista').textContent = 'No se pudieron cargar tus anuncios.'; console.error(error); return; }
    if (!data.length) {
      $('lista').innerHTML = `<div class="vacio"><strong>Aún no has publicado nada</strong>
        <p><a class="boton" href="publicar.html">Publicar mi primer inmueble</a></p></div>`;
      return;
    }
    $('lista').innerHTML = data.map(i => {
      const foto = DP.fotoUrl(i.fotos && i.fotos[0]);
      return `<div class="item-mio" data-id="${DP.esc(i.id)}">
        ${foto ? `<img src="${DP.esc(foto)}" alt="">` : '<div class="sinfoto">Sin fotos</div>'}
        <div class="info">
          <a href="anuncio.html?id=${encodeURIComponent(i.id)}"><strong>${DP.esc(i.titulo)}</strong></a>
          <div class="lugar">${DP.esc(DP.precio(i))} · ${DP.esc(DP.lugar(i))}</div>
          <span class="etiqueta ${i.activo ? '' : 'gris'}">${i.activo ? 'Publicado' : 'Pausado'}</span>
        </div>
        <div class="acciones">
          <a class="boton sec peq" href="publicar.html?id=${encodeURIComponent(i.id)}">Editar</a>
          <button class="boton sec peq" data-accion="pausar" data-activo="${i.activo}">${i.activo ? 'Pausar' : 'Reactivar'}</button>
          <button class="boton peligro peq" data-accion="borrar">Borrar</button>
        </div></div>`;
    }).join('');
    window._mios = Object.fromEntries(data.map(i => [i.id, i]));
  }

  $('lista').addEventListener('click', async e => {
    const b = e.target.closest('button[data-accion]'); if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    $('msg').innerHTML = '';
    b.disabled = true;
    if (b.dataset.accion === 'pausar') {
      const { error } = await DP.sb.from('inmuebles').update({ activo: b.dataset.activo !== 'true' }).eq('id', id);
      if (error) $('msg').innerHTML = `<div class="mensaje error">${DP.esc(error.message)}</div>`;
    } else {
      if (!confirm('¿Borrar este anuncio para siempre? Se borrarán también sus fotos. No se puede deshacer.')) { b.disabled = false; return; }
      const fotos = ((window._mios[id] || {}).fotos || []).filter(r => r.startsWith(uid + '/'));
      const { error } = await DP.sb.from('inmuebles').delete().eq('id', id);
      if (error) $('msg').innerHTML = `<div class="mensaje error">${DP.esc(error.message)}</div>`;
      else if (fotos.length) await DP.sb.storage.from('inmuebles').remove(fotos);
    }
    cargar();
  });

  cargar();
})();
