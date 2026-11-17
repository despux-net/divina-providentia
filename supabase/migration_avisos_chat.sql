-- Aviso por correo de mensajes nuevos del chat.
-- Cada 5 minutos (pg_cron) se busca a quien tiene mensajes sin leer de hace
-- más de 3 minutos y aún no avisados, y se le manda UN correo (Resend vía
-- pg_net, clave en Vault «resend_contacto»). Como mucho un correo cada 30 min
-- por persona. El texto de los mensajes NO va en el correo: está cifrado.
-- Cada persona puede apagarlo en «Mi perfil».

alter table public.profiles
  add column if not exists avisos_chat boolean not null default true,
  add column if not exists chat_avisado_hasta timestamptz,
  add column if not exists chat_ultimo_aviso timestamptz;

create or replace function public.avisar_mensajes_chat()
returns integer
language plpgsql security definer set search_path to ''
as $$
declare
  v_clave text;
  r record;
  n integer := 0;
  v_html text;
  v_asunto text;
begin
  select decrypted_secret into v_clave from vault.decrypted_secrets where name = 'resend_contacto' limit 1;
  if v_clave is null or v_clave = '' then return 0; end if;

  for r in
    with pendientes as (
      select case when c.usuario_a = m.emisor_id then c.usuario_b else c.usuario_a end as destino,
             m.emisor_id, m.creado
      from public.mensajes m
      join public.conversaciones c on c.id = m.conversacion_id
      where m.leido_en is null and m.creado < now() - interval '3 minutes'
        and m.creado > now() - interval '7 days'
    )
    select p.id, u.email, count(*)::int as total, max(pe.creado) as ultimo,
           string_agg(distinct coalesce(nullif(e.full_name, ''), '@' || e.usuario), ', ') as quienes
    from pendientes pe
    join public.profiles p on p.id = pe.destino
    join auth.users u on u.id = p.id
    join public.profiles e on e.id = pe.emisor_id
    where p.avisos_chat
      and u.email is not null
      and pe.creado > coalesce(p.chat_avisado_hasta, '-infinity'::timestamptz)
      and coalesce(p.chat_ultimo_aviso, '-infinity'::timestamptz) < now() - interval '30 minutes'
    group by p.id, u.email
    limit 50
  loop
    v_asunto := case when r.total = 1 then 'Tienes un mensaje nuevo en Vivinati'
                     else 'Tienes ' || r.total || ' mensajes nuevos en Vivinati' end;
    v_html := '<div style="font-family:Arial,sans-serif;font-size:15px;color:#2f3a45;line-height:1.5;max-width:520px">'
      || '<p style="margin:0 0 6px"><strong>' || replace(replace(v_asunto, '<', '&lt;'), '>', '&gt;') || '</strong></p>'
      || '<p style="margin:0 0 16px;color:#6b7785">De: ' || replace(replace(left(r.quienes, 200), '<', '&lt;'), '>', '&gt;') || '</p>'
      || '<p style="margin:0 0 18px"><a href="https://vivinati.com/chat.html" style="background:#1976d2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Leer y responder</a></p>'
      || '<p style="margin:0;color:#6b7785;font-size:13px">Por tu seguridad, el contenido está cifrado y solo se puede leer dentro de Vivinati. '
      || 'Nunca envíes dinero sin haber visitado el inmueble. Puedes desactivar estos avisos en '
      || '<a href="https://vivinati.com/perfil.html#avisos" style="color:#6b7785">Mi perfil</a>.</p></div>';

    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_clave, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', 'Vivinati <no-responder@vivinati.com>',
        'to', jsonb_build_array(r.email),
        'subject', v_asunto,
        'html', v_html,
        'text', v_asunto || chr(10) || 'De: ' || left(r.quienes, 200) || chr(10) || chr(10)
                || 'Léelos y responde en https://vivinati.com/chat.html' || chr(10)
                || 'Desactiva estos avisos en https://vivinati.com/perfil.html#avisos'));

    update public.profiles set chat_avisado_hasta = r.ultimo, chat_ultimo_aviso = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.avisar_mensajes_chat() from public, anon, authenticated;

-- Programación cada 5 minutos (se puede ejecutar más de una vez).
select cron.unschedule(jobid) from cron.job where jobname = 'avisos-chat';
select cron.schedule('avisos-chat', '*/5 * * * *', 'select public.avisar_mensajes_chat()');
