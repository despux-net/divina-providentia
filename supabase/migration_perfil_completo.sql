-- Perfil completo (inspirado en la referencia de wg-gesucht):
-- tipo de perfil, empresa, zona, web, Instagram, WhatsApp público opcional
-- y «Eliminar mi cuenta». Se puede ejecutar más de una vez.

alter table public.profiles
  add column if not exists tipo_perfil text,
  add column if not exists empresa text,
  add column if not exists estado text,
  add column if not exists ciudad text,
  add column if not exists sitio_web text,
  add column if not exists instagram text,
  add column if not exists mostrar_telefono boolean not null default false;

alter table public.profiles drop constraint if exists profiles_tipo_perfil_ok;
alter table public.profiles add constraint profiles_tipo_perfil_ok check (tipo_perfil is null or tipo_perfil in
  ('particular','agente','inmobiliaria','constructora','arquitecto','estudiante','otro'));
alter table public.profiles drop constraint if exists profiles_textos_cortos;
alter table public.profiles add constraint profiles_textos_cortos check (
  coalesce(length(empresa), 0) <= 80 and coalesce(length(estado), 0) <= 40 and coalesce(length(ciudad), 0) <= 60);
alter table public.profiles drop constraint if exists profiles_sitio_web_ok;
alter table public.profiles add constraint profiles_sitio_web_ok check (
  sitio_web is null or (sitio_web ~ '^https://[^\s<>"]+$' and length(sitio_web) <= 200));
alter table public.profiles drop constraint if exists profiles_instagram_ok;
alter table public.profiles add constraint profiles_instagram_ok check (
  instagram is null or instagram ~ '^[a-z0-9._]{1,30}$');

-- Perfil público: añade los datos nuevos. El teléfono solo sale si la
-- persona marcó «Mostrar mi WhatsApp en mi perfil». Nunca sale el correo.
drop function if exists public.perfil_publico(uuid);
create function public.perfil_publico(p_id uuid)
returns table(usuario text, nombre text, avatar_url text, estrellas numeric, valoraciones integer,
              miembro_desde date, biografia text, tipo_perfil text, empresa text, estado text,
              ciudad text, sitio_web text, instagram text, whatsapp text)
language sql stable security definer set search_path to ''
as $$
  select p.usuario, p.full_name, p.avatar_url,
         (select round(avg(v.estrellas)::numeric, 1) from public.valoraciones v where v.usuario_id = p.id),
         (select count(*)::int from public.valoraciones v where v.usuario_id = p.id),
         (select u.created_at::date from auth.users u where u.id = p.id),
         nullif(trim(p.biography), ''), p.tipo_perfil, nullif(trim(p.empresa), ''), p.estado,
         nullif(trim(p.ciudad), ''), p.sitio_web, p.instagram,
         case when p.mostrar_telefono then nullif(trim(p.phone), '') end
  from public.profiles p where p.id = p_id
$$;

drop function if exists public.perfil_por_usuario(text);
create function public.perfil_por_usuario(p_usuario text)
returns table(id uuid, usuario text, nombre text, avatar_url text, estrellas numeric, valoraciones integer,
              miembro_desde date, biografia text, tipo_perfil text, empresa text, estado text,
              ciudad text, sitio_web text, instagram text, whatsapp text)
language sql stable security definer set search_path to ''
as $$
  select p.id, p.usuario, p.full_name, p.avatar_url,
         (select round(avg(v.estrellas)::numeric, 1) from public.valoraciones v where v.usuario_id = p.id),
         (select count(*)::int from public.valoraciones v where v.usuario_id = p.id),
         (select u.created_at::date from auth.users u where u.id = p.id),
         nullif(trim(p.biography), ''), p.tipo_perfil, nullif(trim(p.empresa), ''), p.estado,
         nullif(trim(p.ciudad), ''), p.sitio_web, p.instagram,
         case when p.mostrar_telefono then nullif(trim(p.phone), '') end
  from public.profiles p where p.usuario = lower(trim(leading '@' from p_usuario)) limit 1
$$;

grant execute on function public.perfil_publico(uuid) to anon, authenticated;
grant execute on function public.perfil_por_usuario(text) to anon, authenticated;

-- Eliminar mi cuenta: borra al usuario que tiene la sesión. Todo lo suyo
-- (perfil, anuncios, favoritos, alertas, chats, valoraciones) se borra en
-- cascada. Las fotos las borra antes la propia página.
create or replace function public.eliminar_mi_cuenta()
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'La cuenta de administración no se puede borrar desde la web.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;
