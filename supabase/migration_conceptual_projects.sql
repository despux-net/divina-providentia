-- =====================================================================
-- Vivinati · Tercera vertical: «Conceptos 3D» (proyectos conceptuales)
-- Pegar entero en Supabase → SQL Editor → Run. Se puede ejecutar más de
-- una vez sin romper nada (usa IF EXISTS / IF NOT EXISTS / OR REPLACE).
--
-- Decisión: los proyectos van en la MISMA tabla public.inmuebles con
-- operacion = 'concepto'. Así reutilizan la subida de fotos (bucket
-- «inmuebles»), las cuentas, la RLS, el contacto y la ficha de detalle.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Columnas nuevas (todas opcionales; solo se usan en conceptos)
-- ---------------------------------------------------------------------
alter table public.inmuebles
  add column if not exists etapa              text,    -- conceptual | tesis | anteproyecto | infraestructura
  add column if not exists rol_autor          text,    -- estudiante | arquitecto | emprendedor | estudio
  add column if not exists institucion        text,    -- universidad o estudio (opcional)
  add column if not exists categoria_proyecto text,    -- residencial | urbano | infraestructura | comercial
  add column if not exists url_3d             text,    -- Sketchfab, Behance, etc. (opcional)
  add column if not exists herramientas       text[];  -- Revit, Blender, AutoCAD… (opcional)

comment on column public.inmuebles.etapa              is 'Solo conceptos: conceptual, tesis, anteproyecto o infraestructura';
comment on column public.inmuebles.rol_autor          is 'Solo conceptos: estudiante, arquitecto, emprendedor o estudio';
comment on column public.inmuebles.institucion        is 'Solo conceptos: universidad o estudio (opcional)';
comment on column public.inmuebles.categoria_proyecto is 'Solo conceptos: residencial, urbano, infraestructura o comercial';
comment on column public.inmuebles.url_3d             is 'Solo conceptos: enlace https al modelo 3D externo (opcional)';
comment on column public.inmuebles.herramientas       is 'Solo conceptos: programas usados (opcional)';

-- ---------------------------------------------------------------------
-- 2) Restricciones (CHECK)
-- ---------------------------------------------------------------------
alter table public.inmuebles drop constraint if exists inmuebles_operacion_check;
alter table public.inmuebles add  constraint inmuebles_operacion_check
  check (operacion in ('venta', 'alquiler', 'concepto'));

alter table public.inmuebles drop constraint if exists inmuebles_etapa_check;
alter table public.inmuebles add  constraint inmuebles_etapa_check
  check (etapa is null or etapa in ('conceptual', 'tesis', 'anteproyecto', 'infraestructura'));

alter table public.inmuebles drop constraint if exists inmuebles_rol_autor_check;
alter table public.inmuebles add  constraint inmuebles_rol_autor_check
  check (rol_autor is null or rol_autor in ('estudiante', 'arquitecto', 'emprendedor', 'estudio'));

alter table public.inmuebles drop constraint if exists inmuebles_categoria_proyecto_check;
alter table public.inmuebles add  constraint inmuebles_categoria_proyecto_check
  check (categoria_proyecto is null or categoria_proyecto in ('residencial', 'urbano', 'infraestructura', 'comercial'));

alter table public.inmuebles drop constraint if exists inmuebles_institucion_check;
alter table public.inmuebles add  constraint inmuebles_institucion_check
  check (institucion is null or char_length(institucion) <= 100);

alter table public.inmuebles drop constraint if exists inmuebles_url_3d_check;
alter table public.inmuebles add  constraint inmuebles_url_3d_check
  check (url_3d is null or (url_3d ~ '^https://' and char_length(url_3d) <= 500));

alter table public.inmuebles drop constraint if exists inmuebles_herramientas_check;
alter table public.inmuebles add  constraint inmuebles_herramientas_check
  check (herramientas is null or (cardinality(herramientas) <= 12 and char_length(array_to_string(herramientas, ',')) <= 400));

-- Un concepto no tiene precio, lo publica una persona (no el indexador)
-- y lleva etapa, rol del autor y categoría.
alter table public.inmuebles drop constraint if exists inmuebles_concepto_coherente;
alter table public.inmuebles add  constraint inmuebles_concepto_coherente
  check (operacion <> 'concepto' or (
    precio is null and origen = 'usuario'
    and etapa is not null and rol_autor is not null and categoria_proyecto is not null));

-- Venta y alquiler no llevan campos de portafolio.
alter table public.inmuebles drop constraint if exists inmuebles_campos_solo_concepto;
alter table public.inmuebles add  constraint inmuebles_campos_solo_concepto
  check (operacion = 'concepto' or (
    etapa is null and rol_autor is null and institucion is null
    and categoria_proyecto is null and url_3d is null and herramientas is null));

create index if not exists inmuebles_conceptos_idx
  on public.inmuebles (creado desc) where operacion = 'concepto' and activo;

-- ---------------------------------------------------------------------
-- 3) Disparador: el buscador de texto también encuentra por
--    universidad/estudio, categoría y herramientas.
--    (Igual que el actual + una línea nueva en «busqueda».)
-- ---------------------------------------------------------------------
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
-- 4) Funciones de búsqueda.
--    Regla: Comprar/Alquilar (y «Venta y alquiler») NUNCA muestran
--    conceptos, salvo p_incluir_conceptos = true. Con p_operacion =
--    'concepto' solo salen conceptos. Filtros nuevos: categoría, etapa
--    y rol del autor. Se borran las versiones viejas para no dejar dos
--    funciones con el mismo nombre (la web usa parámetros con nombre).
-- ---------------------------------------------------------------------
drop function if exists public.buscar_inmuebles(text, text, text, text, numeric, numeric, integer, text,
  double precision, double precision, double precision, double precision, text, integer, integer);
drop function if exists public.conteos_busqueda(text, text, text, text, numeric, numeric, integer, text);
drop function if exists public.mapa_inmuebles(text, text, text, text, numeric, numeric, integer, text,
  double precision, double precision, double precision, double precision, integer);
drop function if exists public.estadisticas_publicas();

create or replace function public.buscar_inmuebles(
  q text default null, p_operacion text default null, p_tipo text default null, p_estado text default null,
  p_precio_min numeric default null, p_precio_max numeric default null, p_habitaciones integer default null,
  p_moneda text default null,
  p_lat_min double precision default null, p_lat_max double precision default null,
  p_lng_min double precision default null, p_lng_max double precision default null,
  p_orden text default 'recientes', p_limite integer default 24, p_desde integer default 0,
  p_incluir_conceptos boolean default false, p_categoria text default null,
  p_etapa text default null, p_rol text default null)
returns setof public.inmuebles language sql stable set search_path = '' as $function$
  select i.* from public.inmuebles i
  where i.activo
    and not exists (
      select 1 from public.inmuebles j
      where j.huella = i.huella and j.activo and j.id <> i.id
        and (j.prioridad > i.prioridad or (j.prioridad = i.prioridad and (j.creado, j.id) < (i.creado, i.id))))
    and (nullif(trim(q),'') is null
         or i.busqueda @@ websearch_to_tsquery('spanish', public.f_unaccent(q)))
    and (case when p_operacion is null then i.operacion <> 'concepto' or coalesce(p_incluir_conceptos, false)
              else i.operacion = p_operacion or (coalesce(p_incluir_conceptos, false) and i.operacion = 'concepto') end)
    and (p_tipo is null or i.tipo = p_tipo)
    and (p_estado is null or i.estado = p_estado)
    and (p_moneda is null or i.moneda = p_moneda)
    and (p_precio_min is null or i.precio >= p_precio_min)
    and (p_precio_max is null or i.precio <= p_precio_max)
    and (p_habitaciones is null or i.habitaciones >= p_habitaciones)
    and (p_lat_min is null or i.lat between p_lat_min and p_lat_max)
    and (p_lng_min is null or i.lng between p_lng_min and p_lng_max)
    and (p_categoria is null or i.categoria_proyecto = p_categoria)
    and (p_etapa is null or i.etapa = p_etapa)
    and (p_rol is null or i.rol_autor = p_rol)
  order by
    case when p_orden = 'precio_asc' then i.precio end asc nulls last,
    case when p_orden = 'precio_desc' then i.precio end desc nulls last,
    case when p_orden = 'relevancia' and nullif(trim(q),'') is not null
         then ts_rank(i.busqueda, websearch_to_tsquery('spanish', public.f_unaccent(q))) end desc nulls last,
    i.creado desc
  limit least(greatest(p_limite, 1), 100) offset greatest(p_desde, 0)
$function$;

create or replace function public.conteos_busqueda(
  q text default null, p_operacion text default null, p_tipo text default null, p_estado text default null,
  p_precio_min numeric default null, p_precio_max numeric default null, p_habitaciones integer default null,
  p_moneda text default null,
  p_incluir_conceptos boolean default false, p_categoria text default null,
  p_etapa text default null, p_rol text default null)
returns json language sql stable set search_path = '' as $function$
  with base as (
    select i.tipo, i.estado from public.inmuebles i
    where i.activo
      and not exists (
        select 1 from public.inmuebles j
        where j.huella = i.huella and j.activo and j.id <> i.id
          and (j.prioridad > i.prioridad or (j.prioridad = i.prioridad and (j.creado, j.id) < (i.creado, i.id))))
      and (nullif(trim(q),'') is null or i.busqueda @@ websearch_to_tsquery('spanish', public.f_unaccent(q)))
      and (case when p_operacion is null then i.operacion <> 'concepto' or coalesce(p_incluir_conceptos, false)
                else i.operacion = p_operacion or (coalesce(p_incluir_conceptos, false) and i.operacion = 'concepto') end)
      and (p_moneda is null or i.moneda = p_moneda)
      and (p_precio_min is null or i.precio >= p_precio_min)
      and (p_precio_max is null or i.precio <= p_precio_max)
      and (p_habitaciones is null or i.habitaciones >= p_habitaciones)
      and (p_categoria is null or i.categoria_proyecto = p_categoria)
      and (p_etapa is null or i.etapa = p_etapa)
      and (p_rol is null or i.rol_autor = p_rol)
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
  p_etapa text default null, p_rol text default null)
returns table(id uuid, lat double precision, lng double precision, precio numeric, moneda text, operacion text,
  tipo text, titulo text, foto text, zona text, ciudad text, estado text)
language sql stable set search_path = '' as $function$
  select i.id, i.lat, i.lng, i.precio, i.moneda, i.operacion, i.tipo, i.titulo, i.fotos[1], i.zona, i.ciudad, i.estado
  from public.inmuebles i
  where i.activo and i.lat is not null and i.lng is not null
    and i.lat between p_lat_min and p_lat_max and i.lng between p_lng_min and p_lng_max
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
  order by i.creado desc
  limit least(greatest(p_limite, 1), 3000)
$function$;

-- Cifras de la portada: «anuncios» cuenta solo venta y alquiler;
-- «conceptos» es el número de proyectos 3D publicados.
create or replace function public.estadisticas_publicas()
returns table(anuncios bigint, fuentes bigint, estados bigint, con_mapa bigint, conceptos bigint)
language sql stable set search_path = '' as $function$
  select count(*) filter (where operacion <> 'concepto'),
         count(distinct coalesce(fuente, 'Vivinati')),
         count(distinct estado),
         count(*) filter (where lat is not null and operacion <> 'concepto'),
         count(*) filter (where operacion = 'concepto')
  from public.inmuebles where activo
$function$;

grant execute on function public.buscar_inmuebles(text, text, text, text, numeric, numeric, integer, text,
  double precision, double precision, double precision, double precision, text, integer, integer,
  boolean, text, text, text) to anon, authenticated;
grant execute on function public.conteos_busqueda(text, text, text, text, numeric, numeric, integer, text,
  boolean, text, text, text) to anon, authenticated;
grant execute on function public.mapa_inmuebles(text, text, text, text, numeric, numeric, integer, text,
  double precision, double precision, double precision, double precision, integer,
  boolean, text, text, text) to anon, authenticated;
grant execute on function public.estadisticas_publicas() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) Seguridad (RLS). Las políticas actuales ya cubren los conceptos:
--    cualquiera lee lo activo; con sesión se publica, edita y borra lo
--    propio. Se vuelven a declarar aquí, idénticas, para que quede
--    explícito y el archivo sea autosuficiente.
-- ---------------------------------------------------------------------
alter table public.inmuebles enable row level security;

drop policy if exists "Ver anuncios activos o propios" on public.inmuebles;
create policy "Ver anuncios activos o propios" on public.inmuebles for select to public
  using (activo or user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Publicar con sesión" on public.inmuebles;
create policy "Publicar con sesión" on public.inmuebles for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Editar los propios" on public.inmuebles;
create policy "Editar los propios" on public.inmuebles for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Borrar los propios" on public.inmuebles;
create policy "Borrar los propios" on public.inmuebles for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

commit;

-- Para que la API vea al instante las funciones nuevas:
notify pgrst, 'reload schema';
