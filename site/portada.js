// Portada: el buscador envía a buscar.html (formulario normal, sin JS),
// aquí solo se rellenan los desplegables, los anuncios recientes y las cifras.
(() => {
  const $ = id => document.getElementById(id);
  DP.opciones($('f-operacion'), { venta: 'En venta', alquiler: 'En alquiler' }, 'Venta y alquiler');
  DP.opciones($('f-tipo'), DP.TIPOS, 'Todos los tipos');
  // No enviar campos vacíos (la URL queda limpia: buscar.html?q=Chacao).
  $('form-busqueda').addEventListener('submit', () => {
    for (const el of $('form-busqueda').querySelectorAll('[name]')) if (!el.value) el.disabled = true;
  });
  window.addEventListener('pageshow', () => $('form-busqueda').querySelectorAll('[name]').forEach(el => { el.disabled = false; }));

  DP.cabecera();

  // Anuncios recientes (8).
  DP.sb.rpc('buscar_inmuebles', { p_limite: 8 }).then(({ data, error }) => {
    const cont = $('recientes');
    if (error || !data) { cont.innerHTML = '<div class="vacio" style="grid-column:1/-1">No se pudieron cargar los anuncios.</div>'; return; }
    cont.innerHTML = data.map(DP.tarjeta).join('');
  });

  // ---------- Contenido editable desde Pages CMS (site/contenido/portada.json) ----------
  // Si el archivo no carga, la portada se queda con los textos e ilustración de fábrica.
  const contenido = fetch('contenido/portada.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null)).catch(() => null).then(c => {
      if (!c) return;
      // Imagen de fondo: solo fotos subidas al CMS (/media/…) o enlaces https.
      const img = String(c.imagen_fondo || '').trim();
      const imgSegura = /^\/media\/[\w\-./%]+$/i.test(img) ? img : DP.urlSegura(img);
      if (imgSegura) {
        const velo = Math.min(80, Math.max(0, Number(c.velo) || 0)) / 100;
        const pos = ['top', 'center', 'bottom'].includes(c.posicion) ? c.posicion : 'center';
        const hero = $('hero');
        hero.style.backgroundImage = `linear-gradient(rgba(255,255,255,${velo}), rgba(255,255,255,${velo})), url("${imgSegura.replace(/["\\\s()]/g, encodeURIComponent)}")`;
        hero.style.backgroundPosition = `center ${pos}`;
        hero.style.backgroundSize = 'cover';
      }
      // Título del buscador: {anuncios} se convierte en el número en vivo.
      if (c.titulo_buscador) {
        const h = $('titulo-buscador');
        h.textContent = '';
        String(c.titulo_buscador).split('{anuncios}').forEach((trozo, n) => {
          if (n > 0) h.appendChild(Object.assign(document.createElement('span'), { textContent: '…' })).dataset.cifra = 'anuncios';
          h.appendChild(document.createTextNode(trozo));
        });
      }
      if (c.titulo_categorias) $('titulo-categorias').textContent = c.titulo_categorias;
      if (c.subtitulo_categorias) $('subtitulo-categorias').textContent = c.subtitulo_categorias;
      const zonas = (Array.isArray(c.sugerencias) ? c.sugerencias : []).map(z => String(z).trim()).filter(Boolean).slice(0, 10);
      if (zonas.length) {
        $('sugerencias').innerHTML = 'Prueba: ' + zonas.map(z =>
          `<a href="buscar.html?q=${encodeURIComponent(z)}">${DP.esc(z)}</a>`).join(' · ');
      }
    });

  // Cifras en vivo (anuncios activos, webs, estados, con mapa), después del contenido.
  Promise.all([DP.sb.rpc('estadisticas_publicas'), contenido]).then(([{ data }]) => {
    const c = data && data[0];
    if (!c) return;
    document.querySelectorAll('[data-cifra]').forEach(el => {
      const v = c[el.dataset.cifra];
      if (v != null) el.textContent = Number(v).toLocaleString('es-VE');
    });
  });
})();
