-- =====================================================================
-- Vivinati · Mejoras de experiencia (noviembre 2026)
--  1. Alertas de búsqueda por correo         (tabla alertas + baja_alerta)
--  2. Reportar anuncios                      (tabla reportes; 3 reportes → se pausa)
--  3. Anuncios similares y precio de ref.    (similares, precio_referencia)
--  4. Filtros nuevos en la búsqueda          (m², baños, estacionamiento, fotos,
--                                             solo Vivinati, días, bajó de precio)
--  6. Favoritos guardados en la cuenta       (tabla favoritos)
--  7. «Bajó de precio»                       (precio_anterior, precio_bajo_en)
--  8. Perfil público de creadores            (perfil_por_usuario)
-- Se puede ejecutar más de una vez sin romper nada.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Columnas nuevas en inmuebles
-- ---------------------------------------------------------------------
alter table public.inmuebles
  add column if not exists precio_anterior numeric,
  add column if not exists precio_bajo_en  timestamptz,
  add column if not exists revision        text;   -- 'reportado' si se pausó por reportes
alter table public.inmuebles drop constraint if exists inmuebles_revision_check;
alter table public.inmuebles add constraint inmuebles_revision_check check (revision is null or revision in ('reportado'));
create index if not exists inmuebles_precio_bajo_idx on public.inmuebles (precio_bajo_en desc) where precio_bajo_en is not null and activo;

-- Disparador: igual que antes + seguimiento de bajadas de precio y revisión.
create or replace function public.inmuebles_antes_de_guardar()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  es_servicio boolean := coalesce(auth.role(), 'service_role') = 'service_role';
begin
  if not es_servicio and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.user_id := auth.uid();
      new.origen := 'usuario';
      new.fuente := null;
      new.url_original := null;
      new.creado := now();
      new.revision := null;
      if (select count(*) from public.inmuebles where user_id = auth.uid() and activo) >= 30 then
        raise exception 'Has llegado al máximo de 30 anuncios activos.';
      end if;
    else
      new.user_id := old.user_id;
      new.origen := old.origen;
      new.fuente := old.fuente;
      new.url_original := old.url_original;
      new.creado := old.creado;
      new.prioridad := old.prioridad;
      -- Si el dueño reactiva un anuncio pausado por reportes, sale de revisión.
      new.revision := case when new.activo and not old.activo then null else old.revision end;
    end if;
  end if;

  -- «Bajó de precio»: nadie lo escribe a mano; se calcula aquí.
  if tg_op = 'INSERT' then
    new.precio_anterior := null; new.precio_bajo_en := null;
  else
    new.precio_anterior := old.precio_anterior; new.precio_bajo_en := old.precio_bajo_en;
    if new.precio is not null and old.precio is not null and new.moneda = old.moneda and new.operacion = old.operacion then
      if new.precio < old.precio * 0.99 then
        new.precio_anterior := greatest(old.precio, coalesce(old.precio_anterior, 0));
        new.precio_bajo_en := now();
      elsif new.precio > old.precio then
        new.precio_anterior := null; new.precio_bajo_en := null;
      end if;
    end if;
  end if;

  if new.origen = 'usuario' then new.prioridad := 100; end if;
  new.actualizado := now();
  new.huella := new.operacion || '|' || coalesce(round(new.precio)::text, '') || '|' ||
    regexp_replace(lower(public.f_unaccent(new.titulo)), '[^a-z0-9]+', '', 'g');
  new.busqueda :=
    setweight(to_tsvector('spanish', public.f_unaccent(coalesce(new.titulo,''))), 'A') ||
    setweight(to_tsvector('spanish', public.f_unaccent(concat_ws(' ', new.tipo, new.operacion, new.estado, new.ciudad, new.zona))), 'A') ||
    setweight(to_tsvector('spanish', public.f_unaccent(concat_ws(' ', new.categoria_proyecto, new.etapa, new.institucion,
      array_to_string(new.herramientas, ' ')))), 'B') ||
    setweight(to_tsvector('spanish', public.f_unaccent(coalesce(new.descripcion,''))), 'C');
  return new;
end $function$;

-- ---------------------------------------------------------------------
-- 4) Búsqueda: un filtro común y las tres funciones que lo usan
-- ---------------------------------------------------------------------
drop function if exists public.buscar_inmuebles(text, text, text, text, numeric, numeric, integer, text,
  double precision, double precision, double precision, double precision, text, integer, integer, boolean, text, text, text);
drop function if exists public.conteos_busqueda(text, text, text, text, numeric, numeric, integer, text, boolean, text, text, text);
drop function if exists public.mapa_inmuebles(text, text, text, text, numeric, numeric, integer, text,
  double precision, double precision, double precision, double precision, integer, boolean, text, text, text);
drop function if exists public.filtrar_inmuebles(text, text, text, text, numeric, numeric, integer, text, boolean, text, text, text,
  numeric, numeric, integer, boolean, boolean, boolean, integer, boolean);

create or replace function public.filtrar_inmuebles(
  q text default null, p_operacion text default null, p_tipo text default null, p_estado text default null,
  p_precio_min numeric default null, p_precio_max numeric default null, p_habitaciones integer default null,
  p_moneda text default null, p_incluir_conceptos boolean default false, p_categoria text default null,
  p_etapa text default null, p_rol text default null,
  p_metros_min numeric default null, p_metros_max numeric default null, p_banos integer default null,
  p_estacionamiento boolean default null, p_con_fotos boolean default null, p_solo_vivinati boolean default null,
  p_dias integer default null, p_bajo_precio boolean default null)
returns setof public.inmuebles language sql stable set search_path = '' as $function$
  select i.* from public.inmuebles i
  where i.activo
    and not exists (
      select 1 from public.inmuebles j
      where j.huella = i.huella and j.activo and j.id <> i.id
        and (j.prioridad > i.prioridad or (j.prioridad = i.prioridad and (j.creado, j.id) < (i.creado, i.id))))
    and (nullif(trim(q),'') is null or i.busqueda @@ websearch_to_tsquery('spanish', public.f_unaccent(q)))
    and (case when p_operacion is null then i.operacion <> 'concepto' or coalesce(p_incluir_conceptos, false)
              else i.operacion = p_operacion or (coalesce(p_incluir_conceptos, false) and i.operacion = 'concepto') end)
    and (p_tipo is null or i.tipo = p_tipo)
    and (p_estado is null or i.estado = p_estado)
    and (p_moneda is null or i.moneda = p_moneda)
    and (p_precio_min is null or i.precio >= p_precio_min)
    and (p_precio_max is null or i.precio <= p_precio_max)
    and (p_habitaciones is null or i.habitaciones >= p_habitaciones)
    and (p_categoria is null or i.categoria_proyecto = p_categoria)
    and (p_etapa is null or i.etapa = p_etapa)
    and (p_rol is null or i.rol_autor = p_rol)
    and (p_metros_min is null or i.metros >= p_metros_min)
    and (p_metros_max is null or i.metros <= p_metros_max)
    and (p_banos is null or i.banos >= p_banos)
    and (not coalesce(p_estacionamiento, false) or i.estacionamientos >= 1)
    and (not coalesce(p_con_fotos, false) or cardinality(i.fotos) > 0)
    and (not coalesce(p_solo_vivinati, false) or i.origen = 'usuario')
    and (p_dias is null or i.creado >= now() - make_interval(days => least(greatest(p_dias, 1), 365)))
    and (not coalesce(p_bajo_precio, false) or i.precio_bajo_en >= now() - interval '60 days')
$function$;

create or replace function public.buscar_inmuebles(
  q text default null, p_operacion text default null, p_tipo text default null, p_estado text default null,
  p_precio_min numeric default null, p_precio_max numeric default null, p_habitaciones integer default null,
  p_moneda text default null,
  p_lat_min double precision default null, p_lat_max double precision default null,
  p_lng_min double precision default null, p_lng_max double precision default null,
  p_orden text default 'recientes', p_limite integer default 24, p_desde integer default 0,
  p_incluir_conceptos boolean default false, p_categoria text default null,
  p_etapa text default null, p_rol text default null,
  p_metros_min numeric default null, p_metros_max numeric default null, p_banos integer default null,
  p_estacionamiento boolean default null, p_con_fotos boolean default null, p_solo_vivinati boolean default null,
  p_dias integer default null, p_bajo_precio boolean default null)
returns setof public.inmuebles language sql stable set search_path = '' as $function$
  select i.* from public.filtrar_inmuebles(q, p_operacion, p_tipo, p_estado, p_precio_min, p_precio_max, p_habitaciones,
    p_moneda, p_incluir_conceptos, p_categoria, p_etapa, p_rol, p_metros_min, p_metros_max, p_banos,
    p_estacionamiento, p_con_fotos, p_solo_vivinati, p_dias, p_bajo_precio) i
  where (p_lat_min is null or i.lat between p_lat_min and p_lat_max)
    and (p_lng_min is null or i.lng between p_lng_min and p_lng_max)
  order by
    case when p_orden = 'precio_asc' then i.precio end asc nulls last,
    case when p_orden = 'precio_desc' then i.precio end desc nulls last,
    case when p_orden = 'relevancia' and nullif(trim(q),'') is not null
         then ts_rank(i.busqueda, websearch_to_tsquery('spanish', public.f_unaccent(q))) end desc nulls last,
    case when p_orden = 'bajadas' then i.precio_bajo_en end desc nulls last,
    i.creado desc
  limit least(greatest(p_limite, 1), 100) offset greatest(p_desde, 0)
$function$;

create or replace function public.conteos_busqueda(
  q text default null, p_operacion text default null, p_tipo text default null, p_estado text default null,
  p_precio_min numeric default null, p_precio_max numeric default null, p_habitaciones integer default null,
  p_moneda text default null,
  p_incluir_conceptos boolean default false, p_categoria text default null,
  p_etapa text default null, p_rol text default null,
  p_metros_min numeric default null, p_metros_max numeric default null, p_banos integer default null,
  p_estacionamiento boolean default null, p_con_fotos boolean default null, p_solo_vivinati boolean default null,
  p_dias integer default null, p_bajo_precio boolean default null)
returns json language sql stable set search_path = '' as $function$
  with base as (
    select i.tipo, i.estado from public.filtrar_inmuebles(q, p_operacion, null, null, p_precio_min, p_precio_max, p_habitaciones,
      p_moneda, p_incluir_conceptos, p_categoria, p_etapa, p_rol, p_metros_min, p_metros_max, p_banos,
      p_estacionamiento, p_con_fotos, p_solo_vivinati, p_dias, p_bajo_precio) i
  )
  select json_build_object(
    'total', (select count(*) from base where (p_tipo is null or tipo = p_tipo) and (p_estado is null or estado = p_estado)),
    'por_tipo', coalesce((select json_object_agg(tipo, n) from (select tipo, count(*) n from base where p_estado is null or estado = p_estado group by tipo) t), '{}'::json),
    'por_estado', coalesce((select json_object_agg(estado, n) from (select estado, count(*) n from base where p_tipo is null or tipo = p_tipo group by estado) e), '{}'::json)
  )
$function$;

create or replace function public.mapa_inmuebles(
  q text default null, p_operacion text default null, p_tipo text default null, p_estado text default null,
  p_precio_min numeric default null, p_precio_max numeric default null, p_habitaciones integer default null,
  p_moneda text default null,
  p_lat_min double precision default 0, p_lat_max double precision default 13,
  p_lng_min double precision default -74, p_lng_max double precision default -59,
  p_limite integer default 2000,
  p_incluir_conceptos boolean default false, p_categoria text default null,
  p_etapa text default null, p_rol text default null,
  p_metros_min numeric default null, p_metros_max numeric default null, p_banos integer default null,
  p_estacionamiento boolean default null, p_con_fotos boolean default null, p_solo_vivinati boolean default null,
  p_dias integer default null, p_bajo_precio boolean default null)
returns table(id uuid, lat double precision, lng double precision, precio numeric, moneda text, operacion text,
  tipo text, titulo text, foto text, zona text, ciudad text, estado text)
language sql stable set search_path = '' as $function$
  select i.id, i.lat, i.lng, i.precio, i.moneda, i.operacion, i.tipo, i.titulo, i.fotos[1], i.zona, i.ciudad, i.estado
  from public.filtrar_inmuebles(q, p_operacion, p_tipo, p_estado, p_precio_min, p_precio_max, p_habitaciones,
    p_moneda, p_incluir_conceptos, p_categoria, p_etapa, p_rol, p_metros_min, p_metros_max, p_banos,
    p_estacionamiento, p_con_fotos, p_solo_vivinati, p_dias, p_bajo_precio) i
  where i.lat is not null and i.lng is not null
    and i.lat between p_lat_min and p_lat_max and i.lng between p_lng_min and p_lng_max
  order by i.creado desc
  limit least(greatest(p_limite, 1), 3000)
$function$;

-- ---------------------------------------------------------------------
-- 3) Similares y precio de referencia por m²
-- ---------------------------------------------------------------------
create or replace function public.similares(p_id uuid, p_limite integer default 6)
returns setof public.inmuebles language sql stable set search_path = '' as $function$
  with ref as (select * from public.inmuebles where id = p_id)
  select i.* from public.inmuebles i, ref
  where i.activo and i.id <> ref.id and i.operacion = ref.operacion and i.tipo = ref.tipo and i.estado = ref.estado
    and i.huella is distinct from ref.huella
  order by (i.zona is not distinct from ref.zona and ref.zona is not null) desc,
           (i.ciudad is not distinct from ref.ciudad and ref.ciudad is not null) desc,
           case when ref.precio > 0 and i.precio is not null and i.moneda = ref.moneda
                then abs(i.precio - ref.precio) / ref.precio end asc nulls last,
           i.creado desc
  limit least(greatest(p_limite, 1), 12)
$function$;

-- Mediana del precio por m² (en USD) de inmuebles parecidos: misma operación
-- y tipo, en la misma ciudad si hay 5 o más; si no, en el mismo estado.
create or replace function public.precio_referencia(p_id uuid)
returns table(m2 numeric, muestras integer, ambito text) language sql stable set search_path = '' as $function$
  with ref as (select * from public.inmuebles where id = p_id and operacion in ('venta', 'alquiler')),
  base as (
    select i.precio / i.metros as m2, i.ciudad, i.estado from public.inmuebles i, ref
    where i.activo and i.operacion = ref.operacion and i.tipo = ref.tipo and i.estado = ref.estado
      and i.moneda = 'USD' and i.precio > 0 and i.metros between 15 and 5000
  ),
  ciudad as (select count(*) n, percentile_cont(0.5) within group (order by m2) med from base, ref where base.ciudad = ref.ciudad),
  estado as (select count(*) n, percentile_cont(0.5) within group (order by m2) med from base)
  select round(med::numeric, 2), n::integer, (select ciudad from ref) from ciudad where n >= 5
  union all
  select round(estado.med::numeric, 2), estado.n::integer, (select estado from ref) from estado, ciudad
  where ciudad.n < 5 and estado.n >= 5
$function$;

-- ---------------------------------------------------------------------
-- 6) Favoritos en la cuenta
-- ---------------------------------------------------------------------
create table if not exists public.favoritos (
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  inmueble_id uuid not null references public.inmuebles(id) on delete cascade,
  creado      timestamptz not null default now(),
  primary key (user_id, inmueble_id)
);
alter table public.favoritos enable row level security;
drop policy if exists "Mis favoritos: ver" on public.favoritos;
create policy "Mis favoritos: ver" on public.favoritos for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Mis favoritos: añadir" on public.favoritos;
create policy "Mis favoritos: añadir" on public.favoritos for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Mis favoritos: quitar" on public.favoritos;
create policy "Mis favoritos: quitar" on public.favoritos for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on public.favoritos to authenticated;

-- ---------------------------------------------------------------------
-- 1) Alertas de búsqueda por correo
-- ---------------------------------------------------------------------
create table if not exists public.alertas (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  nombre       text not null check (char_length(nombre) between 2 and 160),
  filtros      jsonb not null check (jsonb_typeof(filtros) = 'object' and pg_column_size(filtros) < 4000),
  activa       boolean not null default true,
  creado       timestamptz not null default now(),
  ultimo_envio timestamptz not null default now(),
  token        uuid not null unique default gen_random_uuid()
);
create index if not exists alertas_activas_idx on public.alertas (activa) where activa;
alter table public.alertas enable row level security;
drop policy if exists "Mis alertas: ver" on public.alertas;
create policy "Mis alertas: ver" on public.alertas for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Mis alertas: crear" on public.alertas;
create policy "Mis alertas: crear" on public.alertas for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Mis alertas: cambiar" on public.alertas;
create policy "Mis alertas: cambiar" on public.alertas for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Mis alertas: borrar" on public.alertas;
create policy "Mis alertas: borrar" on public.alertas for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.alertas to authenticated;

-- Máximo 5 alertas por persona (para no gastar los correos gratis).
create or replace function public.alertas_antes_de_guardar()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(auth.uid(), new.user_id);
    new.ultimo_envio := now();
    new.token := gen_random_uuid();
    if (select count(*) from public.alertas where user_id = new.user_id) >= 5 then
      raise exception 'Puedes tener como máximo 5 alertas. Borra alguna para crear otra.';
    end if;
  else
    new.user_id := old.user_id; new.token := old.token; new.creado := old.creado;
    if coalesce(auth.role(), 'service_role') <> 'service_role' then new.ultimo_envio := old.ultimo_envio; end if;
  end if;
  return new;
end $function$;
drop trigger if exists alertas_antes_de_guardar on public.alertas;
create trigger alertas_antes_de_guardar before insert or update on public.alertas
  for each row execute function public.alertas_antes_de_guardar();

-- Darse de baja desde el enlace del correo (sin iniciar sesión).
create or replace function public.baja_alerta(p_token uuid)
returns text language sql security definer set search_path = '' as $function$
  update public.alertas set activa = false where token = p_token returning nombre
$function$;
grant execute on function public.baja_alerta(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Reportes de anuncios
-- ---------------------------------------------------------------------
create table if not exists public.reportes (
  id          uuid primary key default gen_random_uuid(),
  inmueble_id uuid not null references public.inmuebles(id) on delete cascade,
  motivo      text not null check (motivo in ('estafa', 'vendido', 'datos_falsos', 'duplicado', 'otro')),
  detalle     text check (char_length(detalle) <= 500),
  reportante  text not null check (char_length(reportante) between 8 and 64),  -- id de la cuenta o del navegador
  user_id     uuid default auth.uid(),
  creado      timestamptz not null default now(),
  unique (inmueble_id, reportante)
);
alter table public.reportes enable row level security;
drop policy if exists "Cualquiera puede reportar" on public.reportes;
create policy "Cualquiera puede reportar" on public.reportes for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
drop policy if exists "Solo admin ve reportes" on public.reportes;
create policy "Solo admin ve reportes" on public.reportes for select to authenticated using ((select public.is_admin()));
grant insert on public.reportes to anon, authenticated;
grant select on public.reportes to authenticated;

-- Con 3 reportes de personas distintas, el anuncio se pausa y queda «en revisión».
create or replace function public.reportes_despues()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if (select count(distinct reportante) from public.reportes where inmueble_id = new.inmueble_id) >= 3 then
    update public.inmuebles set activo = false, revision = 'reportado' where id = new.inmueble_id and activo;
  end if;
  return null;
end $function$;
drop trigger if exists reportes_despues on public.reportes;
create trigger reportes_despues after insert on public.reportes
  for each row execute function public.reportes_despues();

-- ---------------------------------------------------------------------
-- 8) Perfil público (por @usuario): solo nombre y usuario, nunca el correo
-- ---------------------------------------------------------------------
create or replace function public.perfil_por_usuario(p_usuario text)
returns table(id uuid, usuario text, nombre text) language sql stable security definer set search_path = '' as $function$
  select id, usuario, full_name from public.profiles where usuario = lower(trim(leading '@' from p_usuario)) limit 1
$function$;

-- ---------------------------------------------------------------------
-- Permisos de las funciones públicas
-- ---------------------------------------------------------------------
grant execute on function public.filtrar_inmuebles(text, text, text, text, numeric, numeric, integer, text, boolean, text, text, text,
  numeric, numeric, integer, boolean, boolean, boolean, integer, boolean) to anon, authenticated;
grant execute on function public.buscar_inmuebles(text, text, text, text, numeric, numeric, integer, text,
  double precision, double precision, double precision, double precision, text, integer, integer, boolean, text, text, text,
  numeric, numeric, integer, boolean, boolean, boolean, integer, boolean) to anon, authenticated;
grant execute on function public.conteos_busqueda(text, text, text, text, numeric, numeric, integer, text, boolean, text, text, text,
  numeric, numeric, integer, boolean, boolean, boolean, integer, boolean) to anon, authenticated;
grant execute on function public.mapa_inmuebles(text, text, text, text, numeric, numeric, integer, text,
  double precision, double precision, double precision, double precision, integer, boolean, text, text, text,
  numeric, numeric, integer, boolean, boolean, boolean, integer, boolean) to anon, authenticated;
grant execute on function public.similares(uuid, integer) to anon, authenticated;
grant execute on function public.precio_referencia(uuid) to anon, authenticated;
grant execute on function public.perfil_por_usuario(text) to anon, authenticated;
-- Las funciones de disparadores no se llaman desde fuera.
revoke execute on function public.alertas_antes_de_guardar() from public, anon, authenticated;
revoke execute on function public.reportes_despues() from public, anon, authenticated;

commit;
notify pgrst, 'reload schema';
