// Envía por correo los anuncios nuevos de cada alerta (tabla public.alertas).
// Se ejecuta una vez al día desde GitHub Actions (.github/workflows/alertas.yml).
//
// Entorno:
//   SUPABASE_SERVICE_ROLE_KEY  (secreto de GitHub; el mismo del indexador)
//   RESEND_API_KEY             (secreto de GitHub; clave de Resend con permiso de envío)
//   PRUEBA=1                   (opcional: no envía ni marca nada, solo lo muestra)
//
// Un solo correo por persona y día, con todas sus alertas juntas, para no
// gastar los 100 correos diarios gratis de Resend.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nzwtafacdpdgulzcwntx.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND = process.env.RESEND_API_KEY;
const PRUEBA = process.env.PRUEBA === '1';
const WEB = 'https://vivinati.com';
const MAX_CORREOS = 90;          // margen bajo el límite gratis de 100/día
const MAX_POR_ALERTA = 10;

if (!KEY) { console.error('::error::Falta el secreto SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!RESEND && !PRUEBA) {
  console.log('::warning title=Alertas sin enviar::Falta el secreto RESEND_API_KEY en GitHub → Settings → Secrets and variables → Actions.');
  process.exit(0);
}

const cab = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function api(ruta, opciones = {}) {
  const r = await fetch(`${SUPABASE_URL}${ruta}`, { ...opciones, headers: { ...cab, ...(opciones.headers || {}) } });
  if (!r.ok) throw new Error(`${ruta}: HTTP ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TIPOS = { apartamento: 'Apartamento', casa: 'Casa', anexo: 'Anexo', habitacion: 'Habitación', townhouse: 'Townhouse',
  local: 'Local comercial', oficina: 'Oficina', terreno: 'Terreno', galpon: 'Galpón', otro: 'Inmueble' };
const precio = i => {
  if (i.precio == null) return 'Precio a consultar';
  const n = Number(i.precio).toLocaleString('es-VE', { maximumFractionDigits: 0 });
  return (i.moneda === 'VES' ? `Bs. ${n}` : `$${n}`) + (i.operacion === 'alquiler' ? ' /mes' : '');
};
const foto = p => !p ? null : /^https:\/\//.test(p) ? p : `${SUPABASE_URL}/storage/v1/object/public/inmuebles/${p.split('/').map(encodeURIComponent).join('/')}`;
const URL_FILTROS = { q: 'q', p_operacion: 'operacion', p_tipo: 'tipo', p_estado: 'estado', p_precio_min: 'min', p_precio_max: 'max',
  p_habitaciones: 'hab', p_metros_min: 'm2min', p_metros_max: 'm2max', p_banos: 'banos', p_dias: 'dias',
  p_estacionamiento: 'estac', p_con_fotos: 'fotos', p_solo_vivinati: 'vivinati', p_bajo_precio: 'bajadas', p_incluir_conceptos: 'conceptos' };
const urlBusqueda = f => `${WEB}/realestate/buscar.html?` + new URLSearchParams(Object.entries(f).filter(([k, v]) => URL_FILTROS[k] && v != null && v !== false)
  .map(([k, v]) => [URL_FILTROS[k], v === true ? '1' : String(v)])).toString();
// Solo se aceptan los filtros conocidos (la columna la escribe la persona).
const PERMITIDOS = new Set(Object.keys(URL_FILTROS));

function tarjetaCorreo(i) {
  const f = foto(i.fotos && i.fotos[0]);
  const lugar = [i.zona, i.ciudad, i.estado].filter(Boolean).join(', ');
  const url = `${WEB}/realestate/anuncio.html?id=${i.id}`;
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #e3edf7">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td width="120" valign="top">${f ? `<a href="${url}"><img src="${esc(f)}" width="110" height="80" alt="" style="display:block;width:110px;height:80px;object-fit:cover;border-radius:8px;border:0"></a>` : ''}</td>
      <td valign="top" style="font-family:Arial,sans-serif;font-size:14px;color:#2f3a45">
        <a href="${url}" style="color:#005CA7;font-weight:bold;font-size:16px;text-decoration:none">${esc(precio(i))}</a><br>
        <a href="${url}" style="color:#2f3a45;text-decoration:none">${esc(i.titulo)}</a><br>
        <span style="color:#6b7785;font-size:13px">${esc(TIPOS[i.tipo] || '')}${lugar ? ' · ' + esc(lugar) : ''}</span>
      </td></tr></table></td></tr>`;
}

function correo(nombre, bloques) {
  const total = bloques.reduce((n, b) => n + b.nuevos.length, 0);
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f8fc">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8fc"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;border:1px solid #e3edf7">
    <tr><td style="padding:20px 24px;border-bottom:1px solid #e3edf7"><img src="${WEB}/img/logo-vivinati.png" width="160" alt="Vivinati" style="display:block;border:0"></td></tr>
    <tr><td style="padding:20px 24px;font-family:Arial,sans-serif;color:#2f3a45;font-size:15px">
      <p style="margin:0 0 6px">Hola${nombre ? ' ' + esc(nombre.split(' ')[0]) : ''},</p>
      <p style="margin:0 0 4px">Encontramos <b>${total} ${total === 1 ? 'anuncio nuevo' : 'anuncios nuevos'}</b> para tus alertas:</p>
      ${bloques.map(b => `
        <h2 style="font-size:17px;margin:22px 0 4px;color:#2f3a45">${esc(b.alerta.nombre)}</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${b.nuevos.map(tarjetaCorreo).join('')}</table>
        <p style="margin:10px 0 0"><a href="${esc(urlBusqueda(b.filtros))}" style="color:#005CA7">Ver todos en Vivinati →</a>
          &nbsp;·&nbsp; <a href="${WEB}/baja.html?t=${b.alerta.token}" style="color:#6b7785;font-size:13px">Dejar de recibir esta alerta</a></p>`).join('')}
      <p style="margin:26px 0 0;color:#6b7785;font-size:13px">Consejo: nunca pagues ni «apartes» un inmueble sin haberlo visitado y verificado al propietario.</p>
    </td></tr>
    <tr><td style="padding:14px 24px;border-top:1px solid #e3edf7;font-family:Arial,sans-serif;color:#6b7785;font-size:12px">
      Recibes este correo porque creaste alertas en vivinati.com. Gestiónalas en <a href="${WEB}/perfil.html#alertas" style="color:#6b7785">tu perfil</a>.
    </td></tr>
  </table></td></tr></table></body></html>`;
  const texto = bloques.map(b => `${b.alerta.nombre}\n` + b.nuevos.map(i => `- ${precio(i)} · ${i.titulo}\n  ${WEB}/realestate/anuncio.html?id=${i.id}`).join('\n') +
    `\nDejar de recibir: ${WEB}/baja.html?t=${b.alerta.token}`).join('\n\n');
  return { html, texto, total };
}

// ---------- Trabajo ----------
const alertas = await api('/rest/v1/alertas?activa=eq.true&select=*&order=user_id');
console.log(`Alertas activas: ${alertas.length}`);
const porUsuario = new Map();
for (const a of alertas) {
  const filtros = Object.fromEntries(Object.entries(a.filtros || {}).filter(([k]) => PERMITIDOS.has(k)));
  let nuevos = [];
  try {
    const filas = await api('/rest/v1/rpc/buscar_inmuebles', { method: 'POST', body: JSON.stringify({ ...filtros, p_orden: 'recientes', p_limite: 40 }) });
    nuevos = filas.filter(i => new Date(i.creado) > new Date(a.ultimo_envio)).slice(0, MAX_POR_ALERTA);
  } catch (e) { console.log(`::warning::Alerta ${a.id}: ${e.message}`); continue; }
  if (!porUsuario.has(a.user_id)) porUsuario.set(a.user_id, []);
  porUsuario.get(a.user_id).push({ alerta: a, filtros, nuevos });
}

let enviados = 0;
const ahora = new Date().toISOString();
for (const [userId, bloques] of porUsuario) {
  const conNuevos = bloques.filter(b => b.nuevos.length);
  const marcar = async () => {
    if (PRUEBA) return;
    const ids = bloques.map(b => b.alerta.id).join(',');
    await api(`/rest/v1/alertas?id=in.(${ids})`, { method: 'PATCH', body: JSON.stringify({ ultimo_envio: ahora }), headers: { Prefer: 'return=minimal' } });
  };
  if (!conNuevos.length) { await marcar(); continue; }
  if (enviados >= MAX_CORREOS) { console.log('::warning::Límite diario de correos alcanzado; el resto sale mañana.'); break; }

  let usuario;
  try { usuario = await api(`/auth/v1/admin/users/${userId}`); } catch { continue; }
  if (!usuario || !usuario.email || !usuario.email_confirmed_at) continue;
  const perfil = (await api(`/rest/v1/profiles?id=eq.${userId}&select=full_name`))[0] || {};
  const { html, texto, total } = correo(perfil.full_name, conNuevos);
  const asunto = `${total} ${total === 1 ? 'anuncio nuevo' : 'anuncios nuevos'}: ${conNuevos[0].alerta.nombre}`.slice(0, 120);

  if (PRUEBA) { console.log(`[prueba] ${usuario.email}: ${asunto}`); enviados++; continue; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Vivinati <no-responder@vivinati.com>', to: [usuario.email], subject: asunto, html, text: texto,
      headers: { 'List-Unsubscribe': `<${WEB}/baja.html?t=${conNuevos[0].alerta.token}>` }
    })
  });
  if (!r.ok) { console.log(`::warning::No se pudo enviar a un usuario: HTTP ${r.status} ${await r.text()}`); continue; }
  enviados++;
  await marcar();
}
console.log(`Correos enviados: ${enviados}`);
