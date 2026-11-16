// Galería «Conceptos 3D» (conceptos.html): solo proyectos con operacion =
// 'concepto'. Filtros de portafolio (categoría, etapa, perfil del autor y
// estado) que viven en la URL para poder compartir la búsqueda.
(() => {
  const POR_PAGINA = 24;
  const $ = id => document.getElementById(id);
  const campos = { q: $('q'), categoria: $('f-categoria'), etapa: $('f-etapa'), rol: $('f-rol'), estado: $('f-estado') };
  const fmt = n => Number(n).toLocaleString('es-VE');
  let desde = 0, peticion = 0;

  DP.opciones(campos.categoria, DP.CATEGORIAS, 'Todas las categorías');
  DP.opciones(campos.etapa, DP.ETAPAS, 'Cualquier etapa');
  DP.opciones(campos.rol, DP.ROLES, 'Cualquier autor');
  DP.opcionesEstados(campos.estado, 'Toda Venezuela');

  const params = new URLSearchParams(location.search);
  for (const [k, el] of Object.entries(campos)) if (params.has(k)) el.value = params.get(k);

  const filtros = () => ({
    q: campos.q.value.trim() || null,
    p_operacion: 'concepto',
    p_categoria: campos.categoria.value || null,
    p_etapa: campos.etapa.value || null,
    p_rol: campos.rol.value || null,
    p_estado: campos.estado.value || null
  });

  function guardarEnUrl() {
    const p = new URLSearchParams();
    for (const [k, el] of Object.entries(campos)) if (el.value.trim()) p.set(k, el.value.trim());
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
    for (const el of [campos.categoria, campos.etapa, campos.rol, campos.estado]) el.classList.toggle('activa', !!el.value);
  }

  async function buscar(anadir = false) {
    const id = ++peticion;
    if (!anadir) { desde = 0; $('resumen').textContent = 'Buscando…'; }
    guardarEnUrl();
    const f = filtros();
    const [{ data, error }, conteo] = await Promise.all([
      DP.sb.rpc('buscar_inmuebles', { ...f, p_limite: POR_PAGINA + 1, p_desde: desde }),
      anadir ? Promise.resolve(null) : DP.sb.rpc('conteos_busqueda', f)
    ]);
    if (id !== peticion) return;
    const cont = $('resultados');
    if (error) {
      console.error(error);
      $('resumen').textContent = 'No se pudo cargar la galería. Inténtalo de nuevo.';
      return;
    }
    const hayMas = data.length > POR_PAGINA;
    const filas = hayMas ? data.slice(0, POR_PAGINA) : data;
    if (!anadir) cont.innerHTML = '';
    cont.insertAdjacentHTML('beforeend', filas.map(DP.tarjeta).join(''));
    if (!anadir) {
      const total = conteo && conteo.data ? conteo.data.total : filas.length;
      $('resumen').innerHTML = total
        ? `<b>${fmt(total)}</b> ${total === 1 ? 'proyecto conceptual' : 'proyectos conceptuales'}`
        : '';
      if (!filas.length) {
        cont.innerHTML = `<div class="vacio" style="grid-column:1/-1"><strong>${f.q || f.p_categoria || f.p_etapa || f.p_rol || f.p_estado
          ? 'Ningún proyecto con estos filtros' : 'Aún no hay proyectos publicados'}</strong>
          ¿Tienes un render, una tesis o una idea de infraestructura? <a href="publicar.html?tipo=concepto">Publícalo gratis</a> y sé de los primeros.</div>`;
      }
    }
    $('mas').hidden = !hayMas;
    desde += filas.length;
  }

  $('form-conceptos').addEventListener('submit', e => { e.preventDefault(); buscar(); });
  for (const k of ['categoria', 'etapa', 'rol', 'estado']) campos[k].addEventListener('change', () => buscar());
  $('limpiar').addEventListener('click', () => { for (const el of Object.values(campos)) el.value = ''; buscar(); });
  $('mas').addEventListener('click', () => buscar(true));

  DP.cabecera();
  buscar();
})();
