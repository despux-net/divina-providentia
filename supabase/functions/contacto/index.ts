// Formulario de contacto de vivinati.com con «No soy un robot».
// 1) Comprueba con Cloudflare Turnstile que lo envía una persona.
// 2) Guarda el mensaje en contacto_web (el trigger manda el aviso por correo).
// La tabla ya no acepta escrituras directas desde la web: solo por aquí.
// Secreto necesario (Supabase → Edge Functions → Secrets): TURNSTILE_SECRET.

const ORIGENES = ['https://vivinati.com', 'https://www.vivinati.com', 'http://localhost:8766'];
const MOTIVOS = ['duda', 'anuncio', 'estafa', 'retirar', 'prensa', 'otro'];

function cors(req: Request) {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(o) ? o : ORIGENES[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

Deno.serve(async (req: Request) => {
  const cab = cors(req);
  const responder = (cuerpo: unknown, estado = 200) =>
    new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cab, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cab });
  if (req.method !== 'POST') return responder({ error: 'metodo' }, 405);

  let d: Record<string, unknown>;
  try { d = await req.json(); } catch { return responder({ error: 'datos' }, 400); }
  const txt = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  const nombre = txt(d.nombre, 80).replace(/\s+/g, ' ');
  const correo = txt(d.correo, 120).toLowerCase();
  const motivo = MOTIVOS.includes(String(d.motivo)) ? String(d.motivo) : 'otro';
  const mensaje = txt(d.mensaje, 2000);
  const enlace = txt(d.enlace, 300) || null;
  const token = txt(d.token, 4096);

  if (nombre.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo) || mensaje.length < 10 ||
      (enlace && !/^https?:\/\/\S+$/i.test(enlace))) {
    return responder({ error: 'datos' }, 400);
  }

  // ---- ¿Es una persona? ----
  const secreto = Deno.env.get('TURNSTILE_SECRET');
  if (!secreto) return responder({ error: 'config' }, 500);
  if (!token) return responder({ error: 'robot' }, 400);
  const form = new FormData();
  form.append('secret', secreto);
  form.append('response', token);
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (ip) form.append('remoteip', ip);
  const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
    .then(r => r.json()).catch(() => ({ success: false }));
  const codigos: string[] = v['error-codes'] || [];
  if (codigos.some(c => /secret/.test(c))) return responder({ error: 'config' }, 500);
  if (!v.success) return responder({ error: 'robot' }, 400);

  // ---- Guardar ----
  const url = Deno.env.get('SUPABASE_URL')!;
  const clave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const r = await fetch(`${url}/rest/v1/contacto_web`, {
    method: 'POST',
    headers: { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ nombre, correo, motivo, mensaje, enlace })
  });
  if (!r.ok) {
    const t = await r.text();
    return responder({ error: /demasiados_mensajes/.test(t) ? 'demasiados' : 'guardar' }, 400);
  }
  return responder({ ok: true });
});
