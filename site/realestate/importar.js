// Carga masiva de anuncios desde Excel o CSV (/realestate/importar.html).
// Todo se lee y se valida en el navegador; la base de datos vuelve a
// comprobar permisos, límites y formatos al guardar. Cada fila lleva una
// «referencia» propia del anunciante: si ya existe un anuncio suyo con esa
// referencia se actualiza, si no se crea.
(async () => {
  const $ = id => document.getElementById(id);
  const MAX_FILAS = 300, MAX_FOTOS = 12;

  // ---------- Sesión ----------
  const { data: { session } } = await DP.sb.auth.getSession();
  DP.cabecera();
  if (!session) {
    $('entrar').hidden = false;
    $('ir-entrar').href = '/entrar.html?next=/realestate/importar.html';
    $('ir-registro').href = '/registro.html?next=/realestate/importar.html';
    return;
  }
  const usuario = session.user;
  const perfil = await DP.miPerfil();
  if (!perfil || !perfil.usuario) { location.href = '/perfil.html'; return; }
  $('zona-carga').hidden = false;

  const { data: limiteRpc } = await DP.sb.rpc('limite_anuncios', { p_user: usuario.id });
  const limite = limiteRpc || 30;
  let existentes = new Map();   // referencia en minúsculas → { id, fotos, activo }
  let activos = 0;
  async function cargarExistentes() {
    const { data, error } = await DP.sb.from('inmuebles').select('id, referencia, fotos, activo').eq('user_id', usuario.id);
    if (error) throw error;
    existentes = new Map(data.filter(i => i.referencia).map(i => [i.referencia.toLowerCase(), i]));
    activos = data.filter(i => i.activo).length;
  }
  await cargarExistentes();
  $('limite-texto').textContent = limite > 30
    ? `Tu cuenta puede tener hasta ${limite} anuncios activos. Ahora tienes ${activos}.`
    : `Las cuentas particulares pueden tener hasta 30 anuncios activos (ahora tienes ${activos}). Si eres agente, inmobiliaria o constructora, indícalo en tu perfil y el límite sube a 300.`;

  // ---------- Normalización ----------
  const llano = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const clave = s => llano(s).replace(/[^a-z0-9]/g, '');

  const COLUMNAS = {
    referencia: ['referencia', 'ref', 'codigo', 'cod', 'id', 'idinmueble'],
    operacion: ['operacion', 'negocio', 'tipooperacion', 'tiponegocio'],
    tipo: ['tipo', 'tipoinmueble', 'tipodeinmueble', 'inmueble', 'categoria'],
    titulo: ['titulo', 'nombre', 'encabezado'],
    descripcion: ['descripcion', 'detalle', 'detalles', 'texto'],
    precio: ['precio', 'valor', 'monto', 'canon'],
    moneda: ['moneda', 'divisa'],
    estado: ['estado', 'entidad', 'region'],
    ciudad: ['ciudad', 'municipio', 'localidad'],
    zona: ['zona', 'urbanizacion', 'sector', 'barrio', 'direccion'],
    habitaciones: ['habitaciones', 'hab', 'habs', 'cuartos', 'dormitorios', 'alcobas'],
    banos: ['banos', 'bano'],
    estacionamientos: ['estacionamientos', 'estacionamiento', 'puestos', 'puestosestacionamiento', 'parqueos', 'garajes'],
    metros: ['metros', 'm2', 'mts', 'mts2', 'area', 'superficie', 'metroscuadrados'],
    whatsapp: ['whatsapp', 'telefono', 'celular', 'tlf', 'contacto'],
    lat: ['latitud', 'lat'],
    lng: ['longitud', 'lng', 'lon', 'long'],
    fotos: ['fotos', 'foto', 'imagenes', 'imagen', 'urlfotos']
  };
  const ALIAS_COL = {};
  for (const [campo, nombres] of Object.entries(COLUMNAS)) nombres.forEach(n => { ALIAS_COL[n] = campo; });

  const ALIAS_TIPO = {
    apartamento: 'apartamento', apto: 'apartamento', apartamentos: 'apartamento', departamento: 'apartamento', penthouse: 'apartamento', ph: 'apartamento',
    casa: 'casa', quinta: 'casa', casas: 'casa', chalet: 'casa',
    anexo: 'anexo', estudio: 'anexo',
    habitacion: 'habitacion', cuarto: 'habitacion',
    townhouse: 'townhouse', th: 'townhouse',
    local: 'local', localcomercial: 'local', comercio: 'local',
    oficina: 'oficina', consultorio: 'oficina',
    terreno: 'terreno', parcela: 'terreno', lote: 'terreno', finca: 'terreno', hacienda: 'terreno',
    galpon: 'galpon', deposito: 'galpon', almacen: 'galpon', nave: 'galpon',
    otro: 'otro', edificio: 'otro'
  };
  function tipoDe(v) {
    const k = clave(v);
    return ALIAS_TIPO[k] || Object.entries(ALIAS_TIPO).find(([a]) => a.length > 3 && k.startsWith(a))?.[1] || null;
  }
  function operacionDe(v) {
    const k = clave(v);
    if (/^(venta|vende|vendo|vender|sevende|compra|sale)/.test(k)) return 'venta';
    if (/^(alquiler|alquila|alquilo|alquilar|sealquila|renta|arriendo|arrendamiento|rent)/.test(k)) return 'alquiler';
    return null;
  }
  const ESTADOS_LLANO = Object.fromEntries(Object.keys(DP.ESTADOS).map(e => [clave(e), e]));
  Object.assign(ESTADOS_LLANO, {
    caracas: 'Distrito Capital', dttocapital: 'Distrito Capital', dtocapital: 'Distrito Capital', df: 'Distrito Capital', distritofederal: 'Distrito Capital',
    vargas: 'La Guaira', margarita: 'Nueva Esparta', islademargarita: 'Nueva Esparta'
  });
  const estadoDe = v => ESTADOS_LLANO[clave(String(v ?? '').replace(/^\s*(estado|edo\.?)\s+/i, ''))] || null;

  // «120.000», «1.250,50», «1,250.50», «$ 85000», «Bs. 3.500.000»
  function numeroDe(v) {
    if (v === '' || v == null) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    let s = String(v).replace(/[^\d.,-]/g, '');
    if (!/\d/.test(s)) return NaN;
    const p = s.lastIndexOf('.'), c = s.lastIndexOf(',');
    if (p >= 0 && c >= 0) {
      const dec = p > c ? '.' : ',';
      s = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
    } else {
      const sep = p >= 0 ? '.' : c >= 0 ? ',' : null;
      if (sep) {
        const partes = s.split(sep);
        s = partes.length > 2 || partes[partes.length - 1].length === 3 ? partes.join('') : partes.join('.');
      }
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  const recortar = (v, max) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t ? t.slice(0, max) : null; };

  // ---------- Plantilla ----------
  const CABECERA = ['referencia', 'operacion', 'tipo', 'titulo', 'descripcion', 'precio', 'moneda', 'estado', 'ciudad', 'zona',
    'habitaciones', 'banos', 'estacionamientos', 'metros', 'whatsapp', 'latitud', 'longitud', 'fotos'];
  $('btn-plantilla').addEventListener('click', () => {
    const ejemplo = [
      CABECERA,
      ['EJEMPLO-1', 'venta', 'apartamento', 'Apartamento de 3 habitaciones en Los Palos Grandes', 'Piso alto, vista al Ávila, cocina remodelada, pozo de agua y planta eléctrica.', 120000, 'USD', 'Miranda', 'Chacao', 'Los Palos Grandes', 3, 2, 2, 110, perfil.phone || '04141234567', '', '', ''],
      ['EJEMPLO-2', 'alquiler', 'local', 'Local comercial en el centro de Valencia', 'Planta baja, 2 baños, santamaría eléctrica.', 650, 'USD', 'Carabobo', 'Valencia', 'Centro', '', 2, '', 80, '', '', '', 'https://tuweb.com/fotos/local1.jpg https://tuweb.com/fotos/local2.jpg']
    ];
    const hoja = XLSX.utils.aoa_to_sheet(ejemplo);
    hoja['!cols'] = [12, 10, 13, 45, 50, 10, 8, 14, 14, 18, 12, 7, 15, 8, 14, 10, 10, 40].map(wch => ({ wch }));
    const instrucciones = XLSX.utils.aoa_to_sheet([
      ['Columna', 'Obligatoria', 'Qué poner'],
      ['referencia', 'Sí', 'Tu código interno del inmueble (máx. 40 caracteres), distinto en cada fila. Si vuelves a subir el archivo, el anuncio con esa referencia se actualiza.'],
      ['operacion', 'Sí', 'venta o alquiler'],
      ['tipo', 'Sí', 'apartamento, casa, anexo, habitacion, townhouse, local, oficina, terreno, galpon u otro'],
      ['titulo', 'Sí', 'Entre 5 y 120 caracteres'],
      ['descripcion', 'No', 'Hasta 5000 caracteres. No pongas teléfonos aquí: usa la columna whatsapp'],
      ['precio', 'No', 'Solo el número (120000). Vacío = «Precio a consultar». En alquiler, el precio mensual'],
      ['moneda', 'No', 'USD o Bs. Si se deja vacío: USD'],
      ['estado', 'Sí', 'Estado de Venezuela: Miranda, Distrito Capital (o Caracas), Zulia, Carabobo…'],
      ['ciudad', 'No', 'Ciudad o municipio'],
      ['zona', 'No', 'Urbanización o sector'],
      ['habitaciones, banos, estacionamientos', 'No', 'Números enteros'],
      ['metros', 'No', 'Metros cuadrados'],
      ['whatsapp', 'No', 'Si se deja vacío se usa el teléfono de tu perfil. Ej.: 04141234567'],
      ['latitud, longitud', 'No', 'Para el mapa. Ej.: 10.4961 y -66.8473 (en Google Maps: clic derecho sobre el punto)'],
      ['fotos', 'No', 'Enlaces https:// a las fotos, separados por espacios o comas (máx. 12). También puedes subir las fotos desde tu ordenador nombradas con la referencia: APT-001.jpg, APT-001-2.jpg…'],
      [],
      ['Las filas cuya referencia empieza por EJEMPLO se ignoran: bórralas o reemplázalas por tus inmuebles.']
    ]);
    instrucciones['!cols'] = [{ wch: 36 }, { wch: 12 }, { wch: 110 }];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Anuncios');
    XLSX.utils.book_append_sheet(libro, instrucciones, 'Instrucciones');
    XLSX.writeFile(libro, 'plantilla-vivinati.xlsx');
  });

  // ---------- Fotos locales (por nombre de archivo) ----------
  let fotosLocales = [];   // [{ file, base }]
  $('fotos').addEventListener('change', e => {
    fotosLocales = [...e.target.files].map(file => ({ file, base: llano(file.name.replace(/\.[^.]+$/, '')) }));
    $('fotos-texto').textContent = fotosLocales.length ? `${fotosLocales.length} fotos seleccionadas.` : '';
    if (filas.length) revisar();
  });
  function fotosDeReferencia(ref) {
    const r = llano(ref);
    return fotosLocales
      .map(f => {
        if (f.base === r) return { f, n: 0 };
        const m = f.base.startsWith(r) && f.base.slice(r.length).match(/^[\s_\-.(]+(\d+)\)?$/);
        return m ? { f, n: Number(m[1]) } : null;
      })
      .filter(Boolean).sort((a, b) => a.n - b.n).map(x => x.f.file);
  }

  // ---------- Leer el archivo ----------
  let filas = [];   // filas del archivo ya mapeadas a campos
  let presentes = new Set();   // columnas que trae el archivo
  $('archivo').addEventListener('change', async e => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    DP.mensaje($('msg'), '');
    try {
      const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: false });
      const nombre = libro.SheetNames.find(n => clave(n) === 'anuncios') || libro.SheetNames[0];
      const datos = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, defval: '', raw: true, blankrows: false });
      const iCab = datos.findIndex(f => f.some(c => ALIAS_COL[clave(c)] === 'titulo'));
      if (iCab < 0) throw new Error('No encontramos la fila de encabezados. La primera fila debe tener los nombres de las columnas (referencia, operacion, tipo, titulo…). Descarga la plantilla para verla.');
      const mapa = datos[iCab].map(c => ALIAS_COL[clave(c)] || null);
      presentes = new Set(mapa.filter(Boolean));
      if (presentes.has('precio')) presentes.add('moneda');
      filas = datos.slice(iCab + 1)
        .map((f, n) => {
          const o = { linea: iCab + n + 2 };
          mapa.forEach((campo, i) => { if (campo && o[campo] === undefined) o[campo] = f[i]; });
          return o;
        })
        .filter(o => Object.keys(o).some(k => k !== 'linea' && String(o[k] ?? '').trim() !== ''))
        .filter(o => !/^ejemplo/i.test(String(o.referencia ?? '').trim()));
      if (!filas.length) throw new Error('El archivo no tiene filas con inmuebles (las filas EJEMPLO se ignoran).');
      if (filas.length > MAX_FILAS) throw new Error(`El archivo tiene ${filas.length} filas. Divide el archivo en partes de ${MAX_FILAS} como máximo.`);
      revisar();
    } catch (err) {
      console.error(err);
      filas = [];
      $('revision').hidden = false;
      $('filas').innerHTML = '';
      $('resumen').textContent = '';
      $('btn-publicar').disabled = true;
      DP.mensaje($('msg'), err.message || 'No se pudo leer el archivo.');
    }
  });

  // ---------- Validar ----------
  let plan = [];
  function validar(o, vistas) {
    const errores = [];
    const ref = recortar(o.referencia, 40);
    if (!ref) errores.push('falta la referencia');
    else if (vistas.has(ref.toLowerCase())) errores.push('referencia repetida en el archivo');
    else vistas.add(ref.toLowerCase());

    const operacion = operacionDe(o.operacion);
    if (!operacion) errores.push('operación: pon venta o alquiler');
    const tipo = tipoDe(o.tipo);
    if (!tipo) errores.push('tipo de inmueble no reconocido');
    let titulo = recortar(o.titulo, 120);
    if (!titulo || titulo.length < 5) errores.push('título demasiado corto');
    const estado = estadoDe(o.estado);
    if (!estado) errores.push('estado de Venezuela no reconocido');

    let precio = numeroDe(o.precio);
    if (Number.isNaN(precio) || precio < 0) { errores.push('precio no válido'); precio = null; }
    const textoMoneda = clave(o.moneda) + (typeof o.precio === 'string' ? clave(o.precio) : '');
    const moneda = /bs|bolivar|ves/.test(textoMoneda) ? 'VES' : 'USD';

    const entero = (campo, nombre) => {
      const n = numeroDe(o[campo]);
      if (n == null) return null;
      if (Number.isNaN(n) || n < 0 || n > 99) { errores.push(`${nombre} no válido`); return null; }
      return Math.round(n);
    };
    const habitaciones = entero('habitaciones', 'habitaciones');
    const banos = entero('banos', 'baños');
    const estacionamientos = entero('estacionamientos', 'estacionamientos');
    let metros = numeroDe(o.metros);
    if (Number.isNaN(metros) || metros === 0) metros = null;
    else if (metros != null && metros < 0) { errores.push('metros no válidos'); metros = null; }

    let lat = numeroDe(o.lat), lng = numeroDe(o.lng);
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) { lat = null; lng = null; }
    else if (lat < 0 || lat > 13 || lng < -74 || lng > -59) { errores.push('coordenadas fuera de Venezuela'); lat = null; lng = null; }

    const whatsapp = DP.numeroWa(o.whatsapp) || DP.numeroWa(perfil.phone);
    if (!whatsapp) errores.push('falta el WhatsApp (ponlo en la fila o en tu perfil)');

    const urls = String(o.fotos ?? '').split(/[\s,;|]+/).filter(Boolean);
    const urlsBuenas = urls.map(u => DP.urlSegura(u)).filter(u => u && u.startsWith('https://'));
    if (urlsBuenas.length < urls.length) errores.push('algún enlace de foto no empieza por https://');
    const locales = ref ? fotosDeReferencia(ref) : [];
    const totalFotos = Math.min(MAX_FOTOS, locales.length + urlsBuenas.length);

    const previo = ref ? existentes.get(ref.toLowerCase()) : null;
    let descripcion = String(o.descripcion ?? '').trim().slice(0, 5000) || null;

    return {
      linea: o.linea, ref, errores, previo, locales, urls: urlsBuenas, totalFotos,
      fila: {
        referencia: ref, operacion, tipo, titulo, descripcion, precio, moneda, estado,
        ciudad: recortar(o.ciudad, 60), zona: recortar(o.zona, 80),
        habitaciones, banos, estacionamientos, metros, lat, lng, whatsapp
      }
    };
  }

  function revisar() {
    const vistas = new Set();
    plan = filas.map(o => validar(o, vistas));
    // Límite de anuncios activos: solo cuentan los nuevos
    let libres = Math.max(0, limite - activos);
    for (const p of plan) {
      if (p.errores.length || p.previo) continue;
      if (libres > 0) libres--; else p.errores.push(`superas tu límite de ${limite} anuncios activos`);
    }
    pintar();
  }

  const precioTxt = f => f.precio == null ? 'A consultar' : DP.precio({ precio: f.precio, moneda: f.moneda, operacion: f.operacion });
  function pintar() {
    $('revision').hidden = false;
    const nuevos = plan.filter(p => !p.errores.length && !p.previo).length;
    const actualizar = plan.filter(p => !p.errores.length && p.previo).length;
    const malos = plan.filter(p => p.errores.length).length;
    $('resumen').innerHTML = `<b>${plan.length}</b> filas: <b>${nuevos}</b> nuevas, <b>${actualizar}</b> para actualizar` +
      (malos ? `, <span class="texto-error"><b>${malos}</b> con errores</span> (no se publicarán: corrígelas en el archivo y vuelve a subirlo)` : '') + '.';
    $('filas').innerHTML = plan.map(p => {
      const f = p.fila;
      const estadoFila = p.errores.length
        ? `<span class="texto-error">${DP.esc(p.errores.join('; '))}</span>`
        : p.hecho ? `<span class="texto-ok">${DP.esc(p.hecho)}</span>`
        : p.previo ? 'Actualizar' : 'Nuevo';
      return `<tr${p.errores.length ? ' class="con-error"' : ''}>
        <td>${p.linea}</td><td>${DP.esc(p.ref || '')}</td>
        <td>${DP.esc(f.titulo || '')}<br><small>${DP.esc([DP.TIPOS[f.tipo], f.operacion, f.zona, f.ciudad, f.estado].filter(Boolean).join(' · '))}</small></td>
        <td>${DP.esc(f.operacion ? precioTxt(f) : '')}</td>
        <td>${p.totalFotos || (p.previo ? 'las de antes' : '0')}</td>
        <td>${estadoFila}</td></tr>`;
    }).join('');
    const btn = $('btn-publicar');
    btn.disabled = !(nuevos + actualizar);
    btn.textContent = nuevos && actualizar ? `Publicar ${nuevos} y actualizar ${actualizar}`
      : actualizar ? `Actualizar ${actualizar}` : `Publicar ${nuevos}`;
  }

  // ---------- Fotos: misma optimización que en publicar.js ----------
  const LADO_MAX = 1600, PESO_OBJETIVO = 450 * 1024;
  const aBlob = (c, tipo, calidad) => new Promise(r => c.toBlob(r, tipo, calidad));
  async function reducir(file) {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) throw new Error(`No se pudo leer la foto «${file.name}».`);
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
    if (!blob) throw new Error(`No se pudo preparar la foto «${file.name}».`);
    return blob;
  }
  async function subirFotos(archivos) {
    const rutas = [];
    for (const file of archivos) {
      const blob = await reducir(file);
      const webp = blob.type === 'image/webp';
      const ruta = `${usuario.id}/${crypto.randomUUID()}.${webp ? 'webp' : 'jpg'}`;
      const { error } = await DP.sb.storage.from('inmuebles').upload(ruta, blob, { contentType: webp ? 'image/webp' : 'image/jpeg', cacheControl: '31536000' });
      if (error) throw new Error('No se pudo subir una foto: ' + error.message);
      rutas.push(ruta);
    }
    return rutas;
  }

  function traducirError(error) {
    const m = error.message || '';
    if (/máximo de \d+/.test(m)) return m;
    if (/inmuebles_referencia_unica|duplicate key/.test(m)) return 'ya tienes un anuncio con esa referencia';
    if (/check constraint/.test(m)) return 'algún dato no es válido';
    return m;
  }

  // ---------- Publicar ----------
  $('btn-publicar').addEventListener('click', async () => {
    const btn = $('btn-publicar');
    const tareas = plan.filter(p => !p.errores.length && !p.hecho);
    if (!tareas.length) return;
    btn.disabled = true;
    $('archivo').disabled = $('fotos').disabled = true;
    DP.mensaje($('msg'), '');
    let bien = 0, mal = 0, hechas = 0;
    for (const p of tareas) {
      $('progreso').textContent = `Guardando ${++hechas} de ${tareas.length}…`;
      try {
        const fila = { ...p.fila };
        // Al actualizar, lo que no viene en el archivo se deja como estaba.
        if (p.previo) for (const k of Object.keys(fila)) if (!presentes.has(k)) delete fila[k];
        const hayFotos = p.locales.length || p.urls.length;
        let nuevasRutas = [];
        if (hayFotos) {
          nuevasRutas = await subirFotos(p.locales.slice(0, MAX_FOTOS));
          fila.fotos = [...nuevasRutas, ...p.urls].slice(0, MAX_FOTOS);
        }
        const consulta = p.previo
          ? DP.sb.from('inmuebles').update(fila).eq('id', p.previo.id).select('id').single()
          : DP.sb.from('inmuebles').insert(fila).select('id').single();
        const { data, error } = await consulta;
        if (error) {
          if (nuevasRutas.length) await DP.sb.storage.from('inmuebles').remove(nuevasRutas);
          throw new Error(traducirError(error));
        }
        // Fotos que se reemplazaron: se borran del almacenamiento
        if (hayFotos && p.previo) {
          const quitadas = (p.previo.fotos || []).filter(r => !fila.fotos.includes(r) && r.startsWith(usuario.id + '/'));
          if (quitadas.length) await DP.sb.storage.from('inmuebles').remove(quitadas);
        }
        p.hecho = p.previo ? 'Actualizado' : 'Publicado';
        p.id = data.id;
        bien++;
      } catch (err) {
        console.error(err);
        p.errores.push(err.message || 'no se pudo guardar');
        mal++;
      }
      pintar();
    }
    $('progreso').textContent = '';
    $('archivo').disabled = $('fotos').disabled = false;
    await cargarExistentes().catch(() => {});
    DP.mensaje($('msg'), mal
      ? `Listo: ${bien} guardados y ${mal} con problemas (marcados en rojo en la tabla).`
      : `Listo: ${bien} anuncios guardados.`, mal ? 'error' : 'ok');
    $('msg').insertAdjacentHTML('beforeend', '<p><a class="boton" href="/realestate/mis-anuncios.html">Ver mis anuncios</a></p>');
    btn.disabled = true;
  });
})();
