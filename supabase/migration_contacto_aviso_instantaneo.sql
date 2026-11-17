-- Aviso INSTANTÁNEO por correo de cada mensaje del formulario de contacto.
-- Al guardarse una fila en contacto_web, Supabase llama a Resend (pg_net) y
-- manda el mensaje a contact@vivinati.com (Namecheap lo reenvía al Gmail).
-- «Responder» va directo a quien escribió.
--
-- Necesita la clave de Resend guardada en Supabase → Project Settings →
-- Vault con el nombre exacto  resend_contacto . Si no está, no se envía nada
-- y la tarea de GitHub (scripts/contacto/avisar.mjs) sigue de respaldo.

create extension if not exists pg_net;

create or replace function public.contacto_web_avisar()
returns trigger
language plpgsql security definer set search_path to ''
as $$
declare
  v_clave text;
  v_motivo text;
  v_html text;
  esc text;
begin
  select decrypted_secret into v_clave from vault.decrypted_secrets where name = 'resend_contacto' limit 1;
  if v_clave is null or v_clave = '' then return new; end if;

  v_motivo := case new.motivo
    when 'duda' then 'Duda o sugerencia' when 'estafa' then 'Posible estafa'
    when 'anuncio' then 'Problema con un anuncio o cuenta'
    when 'retirar' then 'Inmobiliaria: aparecer o retirar anuncios'
    when 'prensa' then 'Prensa o alianzas' else 'Otro' end;

  v_html := format(
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#2f3a45;line-height:1.5">'
    || '<p style="color:#6b7785;margin:0 0 12px">Nuevo mensaje desde el formulario de contacto de vivinati.com</p>'
    || '<p style="margin:0">Nombre: %s<br>Correo: %s<br>Motivo: %s%s</p>'
    || '<p style="white-space:pre-wrap;border-left:3px solid #dbe6f1;padding-left:12px">%s</p>'
    || '<p style="color:#6b7785;font-size:13px">Pulsa «Responder» para contestarle directamente. Mensaje n.º %s.</p></div>',
    replace(replace(replace(new.nombre, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
    replace(replace(replace(new.correo, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
    v_motivo,
    coalesce('<br>Enlace: ' || replace(replace(replace(new.enlace, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), ''),
    replace(replace(replace(new.mensaje, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
    new.id);

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_clave, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', 'Vivinati <no-responder@vivinati.com>',
      'to', jsonb_build_array('contact@vivinati.com'),
      'reply_to', new.correo,
      'subject', left('[Contacto Vivinati] ' || v_motivo || ' — ' || new.nombre, 150),
      'html', v_html,
      'text', new.nombre || ' <' || new.correo || '>' || chr(10) || 'Motivo: ' || v_motivo || chr(10)
              || coalesce('Enlace: ' || new.enlace || chr(10), '') || chr(10) || new.mensaje));

  update public.contacto_web set avisado = true where id = new.id;
  return new;
exception when others then
  -- Nunca impedir que el mensaje se guarde: el respaldo de GitHub lo avisará.
  return new;
end $$;

revoke all on function public.contacto_web_avisar() from public, anon, authenticated;

drop trigger if exists contacto_web_avisar on public.contacto_web;
create trigger contacto_web_avisar after insert on public.contacto_web
  for each row execute function public.contacto_web_avisar();
