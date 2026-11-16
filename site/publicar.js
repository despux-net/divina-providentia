// Publicar o editar un anuncio (publicar.html?id=<uuid> para editar).
// La base de datos asigna el dueño (user_id) y comprueba los permisos;
// aquí solo se recoge y se valida lo que escribe la persona.
(async () => {
  const $ = id => document.getElementById(id);
  const MAX_FOTOS = 12;
  const editarId = new URLSearchParams(location.search).get('id');
  let usuario = null;
  let fotos = [];          // [{ ruta } | { blob, vista }]
  let fotosOriginales = [];
  let editando = false;   // true solo si el anuncio cargado es de esta persona
  let punto = null, marcador = null, mapa = null;

  DP.opciones($('operacion'), { venta: 'Venta', alquiler: 'Alquiler' });
  DP.opciones($('tipo'), DP.TIPOS);
  DP.opcionesEstados($('estado'), 'Elige un estado');

  const mensaje = (el, texto, tipo) => { $(el).innerHTML = texto ? `<div class="mensaje ${tipo}">${DP.esc(texto)}</div>` : ''; };

  // ---------- Sesión ----------
  async function arrancar(session) {
    DP.cabecera();
    usuario = session ? session.user : null;
    $('entrar').hidden = !!usuario;
    $('form-anuncio').hidden = !usuario;
    if (usuario && !mapa) await prepararFormulario();
  }

  $('form-entrar').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('email').value.trim();
    $('btn-entrar').disabled = true;
    const { error } = await DP.sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.origin + location.pathname + location.search }
    });
    $('btn-entrar').disabled = false;
    if (error) mensaje('msg-entrar', 'No se pudo enviar el enlace: ' + error.message, 'error');
    else mensaje('msg-entrar', `Listo. Revisa tu correo (${email}) y abre el enlace. Si no lo ves, mira en «spam».`, 'ok');
  });

  DP.sb.auth.onAuthStateChange((evento, session) => {
    if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') arrancar(session);
  });
  const { data: { session } } = await DP.sb.auth.getSession();
  await arrancar(session);

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
    $('h1').textContent = 'Editar anuncio';
    $('btn-guardar').textContent = 'Guardar cambios';
    for (const k of ['operacion', 'tipo', 'titulo', 'precio', 'moneda', 'descripcion', 'habitaciones', 'banos', 'estacionamientos', 'metros', 'estado', 'ciudad', 'zona']) {
      if (i[k] != null) $(k).value = i[k];
    }
    if (i.whatsapp) $('whatsapp').value = '+' + i.whatsapp;
    fotos = (i.fotos || []).map(ruta => ({ ruta }));
    fotosOriginales = [...(i.fotos || [])];
    pintarFotos();
    if (i.lat != null) { ponerPunto(i.lat, i.lng); mapa.setView([i.lat, i.lng], 15); }
    else if (DP.ESTADOS[i.estado]) mapa.setView(DP.ESTADOS[i.estado], 11);
  }

  // ---------- Fotos ----------
  // Reduce cada foto a 1600 px como máximo y la pasa a JPEG: los móviles
  // hacen fotos de 5–10 MB que en Venezuela tardarían mucho en cargar.
  async function reducir(file) {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) throw new Error(`No se pudo leer «${file.name}». ¿Es una foto JPG, PNG o WebP?`);
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
  }

  $('fotos').addEventListener('change', async e => {
    const archivos = [...e.target.files];
    e.target.value = '';
    mensaje('msg-form', '');
    for (const f of archivos) {
      if (fotos.length >= MAX_FOTOS) { mensaje('msg-form', `Máximo ${MAX_FOTOS} fotos.`, 'error'); break; }
      try {
        const blob = await reducir(f);
        fotos.push({ blob, vista: URL.createObjectURL(blob) });
      } catch (err) { mensaje('msg-form', err.message, 'error'); }
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
    if (!$('estado').value) return mensaje('msg-form', 'Elige el estado donde está el inmueble.', 'error');
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
        const ruta = `${usuario.id}/${crypto.randomUUID()}.jpg`;
        const { error } = await DP.sb.storage.from('inmuebles').upload(ruta, f.blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
        if (error) throw new Error('No se pudo subir una foto: ' + error.message);
        f.ruta = ruta; rutas.push(ruta);
      }

      // 2) Guardar el anuncio
      const fila = {
        operacion: $('operacion').value, tipo: $('tipo').value, titulo,
        precio: numero('precio'), moneda: $('moneda').value, descripcion: texto('descripcion'),
        habitaciones: numero('habitaciones'), banos: numero('banos'),
        estacionamientos: numero('estacionamientos'), metros: numero('metros'),
        estado: $('estado').value, ciudad: texto('ciudad'), zona: texto('zona'),
        lat: punto ? punto.lat : null, lng: punto ? punto.lng : null,
        whatsapp, fotos: rutas
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
    if (/máximo de 30/.test(m)) return m;
    if (/check constraint/.test(m)) return 'Algún dato no es válido. Revisa el título, los números y el WhatsApp.';
    return 'No se pudo guardar el anuncio: ' + m;
  }
})();
