// Ficha de una publicación de Vivinati Industrial: producto.html?id=<uuid>
(async () => {
  const $ = id => document.getElementById(id);
  const id = new URLSearchParams(location.search).get('id');
  const session = await DP.cabecera();

  const fin = ok => { $('cargando').hidden = true; $('no-existe').hidden = ok; $('ficha').hidden = !ok; };
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return fin(false);
  const { data: p } = await DP.sb.from('productos').select('*').eq('id', id).maybeSingle();
  if (!p) return fin(false);
  const { data: vend } = await DP.sb.rpc('vendedor_de_producto', { p_producto: id });
  const v = (vend || [])[0];
  const mio = session && session.user.id === p.user_id;

  // ---------- Textos ----------
  const cat = IND.nombreCategoria(p.categoria);
  document.title = `${p.titulo} — Vivinati Industrial`;
  $('migas').innerHTML = `<a href="/industrial/">Industrial</a> › <a href="/industrial/buscar.html?categoria=${p.categoria}">${DP.esc(cat)}</a>` +
    (p.estado ? ` › <a href="/industrial/buscar.html?categoria=${p.categoria}&estado=${encodeURIComponent(p.estado)}">${DP.esc(p.estado)}</a>` : '');
  $('titulo').textContent = p.titulo;
  $('subtitulo').textContent = [IND.OPERACIONES[p.operacion], cat, IND.lugar(p)].filter(Boolean).join(' · ');
  $('precio').textContent = IND.precio(p);
  const datos = [
    ['Condición', IND.CONDICIONES[p.condicion]], ['Marca', p.marca], ['Modelo', p.modelo], ['Año', p.anio],
    ['Disponibles', p.cantidad != null ? Number(p.cantidad).toLocaleString('es-VE') : null],
    ['Envíos', p.envios ? 'Hace envíos' : null], ['Referencia', p.referencia]
  ].filter(([, x]) => x != null && x !== '');
  $('datos').innerHTML = datos.map(([k, x]) => `<div><dt>${DP.esc(k)}</dt><dd>${DP.esc(x)}</dd></div>`).join('');
  $('datos').hidden = !datos.length;
  $('descripcion').textContent = p.descripcion || 'Sin descripción.';
  $('fecha').textContent = `Publicado el ${new Date(p.creado).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}` +
    (p.actualizado && new Date(p.actualizado) - new Date(p.creado) > 864e5 ? ` · actualizado el ${new Date(p.actualizado).toLocaleDateString('es-VE', { day: 'numeric', month: 'long' })}` : '');
  $('reportar').href = `/contacto.html?motivo=estafa&enlace=${encodeURIComponent(location.href)}`;

  // ---------- Fotos ----------
  const fotos = (p.fotos || []).map(DP.fotoUrl).filter(Boolean);
  let n = 0;
  const ver = k => {
    n = (k + fotos.length) % fotos.length;
    $('foto-principal').src = fotos[n];
    $('contador-fotos').textContent = `${n + 1} / ${fotos.length}`;
    document.querySelectorAll('#miniaturas button').forEach((b, i) => b.setAttribute('aria-current', i === n));
  };
  if (fotos.length) {
    $('foto-principal').alt = p.titulo;
    $('miniaturas').innerHTML = fotos.length > 1 ? fotos.map((f, i) => `<button type="button" data-n="${i}"><img src="${DP.esc(f)}" alt="Foto ${i + 1}" loading="lazy"></button>`).join('') : '';
    $('miniaturas').addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (b) ver(Number(b.dataset.n)); });
    $('foto-ant').hidden = $('foto-sig').hidden = $('contador-fotos').hidden = fotos.length < 2;
    $('foto-ant').addEventListener('click', () => ver(n - 1));
    $('foto-sig').addEventListener('click', () => ver(n + 1));
    ver(0);
  } else {
    $('visor').innerHTML = `<div class="sinfoto sinfoto-ficha">${IND.icono(p.categoria, 64)}</div>`;
  }

  // ---------- Quien lo ofrece ----------
  const wa = DP.numeroWa(p.whatsapp) || (v && DP.numeroWa(v.whatsapp));
  const mensajeWa = encodeURIComponent(`Hola, vi tu publicación «${p.titulo}» en Vivinati (${location.href}). ¿Sigue disponible?`);
  if (v) {
    const nombre = v.empresa || v.nombre || '@' + v.usuario;
    const desde = v.miembro_desde ? new Date(v.miembro_desde).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }) : '';
    $('vendedor').innerHTML = `
      <a class="anfitrion-cab" href="/creador.html?u=${encodeURIComponent(v.usuario)}">${DP.avatar({ nombre, avatar_url: v.avatar_url }, 56)}
        <span><strong>${DP.esc(nombre)}</strong>${v.empresa && v.nombre ? `<small>${DP.esc(v.nombre)}</small>` : ''}
        <small>${DP.esc([DP.TIPOS_PERFIL[v.tipo_perfil], [v.ciudad, v.estado].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</small></span></a>
      <p>${DP.estrellas(v.estrellas, v.valoraciones)}</p>
      <p class="ayuda">${v.publicaciones} ${v.publicaciones === 1 ? 'publicación' : 'publicaciones'} en Industrial${desde ? ` · en Vivinati desde ${DP.esc(desde)}` : ''}</p>
      <div class="anfitrion-botones">
        ${mio ? `<a class="boton" href="/industrial/publicar.html?id=${p.id}">Editar publicación</a> <a class="boton sec" href="/industrial/mis-publicaciones.html">Mis publicaciones</a>`
          : `<a class="boton" href="/chat.html?con=${encodeURIComponent(v.id)}&producto=${encodeURIComponent(p.id)}">Escribir por el chat</a>
             ${wa ? `<a class="boton sec wa-sec" href="https://wa.me/${wa}?text=${mensajeWa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}`}
        <a class="boton sec" href="/creador.html?u=${encodeURIComponent(v.usuario)}">Ver perfil</a>
      </div>`;
  }

  // ---------- Compartir ----------
  $('comp-wa').href = `https://wa.me/?text=${encodeURIComponent(`${p.titulo} · ${IND.precio(p)} — ${location.href}`)}`;
  $('comp-copiar').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); $('comp-copiar').textContent = 'Enlace copiado'; } catch { prompt('Copia el enlace:', location.href); }
  });

  fin(true);

  // ---------- Más de la categoría ----------
  const { data: otros } = await DP.sb.rpc('buscar_productos', { p_categoria: p.categoria, p_limite: 5 });
  const lista = (otros || []).filter(x => x.id !== p.id).slice(0, 4);
  if (lista.length) { $('lista-similares').innerHTML = lista.map(IND.tarjeta).join(''); $('similares').hidden = false; }
})();
