// Avisa por correo de los mensajes nuevos del formulario de contacto
// (tabla contacto_web). Se envían a contact@vivinati.com, que Namecheap
// reenvía al Gmail del dueño. «Responder» va directo a quien escribió.
// Entorno: SUPABASE_SERVICE_ROLE_KEY y RESEND_API_KEY (secretos de GitHub).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nzwtafacdpdgulzcwntx.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND = process.env.RESEND_API_KEY;
const PARA = process.env.CORREO_CONTACTO || 'contact@vivinati.com';
const DE = 'Vivinati <no-responder@vivinati.com>';

if (!KEY || !RESEND) { console.error('::error::Faltan SUPABASE_SERVICE_ROLE_KEY o RESEND_API_KEY'); process.exit(1); }

const cab = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const MOTIVOS = { duda: 'Duda o sugerencia', estafa: 'Posible estafa', anuncio: 'Problema con un anuncio o cuenta',
  retirar: 'Inmobiliaria: aparecer o retirar anuncios', prensa: 'Prensa o alianzas', otro: 'Otro' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const r = await fetch(`${SUPABASE_URL}/rest/v1/contacto_web?avisado=eq.false&order=creado&limit=20`, { headers: cab });
if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
const filas = await r.json();
console.log(`Mensajes nuevos: ${filas.length}`);

for (const m of filas) {
  const motivo = MOTIVOS[m.motivo] || m.motivo;
  const fecha = new Date(m.creado).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'medium', timeStyle: 'short' });
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#2f3a45;line-height:1.5;max-width:600px">
    <p style="margin:0 0 12px;color:#6b7785">Nuevo mensaje desde el formulario de contacto de vivinati.com</p>
    <table style="border-collapse:collapse;margin-bottom:14px">
      <tr><td style="padding:2px 12px 2px 0;color:#6b7785">Nombre</td><td>${esc(m.nombre)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#6b7785">Correo</td><td>${esc(m.correo)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#6b7785">Motivo</td><td>${esc(motivo)}</td></tr>
      ${m.enlace ? `<tr><td style="padding:2px 12px 2px 0;color:#6b7785">Enlace</td><td>${esc(m.enlace)}</td></tr>` : ''}
      <tr><td style="padding:2px 12px 2px 0;color:#6b7785">Fecha</td><td>${esc(fecha)}</td></tr>
    </table>
    <div style="border-left:3px solid #dbe6f1;padding:4px 0 4px 14px;white-space:pre-wrap">${esc(m.mensaje)}</div>
    <p style="margin:16px 0 0;color:#6b7785;font-size:13px">Pulsa «Responder» para contestarle directamente. Mensaje n.º ${m.id}.</p>
  </div>`;
  const envio = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: DE, to: [PARA], reply_to: m.correo,
      subject: `[Contacto Vivinati] ${motivo} — ${m.nombre}`.slice(0, 150),
      html,
      text: `${m.nombre} <${m.correo}>\nMotivo: ${motivo}\n${m.enlace ? 'Enlace: ' + m.enlace + '\n' : ''}\n${m.mensaje}`
    })
  });
  if (!envio.ok) { console.log(`::warning::No se pudo avisar del mensaje ${m.id}: ${envio.status} ${(await envio.text()).slice(0, 200)}`); continue; }
  await fetch(`${SUPABASE_URL}/rest/v1/contacto_web?id=eq.${m.id}`, {
    method: 'PATCH', headers: { ...cab, Prefer: 'return=minimal' }, body: JSON.stringify({ avisado: true })
  });
  console.log(`Avisado: mensaje ${m.id}`);
}
