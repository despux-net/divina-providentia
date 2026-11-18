// Publicar o editar en Vivinati Industrial (publicar.html?id=<uuid> para editar).
// La base de datos asigna el dueño y comprueba permisos y límites.
(async () => {
  const $ = id => document.getElementById(id);
  const MAX_FOTOS = 12;
  const editarId = new URLSearchParams(location.search).get('id');
  let fotos = [], fotosOriginales = [];

  IND.opcionesCategorias($('categoria'), 'Elige una categoría');
  DP.opcionesEstados($('estado'), 'Elige un estado');
  $('unidad').innerHTML = Object.entries(IND.UNIDADES).map(([k, n]) => `<option value="${k}">${k === 'unidad' ? 'Unidad / precio total' : n}</option>`).join('');
  const msg = (t, tipo = 'error') => DP.mensaje($('msg'), t, tipo);

  // ---------- Sesión ----------
  const aqui = location.pathname + location.search;
  const { data: { session } } = await DP.sb.auth.getSession();
  DP.cabecera();
  if (!session) {
    $('entrar').hidden = false;
    $('ir-entrar').href = '/entrar.html?next=' + encodeURIComponent(aqui);
    $('ir-registro').href = '/registro.html?next=' + encodeURIComponent(aqui);
    return;
  }
  const usuario = session.user;
  const perfil = await DP.miPerfil();
  if (!perfil || !perfil.usuario) { location.href = '/perfil.html'; return; }
  $('form').hidden = false;
  if (perfil.phone) $('whatsapp').value = perfil.phone;
  if (perfil.estado && DP.ESTADOS[perfil.estado]) $('estado').value = perfil.estado;
  if (perfil.ciudad) $('ciudad').value = perfil.ciudad;

  // ---------- Venta / alquiler / servicio ----------
  const operacion = () => document.querySelector('[name=operacion]:checked').value;
  function segunOperacion() {
    const op = operacion();
    $('bloque-equipo').querySelectorAll('label').forEach(l => { l.hidden = false; });
    if (op === 'servicio') {
      ['condicion', 'marca', 'modelo', 'anio', 'cantidad'].forEach(c => { $(c).closest('label').hidden = true; });
      if ($('categoria').value === '') $('categoria').value = 'servicios';
      if ($('unidad').value === 'unidad') $('unidad').value = 'servicio';
      $('titulo').placeholder = 'Ej.: Mantenimiento de generadores y transferencias';
    } else if (op === 'alquiler') {
      $('campo-cantidad').hidden = true;
      if (['unidad', 'servicio'].includes($('unidad').value)) $('unidad').value = 'dia';
      $('titulo').placeholder = 'Ej.: Alquiler de montacargas Toyota 2.5 t';
    } else {
      if (['dia', 'hora', 'semana', 'mes', 'servicio'].includes($('unidad').value)) $('unidad').value = 'unidad';
      $('titulo').placeholder = 'Ej.: Generador Caterpillar 150 kVA diésel';
    }
  }
  document.querySelectorAll('[name=operacion]').forEach(r => r.addEventListener('change', segunOperacion));

  // ---------- Editar ----------
  if (editarId) {
    const { data: p } = await DP.sb.from('productos').select('*').eq('id', editarId).maybeSingle();
    if (!p || p.user_id !== usuario.id) { msg('No encontramos esa publicación entre las tuyas.'); $('guardar').disabled = true; return; }
    $('h1').textContent = 'Editar publicación';
    $('guardar').textContent = 'Guardar cambios';
    document.querySelector(`[name=operacion][value=${p.operacion}]`).checked = true;
    ['categoria', 'titulo', 'descripcion', 'precio', 'moneda', 'unidad', 'condicion', 'marca', 'modelo', 'anio', 'cantidad', 'referencia', 'estado', 'ciudad', 'whatsapp']
      .forEach(c => { if (p[c] != null) $(c).value = p[c]; });
    $('envios').checked = p.envios;
    fotos = (p.fotos || []).map(ruta => ({ ruta }));
    fotosOriginales = [...(p.fotos || [])];
    pintarFotos();
  }
  segunOperacion();

  // ---------- Fotos (misma optimización que Real Estate) ----------
  const LADO_MAX = 1600, PESO_OBJETIVO = 450 * 1024;
  const aBlob = (c, tipo, calidad) => new Promise(r => c.toBlob(r, tipo, calidad));
  async function reducir(file) {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) throw new Error(`No se pudo leer «${file.name}». ¿Es una foto JPG, PNG o WebP?`);
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    let blob = await aBlob(c, 'image/webp', 0.8);
    if (!blob || blob.type !== 'image/webp') blob = await aBlob(c, 'image/jpeg', 0.82);
    if (blob && blob.size > PESO_OBJETIVO) {
      const otra = await aBlob(c, blob.type, blob.type === 'image/webp' ? 0.72 : 0.75);
      if (otra && otra.size < blob.size) blob = otra;
    }
    if (!blob) throw new Error(`No se pudo preparar «${file.name}».`);
    return blob;
  }
  $('fotos').addEventListener('change', async e => {
    const archivos = [...e.target.files];
    e.target.value = '';
    msg('');
    for (const f of archivos) {
      if (fotos.length >= MAX_FOTOS) { msg(`Máximo ${MAX_FOTOS} fotos.`); break; }
      try { const blob = await reducir(f); fotos.push({ blob, vista: URL.createObjectURL(blob) }); }
      catch (err) { msg(err.message); }
    }
    pintarFotos();
  });
  function pintarFotos() {
    $('fotos-prev').innerHTML = fotos.map((f, n) =>
      `<figure><img src="${DP.esc(f.vista || DP.fotoUrl(f.ruta))}" alt="Foto ${n + 1}">
        <button type="button" data-n="${n}" aria-label="Quitar foto ${n + 1}">×</button></figure>`).join('');
  }
  $('fotos-prev').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const [f] = fotos.splice(Number(b.dataset.n), 1);
    if (f.vista) URL.revokeObjectURL(f.vista);
    pintarFotos();
  });

  // ---------- Guardar ----------
  const texto = id => $(id).value.trim() || null;
  const numero = id => ($(id).value === '' ? null : Number($(id).value));
  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    msg('');
    const op = operacion();
    const titulo = $('titulo').value.trim();
    if (!$('categoria').value) return msg('Elige una categoría.');
    if (titulo.length < 5) return msg('El título debe tener al menos 5 letras.');
    if (!$('estado').value) return msg('Elige el estado donde está.');
    const whatsapp = $('whatsapp').value.trim() ? DP.numeroWa($('whatsapp').value) : null;
    if ($('whatsapp').value.trim() && !whatsapp) return msg('Revisa el número de WhatsApp (ej.: 0414 123 4567).');
    const anio = numero('anio');
    if (anio != null && (anio < 1950 || anio > 2100)) return msg('Revisa el año.');

    const btn = $('guardar'), textoBoton = btn.textContent;
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const rutas = [];
      for (const f of fotos) {
        if (f.ruta) { rutas.push(f.ruta); continue; }
        const webp = f.blob.type === 'image/webp';
        const ruta = `${usuario.id}/${crypto.randomUUID()}.${webp ? 'webp' : 'jpg'}`;
        const { error } = await DP.sb.storage.from('inmuebles').upload(ruta, f.blob, { contentType: webp ? 'image/webp' : 'image/jpeg', cacheControl: '31536000' });
        if (error) throw new Error('No se pudo subir una foto: ' + error.message);
        f.ruta = ruta; rutas.push(ruta);
      }
      const servicio = op === 'servicio';
      const fila = {
        operacion: op, categoria: $('categoria').value, titulo, descripcion: texto('descripcion'),
        precio: numero('precio'), moneda: $('moneda').value, unidad: $('unidad').value || null,
        condicion: servicio ? null : ($('condicion').value || null),
        marca: servicio ? null : texto('marca'), modelo: servicio ? null : texto('modelo'), anio: servicio ? null : anio,
        cantidad: op === 'venta' ? numero('cantidad') : null, referencia: texto('referencia'),
        envios: $('envios').checked, estado: $('estado').value, ciudad: texto('ciudad'), whatsapp, fotos: rutas
      };
      const consulta = editarId
        ? DP.sb.from('productos').update(fila).eq('id', editarId).select('id').single()
        : DP.sb.from('productos').insert(fila).select('id').single();
      const { data, error } = await consulta;
      if (error) {
        const m = error.message || '';
        throw new Error(/máximo de \d+/.test(m) ? m : /productos_referencia_unica|duplicate key/.test(m) ? 'Ya tienes otra publicación con esa referencia interna.'
          : /check constraint/.test(m) ? 'Algún dato no es válido. Revisa el título, los números y el WhatsApp.' : 'No se pudo guardar: ' + m);
      }
      const quitadas = fotosOriginales.filter(r => !rutas.includes(r) && r.startsWith(usuario.id + '/'));
      if (quitadas.length) await DP.sb.storage.from('inmuebles').remove(quitadas);
      location.href = `/industrial/producto.html?id=${encodeURIComponent(data.id)}`;
    } catch (err) {
      console.error(err);
      msg(err.message);
      btn.disabled = false; btn.textContent = textoBoton;
    }
  });
})();
