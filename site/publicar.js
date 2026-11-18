// Publicar o editar un anuncio (publicar.html?id=<uuid> para editar).
// La base de datos asigna el dueño (user_id) y comprueba los permisos;
// aquí solo se recoge y se valida lo que escribe la persona.
(async () => {
  const $ = id => document.getElementById(id);
  const MAX_FOTOS = 12;
  const params = new URLSearchParams(location.search);
  const editarId = params.get('id');
  let modo = ['venta', 'alquiler', 'concepto'].includes(params.get('tipo')) ? params.get('tipo') : null;
  let usuario = null;
  let fotos = [];          // [{ ruta } | { blob, vista }]
  let fotosOriginales = [];
  let editando = false;   // true solo si el anuncio cargado es de esta persona
  let punto = null, marcador = null, mapa = null;

  DP.opciones($('operacion'), { venta: 'Venta', alquiler: 'Alquiler' });
  DP.opciones($('tipo'), DP.TIPOS);
  DP.opciones($('etapa'), DP.ETAPAS);
  DP.opciones($('categoria_proyecto'), DP.CATEGORIAS);
  DP.opciones($('rol_autor'), DP.ROLES);

  // ---------- Modo: venta, alquiler o proyecto conceptual ----------
  // El concepto oculta precio, características y «pega tu anuncio», y
  // muestra los campos de portafolio. La base de datos impide que un
  // concepto lleve precio.
  const MODOS = { venta: 'Vender inmueble', alquiler: 'Alquilar inmueble', concepto: 'Proyecto conceptual' };
  function ponerModo(m) {
    modo = m;
    const c = m === 'concepto';
    $('eleccion').hidden = true;
    $('form-anuncio').hidden = false;
    $('modo-elegido').hidden = editando;
    $('modo-texto').textContent = MODOS[m];
    if (!c) $('operacion').value = m;
    $('campo-operacion').hidden = c;
    $('fila-precio').hidden = c;
    $('bloque-caract').hidden = c;
    $('bloque-proyecto').hidden = !c;
    $('bloque-pegar').hidden = c || editando;
    $('label-tipo').textContent = c ? 'Tipo de edificación que propones' : 'Tipo de inmueble';
    $('legend-fotos').textContent = c ? 'Renders e imágenes' : 'Fotos';
    $('legend-ubicacion').textContent = c ? 'Ubicación del proyecto' : 'Ubicación';
    $('label-whatsapp').innerHTML = c
      ? 'WhatsApp de contacto <small>(para que te escriban y colaborar)</small>'
      : 'WhatsApp <small>(se mostrará en el anuncio)</small>';
    if (!editando) $('h1').textContent = c ? 'Publica tu proyecto conceptual' : 'Publica tu inmueble gratis';
    if (c && !$('tipo').value) $('tipo').value = 'otro';
    if (mapa) setTimeout(() => mapa.invalidateSize(), 0);
  }
  function mostrarEleccion() {
    $('form-anuncio').hidden = true;
    $('eleccion').hidden = false;
    $('h1').textContent = '¿Qué quieres publicar?';
  }
  document.querySelectorAll('.eleccion[data-modo]').forEach(b => b.addEventListener('click', () => {
    ponerModo(b.dataset.modo);
    history.replaceState(null, '', '?tipo=' + b.dataset.modo);
    window.scrollTo(0, 0);
  }));
  $('cambiar-modo').addEventListener('click', () => { history.replaceState(null, '', location.pathname); mostrarEleccion(); });
  DP.opcionesEstados($('estado'), 'Elige un estado');

  const mensaje = (el, texto, tipo) => { $(el).innerHTML = texto ? `<div class="mensaje ${tipo}">${DP.esc(texto)}</div>` : ''; };

  // ---------- Sesión ----------
  // Para publicar hace falta una cuenta activada con @usuario.
  const aqui = 'publicar.html' + location.search;
  const { data: { session } } = await DP.sb.auth.getSession();
  DP.cabecera();
  if (!session) {
    $('entrar').hidden = false;
    $('ir-entrar').href = 'entrar.html?next=' + encodeURIComponent(aqui);
    $('ir-registro').href = 'registro.html?next=' + encodeURIComponent(aqui);
    return;
  }
  usuario = session.user;
  const perfil = await DP.miPerfil();
  if (!perfil || !perfil.usuario) { location.href = 'perfil.html'; return; }
  if (!editarId && perfil.phone) $('whatsapp').value = perfil.phone;
  if (editarId) $('form-anuncio').hidden = false;
  else if (modo) ponerModo(modo);
  else mostrarEleccion();
  await prepararFormulario();

  // ---------- Formulario ----------
  async function prepararFormulario() {
    mapa = L.map('mapa-form').setView(DP.CENTRO_VE, 6);
    DP.capaMapa(mapa);
    mapa.on('click', e => ponerPunto(e.latlng.lat, e.latlng.lng));
    $('quitar-punto').addEventListener('click', () => ponerPunto(null));
    $('estado').addEventListener('change', () => {
      const c = DP.ESTADOS[$('estado').value];
      if (c && !punto) mapa.setView(c, 11);
    });

    if (editarId) await cargarAnuncio();
  }

  function ponerPunto(lat, lng) {
    if (lat == null) {
      punto = null;
      if (marcador) { marcador.remove(); marcador = null; }
    } else {
      // Solo dentro de Venezuela (mismo límite que la base de datos).
      if (lat < 0 || lat > 13 || lng < -74 || lng > -59) return;
      punto = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
      if (marcador) marcador.setLatLng([lat, lng]); else marcador = L.marker([lat, lng]).addTo(mapa);
    }
    $('quitar-punto').hidden = !punto;
  }

  async function cargarAnuncio() {
    const { data: i, error } = await DP.sb.from('inmuebles').select('*').eq('id', editarId).maybeSingle();
    if (error || !i || i.user_id !== usuario.id) {
      mensaje('msg-form', 'No encontramos ese anuncio entre los tuyos. Puedes publicar uno nuevo.', 'error');
      history.replaceState(null, '', location.pathname);
      return;
    }
    editando = true;
    $('bloque-pegar').hidden = true;
    $('h1').textContent = 'Editar anuncio';
    $('btn-guardar').textContent = 'Guardar cambios';
    for (const k of ['tipo', 'titulo', 'precio', 'moneda', 'descripcion', 'habitaciones', 'banos', 'estacionamientos', 'metros', 'estado', 'ciudad', 'zona',
      'etapa', 'categoria_proyecto', 'rol_autor', 'institucion', 'url_3d']) {
      if (i[k] != null) $(k).value = i[k];
    }
    if (Array.isArray(i.herramientas)) $('herramientas').value = i.herramientas.join(', ');
    ponerModo(i.operacion);
    if (i.operacion === 'concepto') $('h1').textContent = 'Editar proyecto conceptual';
    if (i.whatsapp) $('whatsapp').value = '+' + i.whatsapp;
    fotos = (i.fotos || []).map(ruta => ({ ruta }));
    fotosOriginales = [...(i.fotos || [])];
    pintarFotos();
    if (i.lat != null) { ponerPunto(i.lat, i.lng); mapa.setView([i.lat, i.lng], 15); }
    else if (DP.ESTADOS[i.estado]) mapa.setView(DP.ESTADOS[i.estado], 11);
  }

  // ---------- Fotos: se optimizan en el teléfono/PC ANTES de subirlas ----------
  // Nunca se sube el original. Cada foto se reduce a 1600 px en su lado
  // largo (lo máximo que muestra la ficha, incluso en pantallas retina) y se
  // guarda en WebP (≈30 % menos que JPEG con la misma calidad visual). Si el
  // navegador no sabe crear WebP, se usa JPEG. Así una foto de móvil de
  // 4–10 MB queda en ~150–400 KB sin diferencia a la vista. De paso se
  // eliminan los datos ocultos de la foto (GPS, modelo del teléfono…).
  const LADO_MAX = 1600;
  const PESO_OBJETIVO = 450 * 1024;   // si una foto muy detallada pasa de esto, se aprieta un poco más
  const kb = n => n >= 1048576 ? `${(n / 1048576).toLocaleString('es-VE', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  const aBlob = (c, tipo, calidad) => new Promise(r => c.toBlob(r, tipo, calidad));

  async function reducir(file) {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) throw new Error(`No se pudo leer «${file.name}». ¿Es una foto JPG, PNG o WebP?`);
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';                       // fondo blanco para PNG con transparencia
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';           // reducción nítida, sin dientes de sierra
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();

    let blob = await aBlob(c, 'image/webp', 0.8);
    if (!blob || blob.type !== 'image/webp') blob = await aBlob(c, 'image/jpeg', 0.82);  // navegadores sin WebP
    if (blob.size > PESO_OBJETIVO) {
      const otra = await aBlob(c, blob.type, blob.type === 'image/webp' ? 0.72 : 0.75);
      if (otra && otra.size < blob.size) blob = otra;
    }
    if (!blob) throw new Error(`No se pudo preparar «${file.name}».`);
    return blob;
  }

  $('fotos').addEventListener('change', async e => {
    const archivos = [...e.target.files];
    e.target.value = '';
    mensaje('msg-form', '');
    let antes = 0, despues = 0;
    for (const f of archivos) {
      if (fotos.length >= MAX_FOTOS) { mensaje('msg-form', `Máximo ${MAX_FOTOS} fotos.`, 'error'); break; }
      try {
        const blob = await reducir(f);
        antes += f.size; despues += blob.size;
        fotos.push({ blob, vista: URL.createObjectURL(blob) });
      } catch (err) { mensaje('msg-form', err.message, 'error'); }
    }
    pintarFotos();
    if (despues && antes > despues) {
      $('fotos-ahorro').textContent = `Fotos optimizadas: ${kb(antes)} → ${kb(despues)} (${Math.round((1 - despues / antes) * 100)} % menos), misma calidad a la vista.`;
      $('fotos-ahorro').hidden = false;
    }
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
  // Acepta 0414-123.45.67, +58 414 1234567, 584141234567…
  function normalizarWhatsapp(v) {
    let d = v.replace(/\D/g, '');
    if (/^0\d{10}$/.test(d)) d = '58' + d.slice(1);
    else if (/^4\d{9}$/.test(d) || /^2\d{9}$/.test(d)) d = '58' + d;
    return /^\d{10,15}$/.test(d) ? d : null;
  }

  const numero = id => ($(id).value === '' ? null : Number($(id).value));
  const texto = id => $(id).value.trim() || null;

  $('form-anuncio').addEventListener('submit', async e => {
    e.preventDefault();
    mensaje('msg-form', '');
    const titulo = $('titulo').value.trim();
    const whatsapp = normalizarWhatsapp($('whatsapp').value);
    if (titulo.length < 5) return mensaje('msg-form', 'El título debe tener al menos 5 letras.', 'error');
    const concepto = modo === 'concepto';
    if (!$('estado').value) return mensaje('msg-form', concepto ? 'Elige el estado donde se ubicaría el proyecto.' : 'Elige el estado donde está el inmueble.', 'error');
    let url3d = null;
    if (concepto) {
      if (!$('etapa').value || !$('categoria_proyecto').value || !$('rol_autor').value)
        return mensaje('msg-form', 'Elige la etapa, la categoría y tu perfil (estudiante, arquitecto…).', 'error');
      if ($('url_3d').value.trim()) {
        url3d = DP.urlSegura($('url_3d').value.trim());
        if (!url3d || !url3d.startsWith('https://')) return mensaje('msg-form', 'El enlace al modelo 3D debe empezar por https://', 'error');
      }
    }
    if (!whatsapp) return mensaje('msg-form', 'Revisa el número de WhatsApp (ej.: 0414 123 4567).', 'error');

    const btn = $('btn-guardar');
    btn.disabled = true;
    const textoBoton = btn.textContent;
    btn.textContent = 'Guardando…';

    try {
      // 1) Subir las fotos nuevas
      const rutas = [];
      for (const f of fotos) {
        if (f.ruta) { rutas.push(f.ruta); continue; }
        const webp = f.blob.type === 'image/webp';
        const ruta = `${usuario.id}/${crypto.randomUUID()}.${webp ? 'webp' : 'jpg'}`;
        const { error } = await DP.sb.storage.from('inmuebles').upload(ruta, f.blob, { contentType: webp ? 'image/webp' : 'image/jpeg', cacheControl: '31536000' });
        if (error) throw new Error('No se pudo subir una foto: ' + error.message);
        f.ruta = ruta; rutas.push(ruta);
      }

      // 2) Guardar el anuncio
      const herramientas = [...new Set($('herramientas').value.split(',').map(h => h.trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
      const fila = {
        operacion: concepto ? 'concepto' : $('operacion').value, tipo: $('tipo').value, titulo,
        precio: concepto ? null : numero('precio'), moneda: $('moneda').value, descripcion: texto('descripcion'),
        habitaciones: concepto ? null : numero('habitaciones'), banos: concepto ? null : numero('banos'),
        estacionamientos: concepto ? null : numero('estacionamientos'), metros: concepto ? null : numero('metros'),
        estado: $('estado').value, ciudad: texto('ciudad'), zona: texto('zona'),
        lat: punto ? punto.lat : null, lng: punto ? punto.lng : null,
        whatsapp, fotos: rutas,
        // Campos de portafolio: solo en conceptos (la base de datos lo exige).
        etapa: concepto ? $('etapa').value : null,
        categoria_proyecto: concepto ? $('categoria_proyecto').value : null,
        rol_autor: concepto ? $('rol_autor').value : null,
        institucion: concepto ? texto('institucion') : null,
        url_3d: concepto ? url3d : null,
        herramientas: concepto && herramientas.length ? herramientas : null
      };
      const consulta = editando
        ? DP.sb.from('inmuebles').update(fila).eq('id', editarId).select('id').single()
        : DP.sb.from('inmuebles').insert(fila).select('id').single();
      const { data, error } = await consulta;
      if (error) throw new Error(traducirError(error));

      // 3) Borrar del almacenamiento las fotos que se quitaron
      const quitadas = fotosOriginales.filter(r => !rutas.includes(r) && r.startsWith(usuario.id + '/'));
      if (quitadas.length) await DP.sb.storage.from('inmuebles').remove(quitadas);

      location.href = `anuncio.html?id=${encodeURIComponent(data.id)}`;
    } catch (err) {
      console.error(err);
      mensaje('msg-form', err.message, 'error');
      btn.disabled = false;
      btn.textContent = textoBoton;
    }
  });

  function traducirError(error) {
    const m = error.message || '';
    if (/máximo de \d+/.test(m)) return m;
    if (/check constraint/.test(m)) return 'Algún dato no es válido. Revisa el título, los números, los enlaces y el WhatsApp.';
    return 'No se pudo guardar el anuncio: ' + m;
  }

  // ---------- «Pega tu anuncio» (texto de Facebook, Instagram o WhatsApp) ----------
  $('btn-pegar').addEventListener('click', () => {
    const texto = $('texto-pegado').value.trim();
    if (texto.length < 15) return mensaje('msg-pegar', 'Pega primero el texto de tu anuncio.', 'error');
    const r = window.DP_PEGAR.leer(texto);
    const NOMBRES = {
      operacion: 'operación', tipo: 'tipo', titulo: 'título', precio: 'precio', moneda: 'moneda',
      habitaciones: 'habitaciones', banos: 'baños', estacionamientos: 'estacionamientos',
      metros: 'metros', estado: 'estado', ciudad: 'ciudad', whatsapp: 'WhatsApp', descripcion: 'descripción'
    };
    // Títulos en MAYÚSCULAS (muy comunes en redes) se pasan a frase normal.
    if (r.titulo && r.titulo === r.titulo.toUpperCase()) {
      const conMayuscula = s => s.replace(/(^|[\s(])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase())
        .replace(/ (De|Del|Y)(?= )/g, m => m.toLowerCase());
      r.titulo = r.titulo.toLowerCase().replace(/^./, c => c.toUpperCase())
        // Los lugares (tras «en», «urb.», «sector»…) vuelven a llevar mayúscula: «en Cabudare, Urb. La Mata».
        .replace(/\b(en|urb\.?|urbanización|sector|zona|calle|av\.?|avenida)\s+(?!venta\b|alquiler\b)([^,.\n]+)/g,
          (m, k, lugar) => `${k} ${conMayuscula(lugar)}`)
        // «APTO EN VENTA - EL CAFETAL»: lo que va tras el guion suele ser el lugar.
        .replace(/ - ([^,\n]+)/g, (m, lugar) => ` - ${conMayuscula(lugar)}`)
        .replace(/\b(urb|av)\b\.?/g, m => m[0].toUpperCase() + m.slice(1));
    }
    const puestos = [];
    for (const [k, nombre] of Object.entries(NOMBRES)) {
      if (r[k] == null || r[k] === '') continue;
      const el = $(k);
      if (!el) continue;
      if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === String(r[k]))) continue;
      el.value = r[k];
      puestos.push(nombre);
    }
    if (r.estado) $('estado').dispatchEvent(new Event('change')); // centra el mapa en el estado
    if (!puestos.length) return mensaje('msg-pegar', 'No encontramos datos en el texto. Rellena el formulario a mano.', 'error');
    const faltan = ['operacion', 'tipo', 'precio', 'estado', 'whatsapp'].filter(k => r[k] == null).map(k => NOMBRES[k]);
    mensaje('msg-pegar', `Listo: rellenamos ${puestos.join(', ')}.` +
      (faltan.length ? ` Completa tú: ${faltan.join(', ')}.` : '') +
      ' Revisa todo, marca el punto en el mapa y añade las fotos.', 'ok');
  });
})();
