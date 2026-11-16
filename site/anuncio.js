// Ficha de un inmueble: anuncio.html?id=<uuid>
(async () => {
  const $ = id => document.getElementById(id);
  DP.cabecera();
  // Si venimos de la búsqueda, «volver» conserva los filtros que había.
  try {
    const ref = new URL(document.referrer);
    if (ref.origin === location.origin && /(\/|index\.html)$/.test(ref.pathname)) $('volver').href = ref.href;
  } catch { /* sin referrer */ }

  const id = new URLSearchParams(location.search).get('id');
  const valido = /^[0-9a-f-]{36}$/i.test(id || '');
  const { data: i, error } = valido
    ? await DP.sb.from('inmuebles').select('*').eq('id', id).maybeSingle()
    : { data: null, error: null };

  $('cargando').hidden = true;
  if (error) console.error(error);
  if (!i) { $('no-existe').hidden = false; return; }

  document.title = `${i.titulo} — Divina Providentia`;
  $('ficha').hidden = false;

  // Fotos
  const fotos = (i.fotos || []).map(DP.fotoUrl).filter(Boolean);
  const principal = $('foto-principal');
  const mostrar = n => {
    principal.src = fotos[n];
    principal.alt = `Foto ${n + 1} de ${i.titulo}`;
    document.querySelectorAll('#miniaturas button').forEach((b, k) => b.setAttribute('aria-current', k === n));
  };
  if (fotos.length) {
    $('miniaturas').innerHTML = fotos.length > 1 ? fotos.map((f, n) =>
      `<button type="button" data-n="${n}" aria-label="Ver foto ${n + 1}"><img src="${DP.esc(f)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join('') : '';
    $('miniaturas').addEventListener('click', e => { const b = e.target.closest('button'); if (b) mostrar(Number(b.dataset.n)); });
    mostrar(0);
  } else {
    principal.replaceWith(Object.assign(document.createElement('div'), { className: 'vacio', textContent: 'Este anuncio no tiene fotos' }));
  }

  // Datos
  const fuente = i.origen === 'externo' && i.fuente ? `<span class="etiqueta gris">${DP.esc(i.fuente)}</span>` : '';
  $('etiquetas').innerHTML = `<span class="etiqueta">${DP.esc(DP.OPERACIONES[i.operacion])}</span>
    <span class="etiqueta gris">${DP.esc(DP.TIPOS[i.tipo] || i.tipo)}</span>${fuente}
    ${i.activo ? '' : '<span class="etiqueta gris">Pausado (solo lo ves tú)</span>'}`;
  $('titulo').textContent = i.titulo;
  $('precio').textContent = DP.precio(i);
  $('lugar').textContent = DP.lugar(i);
  $('descripcion').textContent = i.descripcion || 'Sin descripción.';
  const caract = [
    ['Habitaciones', i.habitaciones], ['Baños', i.banos],
    ['Superficie', i.metros != null ? `${Number(i.metros).toLocaleString('es-VE')} m²` : null],
    ['Estacionamientos', i.estacionamientos]
  ].filter(([, v]) => v != null);
  $('caract').innerHTML = caract.map(([k, v]) => `<div><span>${k}</span><strong>${DP.esc(v)}</strong></div>`).join('');

  // Quién lo publicó (solo anuncios hechos en nuestra web): nombre y @usuario.
  if (i.origen === 'usuario' && i.user_id) {
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
    const texto = `Hola, vi tu anuncio «${i.titulo}» en Divina Providentia (${location.href}). ¿Sigue disponible?`;
    botones.push(`<a class="boton wa" target="_blank" rel="noopener" href="https://wa.me/${i.whatsapp}?text=${encodeURIComponent(texto)}">Escribir por WhatsApp</a>`);
  }
  const original = DP.urlSegura(i.url_original);
  if (original) {
    botones.push(`<a class="boton${i.whatsapp ? ' sec' : ''}" target="_blank" rel="noopener nofollow" href="${DP.esc(original)}">Ver anuncio original${i.fuente ? ' en ' + DP.esc(i.fuente) : ''}</a>`);
    $('aviso-externo').hidden = false;
  }
  const { data: { session } } = await DP.sb.auth.getSession();
  if (session && session.user.id === i.user_id) {
    botones.push(`<a class="boton sec" href="publicar.html?id=${encodeURIComponent(i.id)}">Editar mi anuncio</a>`);
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
