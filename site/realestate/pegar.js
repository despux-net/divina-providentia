// «Pega tu anuncio»: la persona pega el texto de SU anuncio de Facebook,
// Instagram o WhatsApp y rellenamos el formulario. No se lee nada de esas
// redes: solo el texto que la propia persona copia y pega aquí.
(() => {
  const sinAcentos = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const TIPOS = [
    [/\b(apartamento|apto|aptos|apartamentos|penthouse|ph|apartaestudio|estudio)\b/, 'apartamento'],
    [/\btown ?house\b/, 'townhouse'],
    [/\banexo\b/, 'anexo'],
    [/\b(habitacion|habitaciones|cuarto) (en alquiler|para alquilar|disponible)\b|\balquilo (una )?habitacion\b/, 'habitacion'],
    [/\b(local|locales) comercial|\blocal\b/, 'local'],
    [/\b(oficina|oficinas|consultorio)\b/, 'oficina'],
    [/\b(galpon|galpones|deposito)\b/, 'galpon'],
    [/\b(terreno|terrenos|parcela|lote|finca|hacienda)\b/, 'terreno'],
    [/\b(casa|casas|quinta|chalet)\b/, 'casa']
  ];

  // Estado → palabras que lo delatan (el propio estado, su capital y ciudades grandes).
  const LUGARES = {
    'Distrito Capital': ['distrito capital', 'caracas', 'libertador', 'catia', 'el paraiso', 'la candelaria', 'san bernardino', 'altamira'],
    'Miranda': ['miranda', 'chacao', 'baruta', 'el hatillo', 'los teques', 'guarenas', 'guatire', 'charallave', 'cua', 'ocumare del tuy', 'higuerote', 'san antonio de los altos', 'los palos grandes', 'la castellana', 'las mercedes', 'prados del este', 'el cafetal', 'santa fe', 'la trinidad', 'petare', 'los dos caminos'],
    'La Guaira': ['la guaira', 'vargas', 'catia la mar', 'macuto', 'caraballeda', 'naiguata'],
    'Carabobo': ['carabobo', 'valencia', 'naguanagua', 'san diego', 'guacara', 'puerto cabello', 'los guayos', 'tocuyito', 'el vinedo', 'prebo', 'trigal'],
    'Aragua': ['aragua', 'maracay', 'turmero', 'la victoria', 'cagua', 'el limon'],
    'Zulia': ['zulia', 'maracaibo', 'cabimas', 'ciudad ojeda', 'san francisco'],
    'Lara': ['lara', 'barquisimeto', 'cabudare', 'carora'],
    'Mérida': ['merida', 'el vigia', 'ejido'],
    'Táchira': ['tachira', 'san cristobal', 'tariba', 'rubio'],
    'Bolívar': ['bolivar', 'puerto ordaz', 'ciudad guayana', 'ciudad bolivar', 'san felix'],
    'Anzoátegui': ['anzoategui', 'barcelona', 'lecheria', 'puerto la cruz', 'el tigre'],
    'Monagas': ['monagas', 'maturin'],
    'Nueva Esparta': ['nueva esparta', 'margarita', 'porlamar', 'pampatar', 'juan griego', 'maneiro'],
    'Sucre': ['estado sucre', 'cumana', 'carupano'],
    'Falcón': ['falcon', 'coro', 'punto fijo', 'tucacas', 'chichiriviche'],
    'Portuguesa': ['portuguesa', 'acarigua', 'araure', 'guanare'],
    'Yaracuy': ['yaracuy', 'san felipe'],
    'Trujillo': ['trujillo', 'valera'],
    'Barinas': ['barinas'],
    'Guárico': ['guarico', 'san juan de los morros', 'calabozo'],
    'Cojedes': ['cojedes', 'san carlos', 'tinaquillo'],
    'Apure': ['apure', 'san fernando de apure'],
    'Delta Amacuro': ['delta amacuro', 'tucupita'],
    'Amazonas': ['amazonas', 'puerto ayacucho']
  };
  // Lo que se pone como «ciudad» cuando aparece en el texto.
  const CIUDADES = ['caracas', 'valencia', 'maracaibo', 'barquisimeto', 'maracay', 'puerto ordaz', 'ciudad guayana',
    'barcelona', 'lecheria', 'puerto la cruz', 'maturin', 'merida', 'san cristobal', 'cumana', 'porlamar', 'pampatar',
    'los teques', 'guarenas', 'guatire', 'cabudare', 'naguanagua', 'san diego', 'coro', 'punto fijo', 'acarigua',
    'barinas', 'valera', 'san felipe', 'cabimas', 'ciudad ojeda', 'tucacas', 'higuerote', 'charallave', 'turmero'];

  const numero = s => {
    // «1.200», «1,200», «1200», «1.5k», «120mil»
    let t = String(s).toLowerCase().replace(/\s/g, '').replace(/[.,]+$/, '');
    let mult = 1;
    if (/k$/.test(t)) { mult = 1000; t = t.slice(0, -1); }
    if (/mil$/.test(t)) { mult = 1000; t = t.slice(0, -3); }
    if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '');
    else t = t.replace(',', '.');
    const n = Number(t) * mult;
    return Number.isFinite(n) ? n : null;
  };

  function leer(texto) {
    const crudo = String(texto || '').slice(0, 8000);
    const t = sinAcentos(crudo).replace(/[*_~]/g, ' ');
    const r = {};

    // Operación: manda la palabra que aparece antes («Se vende… ideal para alquilar» = venta).
    const pAlquiler = t.search(/\b(alquil|arrend|se renta|en renta)/);
    const pVenta = t.search(/\b(vend[eo]|venta|se vende|remato)\b/);
    if (pAlquiler >= 0 || pVenta >= 0) {
      r.operacion = pVenta >= 0 && (pAlquiler < 0 || pVenta < pAlquiler) ? 'venta' : 'alquiler';
    }

    // Tipo
    for (const [re, tipo] of TIPOS) if (re.test(t)) { r.tipo = tipo; break; }

    // Precio: «$450», «450$», «450 usd», «usd 450», «450 dolares», «Bs. 30.000»
    // (?<![a-z\d.,]) evita tomar el «2» de «m2» como precio.
    const precioUsd = t.match(/(?:us\$|\$|usd|dolares?)\s*(\d[\d.,]*\s*(?:k|mil)?)|(?<![a-z\d.,])(\d[\d.,]*\s*(?:k|mil)?)\s*(?:us\$|\$|usd|dolares?)/);
    const precioBs = t.match(/(?:bs\.?|bolivares)\s*(\d[\d.,]*)|(?<![a-z\d.,])(\d[\d.,]*)\s*(?:bs\.?|bolivares)\b/);
    if (precioUsd) { r.precio = numero(precioUsd[1] || precioUsd[2]); r.moneda = 'USD'; }
    else if (precioBs) { r.precio = numero(precioBs[1] || precioBs[2]); r.moneda = 'VES'; }
    if (r.precio != null && (r.precio <= 0 || r.precio > 1e9)) delete r.precio;

    // Características
    const cuenta = re => { const m = t.match(re); return m ? Number(m[1]) : null; };
    r.habitaciones = cuenta(/(\d{1,2})\s*(?:habitaciones|habitacion|hab\b|habs\b|cuartos|dormitorios|h\b)/);
    r.banos = cuenta(/(\d{1,2})\s*(?:banos|bano|b\b|wc)/);
    r.estacionamientos = cuenta(/(\d{1,2})\s*(?:puestos?|estacionamientos?|p\b)/);
    const m2 = t.match(/([\d.,]{2,7})\s*(?:m2|m²|mts2?|metros( cuadrados)?|mt2)/);
    if (m2) { const n = numero(m2[1]); if (n && n > 5 && n < 1e7) r.metros = n; }
    for (const k of ['habitaciones', 'banos', 'estacionamientos']) if (r[k] == null || r[k] > 50) delete r[k];

    // Estado y ciudad
    const conBordes = ' ' + t.replace(/[^a-z0-9]+/g, ' ') + ' ';
    // Gana el lugar más concreto («los palos grandes» antes que «caracas»).
    let mejor = '';
    for (const [estado, palabras] of Object.entries(LUGARES)) {
      for (const p of palabras) if (p.length > mejor.length && conBordes.includes(` ${p} `)) { mejor = p; r.estado = estado; }
    }
    const ciudad = CIUDADES.find(c => conBordes.includes(` ${c} `));
    if (ciudad) r.ciudad = ciudad.replace(/\b\w/g, c => c.toUpperCase());

    // WhatsApp / teléfono venezolano: 0414-123.45.67, +58 414 1234567, 58412...
    const tel = crudo.match(/(?:\+?58[\s.-]?)?\(?0?(4(?:12|14|16|22|24|26))\)?[\s.-]?(\d{3})[\s.-]?(\d{2})[\s.-]?(\d{2})/);
    if (tel) r.whatsapp = `0${tel[1]}${tel[2]}${tel[3]}${tel[4]}`;

    // Título: la primera línea con sentido, sin emojis ni almohadillas.
    const lineas = crudo.split(/\n+/).map(l => l.replace(/[#*_~]/g, '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim()).filter(l => l.length >= 5);
    if (lineas[0]) r.titulo = lineas[0].slice(0, 120);
    r.descripcion = crudo.replace(/#\w+/g, '').trim().slice(0, 5000) || undefined;
    return r;
  }

  window.DP_PEGAR = { leer };
})();
