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
      ? `<img class="foto" src="${DP.esc(foto)}" alt="" loading="lazy">`
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

  // Pinta la cabecera según haya sesión o no.
  async cabecera() {
    const { data: { session } } = await sb.auth.getSession();
    const nav = document.querySelector('[data-nav-sesion]');
    if (!nav) return session;
    nav.innerHTML = session
      ? `<a href="mis-anuncios.html">Mis anuncios</a><a href="#" data-salir>Salir</a>`
      : `<a href="publicar.html">Entrar</a>`;
    const salir = nav.querySelector('[data-salir]');
    if (salir) salir.addEventListener('click', async e => { e.preventDefault(); await sb.auth.signOut(); location.href = 'index.html'; });
    return session;
  }
};

window.DP = DP;
