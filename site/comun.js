// Código compartido por todas las páginas del buscador.
// La clave anónima de Supabase es pública a propósito: quien protege los
// datos es la RLS de Postgres (tabla inmuebles), no el navegador.
const SUPABASE_URL = 'https://nzwtafacdpdgulzcwntx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56d3RhZmFjZHBkZ3VsemN3bnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjkxNDksImV4cCI6MjA4MTQwNTE0OX0.6elrAvcsEAc0Jaj4P8-ZFLSWKi2cvzgoAYGlDxeR-8U';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DP = {
  sb,

  TIPOS: {
    apartamento: 'Apartamento', casa: 'Casa', anexo: 'Anexo', habitacion: 'Habitación',
    townhouse: 'Townhouse', local: 'Local comercial', oficina: 'Oficina',
    terreno: 'Terreno', galpon: 'Galpón', otro: 'Otro'
  },
  OPERACIONES: { venta: 'En venta', alquiler: 'En alquiler', concepto: 'Concepto 3D' },

  // Conceptos 3D (proyectos conceptuales: renders, bocetos, tesis…)
  ETAPAS: { conceptual: 'Proyecto conceptual', tesis: 'Tesis', anteproyecto: 'Anteproyecto', infraestructura: 'Infraestructura' },
  ROLES: { estudiante: 'Estudiante', arquitecto: 'Arquitecto/a', emprendedor: 'Emprendedor/a', estudio: 'Estudio' },
  TIPOS_PERFIL: { particular: 'Particular', agente: 'Agente inmobiliario', inmobiliaria: 'Inmobiliaria', constructora: 'Constructora o promotora', arquitecto: 'Arquitecto/a o estudio', estudiante: 'Estudiante de arquitectura o diseño', otro: 'Otro' },
  CATEGORIAS: { residencial: 'Residencial', urbano: 'Urbano', infraestructura: 'Infraestructura', comercial: 'Comercial' },
  esConcepto(i) { return i && i.operacion === 'concepto'; },

  // Perfil público: etiquetas (tipo, empresa, zona) y enlaces de contacto.
  etiquetasPerfil(p) {
    if (!p) return '';
    const zona = [p.ciudad, p.estado].filter(Boolean).join(', ');
    return [p.tipo_perfil && DP.TIPOS_PERFIL[p.tipo_perfil], p.empresa, zona && '📍 ' + zona]
      .filter(Boolean).map(t => `<span class="chip-dato">${DP.esc(t)}</span>`).join('');
  },
  numeroWa(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (/^0\d{10}$/.test(d)) d = '58' + d.slice(1);
    else if (/^[24]\d{9}$/.test(d)) d = '58' + d;
    return /^\d{10,15}$/.test(d) ? d : null;
  },
  contactosPerfil(p) {
    if (!p) return '';
    const wa = DP.numeroWa(p.whatsapp), l = [];
    if (wa) l.push(`<a class="boton sec peq wa-sec" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>`);
    if (p.instagram && /^[a-z0-9._]{1,30}$/.test(p.instagram)) l.push(`<a class="boton sec peq" href="https://instagram.com/${p.instagram}" target="_blank" rel="noopener nofollow">Instagram</a>`);
    const web = p.sitio_web && /^https:\/\//.test(p.sitio_web) && DP.urlSegura(p.sitio_web);
    if (web) l.push(`<a class="boton sec peq" href="${DP.esc(web)}" target="_blank" rel="noopener nofollow ugc">Página web ↗</a>`);
    return l.join('');
  },

  // Estado → capital aproximada, para centrar el mapa.
  ESTADOS: {
    'Amazonas': [5.66, -67.62], 'Anzoátegui': [10.13, -64.68], 'Apure': [7.89, -67.47],
    'Aragua': [10.25, -67.60], 'Barinas': [8.62, -70.21], 'Bolívar': [8.12, -63.55],
    'Carabobo': [10.16, -68.00], 'Cojedes': [9.66, -68.58], 'Delta Amacuro': [9.06, -62.05],
    'Distrito Capital': [10.49, -66.88], 'Falcón': [11.40, -69.67], 'Guárico': [9.91, -67.35],
    'La Guaira': [10.60, -66.93], 'Lara': [10.07, -69.32], 'Mérida': [8.59, -71.15],
    'Miranda': [10.48, -66.82], 'Monagas': [9.75, -63.18], 'Nueva Esparta': [10.96, -63.85],
    'Portuguesa': [9.04, -69.74], 'Sucre': [10.46, -64.17], 'Táchira': [7.77, -72.22],
    'Trujillo': [9.37, -70.44], 'Yaracuy': [10.34, -68.74], 'Zulia': [10.65, -71.64]
  },
  CENTRO_VE: [7.6, -66.2],

  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  // Solo deja pasar enlaces http(s); cualquier otra cosa se descarta.
  urlSegura(u) {
    try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; }
  },

  fotoUrl(p) {
    if (!p) return null;
    if (/^https?:\/\//.test(p)) return DP.urlSegura(p);
    return `${SUPABASE_URL}/storage/v1/object/public/inmuebles/${p.split('/').map(encodeURIComponent).join('/')}`;
  },

  precio(i) {
    if (DP.esConcepto(i)) return DP.ETAPAS[i.etapa] || 'Proyecto conceptual';
    if (i.precio == null) return 'Precio a consultar';
    const n = Number(i.precio).toLocaleString('es-VE', { maximumFractionDigits: 0 });
    const txt = i.moneda === 'VES' ? `Bs. ${n}` : `$${n}`;
    return i.operacion === 'alquiler' ? `${txt} /mes` : txt;
  },

  lugar(i) { return [i.zona, i.ciudad, i.estado].filter(Boolean).join(', '); },

  datos(i) {
    const d = [];
    if (i.habitaciones != null) d.push(`${i.habitaciones} hab.`);
    if (i.banos != null) d.push(`${i.banos} baños`);
    if (i.metros != null) d.push(`${Number(i.metros).toLocaleString('es-VE')} m²`);
    if (i.estacionamientos) d.push(`${i.estacionamientos} puesto${i.estacionamientos > 1 ? 's' : ''}`);
    return d.join(' · ');
  },

  // ---------- Avatar y estrellas ----------
  avatarUrl(ruta) {
    return ruta ? `${SUPABASE_URL}/storage/v1/object/public/avatares/${ruta.split('/').map(encodeURIComponent).join('/')}` : null;
  },
  // Círculo con la foto o, si no hay, con la inicial del nombre.
  avatar(p, tam = 48) {
    const nombre = (p && (p.nombre || p.full_name || p.usuario)) || 'V';
    const url = DP.avatarUrl(p && (p.avatar_url || p.otro_avatar || p.autor_avatar));
    const estilo = `width:${tam}px;height:${tam}px;font-size:${Math.round(tam * 0.42)}px`;
    return url
      ? `<img class="avatar" src="${DP.esc(url)}" alt="" width="${tam}" height="${tam}" style="${estilo}" loading="lazy">`
      : `<span class="avatar avatar-letra" style="${estilo}" aria-hidden="true">${DP.esc(nombre.replace('@', '').charAt(0).toUpperCase())}</span>`;
  },
  // «★ 4,9/5 (1.743)» o «Sin valoraciones aún»
  estrellas(valor, n, corto = false) {
    if (!n) return `<span class="estrellas sin">${corto ? 'Nuevo' : 'Sin valoraciones aún'}</span>`;
    const v = Number(valor).toLocaleString('es-VE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `<span class="estrellas" title="${v} de 5 estrellas"><span class="estrella" aria-hidden="true">★</span> <b>${v}</b>/5 <span class="n">(${Number(n).toLocaleString('es-VE')})</span></span>`;
  },
  // Resumen de puntuación acumulada: media grande, total y barras por estrellas.
  async resumenEstrellas(userId, cont, opciones = {}) {
    const { data } = await sb.from('valoraciones').select('estrellas').eq('usuario_id', userId);
    const lista = (data || []).map(v => v.estrellas);
    const n = lista.length;
    const media = n ? lista.reduce((a, b) => a + b, 0) / n : 0;
    const por = [5, 4, 3, 2, 1].map(e => [e, lista.filter(x => x === e).length]);
    const fmtMedia = media.toLocaleString('es-VE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    cont.innerHTML = `<div class="resumen-estrellas">
      <div class="resumen-nota">
        <b>${n ? fmtMedia : '–'}</b><span>de 5</span>
        ${DP.cincoEstrellas(Math.round(media))}
        <small>${n ? `${n.toLocaleString('es-VE')} ${n === 1 ? 'valoración' : 'valoraciones'}` : 'Aún sin valoraciones'}</small>
      </div>
      <div class="resumen-barras">${por.map(([e, c]) => `<div class="barra-estrella">
        <span>${e} ★</span><span class="pista"><span style="width:${n ? Math.round(c / n * 100) : 0}%"></span></span><span class="cuenta">${c}</span></div>`).join('')}
      </div>
    </div>${opciones.pie ? `<p class="ayuda">${opciones.pie}</p>` : ''}`;
    return { n, media };
  },

  // Cinco estrellas dibujadas (para reseñas)
  cincoEstrellas(n) {
    return `<span class="cinco-estrellas" aria-label="${n} de 5 estrellas">${'★'.repeat(n)}<span>${'★'.repeat(5 - n)}</span></span>`;
  },

  // Filtros guardados (p_operacion, p_tipo…) → parámetros de buscar.html (?operacion=…)
  urlDeFiltros(f) {
    const M = { q: 'q', p_operacion: 'operacion', p_tipo: 'tipo', p_estado: 'estado', p_precio_min: 'min', p_precio_max: 'max',
      p_habitaciones: 'hab', p_metros_min: 'm2min', p_metros_max: 'm2max', p_banos: 'banos', p_dias: 'dias',
      p_estacionamiento: 'estac', p_con_fotos: 'fotos', p_solo_vivinati: 'vivinati', p_bajo_precio: 'bajadas', p_incluir_conceptos: 'conceptos' };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f || {})) if (M[k] && v !== null && v !== false && v !== '') p.set(M[k], v === true ? '1' : v);
    return p.toString();
  },

  // «Bajó $50» si el precio bajó en los últimos 60 días (lo calcula la base de datos).
  bajada(i) {
    if (!i.precio_bajo_en || !(i.precio_anterior > i.precio)) return null;
    if (Date.now() - Date.parse(i.precio_bajo_en) > 60 * 864e5) return null;
    const n = Number(i.precio_anterior - i.precio).toLocaleString('es-VE', { maximumFractionDigits: 0 });
    return `Bajó ${i.moneda === 'VES' ? 'Bs. ' : '$'}${n}`;
  },

  // Tarjeta de anuncio: foto con etiqueta de operación y corazón de favorito,
  // precio grande, título, lugar, datos y, abajo, de qué web viene.
  tarjeta(i) {
    const bajo = DP.bajada(i);
    const foto = DP.fotoUrl(i.fotos && i.fotos[0]);
    const img = foto
      ? `<img class="foto" src="${DP.esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<div class="sinfoto">Sin fotos</div>`;
    const precio = DP.esc(DP.precio(i)).replace(' /mes', ' <small>/mes</small>');
    const origen = i.origen === 'externo' && i.fuente ? `Anuncio de ${DP.esc(i.fuente)}`
      : DP.esConcepto(i) ? (i.institucion ? DP.esc(i.institucion) : 'Portafolio en Vivinati') : 'Publicado en Vivinati';
    const fav = DP.esFavorito(i.id);
    const concepto = DP.esConcepto(i);
    const chips = (concepto
      ? [DP.ROLES[i.rol_autor], ...(Array.isArray(i.herramientas) ? i.herramientas.slice(0, 3) : [])]
      : [
        i.habitaciones != null ? `${i.habitaciones} hab.` : null,
        i.banos != null ? `${i.banos} baños` : null,
        i.metros != null ? `${Number(i.metros).toLocaleString('es-VE')} m²` : null
      ]).filter(Boolean).map(c => `<span class="chip-dato">${DP.esc(c)}</span>`).join('');
    // Solo en el teléfono (estilo app): «Apartamento · En alquiler» arriba y
    // «$650/mes | 85 m² | 2 hab.» abajo. En escritorio están ocultas.
    const tipo = concepto ? (DP.CATEGORIAS[i.categoria_proyecto] || 'Proyecto') : (DP.TIPOS[i.tipo] || i.tipo);
    const tipoMovil = [tipo, DP.OPERACIONES[i.operacion]].filter(Boolean).join(' · ');
    const lineaMovil = (concepto ? [DP.precio(i), DP.ROLES[i.rol_autor], i.institucion] : [
      DP.precio(i),
      i.metros != null ? `${Number(i.metros).toLocaleString('es-VE')} m²` : null,
      i.habitaciones != null ? `${i.habitaciones} hab.` : null
    ]).filter(Boolean).map(DP.esc).join(' <span class="sep">|</span> ');
    return `<article class="tarjeta-env">
      <a class="tarjeta" href="anuncio.html?id=${encodeURIComponent(i.id)}">
        <div class="tarjeta-foto">${img}<span class="sello sello-${DP.esc(i.operacion)}">${DP.esc(DP.OPERACIONES[i.operacion] || '')}</span>${bajo ? `<span class="cinta-bajada">↓ ${DP.esc(bajo)}</span>` : ''}</div>
        <div class="cuerpo">
          <div class="tipo-movil op-${DP.esc(i.operacion)}">${DP.esc(tipoMovil)}</div>
          <div class="precio${concepto ? ' precio-concepto' : ''}">${precio}${bajo ? ` <s class="precio-antes">${DP.esc(DP.precio({ ...i, precio: i.precio_anterior }))}</s>` : ''}</div>
          <div class="titulo-t">${DP.esc(i.titulo)}</div>
          <div class="lugar"><span class="lugar-tipo">${DP.esc(tipo)} · </span><span class="lugar-sitio">${DP.esc(DP.lugar(i))}</span></div>
          <div class="linea-movil">${lineaMovil}</div>
          ${chips ? `<div class="chips-datos">${chips}</div>` : ''}
          <div class="origen">${origen}</div>
        </div>
      </a>
      <button type="button" class="corazon" data-fav="${DP.esc(i.id)}" aria-pressed="${fav}"
        aria-label="${fav ? 'Quitar de favoritos' : 'Guardar en favoritos'}" title="${fav ? 'Quitar de favoritos' : 'Guardar en favoritos'}">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.3 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>
      </button>
    </article>`;
  },

  // ---------- Favoritos ----------
  // Se guardan en este navegador y, si hay sesión, también en la cuenta
  // (tabla favoritos): así aparecen en cualquier teléfono u ordenador.
  favoritos() {
    try { return JSON.parse(localStorage.getItem('dp_favoritos') || '[]').filter(x => /^[0-9a-f-]{36}$/i.test(x)); }
    catch { return []; }
  },
  _guardarFavoritos(lista) {
    try { localStorage.setItem('dp_favoritos', JSON.stringify(lista.slice(0, 200))); } catch { /* sin almacenamiento */ }
    document.dispatchEvent(new CustomEvent('dp:favoritos', { detail: lista }));
  },
  esFavorito(id) { return DP.favoritos().includes(id); },
  alternarFavorito(id) {
    const lista = DP.favoritos();
    const i = lista.indexOf(id);
    if (i >= 0) lista.splice(i, 1); else lista.unshift(id);
    DP._guardarFavoritos(lista);
    // En la cuenta, sin esperar (si falla, queda al menos en el navegador).
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      const t = sb.from('favoritos');
      (i < 0 ? t.upsert({ user_id: session.user.id, inmueble_id: id }, { onConflict: 'user_id,inmueble_id', ignoreDuplicates: true })
             : t.delete().eq('user_id', session.user.id).eq('inmueble_id', id)).then(() => {});
    });
    return i < 0;
  },
  // Une los favoritos del navegador con los de la cuenta (una vez por visita).
  async sincronizarFavoritos() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session || DP._sincronizado) return;
    DP._sincronizado = true;
    const { data, error } = await sb.from('favoritos').select('inmueble_id').order('creado', { ascending: false }).limit(200);
    if (error || !data) return;
    const enCuenta = data.map(f => f.inmueble_id);
    const local = DP.favoritos();
    const soloLocal = local.filter(id => !enCuenta.includes(id));
    if (soloLocal.length) {
      await sb.from('favoritos').upsert(soloLocal.map(inmueble_id => ({ user_id: session.user.id, inmueble_id })),
        { onConflict: 'user_id,inmueble_id', ignoreDuplicates: true });
    }
    const union = [...new Set([...local, ...enCuenta])];
    if (union.length !== local.length) {
      DP._guardarFavoritos(union);
      document.querySelectorAll('.corazon[data-fav]').forEach(x => {
        const si = union.includes(x.dataset.fav);
        x.setAttribute('aria-pressed', si);
        x.setAttribute('aria-label', si ? 'Quitar de favoritos' : 'Guardar en favoritos');
      });
    }
  },
  // Un solo escuchador para todos los corazones de la página.
  activarCorazones() {
    if (DP._corazones) return;
    DP._corazones = true;
    document.addEventListener('click', e => {
      const b = e.target.closest('.corazon[data-fav]');
      if (!b) return;
      e.preventDefault();
      const ahora = DP.alternarFavorito(b.dataset.fav);
      document.querySelectorAll(`.corazon[data-fav="${CSS.escape(b.dataset.fav)}"]`).forEach(x => {
        x.setAttribute('aria-pressed', ahora);
        x.setAttribute('aria-label', ahora ? 'Quitar de favoritos' : 'Guardar en favoritos');
        x.title = x.getAttribute('aria-label');
      });
    });
  },

  opciones(sel, mapa, primera) {
    sel.innerHTML = (primera ? `<option value="">${DP.esc(primera)}</option>` : '') +
      Object.entries(mapa).map(([v, t]) => `<option value="${DP.esc(v)}">${DP.esc(t)}</option>`).join('');
  },

  opcionesEstados(sel, primera) {
    DP.opciones(sel, Object.fromEntries(Object.keys(DP.ESTADOS).map(e => [e, e])), primera);
  },

  // Capa de mapa (OpenStreetMap). Requiere Leaflet cargado en la página.
  capaMapa(mapa) {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapa);
  },

  // Perfil de quien tiene la sesión (o null). Se guarda en memoria por página.
  async miPerfil() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    if (!DP._perfil) {
      const { data } = await sb.from('profiles').select('id, usuario, full_name, phone, email, avatar_url, biography, tipo_perfil, empresa, estado, ciudad, sitio_web, instagram, mostrar_telefono').eq('id', session.user.id).maybeSingle();
      DP._perfil = data || { id: session.user.id, usuario: null };
    }
    return DP._perfil;
  },

  // Globito rojo con los mensajes sin leer (menú de arriba y barra del móvil).
  async contarMensajes() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const { data: n } = await sb.rpc('no_leidos_total');
    document.querySelectorAll('[data-mensajes]').forEach(a => {
      let b = a.querySelector('.badge-mensajes');
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('span'); b.className = 'badge-mensajes'; a.appendChild(b); }
      b.textContent = n > 99 ? '99+' : n;
    });
  },

  // Pinta la cabecera según haya sesión o no.
  async cabecera() {
    const { data: { session } } = await sb.auth.getSession();
    const nav = document.querySelector('[data-nav-sesion]');
    if (!nav) return session;
    if (session) {
      const p = await DP.miPerfil();
      const quien = p && p.usuario ? '@' + p.usuario : 'Mi perfil';
      nav.innerHTML = `<a href="chat.html" data-mensajes>Mensajes</a><a href="mis-anuncios.html">Mis anuncios</a>` +
        `<a href="perfil.html" class="nav-perfil">${p && p.avatar_url ? DP.avatar({ nombre: quien, avatar_url: p.avatar_url }, 24) + ' ' : ''}${DP.esc(quien)}</a><a href="#" data-salir>Salir</a>`;
      nav.querySelector('[data-salir]').addEventListener('click', async e => {
        e.preventDefault();
        try { indexedDB.deleteDatabase('vivinati-chat'); } catch { /* nada */ }
        await sb.auth.signOut(); location.href = 'index.html';
      });
      DP.contarMensajes();
    } else {
      nav.innerHTML = `<a href="entrar.html">Entrar</a><a href="registro.html">Crear cuenta</a>`;
    }
    return session;
  },

  // ---------- «No soy un robot» (Cloudflare Turnstile) ----------
  // La clave del sitio es pública. La secreta vive solo en Supabase
  // (Authentication → Attack Protection), que es quien comprueba el token.
  // Mientras TURNSTILE_SITE_KEY esté vacía, el widget no se muestra.
  TURNSTILE_SITE_KEY: '0x4AAAAAAGDgiLDbWnalwbx_',

  antirrobot(contenedor) {
    const estado = { token: null, id: null };
    if (!DP.TURNSTILE_SITE_KEY) { contenedor.hidden = true; return { activo: false, token: () => undefined, reiniciar() {} }; }
    const pintar = () => {
      estado.id = window.turnstile.render(contenedor, {
        sitekey: DP.TURNSTILE_SITE_KEY, language: 'es', theme: 'auto',
        callback: t => { estado.token = t; },
        'expired-callback': () => { estado.token = null; },
        'error-callback': () => { estado.token = null; }
      });
    };
    if (window.turnstile) pintar();
    else {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.onload = pintar;
      document.head.appendChild(s);
    }
    return {
      activo: true,
      token: () => estado.token,
      reiniciar() { estado.token = null; if (window.turnstile && estado.id != null) window.turnstile.reset(estado.id); }
    };
  },

  // ---------- Formularios de cuenta ----------
  // Botón de «ojo» dentro de cada campo de contraseña para verla u ocultarla.
  ojos(raiz = document) {
    const ICONO_VER = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    const ICONO_OCULTAR = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.8 10.8 0 0112 5c6.5 0 10 7 10 7a17.6 17.6 0 01-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1"/></svg>';
    raiz.querySelectorAll('input[type=password]:not([data-con-ojo])').forEach(input => {
      input.dataset.conOjo = '1';
      const caja = document.createElement('div');
      caja.className = 'con-ojo';
      input.parentNode.insertBefore(caja, input);
      caja.appendChild(input);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ojo';
      const pintar = () => {
        const visible = input.type === 'text';
        b.innerHTML = visible ? ICONO_OCULTAR : ICONO_VER;
        b.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
        b.setAttribute('aria-pressed', visible);
        b.title = b.getAttribute('aria-label');
      };
      b.addEventListener('click', () => {
        input.type = input.type === 'password' ? 'text' : 'password';
        pintar();
        input.focus();
      });
      pintar();
      caja.appendChild(b);
    });
  },

  mensaje(el, texto, tipo = 'error') {
    el.innerHTML = texto ? `<div class="mensaje ${tipo}">${DP.esc(texto)}</div>` : '';
  },

  // Reglas de contraseña: 8+ caracteres, al menos una letra y un número.
  problemaContrasena(c) {
    if (c.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(c) || !/\d/.test(c)) return 'La contraseña debe tener letras y números.';
    return null;
  },

  // Mensajes de Supabase Auth en español claro.
  errorCuenta(error) {
    const m = (error && (error.message || error.error_description)) || '';
    if (/usuario_ocupado/.test(m)) return 'Ese @usuario ya está en uso. Elige otro.';
    if (/usuario_invalido/.test(m)) return 'Ese @usuario no está permitido. Usa de 3 a 20 letras, números o _.';
    if (/Database error saving new user/i.test(m)) return 'No se pudo crear la cuenta. Puede que ese @usuario ya esté en uso: prueba con otro.';
    if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
    if (/Email not confirmed/i.test(m)) return 'Aún no has activado tu cuenta. Abre el enlace que te enviamos por correo.';
    if (/already registered|already been registered/i.test(m)) return 'Ya existe una cuenta con ese correo. Entra o recupera tu contraseña.';
    if (/captcha/i.test(m)) return 'Confirma que no eres un robot y vuelve a intentarlo.';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.';
    if (/Password should be|weak/i.test(m)) return 'La contraseña es demasiado débil. Usa al menos 8 caracteres con letras y números.';
    if (/same.*password|different from the old/i.test(m)) return 'La nueva contraseña debe ser distinta de la anterior.';
    return 'Algo salió mal: ' + m;
  },

  // Adónde volver tras entrar (solo páginas de este sitio).
  // «Continuar con Google» (entrar y registro). Google devuelve a la
  // persona a entrar.html?oauth=1, que decide a dónde llevarla.
  botonesSociales(el, destino, { arriba = false } = {}) {
    if (!el) return;
    const g = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
    const boton = `<button type="button" class="boton-social" data-google>${g}<span>Continuar con Google</span></button>
      <div data-msg-social></div>
      <p class="legal-social">Al continuar con Google aceptas las <a href="condiciones.html" target="_blank" rel="noopener">condiciones de uso y el aviso de responsabilidad</a>.</p>`;
    el.innerHTML = arriba
      ? boton + '<div class="separador-o"><span>o regístrate con tu correo</span></div>'
      : '<div class="separador-o"><span>o</span></div>' + boton;
    el.querySelector('[data-google]').addEventListener('click', async e => {
      e.currentTarget.disabled = true;
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${location.origin}/entrar.html?oauth=1&next=${encodeURIComponent(destino || 'mis-anuncios.html')}` }
      });
      if (error) {
        e.target.closest('button').disabled = false;
        DP.mensaje(el.querySelector('[data-msg-social]'), /not enabled|Unsupported provider/i.test(error.message || '')
          ? 'El acceso con Google aún no está activado. Usa tu correo por ahora.' : 'No se pudo abrir Google. Inténtalo de nuevo.');
      }
    });
  },

  siguiente(porDefecto = 'mis-anuncios.html') {
    const n = new URLSearchParams(location.search).get('next') || '';
    return /^[a-z0-9-]+\.html(\?[\w=&%-]*)?$/i.test(n) ? n : porDefecto;
  }
};

// Pie de página común a todas las páginas (columnas de enlaces, como los portales grandes).
DP.pie = () => {
  const pie = document.querySelector('footer.pie');
  if (!pie) return;
  const anio = new Date().getFullYear();
  const estados = ['Distrito Capital', 'Miranda', 'Carabobo', 'Zulia', 'Lara', 'Anzoátegui'];
  pie.innerHTML = `<div class="pie-int">
    <div class="pie-columnas">
      <div>
        <h4>Vivinati</h4>
        <p style="margin:0">El buscador de inmuebles de Venezuela: apartamentos, casas, anexos, locales y terrenos en venta y alquiler, en un solo lugar.</p>
      </div>
      <div>
        <h4>Buscar</h4>
        <ul>
          <li><a href="buscar.html?operacion=venta">Inmuebles en venta</a></li>
          <li><a href="buscar.html?operacion=alquiler">Inmuebles en alquiler</a></li>
          <li><a href="buscar.html?tipo=apartamento">Apartamentos</a></li>
          <li><a href="buscar.html?tipo=casa">Casas</a></li>
          <li><a href="buscar.html?vista=mapa">Ver en el mapa</a></li>
          <li><a href="precios/">Precio del m² por zona</a></li>
        </ul>
      </div>
      <div>
        <h4>Por estado</h4>
        <ul>${estados.map(e => `<li><a href="buscar.html?estado=${encodeURIComponent(e)}">${DP.esc(e)}</a></li>`).join('')}</ul>
      </div>
      <div>
        <h4>Publicar y ayuda</h4>
        <ul>
          <li><a href="publicar.html">Publicar gratis</a></li>
          <li><a href="registro.html">Crear cuenta</a></li>
          <li><a href="mis-anuncios.html">Mis anuncios</a></li>
          <li><a href="index.html#consejos">Consejos de seguridad</a></li>
          <li><a href="bot.html">Cómo encontramos anuncios</a></li>
          <li><a href="condiciones.html">Condiciones de uso y aviso de responsabilidad</a></li>
        </ul>
      </div>
    </div>
    <a class="emblema" href="index.html" aria-label="Vivinati — inicio">
      <img src="img/sello-vivinati.png" alt="Vivinati" width="150" height="25" loading="lazy" decoding="async">
    </a>
    <div class="legal">
      <span>© ${anio} Vivinati</span>
      <span>Los anuncios son responsabilidad de quien los publica; Vivinati no se hace responsable de estafas ni engaños. <a href="condiciones.html">Condiciones de uso</a></span>
    </div>
  </div>`;
};

// Barra de pestañas inferior, como en las apps. Solo se ve en el teléfono
// (el CSS la oculta en pantallas anchas).
DP.barraMovil = () => {
  if (document.querySelector('.barra-movil')) return;
  const pagina = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const fav = new URLSearchParams(location.search).get('fav') === '1';
  const icono = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const pestañas = [
    ['buscar.html', 'Buscar', pagina === 'buscar.html' && !fav, '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'],
    ['buscar.html?fav=1', 'Favoritos', pagina === 'buscar.html' && fav, '<path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.3 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/>'],
    ['publicar.html', 'Publicar', pagina === 'publicar.html', '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'],
    ['chat.html', 'Mensajes', pagina === 'chat.html', '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'],
    ['perfil.html', 'Perfil', ['perfil.html', 'entrar.html', 'registro.html', 'restablecer.html'].includes(pagina), '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>']
  ];
  const nav = document.createElement('nav');
  nav.className = 'barra-movil';
  nav.setAttribute('aria-label', 'Menú principal');
  nav.innerHTML = pestañas.map(([href, txt, activa, d]) =>
    `<a href="${href}"${activa ? ' class="activa" aria-current="page"' : ''}${href === 'chat.html' ? ' data-mensajes' : ''}>${icono(d)}<span>${txt}</span></a>`).join('');
  document.body.appendChild(nav);
  document.body.classList.add('con-barra-movil');
};

// ---------- Instalar como app (PWA) ----------
// Android/Chrome avisan con «beforeinstallprompt»: guardamos el aviso y
// mostramos nuestro botón (en el perfil y una barra discreta en el móvil).
// En iPhone no existe ese aviso: explicamos «Compartir → Añadir a inicio».
DP.app = () => {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let aviso = null;
  const bloque = document.getElementById('bloque-instalar');
  const ocultarBarra = () => { const b = document.querySelector('.barra-instalar'); if (b) b.remove(); };
  const instalar = async () => {
    if (!aviso) return;
    aviso.prompt();
    await aviso.userChoice.catch(() => null);
    aviso = null; ocultarBarra();
    if (bloque) bloque.hidden = true;
  };
  document.addEventListener('click', e => { if (e.target.closest('[data-instalar]')) instalar(); });
  if (instalada) return;
  if (bloque && ios) {
    bloque.hidden = false;
    bloque.querySelector('[data-instalar]').hidden = true;
    document.getElementById('texto-instalar').innerHTML = 'En iPhone: abre vivinati.com en Safari, pulsa <b>Compartir</b> (el cuadrado con la flecha) y luego <b>«Añadir a pantalla de inicio»</b>.';
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    aviso = e;
    if (bloque) bloque.hidden = false;
    let cerrada = false;
    try { cerrada = Date.now() - Number(localStorage.getItem('dp_instalar_cerrado') || 0) < 14 * 864e5; } catch { /* nada */ }
    if (cerrada || document.querySelector('.barra-instalar')) return;
    const barra = document.createElement('div');
    barra.className = 'barra-instalar';
    barra.innerHTML = `<img src="/img/icono-192.png" alt="" width="36" height="36"><span><b>Vivinati en tu teléfono</b><br>Instálala gratis, sin tienda de apps</span>
      <button type="button" class="boton peq" data-instalar>Instalar</button>
      <button type="button" class="cerrar" aria-label="Cerrar">×</button>`;
    barra.querySelector('.cerrar').addEventListener('click', () => {
      try { localStorage.setItem('dp_instalar_cerrado', String(Date.now())); } catch { /* nada */ }
      ocultarBarra();
    });
    document.body.appendChild(barra);
  });
  window.addEventListener('appinstalled', () => { ocultarBarra(); if (bloque) bloque.hidden = true; });
};

window.DP = DP;
DP.ojos();
DP.pie();
DP.barraMovil();
DP.activarCorazones();
DP.sincronizarFavoritos();
DP.app();
