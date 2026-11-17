-- =====================================================================
-- Vivinati · Descripción del perfil («Sobre mí / mi negocio»)
-- Reutiliza la columna profiles.biography. Máximo 1.000 caracteres.
-- Se muestra en el perfil público y en la tarjeta de quien publica.
-- =====================================================================
alter table public.profiles drop constraint if exists profiles_biografia_largo;
alter table public.profiles add constraint profiles_biografia_largo check (biography is null or char_length(biography) <= 1000);

drop function if exists public.perfil_publico(uuid);
create function public.perfil_publico(p_id uuid)
returns table(usuario text, nombre text, avatar_url text, estrellas numeric, valoraciones integer, miembro_desde date, biografia text)
language sql stable security definer set search_path = '' as $function$
  select p.usuario, p.full_name, p.avatar_url,
         (select round(avg(v.estrellas)::numeric, 1) from public.valoraciones v where v.usuario_id = p.id),
         (select count(*)::int from public.valoraciones v where v.usuario_id = p.id),
         (select u.created_at::date from auth.users u where u.id = p.id),
         nullif(trim(p.biography), '')
  from public.profiles p where p.id = p_id
$function$;

drop function if exists public.perfil_por_usuario(text);
create function public.perfil_por_usuario(p_usuario text)
returns table(id uuid, usuario text, nombre text, avatar_url text, estrellas numeric, valoraciones integer, miembro_desde date, biografia text)
language sql stable security definer set search_path = '' as $function$
  select p.id, p.usuario, p.full_name, p.avatar_url,
         (select round(avg(v.estrellas)::numeric, 1) from public.valoraciones v where v.usuario_id = p.id),
         (select count(*)::int from public.valoraciones v where v.usuario_id = p.id),
         (select u.created_at::date from auth.users u where u.id = p.id),
         nullif(trim(p.biography), '')
  from public.profiles p where p.usuario = lower(trim(leading '@' from p_usuario)) limit 1
$function$;

grant execute on function public.perfil_publico(uuid) to anon, authenticated;
grant execute on function public.perfil_por_usuario(text) to anon, authenticated;
notify pgrst, 'reload schema';
