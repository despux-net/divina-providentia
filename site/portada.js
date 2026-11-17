// Portada: el buscador envía a buscar.html (formulario normal, sin JS),
// aquí solo se rellenan los desplegables, los anuncios recientes y las cifras.
(() => {
  const $ = id => document.getElementById(id);
  DP.opciones($('f-tipo'), DP.TIPOS, 'Todos los tipos');
  DP.opciones($('f-categoria'), DP.CATEGORIAS, 'Todas las categorías');
  DP.opciones($('f-rol'), DP.ROLES, 'Cualquier autor');

  // ---------- Pestañas de intención: Comprar · Alquilar · Conceptos 3D ----------
  // Comprar/Alquilar envían a buscar.html con su operación y filtros de
  // vivienda; Conceptos 3D envía a la galería conceptos.html con filtros de
  // portafolio (categoría y perfil del autor).
  const INTENCIONES = {
    venta: { accion: 'buscar.html', texto: 'Ciudad, zona o palabra clave', vivienda: true },
    alquiler: { accion: 'buscar.html', texto: '¿Dónde quieres vivir? Ciudad o zona', vivienda: true },
    concepto: { accion: 'conceptos.html', texto: 'Idea, universidad o programa (Revit, Blender…)', vivienda: false }
  };
  const form = $('form-busqueda');
  const pestañas = [...document.querySelectorAll('.intencion')];
  function elegir(intencion, enfocar) {
    const c = INTENCIONES[intencion] || INTENCIONES.venta;
    pestañas.forEach(b => b.setAttribute('aria-selected', String(b.dataset.intencion === intencion)));
    form.action = c.accion;
    form.dataset.intencion = intencion;
    $('q').placeholder = c.texto;
    $('f-operacion').value = intencion;
    $('f-operacion').disabled = !c.vivienda;
    for (const id of ['f-tipo', 'f-hab']) { $(id).hidden = !c.vivienda; $(id).disabled = !c.vivienda; }
    for (const id of ['f-categoria', 'f-rol']) { $(id).hidden = c.vivienda; $(id).disabled = c.vivienda; }
    if (enfocar) $('q').focus();
  }
  pestañas.forEach(b => b.addEventListener('click', () => elegir(b.dataset.intencion, true)));
  // Flechas izquierda/derecha entre pestañas (accesibilidad).
  document.querySelector('.intenciones').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const i = pestañas.indexOf(document.activeElement);
    if (i < 0) return;
    const sig = pestañas[(i + (e.key === 'ArrowRight' ? 1 : pestañas.length - 1)) % pestañas.length];
    sig.focus(); elegir(sig.dataset.intencion, false);
  });
  elegir(new URLSearchParams(location.search).get('intencion') || 'venta', false);
  // No enviar campos vacíos (la URL queda limpia: buscar.html?q=Chacao).
  $('form-busqueda').addEventListener('submit', () => {
    for (const el of $('form-busqueda').querySelectorAll('[name]')) if (!el.value) el.disabled = true;
  });
  window.addEventListener('pageshow', () => elegir(form.dataset.intencion || 'venta', false));

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
