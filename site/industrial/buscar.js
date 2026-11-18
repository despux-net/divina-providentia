// Buscador de Vivinati Industrial. Los filtros viven en la URL
// (buscar.html?q=generador&categoria=energia&estado=Zulia…) para poder compartirla.
(() => {
  const $ = id => document.getElementById(id);
  const POR_PAGINA = 24;
  DP.cabecera();
  IND.opcionesCategorias($('categoria'), 'Todas las categorías');
  DP.opcionesEstados($('estado'), 'Toda Venezuela');

  const CAMPOS = ['q', 'categoria', 'operacion', 'condicion', 'estado', 'pmin', 'pmax', 'orden'];
  const CASILLAS = ['fotos', 'envios'];
  const params = new URLSearchParams(location.search);
  CAMPOS.forEach(c => { if (params.get(c)) $(c).value = params.get(c); });
  CASILLAS.forEach(c => { $(c).checked = params.get(c) === '1'; });
  if (!$('orden').value) $('orden').value = 'recientes';

  let desde = 0;
  const num = v => (v === '' || v == null ? null : Number(v));

  function filtros() {
    return {
      q: $('q').value.trim() || null, p_categoria: $('categoria').value || null, p_operacion: $('operacion').value || null,
      p_condicion: $('condicion').value || null, p_estado: $('estado').value || null,
      p_precio_min: num($('pmin').value), p_precio_max: num($('pmax').value),
      p_con_fotos: $('fotos').checked || null, p_envios: $('envios').checked || null,
      p_orden: $('orden').value || 'recientes'
    };
  }
  function guardarUrl() {
    const p = new URLSearchParams();
    CAMPOS.forEach(c => { const v = $(c).value.trim(); if (v && !(c === 'orden' && v === 'recientes')) p.set(c, v); });
    CASILLAS.forEach(c => { if ($(c).checked) p.set(c, '1'); });
    history.replaceState(null, '', p.toString() ? '?' + p : location.pathname);
  }
  function titulo() {
    const f = filtros();
    const que = f.p_categoria ? IND.nombreCategoria(f.p_categoria) : f.p_operacion === 'servicio' ? 'Servicios industriales'
      : f.p_operacion === 'alquiler' ? 'Alquiler de maquinaria y equipos' : 'Industrial';
    const op = f.p_categoria && f.p_operacion ? ' ' + IND.OPERACIONES[f.p_operacion].toLowerCase() : '';
    const t = `${que}${op} en ${f.p_estado || 'Venezuela'}`;
    $('titulo').textContent = t;
    document.title = `${t} — Vivinati Industrial`;
  }

  async function buscar(mas = false) {
    if (!mas) { desde = 0; $('resultados').innerHTML = ''; $('resumen').textContent = 'Buscando…'; }
    $('mas').hidden = true;
    const { data, error } = await DP.sb.rpc('buscar_productos', { ...filtros(), p_limite: POR_PAGINA, p_desde: desde });
    if (error) { console.error(error); $('resumen').textContent = 'No se pudo buscar. Inténtalo de nuevo.'; return; }
    $('resultados').insertAdjacentHTML('beforeend', data.map(IND.tarjeta).join(''));
    desde += data.length;
    $('mas').hidden = data.length < POR_PAGINA;
    if (!desde) {
      $('resumen').textContent = '';
      $('resultados').innerHTML = `<div class="vacio-ind">
        <p><b>No encontramos publicaciones con estos filtros.</b> Prueba con menos filtros o con otra palabra.</p>
        <p>¿Lo vendes tú? <a href="/industrial/publicar.html">Publícalo gratis</a>.</p></div>`;
    } else {
      $('resumen').textContent = `${desde}${$('mas').hidden ? '' : '+'} ${desde === 1 ? 'publicación' : 'publicaciones'}`;
    }
  }

  $('form').addEventListener('submit', e => { e.preventDefault(); $('d-mas').open = false; guardarUrl(); titulo(); buscar(); });
  ['categoria', 'operacion', 'condicion', 'estado', 'orden', 'fotos', 'envios'].forEach(c =>
    $(c).addEventListener('change', () => { guardarUrl(); titulo(); buscar(); }));
  document.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => {
    b.closest('details').open = false; guardarUrl(); titulo(); buscar();
  }));
  $('limpiar').addEventListener('click', () => {
    CAMPOS.forEach(c => { $(c).value = ''; }); CASILLAS.forEach(c => { $(c).checked = false; });
    $('orden').value = 'recientes'; guardarUrl(); titulo(); buscar();
  });
  $('mas').addEventListener('click', () => buscar(true));

  titulo();
  buscar();
})();
