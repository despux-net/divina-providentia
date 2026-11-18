-- Vivinati Industrial también muestra productos de proveedores venezolanos
-- que los publican en su propia web (como Real Estate con las inmobiliarias):
-- origen 'externo', sin cuenta dueña, con enlace a la web original.
-- Lo llena scripts/industrial/indexar.mjs (clave de servicio).

alter table public.productos alter column user_id drop not null;
alter table public.productos
  add column if not exists origen text not null default 'usuario' check (origen in ('usuario', 'externo')),
  add column if not exists fuente text check (char_length(fuente) <= 80),
  add column if not exists url_original text check (url_original is null or (url_original ~ '^https://' and char_length(url_original) <= 500)),
  add column if not exists visto_en timestamptz;
alter table public.productos drop constraint if exists productos_url_original_unica;
alter table public.productos add constraint productos_url_original_unica unique (url_original);
create index if not exists productos_fuente on public.productos (fuente) where origen = 'externo';
alter table public.productos drop constraint if exists productos_origen_coherente;
alter table public.productos add constraint productos_origen_coherente check (
  (origen = 'usuario' and user_id is not null and fuente is null and url_original is null)
  or (origen = 'externo' and user_id is null and fuente is not null and url_original is not null and whatsapp is null));

-- Categoría nueva: automatización y neumática
alter table public.productos drop constraint if exists productos_categoria_check;
alter table public.productos add constraint productos_categoria_check check (categoria in ('maquinaria-pesada', 'maquinaria-industrial',
  'automatizacion', 'herramientas', 'materiales', 'materias-primas', 'energia', 'repuestos', 'seguridad', 'logistica', 'agroindustria', 'servicios', 'otros'));

-- Quien publica desde la web nunca puede crear «externos» ni tocar su origen
do $$ begin
  execute replace(pg_get_functiondef('public.productos_antes_de_guardar'::regproc),
    'new.user_id := auth.uid();',
    'new.user_id := auth.uid(); new.origen := ''usuario''; new.fuente := null; new.url_original := null; new.visto_en := null;');
  execute replace(pg_get_functiondef('public.productos_antes_de_guardar'::regproc),
    'new.user_id := old.user_id;',
    'new.user_id := old.user_id; new.origen := old.origen; new.fuente := old.fuente; new.url_original := old.url_original;');
end $$;
revoke all on function public.productos_antes_de_guardar() from public, anon, authenticated;

-- Portada de Industrial: lo más reciente, como mucho p_por_fuente por fuente
-- (lo publicado en Vivinati cuenta como una), y primero lo publicado en Vivinati.
create or replace function public.portada_productos(p_limite integer default 8, p_por_fuente integer default 2)
returns setof public.productos language sql stable set search_path to '' as $$
  select p.* from (
    select x.id, row_number() over (partition by coalesce(x.fuente, 'vivinati') order by x.creado desc) as n
    from public.productos x where x.activo and cardinality(x.fotos) > 0
  ) o join public.productos p on p.id = o.id
  where o.n <= least(greatest(p_por_fuente, 1), 6)
  order by (p.origen = 'usuario') desc, p.creado desc
  limit least(greatest(p_limite, 1), 24)
$$;
grant execute on function public.portada_productos(integer, integer) to anon, authenticated;

-- La fuente también se busca por texto («FRASAM», «Camozzi»)
do $$ begin
  execute replace(pg_get_functiondef('public.productos_antes_de_guardar'::regproc),
    'concat_ws('' '', new.marca, new.modelo,', 'concat_ws('' '', new.fuente, new.marca, new.modelo,');
end $$;
revoke all on function public.productos_antes_de_guardar() from public, anon, authenticated;
