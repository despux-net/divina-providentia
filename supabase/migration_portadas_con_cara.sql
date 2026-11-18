-- Anuncios cuya foto de portada muestra a una persona (cartel de un agente):
-- siguen existiendo y apareciendo en búsquedas, pero van al final del orden
-- «recientes» (portada y buscador). Lo calcula scripts/portadas/revisar.py (detector de caras de OpenCV).

alter table public.inmuebles add column if not exists foto_huella text;
alter table public.inmuebles add column if not exists relegado boolean not null default false;
create index if not exists inmuebles_sin_huella on public.inmuebles (id) where foto_huella is null and activo and origen = 'externo';

create or replace function public.buscar_inmuebles(q text DEFAULT NULL::text, p_operacion text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text, p_estado text DEFAULT NULL::text, p_precio_min numeric DEFAULT NULL::numeric, p_precio_max numeric DEFAULT NULL::numeric, p_habitaciones integer DEFAULT NULL::integer, p_moneda text DEFAULT NULL::text, p_lat_min double precision DEFAULT NULL::double precision, p_lat_max double precision DEFAULT NULL::double precision, p_lng_min double precision DEFAULT NULL::double precision, p_lng_max double precision DEFAULT NULL::double precision, p_orden text DEFAULT 'recientes'::text, p_limite integer DEFAULT 24, p_desde integer DEFAULT 0, p_incluir_conceptos boolean DEFAULT false, p_categoria text DEFAULT NULL::text, p_etapa text DEFAULT NULL::text, p_rol text DEFAULT NULL::text, p_metros_min numeric DEFAULT NULL::numeric, p_metros_max numeric DEFAULT NULL::numeric, p_banos integer DEFAULT NULL::integer, p_estacionamiento boolean DEFAULT NULL::boolean, p_con_fotos boolean DEFAULT NULL::boolean, p_solo_vivinati boolean DEFAULT NULL::boolean, p_dias integer DEFAULT NULL::integer, p_bajo_precio boolean DEFAULT NULL::boolean)
 RETURNS SETOF inmuebles
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select i.* from public.filtrar_inmuebles(q, p_operacion, p_tipo, p_estado, p_precio_min, p_precio_max, p_habitaciones,
    p_moneda, p_incluir_conceptos, p_categoria, p_etapa, p_rol, p_metros_min, p_metros_max, p_banos,
    p_estacionamiento, p_con_fotos, p_solo_vivinati, p_dias, p_bajo_precio) i
  where (p_lat_min is null or i.lat between p_lat_min and p_lat_max)
    and (p_lng_min is null or i.lng between p_lng_min and p_lng_max)
  order by
    case when p_orden = 'precio_asc' then i.precio end asc nulls last,
    case when p_orden = 'precio_desc' then i.precio end desc nulls last,
    case when p_orden in ('recientes', 'relevancia') then i.relegado end asc,
    case when p_orden = 'relevancia' and nullif(trim(q),'') is not null
         then ts_rank(i.busqueda, websearch_to_tsquery('spanish', public.f_unaccent(q))) end desc nulls last,
    case when p_orden = 'bajadas' then i.precio_bajo_en end desc nulls last,
    i.creado desc
  limit least(greatest(p_limite, 1), 100) offset greatest(p_desde, 0)
$function$;

-- Portada: los anuncios más recientes, como mucho p_por_fuente por fuente
-- (Vivinati cuenta como una), sin conceptos, con foto, sin relegados y sin las
-- fuentes de p_excluir (siguen en el buscador, solo no abren la portada).
create or replace function public.portada_inmuebles(p_limite integer default 8, p_por_fuente integer default 1, p_excluir text[] default '{}')
returns setof public.inmuebles language sql stable set search_path to '' as $$
  select i.* from (
    select x.id, row_number() over (partition by coalesce(x.fuente, 'vivinati') order by x.creado desc) as n
    from public.inmuebles x
    where x.activo and x.operacion <> 'concepto' and not x.relegado and cardinality(x.fotos) > 0
      and (x.fuente is null or not (x.fuente = any (coalesce(p_excluir, '{}'))))
  ) i0
  join public.inmuebles i on i.id = i0.id
  where i0.n <= least(greatest(p_por_fuente, 1), 5)
  order by i.creado desc
  limit least(greatest(p_limite, 1), 24)
$$;
grant execute on function public.portada_inmuebles(integer, integer, text[]) to anon, authenticated;
