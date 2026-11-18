-- Una sola cuenta (correo, contraseña, @usuario), dos perfiles públicos
-- independientes: Real Estate (tabla profiles, como hasta ahora) e
-- Industrial (tabla perfiles_industrial). Los dos con datos profesionales.

-- 1) Datos profesionales en el perfil de Real Estate
alter table public.profiles
  add column if not exists cargo text check (char_length(cargo) <= 80),
  add column if not exists rif text check (char_length(rif) <= 20),
  add column if not exists direccion text check (char_length(direccion) <= 160),
  add column if not exists registro text check (char_length(registro) <= 80),
  add column if not exists linkedin text check (linkedin is null or (linkedin ~ '^https://[^\s<>"]+$' and char_length(linkedin) <= 200)),
  add column if not exists anios_experiencia integer check (anios_experiencia between 0 and 80),
  add column if not exists especialidades text[] check (cardinality(especialidades) <= 12),
  add column if not exists horario text check (char_length(horario) <= 120);

-- 2) Perfil de Industrial
create table if not exists public.perfiles_industrial (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nombre text check (char_length(nombre) <= 80),
  avatar_url text check (avatar_url is null or (split_part(avatar_url, '/', 1) = user_id::text and avatar_url ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}\.(webp|jpg)$')),
  tipo_perfil text check (tipo_perfil in ('fabricante', 'distribuidor', 'importador', 'servicios', 'particular', 'otro')),
  empresa text check (char_length(empresa) <= 80),
  cargo text check (char_length(cargo) <= 80),
  rif text check (char_length(rif) <= 20),
  estado text check (char_length(estado) <= 40),
  ciudad text check (char_length(ciudad) <= 60),
  direccion text check (char_length(direccion) <= 160),
  telefono text check (char_length(telefono) <= 30),
  mostrar_telefono boolean not null default false,
  instagram text check (instagram is null or instagram ~ '^[a-z0-9._]{1,30}$'),
  sitio_web text check (sitio_web is null or (sitio_web ~ '^https://[^\s<>"]+$' and char_length(sitio_web) <= 200)),
  linkedin text check (linkedin is null or (linkedin ~ '^https://[^\s<>"]+$' and char_length(linkedin) <= 200)),
  biografia text check (char_length(biografia) <= 1000),
  registro text check (char_length(registro) <= 80),
  anios_experiencia integer check (anios_experiencia between 0 and 80),
  especialidades text[] check (cardinality(especialidades) <= 12),
  horario text check (char_length(horario) <= 120),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
alter table public.perfiles_industrial enable row level security;
drop policy if exists perfiles_industrial_propio on public.perfiles_industrial;
create policy perfiles_industrial_propio on public.perfiles_industrial for all to authenticated
  using (user_id = (select auth.uid()) or public.is_admin()) with check (user_id = (select auth.uid()) or public.is_admin());
grant select, insert, update, delete on public.perfiles_industrial to authenticated;

create or replace function public.perfiles_industrial_antes() returns trigger language plpgsql set search_path to '' as $$
begin new.actualizado := now(); return new; end $$;
drop trigger if exists perfiles_industrial_antes on public.perfiles_industrial;
create trigger perfiles_industrial_antes before insert or update on public.perfiles_industrial
  for each row execute function public.perfiles_industrial_antes();

-- 3) Perfil público de cualquiera de los dos mercados (por @usuario o por id).
--    El teléfono solo si la persona marcó «mostrar».
create or replace function public.perfil_mercado(p_usuario text default null, p_id uuid default null, p_mercado text default 'realestate')
returns table(id uuid, usuario text, nombre text, avatar_url text, estrellas numeric, valoraciones integer, miembro_desde date,
              biografia text, tipo_perfil text, empresa text, cargo text, rif text, estado text, ciudad text, direccion text,
              sitio_web text, instagram text, linkedin text, whatsapp text, registro text, anios_experiencia integer,
              especialidades text[], horario text, tiene_industrial boolean, tiene_realestate boolean)
language sql stable security definer set search_path to '' as $$
  with u as (
    select p.* from public.profiles p
    where p.usuario is not null
      and ((p_id is not null and p.id = p_id) or (p_id is null and p.usuario = lower(trim(leading '@' from p_usuario))))
    limit 1
  )
  select u.id, u.usuario,
         case when p_mercado = 'industrial' then coalesce(nullif(trim(i.nombre), ''), nullif(trim(i.empresa), ''), u.usuario) else u.full_name end,
         case when p_mercado = 'industrial' then i.avatar_url else u.avatar_url end,
         (select round(avg(v.estrellas)::numeric, 1) from public.valoraciones v where v.usuario_id = u.id),
         (select count(*)::int from public.valoraciones v where v.usuario_id = u.id),
         (select a.created_at::date from auth.users a where a.id = u.id),
         nullif(trim(case when p_mercado = 'industrial' then i.biografia else u.biography end), ''),
         case when p_mercado = 'industrial' then i.tipo_perfil else u.tipo_perfil end,
         nullif(trim(case when p_mercado = 'industrial' then i.empresa else u.empresa end), ''),
         nullif(trim(case when p_mercado = 'industrial' then i.cargo else u.cargo end), ''),
         nullif(trim(case when p_mercado = 'industrial' then i.rif else u.rif end), ''),
         case when p_mercado = 'industrial' then i.estado else u.estado end,
         nullif(trim(case when p_mercado = 'industrial' then i.ciudad else u.ciudad end), ''),
         nullif(trim(case when p_mercado = 'industrial' then i.direccion else u.direccion end), ''),
         case when p_mercado = 'industrial' then i.sitio_web else u.sitio_web end,
         case when p_mercado = 'industrial' then i.instagram else u.instagram end,
         case when p_mercado = 'industrial' then i.linkedin else u.linkedin end,
         case when p_mercado = 'industrial' then (case when i.mostrar_telefono then nullif(trim(i.telefono), '') end)
              else (case when u.mostrar_telefono then nullif(trim(u.phone), '') end) end,
         nullif(trim(case when p_mercado = 'industrial' then i.registro else u.registro end), ''),
         case when p_mercado = 'industrial' then i.anios_experiencia else u.anios_experiencia end,
         case when p_mercado = 'industrial' then i.especialidades else u.especialidades end,
         nullif(trim(case when p_mercado = 'industrial' then i.horario else u.horario end), ''),
         (i.user_id is not null or exists (select 1 from public.productos x where x.user_id = u.id and x.activo)),
         (u.full_name is not null or exists (select 1 from public.inmuebles x where x.user_id = u.id and x.activo))
  from u left join public.perfiles_industrial i on i.user_id = u.id
$$;
grant execute on function public.perfil_mercado(text, uuid, text) to anon, authenticated;

-- 4) Industrial usa su propio perfil: quién vende y el límite de publicaciones
drop function if exists public.vendedor_de_producto(uuid);
create or replace function public.vendedor_de_producto(p_producto uuid)
returns table(id uuid, usuario text, nombre text, empresa text, avatar_url text, tipo_perfil text, estado text, ciudad text,
              estrellas numeric, valoraciones integer, miembro_desde date, whatsapp text, sitio_web text, instagram text,
              publicaciones integer, cargo text, rif text, linkedin text, horario text)
language sql stable security definer set search_path to '' as $$
  select u.id, u.usuario, coalesce(nullif(trim(i.nombre), ''), u.usuario), nullif(trim(i.empresa), ''), i.avatar_url, i.tipo_perfil,
         i.estado, nullif(trim(i.ciudad), ''),
         (select round(avg(v.estrellas)::numeric, 1) from public.valoraciones v where v.usuario_id = u.id),
         (select count(*)::int from public.valoraciones v where v.usuario_id = u.id),
         (select a.created_at::date from auth.users a where a.id = u.id),
         case when i.mostrar_telefono then nullif(trim(i.telefono), '') end, i.sitio_web, i.instagram,
         (select count(*)::int from public.productos x where x.user_id = u.id and x.activo),
         nullif(trim(i.cargo), ''), nullif(trim(i.rif), ''), i.linkedin, nullif(trim(i.horario), '')
  from public.productos p join public.profiles u on u.id = p.user_id
  left join public.perfiles_industrial i on i.user_id = u.id
  where p.id = p_producto and (p.activo or p.user_id = auth.uid() or public.is_admin())
$$;
grant execute on function public.vendedor_de_producto(uuid) to anon, authenticated;

create or replace function public.limite_productos(p_user uuid)
returns integer language sql stable security definer set search_path to '' as $$
  select case when exists (select 1 from public.perfiles_industrial where user_id = p_user and tipo_perfil in ('fabricante', 'distribuidor', 'importador', 'servicios'))
                or exists (select 1 from public.profiles where id = p_user and tipo_perfil = 'proveedor')
              then 300 else 30 end
$$;
revoke all on function public.limite_productos(uuid) from public, anon;
grant execute on function public.limite_productos(uuid) to authenticated;

-- El trigger de productos pasa a usar limite_productos
do $$ begin
  execute replace(pg_get_functiondef('public.productos_antes_de_guardar'::regproc),
    'v_limite := public.limite_anuncios(auth.uid());', 'v_limite := public.limite_productos(auth.uid());');
end $$;
revoke all on function public.productos_antes_de_guardar() from public, anon, authenticated;

-- 5) En el chat, una conversación sobre un producto muestra el perfil industrial
drop function if exists public.mis_conversaciones();
create or replace function public.mis_conversaciones()
returns table(id uuid, otro_id uuid, otro_usuario text, otro_nombre text, otro_avatar text, inmueble_id uuid, inmueble_titulo text,
              ultimo timestamptz, no_leidos integer, producto_id uuid, producto_titulo text)
language sql stable security definer set search_path to '' as $function$
  select c.id, o.id, o.usuario,
         case when c.producto_id is not null then coalesce(nullif(trim(pi.nombre), ''), nullif(trim(pi.empresa), ''), o.full_name) else o.full_name end,
         case when c.producto_id is not null then coalesce(pi.avatar_url, o.avatar_url) else o.avatar_url end,
         c.inmueble_id, i.titulo, c.ultimo,
         (select count(*)::int from public.mensajes m where m.conversacion_id = c.id and m.emisor_id <> auth.uid() and m.leido_en is null),
         c.producto_id, pr.titulo
  from public.conversaciones c
  join public.profiles o on o.id = case when c.usuario_a = auth.uid() then c.usuario_b else c.usuario_a end
  left join public.perfiles_industrial pi on pi.user_id = o.id
  left join public.inmuebles i on i.id = c.inmueble_id
  left join public.productos pr on pr.id = c.producto_id
  where auth.uid() in (c.usuario_a, c.usuario_b)
  order by c.ultimo desc
  limit 200
$function$;
revoke all on function public.mis_conversaciones() from public, anon;
grant execute on function public.mis_conversaciones() to authenticated;
