-- Vivinati Industrial (vivinati.com/industrial/): mercado de maquinaria,
-- herramientas, materiales, insumos y servicios para la industria.
-- Venta, alquiler (de maquinaria) y servicios. Lo publican las empresas y
-- personas con cuenta en Vivinati (la misma cuenta que Real Estate).

-- Tipo de perfil nuevo: empresas industriales y proveedores
alter table public.profiles drop constraint if exists profiles_tipo_perfil_ok;
alter table public.profiles add constraint profiles_tipo_perfil_ok check (tipo_perfil is null or tipo_perfil = any (array[
  'particular', 'agente', 'inmobiliaria', 'constructora', 'arquitecto', 'estudiante', 'proveedor', 'otro']));

create or replace function public.limite_anuncios(p_user uuid)
returns integer language sql stable security definer set search_path to '' as $$
  select case when exists (select 1 from public.profiles where id = p_user and tipo_perfil in ('agente', 'inmobiliaria', 'constructora', 'proveedor'))
              then 300 else 30 end
$$;

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  operacion text not null check (operacion in ('venta', 'alquiler', 'servicio')),
  categoria text not null check (categoria in ('maquinaria-pesada', 'maquinaria-industrial', 'herramientas', 'materiales',
    'materias-primas', 'energia', 'repuestos', 'seguridad', 'logistica', 'agroindustria', 'servicios', 'otros')),
  titulo text not null check (char_length(titulo) between 5 and 120),
  descripcion text check (char_length(descripcion) <= 5000),
  precio numeric check (precio >= 0),
  moneda text not null default 'USD' check (moneda in ('USD', 'VES')),
  unidad text check (unidad in ('unidad', 'hora', 'dia', 'semana', 'mes', 'kg', 'tonelada', 'metro', 'm2', 'm3', 'litro', 'saco', 'caja', 'lote', 'servicio')),
  condicion text check (condicion in ('nuevo', 'usado', 'reacondicionado')),
  marca text check (char_length(marca) <= 60),
  modelo text check (char_length(modelo) <= 60),
  anio integer check (anio between 1950 and 2100),
  cantidad integer check (cantidad >= 0),
  envios boolean not null default false,
  estado text not null check (char_length(estado) between 2 and 40),
  ciudad text check (char_length(ciudad) <= 60),
  whatsapp text check (whatsapp ~ '^[0-9]{10,15}$'),
  fotos text[] not null default '{}' check (cardinality(fotos) <= 12),
  referencia text check (referencia is null or char_length(referencia) between 1 and 40),
  activo boolean not null default true,
  revision text check (revision is null or revision in ('reportado', 'oculto_admin')),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  busqueda tsvector,
  constraint productos_referencia_unica unique (user_id, referencia),
  constraint productos_servicio_sin_condicion check (operacion <> 'servicio' or condicion is null)
);
create index if not exists productos_busqueda on public.productos using gin (busqueda);
create index if not exists productos_recientes on public.productos (creado desc) where activo;
create index if not exists productos_categoria on public.productos (categoria, creado desc) where activo;
create index if not exists productos_usuario on public.productos (user_id);

alter table public.productos enable row level security;
drop policy if exists productos_leer on public.productos;
create policy productos_leer on public.productos for select using (activo or user_id = (select auth.uid()) or public.is_admin());
drop policy if exists productos_crear on public.productos;
create policy productos_crear on public.productos for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists productos_cambiar on public.productos;
create policy productos_cambiar on public.productos for update to authenticated
  using (user_id = (select auth.uid()) or public.is_admin()) with check (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists productos_borrar on public.productos;
create policy productos_borrar on public.productos for delete to authenticated using (user_id = (select auth.uid()) or public.is_admin());
grant select on public.productos to anon, authenticated;
grant insert, update, delete on public.productos to authenticated;

create or replace function public.productos_antes_de_guardar()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_limite integer;
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.user_id := auth.uid();
      new.creado := now();
      new.revision := null;
      v_limite := public.limite_anuncios(auth.uid());
      if (select count(*) from public.productos where user_id = auth.uid() and activo) >= v_limite then
        raise exception 'Has llegado al máximo de % publicaciones activas.', v_limite;
      end if;
    else
      new.user_id := old.user_id;
      new.creado := old.creado;
      if old.revision = 'oculto_admin' then new.activo := false; new.revision := old.revision;
      else new.revision := case when new.activo and not old.activo then null else old.revision end; end if;
    end if;
  end if;
  if new.operacion = 'servicio' then new.condicion := null; end if;
  new.actualizado := now();
  new.busqueda :=
    setweight(to_tsvector('spanish', public.f_unaccent(coalesce(new.titulo, ''))), 'A') ||
    setweight(to_tsvector('spanish', public.f_unaccent(concat_ws(' ', new.marca, new.modelo, replace(new.categoria, '-', ' '), new.estado, new.ciudad))), 'A') ||
    setweight(to_tsvector('spanish', public.f_unaccent(coalesce(new.descripcion, ''))), 'C');
  return new;
end $$;
drop trigger if exists productos_antes_de_guardar on public.productos;
create trigger productos_antes_de_guardar before insert or update on public.productos
  for each row execute function public.productos_antes_de_guardar();

-- Búsqueda: texto libre + filtros. Orden: recientes, precio o relevancia.
create or replace function public.buscar_productos(q text default null, p_operacion text default null, p_categoria text default null,
  p_estado text default null, p_condicion text default null, p_precio_min numeric default null, p_precio_max numeric default null,
  p_con_fotos boolean default null, p_envios boolean default null, p_vendedor uuid default null,
  p_orden text default 'recientes', p_limite integer default 24, p_desde integer default 0)
returns setof public.productos language sql stable set search_path to '' as $$
  select p.* from public.productos p
  where p.activo
    and (nullif(trim(q), '') is null or p.busqueda @@ websearch_to_tsquery('spanish', public.f_unaccent(q))
         or public.f_unaccent(lower(p.titulo)) like '%' || public.f_unaccent(lower(trim(q))) || '%')
    and (p_operacion is null or p.operacion = p_operacion)
    and (p_categoria is null or p.categoria = p_categoria)
    and (p_estado is null or p.estado = p_estado)
    and (p_condicion is null or p.condicion = p_condicion)
    and (p_precio_min is null or p.precio >= p_precio_min)
    and (p_precio_max is null or p.precio <= p_precio_max)
    and (p_con_fotos is not true or cardinality(p.fotos) > 0)
    and (p_envios is not true or p.envios)
    and (p_vendedor is null or p.user_id = p_vendedor)
  order by
    case when p_orden = 'precio_asc' then p.precio end asc nulls last,
    case when p_orden = 'precio_desc' then p.precio end desc nulls last,
    case when p_orden = 'relevancia' and nullif(trim(q), '') is not null
         then ts_rank(p.busqueda, websearch_to_tsquery('spanish', public.f_unaccent(q))) end desc nulls last,
    p.creado desc
  limit least(greatest(p_limite, 1), 60) offset greatest(p_desde, 0)
$$;
grant execute on function public.buscar_productos(text, text, text, text, text, numeric, numeric, boolean, boolean, uuid, text, integer, integer) to anon, authenticated;

-- Cuántas publicaciones hay por categoría (portada de Industrial)
create or replace function public.conteo_productos()
returns table(categoria text, total integer) language sql stable set search_path to '' as $$
  select categoria, count(*)::int from public.productos where activo group by categoria
$$;
grant execute on function public.conteo_productos() to anon, authenticated;

-- Ficha: el producto y lo público de quien lo vende
create or replace function public.vendedor_de_producto(p_producto uuid)
returns table(id uuid, usuario text, nombre text, empresa text, avatar_url text, tipo_perfil text, estado text, ciudad text,
              estrellas numeric, valoraciones integer, miembro_desde date, whatsapp text, sitio_web text, instagram text, publicaciones integer)
language sql stable security definer set search_path to '' as $$
  select u.id, u.usuario, u.full_name, nullif(trim(u.empresa), ''), u.avatar_url, u.tipo_perfil, u.estado, nullif(trim(u.ciudad), ''),
         (select round(avg(v.estrellas)::numeric, 1) from public.valoraciones v where v.usuario_id = u.id),
         (select count(*)::int from public.valoraciones v where v.usuario_id = u.id),
         (select a.created_at::date from auth.users a where a.id = u.id),
         case when u.mostrar_telefono then nullif(trim(u.phone), '') end, u.sitio_web, u.instagram,
         (select count(*)::int from public.productos x where x.user_id = u.id and x.activo)
  from public.productos p join public.profiles u on u.id = p.user_id
  where p.id = p_producto and (p.activo or p.user_id = auth.uid() or public.is_admin())
$$;
grant execute on function public.vendedor_de_producto(uuid) to anon, authenticated;

-- Chat: una conversación también puede ser sobre un producto
alter table public.conversaciones add column if not exists producto_id uuid references public.productos (id) on delete set null;

drop function if exists public.abrir_conversacion(uuid, uuid);
create or replace function public.abrir_conversacion(p_otro uuid, p_inmueble uuid default null, p_producto uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare yo uuid := auth.uid(); a uuid; b uuid; cid uuid;
begin
  if yo is null then raise exception 'Necesitas iniciar sesión.'; end if;
  if p_otro is null or p_otro = yo then raise exception 'No puedes escribirte a ti mismo.'; end if;
  if not exists (select 1 from public.profiles where id = p_otro and usuario is not null) then
    raise exception 'Esa persona no tiene cuenta en Vivinati.';
  end if;
  a := least(yo, p_otro); b := greatest(yo, p_otro);
  select id into cid from public.conversaciones
    where usuario_a = a and usuario_b = b and inmueble_id is not distinct from p_inmueble and producto_id is not distinct from p_producto;
  if cid is null then
    insert into public.conversaciones (usuario_a, usuario_b, inmueble_id, producto_id) values (a, b, p_inmueble, p_producto) returning id into cid;
  end if;
  return cid;
end $function$;
grant execute on function public.abrir_conversacion(uuid, uuid, uuid) to authenticated;

drop function if exists public.mis_conversaciones();
create or replace function public.mis_conversaciones()
returns table(id uuid, otro_id uuid, otro_usuario text, otro_nombre text, otro_avatar text, inmueble_id uuid, inmueble_titulo text,
              ultimo timestamptz, no_leidos integer, producto_id uuid, producto_titulo text)
language sql stable security definer set search_path to '' as $function$
  select c.id, o.id, o.usuario, o.full_name, o.avatar_url, c.inmueble_id, i.titulo, c.ultimo,
         (select count(*)::int from public.mensajes m where m.conversacion_id = c.id and m.emisor_id <> auth.uid() and m.leido_en is null),
         c.producto_id, pr.titulo
  from public.conversaciones c
  join public.profiles o on o.id = case when c.usuario_a = auth.uid() then c.usuario_b else c.usuario_a end
  left join public.inmuebles i on i.id = c.inmueble_id
  left join public.productos pr on pr.id = c.producto_id
  where auth.uid() in (c.usuario_a, c.usuario_b)
  order by c.ultimo desc
  limit 200
$function$;
grant execute on function public.mis_conversaciones() to authenticated;

-- Una conversación por pareja de personas y por inmueble o producto
create unique index if not exists conversaciones_par_producto_idx on public.conversaciones (usuario_a, usuario_b,
  coalesce(inmueble_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(producto_id, '00000000-0000-0000-0000-000000000000'::uuid));
drop index if exists public.conversaciones_par_idx;

-- El trigger no se llama desde la API
revoke all on function public.productos_antes_de_guardar() from public, anon, authenticated;
