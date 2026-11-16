// Ficha de un inmueble: anuncio.html?id=<uuid>
(async () => {
  const $ = id => document.getElementById(id);
  DP.cabecera();
  // Si venimos de la búsqueda, «volver» conserva los filtros que había.
  try {
    const ref = new URL(document.referrer);
    if (ref.origin === location.origin && /(\/|index\.html|buscar\.html|conceptos\.html)$/.test(ref.pathname)) $('volver').href = ref.href;
  } catch { /* sin referrer */ }

  const id = new URLSearchParams(location.search).get('id');
  const valido = /^[0-9a-f-]{36}$/i.test(id || '');
  const { data: i, error } = valido
    ? await DP.sb.from('inmuebles').select('*').eq('id', id).maybeSingle()
    : { data: null, error: null };

  $('cargando').hidden = true;
  if (error) console.error(error);
  if (!i) { $('no-existe').hidden = false; return; }

  document.title = `${i.titulo} — Vivinati`;
  $('ficha').hidden = false;

  // Fotos
  const fotos = (i.fotos || []).map(DP.fotoUrl).filter(Boolean);
  const principal = $('foto-principal');
  let actual = 0;
  const mostrar = n => {
    actual = (n + fotos.length) % fotos.length;
    principal.src = fotos[actual];
    principal.alt = `Foto ${actual + 1} de ${i.titulo}`;
    $('contador-fotos').textContent = `${actual + 1} / ${fotos.length}`;
    document.querySelectorAll('#miniaturas button').forEach((b, k) => {
      b.setAttribute('aria-current', k === actual);
      if (k === actual) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };
  if (fotos.length) {
    if (fotos.length > 1) {
      $('miniaturas').innerHTML = fotos.map((f, n) =>
        `<button type="button" data-n="${n}" aria-label="Ver foto ${n + 1}"><img src="${DP.esc(f)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join('');
      $('miniaturas').addEventListener('click', e => { const b = e.target.closest('button'); if (b) mostrar(Number(b.dataset.n)); });
      $('foto-ant').hidden = $('foto-sig').hidden = $('contador-fotos').hidden = false;
      $('foto-ant').addEventListener('click', () => mostrar(actual - 1));
      $('foto-sig').addEventListener('click', () => mostrar(actual + 1));
      document.addEventListener('keydown', e => {
        if (/input|textarea|select/i.test(e.target.tagName)) return;
        if (e.key === 'ArrowLeft') mostrar(actual - 1);
        if (e.key === 'ArrowRight') mostrar(actual + 1);
      });
      // Deslizar con el dedo en el móvil.
      let x0 = null;
      $('visor').addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
      $('visor').addEventListener('touchend', e => {
        if (x0 == null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) mostrar(actual + (dx < 0 ? 1 : -1));
        x0 = null;
      });
    }
    mostrar(0);
    // Anuncios externos: guardamos hasta 8 fotos; la galería completa está en el original.
    const original = DP.urlSegura(i.url_original);
    if (original && (i.fotos_total || 0) > fotos.length) {
      $('mas-fotos').innerHTML = `Mostrando ${fotos.length} de ${i.fotos_total} fotos · <a href="${DP.esc(original)}" target="_blank" rel="noopener nofollow">Ver las ${i.fotos_total} fotos en ${DP.esc(i.fuente || 'el anuncio original')}</a>`;
      $('mas-fotos').hidden = false;
    }
  } else {
    $('visor').replaceWith(Object.assign(document.createElement('div'), { className: 'vacio', textContent: 'Este anuncio no tiene fotos' }));
  }

  // Datos
  const fuente = i.origen === 'externo' && i.fuente ? `<span class="etiqueta gris">${DP.esc(i.fuente)}</span>` : '';
  const concepto = DP.esConcepto(i);
  $('etiquetas').innerHTML = `<span class="etiqueta op-${DP.esc(i.operacion)}">${DP.esc(DP.OPERACIONES[i.operacion])}</span>
    ${concepto
      ? `<span class="etiqueta gris">${DP.esc(DP.ETAPAS[i.etapa] || '')}</span><span class="etiqueta gris">${DP.esc(DP.CATEGORIAS[i.categoria_proyecto] || '')}</span>`
      : `<span class="etiqueta gris">${DP.esc(DP.TIPOS[i.tipo] || i.tipo)}</span>`}${fuente}
    ${i.activo ? '' : '<span class="etiqueta gris">Pausado (solo lo ves tú)</span>'}`;
  $('titulo').textContent = i.titulo;
  $('precio').textContent = DP.precio(i);
  $('lugar').textContent = DP.lugar(i);
  $('descripcion').textContent = i.descripcion || 'Sin descripción.';
  const caract = concepto ? [
    ['Categoría', DP.CATEGORIAS[i.categoria_proyecto]], ['Etapa', DP.ETAPAS[i.etapa]],
    ['Tipo propuesto', DP.TIPOS[i.tipo]]
  ].filter(([, v]) => v) : [
    ['Habitaciones', i.habitaciones], ['Baños', i.banos],
    ['Superficie', i.metros != null ? `${Number(i.metros).toLocaleString('es-VE')} m²` : null],
    ['Estacionamientos', i.estacionamientos]
  ].filter(([, v]) => v != null);
  $('caract').innerHTML = caract.map(([k, v]) => `<div><span>${k}</span><strong>${DP.esc(v)}</strong></div>`).join('');

  // Proyecto conceptual: en vez de precio, la ficha del creador.
  if (concepto) {
    $('precio').classList.add('precio-concepto');
    $('precio').textContent = 'Proyecto conceptual · no está a la venta';
    $('aviso-consejo').textContent = 'Esto es un proyecto conceptual (render, boceto, tesis o propuesta): no es un inmueble en venta ni en alquiler.';
    const herramientas = (Array.isArray(i.herramientas) ? i.herramientas : [])
      .map(h => `<span class="chip-dato">${DP.esc(h)}</span>`).join('');
    const pintarAutor = p => {
      const nombre = p && (p.nombre || (p.usuario ? '@' + p.usuario : '')) || 'Creador en Vivinati';
      $('ficha-autor').innerHTML = `<h2>Creador</h2>
        <div class="autor-cabeza"><span class="autor-avatar" aria-hidden="true">${DP.esc(nombre.replace('@', '').charAt(0).toUpperCase() || 'V')}</span>
          <div><strong>${DP.esc(nombre)}</strong>${p && p.usuario && p.nombre ? ` <span class="autor-usuario">@${DP.esc(p.usuario)}</span>` : ''}
          <div class="autor-rol">${DP.esc(DP.ROLES[i.rol_autor] || '')}</div></div></div>
        ${i.institucion ? `<p class="autor-dato"><span>Universidad o estudio</span>${DP.esc(i.institucion)}</p>` : ''}
        ${herramientas ? `<div class="autor-dato"><span>Herramientas</span><div class="chips-datos">${herramientas}</div></div>` : ''}`;
      $('ficha-autor').hidden = false;
    };
    pintarAutor(null);
    if (i.user_id) DP.sb.rpc('perfil_publico', { p_id: i.user_id }).then(({ data }) => { if (data && data[0]) pintarAutor(data[0]); });
  }

  // Quién lo publicó (solo anuncios hechos en nuestra web): nombre y @usuario.
  if (!concepto && i.origen === 'usuario' && i.user_id) {
    DP.sb.rpc('perfil_publico', { p_id: i.user_id }).then(({ data }) => {
      const p = data && data[0];
      if (!p || !p.usuario) return;
      $('publicado-por').textContent = `Publicado por ${p.nombre ? p.nombre + ' · ' : ''}@${p.usuario}`;
      $('publicado-por').hidden = false;
    });
  }
  $('fecha').textContent = `${i.origen === 'externo' ? 'Encontrado' : 'Publicado'} el ${new Date(i.creado).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  // Contacto
  const botones = [];
  if (i.whatsapp) {
    const texto = concepto
      ? `Hola, vi tu proyecto «${i.titulo}» en Vivinati (${location.href}). Me gustaría hablar contigo / colaborar.`
      : `Hola, vi tu anuncio «${i.titulo}» en Vivinati (${location.href}). ¿Sigue disponible?`;
    botones.push(`<a class="boton ${concepto ? 'concepto' : 'wa'}" target="_blank" rel="noopener" href="https://wa.me/${i.whatsapp}?text=${encodeURIComponent(texto)}">${concepto ? 'Contactar al creador / Colaborar' : 'Escribir por WhatsApp'}</a>`);
  }
  const modelo = concepto && DP.urlSegura(i.url_3d);
  if (modelo && modelo.startsWith('https://')) {
    botones.push(`<a class="boton sec" target="_blank" rel="noopener nofollow" href="${DP.esc(modelo)}">Ver modelo 3D externo ↗</a>`);
  }
  const original = DP.urlSegura(i.url_original);
  if (original) {
    botones.push(`<a class="boton${i.whatsapp ? ' sec' : ''}" target="_blank" rel="noopener nofollow" href="${DP.esc(original)}">Ver anuncio original${i.fuente ? ' en ' + DP.esc(i.fuente) : ''}</a>`);
    $('aviso-externo').hidden = false;
  }
  const { data: { session } } = await DP.sb.auth.getSession();
  if (session && session.user.id === i.user_id) {
    botones.push(`<a class="boton sec" href="publicar.html?id=${encodeURIComponent(i.id)}">${concepto ? 'Editar mi proyecto' : 'Editar mi anuncio'}</a>`);
  }
  $('contacto').innerHTML = botones.join('');

  // Compartir: enlace limpio a esta ficha (sin parámetros extra).
  const enlace = `${location.origin}/anuncio.html?id=${encodeURIComponent(i.id)}`;
  const resumen = `${i.titulo} · ${DP.precio(i)} · ${DP.lugar(i)}`;
  $('comp-wa').href = `https://wa.me/?text=${encodeURIComponent(resumen + '\n' + enlace)}`;
  $('comp-fb').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(enlace)}`;
  $('comp-copiar').addEventListener('click', async () => {
    const b = $('comp-copiar');
    try { await navigator.clipboard.writeText(enlace); b.textContent = '¡Copiado!'; }
    catch { window.prompt('Copia este enlace:', enlace); }
    setTimeout(() => { b.textContent = 'Copiar enlace'; }, 2000);
  });
  if (navigator.share) {
    // En el móvil, el botón de copiar abre el menú de compartir del teléfono.
    $('comp-copiar').textContent = 'Más opciones';
    $('comp-copiar').onclick = e => { e.stopImmediatePropagation(); navigator.share({ title: i.titulo, text: resumen, url: enlace }).catch(() => {}); };
  }

  // Mapa
  if (i.lat != null && i.lng != null) {
    $('bloque-mapa').hidden = false;
    const mapa = L.map('mapa-ficha', { scrollWheelZoom: false }).setView([i.lat, i.lng], 15);
    DP.capaMapa(mapa);
    L.circle([i.lat, i.lng], { radius: 150, color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0f6b5c' }).addTo(mapa);
  }
})();
