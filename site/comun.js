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
  OPERACIONES: { venta: 'En venta', alquiler: 'En alquiler' },

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

  tarjeta(i) {
    const foto = DP.fotoUrl(i.fotos && i.fotos[0]);
    const img = foto
      ? `<img class="foto" src="${DP.esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<div class="sinfoto">Sin fotos</div>`;
    const fuente = i.origen === 'externo' && i.fuente ? `<span class="etiqueta gris">${DP.esc(i.fuente)}</span>` : '';
    return `<a class="tarjeta" href="anuncio.html?id=${encodeURIComponent(i.id)}">
      ${img}
      <div class="cuerpo">
        <div class="etiquetas"><span class="etiqueta">${DP.esc(DP.OPERACIONES[i.operacion] || '')}</span>
          <span class="etiqueta gris">${DP.esc(DP.TIPOS[i.tipo] || i.tipo)}</span>${fuente}</div>
        <div class="precio">${DP.esc(DP.precio(i))}</div>
        <div class="titulo-t">${DP.esc(i.titulo)}</div>
        <div class="lugar">${DP.esc(DP.lugar(i))}</div>
        <div class="datos">${DP.esc(DP.datos(i))}</div>
      </div></a>`;
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
      const { data } = await sb.from('profiles').select('id, usuario, full_name, phone, email').eq('id', session.user.id).maybeSingle();
      DP._perfil = data || { id: session.user.id, usuario: null };
    }
    return DP._perfil;
  },

  // Pinta la cabecera según haya sesión o no.
  async cabecera() {
    const { data: { session } } = await sb.auth.getSession();
    const nav = document.querySelector('[data-nav-sesion]');
    if (!nav) return session;
    if (session) {
      const p = await DP.miPerfil();
      const quien = p && p.usuario ? '@' + p.usuario : 'Mi perfil';
      nav.innerHTML = `<a href="mis-anuncios.html">Mis anuncios</a><a href="perfil.html">${DP.esc(quien)}</a><a href="#" data-salir>Salir</a>`;
      nav.querySelector('[data-salir]').addEventListener('click', async e => {
        e.preventDefault(); await sb.auth.signOut(); location.href = 'index.html';
      });
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
  siguiente(porDefecto = 'mis-anuncios.html') {
    const n = new URLSearchParams(location.search).get('next') || '';
    return /^[a-z0-9-]+\.html(\?[\w=&%-]*)?$/i.test(n) ? n : porDefecto;
  }
};

window.DP = DP;
DP.ojos();
