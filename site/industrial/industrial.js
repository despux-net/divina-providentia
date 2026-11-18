// Vivinati Industrial: datos y piezas comunes a todas sus páginas.
// Se carga después de comun.js (DP.sb, DP.esc, DP.fotoUrl, DP.ESTADOS…).
const IND = {
  // Categorías: clave → [nombre, ejemplos, icono (trazos SVG 24×24)]
  CATEGORIAS: {
    'maquinaria-pesada': ['Maquinaria pesada', 'Excavadoras, retroexcavadoras, grúas, montacargas, compactadoras',
      '<path d="M3 17h11v-5H8l-2-4H3z"/><path d="M14 12l4-6 3 2-3 5"/><circle cx="6" cy="18" r="2"/><circle cx="12" cy="18" r="2"/>'],
    'maquinaria-industrial': ['Maquinaria industrial', 'Tornos, fresadoras, CNC, prensas, inyectoras, empacadoras',
      '<rect x="3" y="8" width="18" height="10" rx="1"/><path d="M7 8V5h10v3M7 13h4M15 12v3"/>'],
    automatizacion: ['Automatización y neumática', 'Cilindros, válvulas, electroválvulas, racores, PLC, sensores, variadores',
      '<rect x="3" y="9" width="12" height="6" rx="1"/><path d="M15 12h6M18 9v6M6 9V6h6v3"/>'],
    herramientas: ['Herramientas y equipos', 'Eléctricas, neumáticas, de soldadura, de medición, compresores',
      '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'],
    materiales: ['Materiales de construcción', 'Cemento, cabillas, bloques, perfiles de acero, madera, tuberías',
      '<path d="M3 20h18M5 20v-6h6v6M13 20V9h6v11M5 14l3-3 3 3M13 9l3-4 3 4"/>'],
    'materias-primas': ['Materias primas e insumos', 'Químicos, resinas y plásticos, metales, papel, textiles, envases',
      '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 14h9"/>'],
    energia: ['Electricidad y energía', 'Generadores, transformadores, tableros, cables, paneles solares',
      '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'],
    repuestos: ['Repuestos y componentes', 'Motores, bombas, rodamientos, válvulas, hidráulica, correas',
      '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>'],
    seguridad: ['Seguridad industrial', 'Equipos de protección personal, extintores, señalización',
      '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>'],
    logistica: ['Transporte y logística', 'Camiones, gandolas, estanterías, paletas, embalaje',
      '<path d="M2 7h12v9H2zM14 10h4l3 3v3h-7"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'],
    agroindustria: ['Agroindustria y alimentos', 'Tractores, implementos, molinos, equipos para alimentos',
      '<path d="M12 21V9M12 9c0-3 2-5 5-5 0 3-2 5-5 5zM12 13c0-3-2-5-5-5 0 3 2 5 5 5z"/><path d="M5 21h14"/>'],
    servicios: ['Servicios industriales', 'Mantenimiento, fletes, montaje, soldadura, ingeniería, calibración',
      '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/><path d="M16 3.5 18 2"/>'],
    otros: ['Otros', 'Todo lo demás que necesita una empresa o una fábrica',
      '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>']
  },
  OPERACIONES: { venta: 'En venta', alquiler: 'En alquiler', servicio: 'Servicio' },
  CONDICIONES: { nuevo: 'Nuevo', usado: 'Usado', reacondicionado: 'Reacondicionado' },
  UNIDADES: { unidad: 'unidad', hora: 'hora', dia: 'día', semana: 'semana', mes: 'mes', kg: 'kg', tonelada: 'tonelada',
    metro: 'metro', m2: 'm²', m3: 'm³', litro: 'litro', saco: 'saco', caja: 'caja', lote: 'lote', servicio: 'servicio' },

  nombreCategoria: c => (IND.CATEGORIAS[c] || [c || 'Otros'])[0],
  icono: (c, tam = 22) => `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(IND.CATEGORIAS[c] || IND.CATEGORIAS.otros)[2]}</svg>`,

  precio(p) {
    if (p.precio == null) return p.operacion === 'servicio' ? 'Precio a convenir' : 'Precio a consultar';
    const n = Number(p.precio).toLocaleString('es-VE', { maximumFractionDigits: 2 });
    const txt = p.moneda === 'VES' ? `Bs. ${n}` : `$${n}`;
    return p.unidad && p.unidad !== 'unidad' ? `${txt} / ${IND.UNIDADES[p.unidad] || p.unidad}` : txt;
  },
  lugar: p => [p.ciudad, p.estado].filter(Boolean).join(', '),

  tarjeta(p) {
    const foto = DP.fotoUrl(p.fotos && p.fotos[0]);
    const img = foto ? `<img class="foto" src="${DP.esc(foto)}" alt="" loading="lazy">` : `<div class="sinfoto">${IND.icono(p.categoria, 40)}</div>`;
    const chips = [p.condicion && IND.CONDICIONES[p.condicion], p.marca, p.anio, p.envios && 'Envíos'].filter(Boolean)
      .map(c => `<span class="chip-dato">${DP.esc(c)}</span>`).join('');
    return `<article class="tarjeta-env">
      <a class="tarjeta" href="/industrial/producto.html?id=${encodeURIComponent(p.id)}">
        <div class="tarjeta-foto">${img}<span class="sello sello-${DP.esc(p.operacion)}">${DP.esc(IND.OPERACIONES[p.operacion] || '')}</span></div>
        <div class="cuerpo">
          <div class="precio">${DP.esc(IND.precio(p))}</div>
          <div class="titulo-t">${DP.esc(p.titulo)}</div>
          <div class="lugar"><span class="lugar-tipo">${DP.esc(IND.nombreCategoria(p.categoria))} · </span><span class="lugar-sitio">${DP.esc(IND.lugar(p))}</span></div>
          ${chips ? `<div class="chips-datos">${chips}</div>` : ''}
          <div class="origen">${p.origen === 'externo' && p.fuente ? `Publicación de ${DP.esc(p.fuente)}` : 'Publicado en Vivinati'}</div>
        </div>
      </a>
    </article>`;
  },

  // Directorio de proveedores: ficha con rubros, marcas, catálogos y su web.
  tarjetaProveedor(v) {
    const web = DP.urlSegura(v.web);
    const lugar = [v.ciudad, v.estado].filter(Boolean).join(', ');
    const cats = (v.categorias || []).map(c => `<a class="chip-dato" href="/industrial/proveedores.html?categoria=${encodeURIComponent(c)}">${DP.esc(IND.nombreCategoria(c))}</a>`).join('');
    const catalogos = (Array.isArray(v.catalogos) ? v.catalogos : []).map(c => {
      const u = DP.urlSegura(c.url);
      return u ? `<li><a href="${DP.esc(u)}" target="_blank" rel="noopener nofollow">${DP.esc(c.titulo || 'Catálogo')}</a>${/\.pdf(\?|$)/i.test(u) ? ' <small>PDF</small>' : ''}</li>` : '';
    }).join('');
    return `<article class="proveedor">
      <div class="proveedor-cab">${DP.avatar({ nombre: v.nombre }, 48)}
        <div><h2>${DP.esc(v.nombre)}</h2>${lugar ? `<p class="ayuda">${DP.esc(lugar)}</p>` : ''}</div></div>
      ${v.descripcion ? `<p>${DP.esc(v.descripcion)}</p>` : ''}
      ${cats ? `<div class="chips-datos">${cats}</div>` : ''}
      ${(v.marcas || []).length ? `<p class="proveedor-marcas"><b>Marcas:</b> ${DP.esc(v.marcas.join(', '))}</p>` : ''}
      ${catalogos ? `<div class="proveedor-catalogos"><b>Catálogos</b><ul>${catalogos}</ul></div>` : ''}
      <div class="proveedor-botones">
        ${v.productos ? `<a class="boton peq" href="/industrial/buscar.html?q=${encodeURIComponent(v.fuente_productos)}">Ver sus ${Number(v.productos).toLocaleString('es-VE')} productos</a>` : ''}
        ${web ? `<a class="boton sec peq" href="${DP.esc(web)}" target="_blank" rel="noopener nofollow">Visitar su web ↗</a>` : ''}
      </div>
    </article>`;
  },

  opcionesCategorias(sel, vacio) {
    sel.innerHTML = (vacio ? `<option value="">${DP.esc(vacio)}</option>` : '') +
      Object.entries(IND.CATEGORIAS).map(([k, [n]]) => `<option value="${k}">${DP.esc(n)}</option>`).join('');
  }
};
window.IND = IND;
// comun.js pinta el pie antes de que exista IND: se repinta con las columnas de Industrial.
DP.pie();
