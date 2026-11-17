// Ficha de un inmueble: anuncio.html?id=<uuid>
// Diseño en dos columnas: fotos, título, precio y datos a la izquierda;
// a la derecha quién lo publica (avatar, estrellas, verificado) y un chat
// cifrado de extremo a extremo para escribirle sin salir de la página.
(async () => {
  const $ = id => document.getElementById(id);
  DP.cabecera();

  const id = new URLSearchParams(location.search).get('id');
  const valido = /^[0-9a-f-]{36}$/i.test(id || '');
  const { data: i, error } = valido
    ? await DP.sb.from('inmuebles').select('*').eq('id', id).maybeSingle()
    : { data: null, error: null };

  $('cargando').hidden = true;
  if (error) console.error(error);
  if (!i) { $('no-existe').hidden = false; return; }
  const concepto = DP.esConcepto(i);
  const externo = i.origen === 'externo';
  const { data: { session } } = await DP.sb.auth.getSession();
  const esMio = session && session.user.id === i.user_id;

  // ---------- SEO ----------
  document.title = `${i.titulo} — Vivinati`;
  const meta = (attr, nombre, valor) => {
    let m = document.head.querySelector(`meta[${attr}="${nombre}"]`);
    if (!m) { m = document.createElement('meta'); m.setAttribute(attr, nombre); document.head.appendChild(m); }
    m.setAttribute('content', valor);
  };
  const resumenSeo = [DP.precio(i), DP.OPERACIONES[i.operacion], DP.TIPOS[i.tipo], DP.lugar(i)].filter(Boolean).join(' · ');
  meta('name', 'description', `${resumenSeo}. ${(i.descripcion || '').slice(0, 140)}`.trim());
  meta('property', 'og:title', i.titulo);
  meta('property', 'og:description', resumenSeo);
  if (i.fotos && i.fotos[0]) meta('property', 'og:image', DP.fotoUrl(i.fotos[0]));
  const canon = document.createElement('link');
  canon.rel = 'canonical'; canon.href = `${location.origin}/anuncio.html?id=${encodeURIComponent(i.id)}`;
  document.head.appendChild(canon);
  if (externo) meta('name', 'robots', 'noindex, follow');   // contenido duplicado: el original es el bueno
  $('ficha').hidden = false;

  // ---------- Migas: Inicio › Estado › Tipo ----------
  const buscarCon = o => 'buscar.html?' + new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();
  $('migas').innerHTML = concepto
    ? `<a href="index.html">Inicio</a> › <a href="conceptos.html">Conceptos 3D</a> › <span>${DP.esc(i.titulo)}</span>`
    : `<a href="index.html">Inicio</a> › <a href="${buscarCon({ operacion: i.operacion, estado: i.estado })}">${DP.esc(i.estado)}</a> ›
       <a href="${buscarCon({ operacion: i.operacion, estado: i.estado, tipo: i.tipo })}">${DP.esc(DP.TIPOS[i.tipo] || 'Inmuebles')}</a> ›
       <span>${DP.esc(i.zona || i.ciudad || i.titulo)}</span>`;

  // ---------- Fotos ----------
  const fotos = (i.fotos || []).map(DP.fotoUrl).filter(Boolean);
  const principal = $('foto-principal');
  let actual = 0;
  const mostrar = n => {
    actual = (n + fotos.length) % fotos.length;
    principal.src = fotos[actual];
    principal.alt = `Foto ${actual + 1} de ${i.titulo}`;
    $('contador-fotos').textContent = `${actual + 1} / ${fotos.length}`;
    document.querySelectorAll('#miniaturas [data-n]').forEach(b => b.setAttribute('aria-current', Number(b.dataset.n) === actual));
  };
  const abrirTodas = () => {
    $('rejilla-fotos').innerHTML = fotos.map((f, n) => `<img src="${DP.esc(f)}" alt="Foto ${n + 1}" loading="lazy" referrerpolicy="no-referrer">`).join('');
    $('visor-completo').showModal();
  };
  $('cerrar-visor').addEventListener('click', () => $('visor-completo').close());
  $('visor-completo').addEventListener('click', e => { if (e.target === $('visor-completo')) $('visor-completo').close(); });

  if (fotos.length) {
    if (fotos.length > 1) {
      // Hasta 4 miniaturas + una con «N fotos más» (como los grandes portales)
      const visibles = fotos.slice(0, fotos.length > 5 ? 4 : 5);
      const resto = fotos.length - visibles.length;
      $('miniaturas').innerHTML = visibles.map((f, n) =>
        `<button type="button" data-n="${n}" aria-label="Ver foto ${n + 1}"><img src="${DP.esc(f)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join('') +
        (resto > 0 ? `<button type="button" class="mas-miniaturas" data-todas aria-label="Ver todas las fotos">
          <img src="${DP.esc(fotos[visibles.length])}" alt="" loading="lazy" referrerpolicy="no-referrer"><span><b>${resto}</b> fotos más</span></button>` : '');
      $('miniaturas').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.todas !== undefined) abrirTodas(); else mostrar(Number(b.dataset.n));
      });
      $('foto-ant').hidden = $('foto-sig').hidden = $('contador-fotos').hidden = false;
      $('foto-ant').addEventListener('click', () => mostrar(actual - 1));
      $('foto-sig').addEventListener('click', () => mostrar(actual + 1));
      document.addEventListener('keydown', e => {
        if (/input|textarea|select/i.test(e.target.tagName)) return;
        if (e.key === 'ArrowLeft') mostrar(actual - 1);
        if (e.key === 'ArrowRight') mostrar(actual + 1);
      });
      let x0 = null;
      $('visor').addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
      $('visor').addEventListener('touchend', e => {
        if (x0 == null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) mostrar(actual + (dx < 0 ? 1 : -1));
        x0 = null;
      });
    }
    principal.addEventListener('click', abrirTodas);
    mostrar(0);
    const original = DP.urlSegura(i.url_original);
    if (original && (i.fotos_total || 0) > fotos.length) {
      $('mas-fotos').innerHTML = `Mostrando ${fotos.length} de ${i.fotos_total} fotos · <a href="${DP.esc(original)}" target="_blank" rel="noopener nofollow">Ver las ${i.fotos_total} fotos en ${DP.esc(i.fuente || 'el anuncio original')}</a>`;
      $('mas-fotos').hidden = false;
    }
  } else {
    $('visor').classList.add('sin-fotos');
    principal.replaceWith(Object.assign(document.createElement('div'), { className: 'vacio', textContent: 'Este anuncio no tiene fotos' }));
  }

  // Insignia sobre la foto
  const insignia = concepto ? '◆ Concepto 3D' : externo ? `Anuncio de ${i.fuente || 'otra web'}` : '✓ Publicado en Vivinati';
  $('insignia-foto').textContent = insignia;
  $('insignia-foto').className = `insignia-foto op-${i.operacion}`;
  $('insignia-foto').hidden = false;

  // Favorito (el mismo corazón que las tarjetas)
  const fav = $('btn-fav');
  fav.dataset.fav = i.id;
  fav.setAttribute('aria-pressed', DP.esFavorito(i.id));

  // ---------- Título, precio y datos ----------
  $('titulo').textContent = i.titulo;
  const fechaTxt = new Date(i.creado).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });
  $('subtitulo').innerHTML = concepto
    ? `<span class="icono-sub">◆</span> ${DP.esc([DP.ETAPAS[i.etapa], DP.CATEGORIAS[i.categoria_proyecto]].filter(Boolean).join(' · '))}`
    : `<span class="icono-sub">⌂</span> ${DP.esc(DP.OPERACIONES[i.operacion])} · ${DP.esc(DP.lugar(i))}`;

  if (concepto) {
    $('precio').innerHTML = `<span class="precio-concepto">Proyecto conceptual</span> <small>· no está a la venta</small>`;
    $('consejo-titulo').textContent = 'Es un proyecto, no un inmueble a la venta';
    $('aviso-consejo').textContent = 'Render, boceto, tesis o propuesta de infraestructura. Contacta al creador para conocerlo o colaborar.';
  } else {
    const p = DP.precio(i);
    const [cifra, sufijo] = p.split(' /');
    $('precio').innerHTML = `<b>${DP.esc(cifra)}</b>${sufijo ? ` <small>/${DP.esc(sufijo)}</small>` : ''}`;
    const bajo = DP.bajada(i);
    if (bajo) $('precio').insertAdjacentHTML('beforeend',
      ` <s class="precio-antes">${DP.esc(DP.precio({ ...i, precio: i.precio_anterior }))}</s> <span class="etiqueta-bajada">↓ ${DP.esc(bajo)}</span>`);
  }

  const datos = concepto
    ? [DP.CATEGORIAS[i.categoria_proyecto], DP.ETAPAS[i.etapa], DP.TIPOS[i.tipo] && `Propone: ${DP.TIPOS[i.tipo].toLowerCase()}`, DP.ROLES[i.rol_autor]]
    : [
      DP.TIPOS[i.tipo],
      i.habitaciones != null ? `${i.habitaciones} ${i.habitaciones === 1 ? 'habitación' : 'habitaciones'}` : null,
      i.banos != null ? `${i.banos} ${i.banos === 1 ? 'baño' : 'baños'}` : null,
      i.metros != null ? `${Number(i.metros).toLocaleString('es-VE')} m²` : null,
      i.estacionamientos ? `${i.estacionamientos} ${i.estacionamientos === 1 ? 'puesto' : 'puestos'}` : null,
      i.metros > 0 && i.precio > 0 && i.moneda === 'USD' ? `$${Number(i.precio / i.metros).toLocaleString('es-VE', { maximumFractionDigits: 0 })}/m²` : null
    ];
  $('datos').innerHTML = datos.filter(Boolean).map(d => `<li>${DP.esc(d)}</li>`).join('');
  $('descripcion').textContent = i.descripcion || 'Sin descripción.';
  $('lugar').textContent = DP.lugar(i);
  $('fecha').textContent = `${externo ? 'Encontrado' : 'Publicado'} el ${fechaTxt}${i.activo ? '' : ' · Pausado (solo lo ves tú)'}`;

  // ---------- Tarjeta de quién publica ----------
  const btn = (clase, href, texto, externo2) => `<a class="boton ${clase}" href="${DP.esc(href)}"${externo2 ? ' target="_blank" rel="noopener nofollow"' : ''}>${texto}</a>`;
  const original = DP.urlSegura(i.url_original);
  const wa = i.whatsapp ? `https://wa.me/${i.whatsapp}?text=${encodeURIComponent(concepto
    ? `Hola, vi tu proyecto «${i.titulo}» en Vivinati (${location.href}). Me gustaría hablar contigo / colaborar.`
    : `Hola, vi tu anuncio «${i.titulo}» en Vivinati (${location.href}). ¿Sigue disponible?`)}` : null;
  const modelo = concepto && DP.urlSegura(i.url_3d);

  if (externo) {
    const fuente = i.fuente || 'otra web';
    $('anfitrion').innerHTML = `
      <div class="anfitrion-cab">
        <span class="avatar avatar-letra avatar-fuente" style="width:56px;height:56px;font-size:22px" aria-hidden="true">${DP.esc(fuente.charAt(0).toUpperCase())}</span>
        <div><strong class="anfitrion-nombre">${DP.esc(fuente)}</strong>
          <div class="anfitrion-insignias"><span class="insignia-gris">Inmobiliaria · anuncio encontrado por Vivinati</span></div></div>
      </div>
      ${original ? btn('', original, `Ver anuncio original en ${DP.esc(fuente)} ↗`, true) : ''}
      <p class="aviso">Los datos y el contacto están en el anuncio original. Vivinati solo lo muestra junto a los demás.</p>`;
  } else {
    // Publicado en Vivinati: avatar, estrellas, verificado y chat
    const pintar = p => {
      const nombre = (p && (p.nombre || (p.usuario && '@' + p.usuario))) || 'Anunciante';
      const perfilUrl = p && p.usuario ? `creador.html?u=${encodeURIComponent(p.usuario)}` : null;
      const desde = p && p.miembro_desde ? new Date(p.miembro_desde + 'T12:00:00').toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }) : null;
      $('anfitrion').innerHTML = `
        <div class="anfitrion-cab">
          ${perfilUrl ? `<a href="${perfilUrl}" class="sin-subrayado">` : ''}${DP.avatar({ nombre, avatar_url: p && p.avatar_url }, 56)}${perfilUrl ? '</a>' : ''}
          <div>
            <div class="anfitrion-linea"><strong class="anfitrion-nombre">${perfilUrl ? `<a href="${perfilUrl}">${DP.esc(nombre)}</a>` : DP.esc(nombre)}</strong>
              ${DP.estrellas(p && p.estrellas, p && p.valoraciones, true)}</div>
            <div class="anfitrion-insignias">
              <span class="insignia-verificado" title="Cuenta con correo confirmado y usuario registrado">✓ Verificado</span>
              ${desde ? `<span class="insignia-gris">En Vivinati desde ${DP.esc(desde)}</span>` : ''}
            </div>
          </div>
        </div>
        ${DP.etiquetasPerfil(p) ? `<div class="chips-datos anfitrion-etiquetas">${DP.etiquetasPerfil(p)}</div>` : ''}
        ${p && p.biografia ? `<p class="anfitrion-bio">${DP.esc(p.biografia.length > 180 ? p.biografia.slice(0, 180).replace(/\s+\S*$/, '') + '…' : p.biografia)}</p>` : ''}
        ${concepto ? `
          ${i.institucion ? `<p class="autor-dato"><span>Universidad o estudio</span>${DP.esc(i.institucion)}</p>` : ''}
          ${Array.isArray(i.herramientas) && i.herramientas.length ? `<div class="autor-dato"><span>Herramientas</span><div class="chips-datos">${i.herramientas.map(h => `<span class="chip-dato">${DP.esc(h)}</span>`).join('')}</div></div>` : ''}` : ''}
        <div class="anfitrion-botones">
          ${esMio ? btn('sec', `publicar.html?id=${encodeURIComponent(i.id)}`, concepto ? 'Editar mi proyecto' : 'Editar mi anuncio')
            : `<button type="button" class="boton ${concepto ? 'concepto' : ''}" id="btn-mensaje">${concepto ? 'Contactar al creador / Colaborar' : 'Enviar mensaje'}</button>`}
          ${wa && !esMio ? btn('sec wa-sec', wa, 'Escribir por WhatsApp', true) : ''}
          ${modelo && modelo.startsWith('https://') ? btn('sec', modelo, 'Ver modelo 3D externo ↗', true) : ''}
        </div>
        ${perfilUrl ? `<p class="anfitrion-pie"><a href="${perfilUrl}">Ver perfil y valoraciones</a></p>` : ''}`;
      const b = $('btn-mensaje');
      if (b) b.addEventListener('click', () => { $('texto-chat').focus(); $('tarjeta-chat').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      if (!esMio && p) {
        $('chat-cab').innerHTML = `${DP.avatar({ nombre, avatar_url: p.avatar_url }, 34)}<strong>Escríbele a ${DP.esc((p.nombre || p.usuario || '').split(' ')[0])}</strong>`;
        $('tarjeta-chat').hidden = false;
      }
    };
    pintar(null);
    if (i.user_id) DP.sb.rpc('perfil_publico', { p_id: i.user_id }).then(({ data }) => { if (data && data[0]) pintar(data[0]); });
  }

  // ---------- Chat dentro de la ficha (cifrado de extremo a extremo) ----------
  const cuerpo = $('chat-cuerpo');
  const burbuja = (texto, clase) => {
    cuerpo.insertAdjacentHTML('beforeend', `<div class="burbuja ${clase}">${texto}</div>`);
    cuerpo.scrollTop = cuerpo.scrollHeight;
  };
  document.querySelectorAll('#preguntas button').forEach(b => b.addEventListener('click', () => {
    $('texto-chat').value = b.textContent; $('texto-chat').focus();
  }));
  $('texto-chat').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('form-chat').requestSubmit(); } });
  $('form-chat').addEventListener('submit', async e => {
    e.preventDefault();
    const texto = $('texto-chat').value.trim();
    if (!texto) return;
    if (!session) {
      burbuja(`Para escribir necesitas una cuenta gratuita. <a href="entrar.html?next=${encodeURIComponent('anuncio.html?id=' + i.id)}">Entra</a> o <a href="registro.html">crea tu cuenta</a>.`, 'sistema');
      return;
    }
    const estado = await DP.e2e.estado();
    if (estado !== 'lista') {
      burbuja(`Antes de escribir, activa tu chat cifrado: <a href="chat.html?con=${encodeURIComponent(i.user_id)}&anuncio=${encodeURIComponent(i.id)}">ábrelo aquí</a>.`, 'sistema');
      return;
    }
    const enviar = $('form-chat').querySelector('button');
    enviar.disabled = true;
    try {
      const conv = await DP.e2e.enviar(i.user_id, i.id, texto);
      burbuja(DP.esc(texto), 'mia');
      burbuja(`Enviado. <a href="chat.html?c=${conv}">Ver la conversación</a>`, 'sistema');
      $('texto-chat').value = '';
    } catch (err) {
      burbuja(DP.esc(err.message === 'sin-clave-otro'
        ? 'Esta persona aún no ha activado su chat cifrado. Mientras tanto, escríbele por WhatsApp.'
        : (err.message || 'No se pudo enviar.')), 'sistema');
    }
    enviar.disabled = false;
  });

  // ---------- Compartir ----------
  // /a/<id>/ trae foto, precio y zona para la vista previa de WhatsApp y redes.
  const enlace = `https://vivinati.com/a/${encodeURIComponent(i.id)}/`;
  const resumen = `${i.titulo} · ${DP.precio(i)} · ${DP.lugar(i)}`;
  $('comp-wa').href = `https://wa.me/?text=${encodeURIComponent(resumen + '\n' + enlace)}`;
  $('comp-fb').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(enlace)}`;
  const copiar = async b => {
    if (navigator.share) return navigator.share({ title: i.titulo, text: resumen, url: enlace }).catch(() => {});
    try { await navigator.clipboard.writeText(enlace); if (b) { const t = b.textContent; b.textContent = '¡Copiado!'; setTimeout(() => { b.textContent = t; }, 2000); } }
    catch { window.prompt('Copia este enlace:', enlace); }
  };
  $('comp-copiar').addEventListener('click', () => copiar($('comp-copiar')));
  $('btn-compartir').addEventListener('click', () => copiar(null));

  // ---------- Mapa ----------
  if (i.lat != null && i.lng != null) {
    $('bloque-mapa').hidden = false;
    $('ir-mapa').hidden = false;
    const mapa = L.map('mapa-ficha', { scrollWheelZoom: false }).setView([i.lat, i.lng], 15);
    DP.capaMapa(mapa);
    L.circle([i.lat, i.lng], { radius: 150, color: '#005CA7' }).addTo(mapa);
    // «Cerca de»: se busca solo cuando la persona llega al mapa (para no cargar de más).
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver(e => { if (e[0].isIntersecting) { obs.disconnect(); cercaDe(mapa, i); } }, { rootMargin: '300px' });
      obs.observe($('bloque-mapa'));
    } else cercaDe(mapa, i);
  }

  // ---------- Cerca de este inmueble (OpenStreetMap / Overpass, gratis) ----------
  async function cercaDe(mapa, i) {
    const CATS = [
      ['educacion', 'Colegios y universidades', t => /^(school|kindergarten|university|college)$/.test(t.amenity)],
      ['salud', 'Hospitales y clínicas', t => /^(hospital|clinic|doctors)$/.test(t.amenity)],
      ['farmacia', 'Farmacias', t => t.amenity === 'pharmacy'],
      ['compras', 'Supermercados y centros comerciales', t => /^(supermarket|mall|department_store)$/.test(t.shop)],
      ['transporte', 'Metro y transporte', t => t.station === 'subway' || t.railway === 'station' || t.railway === 'subway_entrance' || (t.public_transport === 'station')],
      ['parque', 'Parques y plazas', t => t.leisure === 'park' || t.place === 'square'],
      ['banco', 'Bancos', t => t.amenity === 'bank']
    ];
    const clave = `dp_cerca_${i.id}`;
    let elementos = null, guardados = null;
    try { elementos = JSON.parse(sessionStorage.getItem(clave) || 'null'); } catch { /* nada */ }
    // 1) Lo guardado en Supabase para esta zona (~500 m) por scripts/cercanias/generar.mjs.
    if (!elementos) {
      const celda = `${(Math.round(i.lat / 0.005) * 0.005).toFixed(3)},${(Math.round(i.lng / 0.005) * 0.005).toFixed(3)}`;
      const { data } = await DP.sb.from('cercanias').select('datos').eq('celda', celda).maybeSingle();
      if (data && Array.isArray(data.datos)) guardados = data.datos;
    }
    // 2) Si la zona aún no está guardada, se pregunta a OpenStreetMap en el momento.
    if (!elementos && !guardados) {
      const a = `(around:1200,${Number(i.lat).toFixed(5)},${Number(i.lng).toFixed(5)})`;
      const q = `[out:json][timeout:20];(nwr${a}[amenity~"^(school|kindergarten|university|college|hospital|clinic|doctors|pharmacy|bank)$"][name];` +
        `nwr${a}[shop~"^(supermarket|mall|department_store)$"][name];nwr${a}[station=subway];nwr${a}[railway~"^(station|subway_entrance)$"];` +
        `nwr${a}[public_transport=station][name];nwr${a}[leisure=park][name];nwr${a}[place=square][name];);out center tags 250;`;
      for (const servidor of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
        try {
          const r = await fetch(servidor, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
          if (r.ok) { elementos = (await r.json()).elements || []; break; }
        } catch { /* se prueba el siguiente */ }
      }
      if (!elementos) { $('cerca').hidden = true; return; }
      try { sessionStorage.setItem(clave, JSON.stringify(elementos)); } catch { /* sin almacenamiento */ }
    }
    const rad = x => x * Math.PI / 180;
    const distancia = (la, lo) => {
      const dLa = rad(la - i.lat), dLo = rad(lo - i.lng);
      const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(i.lat)) * Math.cos(rad(la)) * Math.sin(dLo / 2) ** 2;
      return 6371000 * 2 * Math.asin(Math.sqrt(h));
    };
    const fmt = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString('es-VE', { maximumFractionDigits: 1 })} km`;
    const grupos = Object.fromEntries(CATS.map(([k]) => [k, []]));
    const vistos = new Set();
    if (guardados) {
      for (const g of guardados) {
        if (!grupos[g.c] || g.la == null || g.lo == null) continue;
        grupos[g.c].push({ nombre: String(g.n || ''), la: g.la, lo: g.lo, d: distancia(g.la, g.lo) });
      }
    }
    for (const e of (elementos || [])) {
      const t = e.tags || {}, la = e.lat ?? (e.center && e.center.lat), lo = e.lon ?? (e.center && e.center.lon);
      if (la == null || lo == null) continue;
      const nombre = (t.name || '').trim();
      const cat = CATS.find(([, , f]) => f(t));
      if (!cat || (!nombre && cat[0] !== 'transporte')) continue;
      const etiqueta = nombre || 'Estación';
      const llave = cat[0] + '|' + etiqueta.toLowerCase();
      if (vistos.has(llave)) continue;
      vistos.add(llave);
      grupos[cat[0]].push({ nombre: etiqueta, la, lo, d: distancia(la, lo) });
    }
    const filas = CATS.map(([k, titulo]) => {
      const l = grupos[k].sort((x, y) => x.d - y.d);
      if (!l.length) return '';
      l.slice(0, 6).forEach(p => L.circleMarker([p.la, p.lo], { radius: 5, color: '#6b7785', weight: 1.5, fillColor: '#fff', fillOpacity: 1 })
        .bindTooltip(`${p.nombre} · ${fmt(p.d)}`).addTo(mapa));
      return `<div class="cerca-grupo"><strong>${titulo}</strong>
        <ul>${l.slice(0, 3).map(p => `<li><span>${DP.esc(p.nombre)}</span><span class="cerca-dist">${fmt(p.d)}</span></li>`).join('')}</ul></div>`;
    }).filter(Boolean);
    if (!filas.length) { $('cerca').hidden = true; return; }
    $('cerca-lista').innerHTML = filas.join('');
    $('cerca').hidden = false;
  }

  // ---------- Precio de referencia por m² ----------
  if (!concepto && i.precio > 0 && i.metros > 0 && i.moneda === 'USD') {
    DP.sb.rpc('precio_referencia', { p_id: i.id }).then(({ data }) => {
      const r = data && data[0];
      if (!r || !r.m2) return;
      const m2 = i.precio / i.metros;
      const dif = Math.round((m2 / r.m2 - 1) * 100);
      const comp = Math.abs(dif) < 5 ? 'en la media de la zona'
        : dif < 0 ? `<b class="bien">${-dif} % por debajo</b> de la media` : `<b>${dif} % por encima</b> de la media`;
      const f = n => Number(n).toLocaleString('es-VE', { maximumFractionDigits: 0 });
      const plural = ({ apartamento: 'apartamentos', casa: 'casas', anexo: 'anexos', habitacion: 'habitaciones', townhouse: 'townhouses', local: 'locales', oficina: 'oficinas', terreno: 'terrenos', galpon: 'galpones' })[i.tipo] || 'inmuebles';
      $('ref-precio').innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg>
        <div><strong>Precio frente a la zona</strong>
        <p>Este anuncio: <b>$${f(m2)}/m²</b>${i.operacion === 'alquiler' ? ' al mes' : ''}, ${comp}. En ${DP.esc(r.ambito)}, el m² de ${plural}
        ${i.operacion === 'venta' ? 'en venta' : 'en alquiler'} ronda <b>$${f(r.m2)}</b> <span>(mediana de ${f(r.muestras)} anuncios)</span>.
        ${dif < -40 ? '<strong class="alerta">Un precio muy bajo puede ser señal de estafa: verifica antes de pagar.</strong>' : ''}</p></div>`;
      $('ref-precio').hidden = false;
    });
  }

  // ---------- Parecidos ----------
  DP.sb.rpc('similares', { p_id: i.id, p_limite: 8 }).then(({ data }) => {
    if (!data || !data.length) return;
    const PLURALES = { apartamento: 'apartamentos', casa: 'casas', anexo: 'anexos', habitacion: 'habitaciones', townhouse: 'townhouses',
      local: 'locales comerciales', oficina: 'oficinas', terreno: 'terrenos', galpon: 'galpones' };
    $('similares-titulo').textContent = concepto ? 'Otros proyectos parecidos'
      : `Otros ${PLURALES[i.tipo] || 'inmuebles'} ${DP.OPERACIONES[i.operacion].toLowerCase()} en ${i.ciudad || i.estado}`;
    $('lista-similares').innerHTML = data.map(DP.tarjeta).join('');
    $('similares').hidden = false;
  });

  // ---------- Reportar ----------
  const idNavegador = () => {
    try {
      let v = localStorage.getItem('dp_cliente');
      if (!v) { v = crypto.randomUUID(); localStorage.setItem('dp_cliente', v); }
      return v;
    } catch { return crypto.randomUUID(); }
  };
  const avisar = (t, tipo) => { $('msg-reporte').innerHTML = t ? `<div class="mensaje ${tipo}">${DP.esc(t)}</div>` : ''; };
  $('btn-reportar').addEventListener('click', () => { $('form-reporte').hidden = false; $('btn-reportar').hidden = true; $('motivo').focus(); });
  $('cancelar-reporte').addEventListener('click', () => { $('form-reporte').hidden = true; $('btn-reportar').hidden = false; avisar(''); });
  $('form-reporte').addEventListener('submit', async e => {
    e.preventDefault();
    if (!$('motivo').value) return avisar('Elige un motivo.', 'error');
    const fila = { inmueble_id: i.id, motivo: $('motivo').value, detalle: $('detalle').value.trim() || null,
      reportante: session ? session.user.id : idNavegador() };
    $('enviar-reporte').disabled = true;
    const { error: er } = await DP.sb.from('reportes').insert(fila);
    $('enviar-reporte').disabled = false;
    if (er && er.code === '23505') return avisar('Ya habías reportado este anuncio. ¡Gracias!', 'ok');
    if (er) { console.error(er); return avisar('No se pudo enviar el reporte. Inténtalo de nuevo.', 'error'); }
    $('form-reporte').innerHTML = '<div class="mensaje ok"><strong>Gracias por avisar.</strong> Revisaremos este anuncio.</div>';
  });
})();
