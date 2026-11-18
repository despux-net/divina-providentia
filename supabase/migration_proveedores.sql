-- Directorio de proveedores industriales de Venezuela (vivinati.com/industrial/proveedores.html).
-- Cada proveedor tiene su ficha con lo que vende, dónde está, sus marcas, su web
-- y los catálogos PDF que publica (enlazados a su web, no copiados). Si además
-- su web tiene fichas de producto, estas se indexan en «productos» con
-- fuente = fuente_productos. Lo mantiene scripts/industrial/ (clave de servicio).

create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  nombre text not null check (char_length(nombre) between 2 and 80),
  web text not null check (web ~ '^https://' and char_length(web) <= 300),
  descripcion text check (char_length(descripcion) <= 700),
  categorias text[] not null default '{}',
  marcas text[] not null default '{}' check (cardinality(marcas) <= 30),
  estado text check (char_length(estado) <= 40),
  ciudad text check (char_length(ciudad) <= 80),
  catalogos jsonb not null default '[]' check (jsonb_typeof(catalogos) = 'array'),
  fuente_productos text check (char_length(fuente_productos) <= 80),
  activo boolean not null default true,
  revisado_en timestamptz,
  creado timestamptz not null default now(),
  busqueda tsvector
);
create or replace function public.proveedores_antes() returns trigger language plpgsql set search_path to '' as $f$
begin
  new.busqueda :=
    setweight(to_tsvector('spanish', public.f_unaccent(coalesce(new.nombre, ''))), 'A') ||
    setweight(to_tsvector('spanish', public.f_unaccent(array_to_string(new.marcas, ' ') || ' ' || replace(array_to_string(new.categorias, ' '), '-', ' ') || ' ' || coalesce(new.estado, '') || ' ' || coalesce(new.ciudad, ''))), 'A') ||
    setweight(to_tsvector('spanish', public.f_unaccent(coalesce(new.descripcion, ''))), 'B');
  return new;
end $f$;
drop trigger if exists proveedores_antes on public.proveedores;
create trigger proveedores_antes before insert or update on public.proveedores for each row execute function public.proveedores_antes();
revoke all on function public.proveedores_antes() from public, anon, authenticated;
create index if not exists proveedores_busqueda on public.proveedores using gin (busqueda);
alter table public.proveedores enable row level security;
drop policy if exists proveedores_leer on public.proveedores;
create policy proveedores_leer on public.proveedores for select using (activo or public.is_admin());
drop policy if exists proveedores_admin on public.proveedores;
create policy proveedores_admin on public.proveedores for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.proveedores to anon, authenticated;
grant insert, update, delete on public.proveedores to authenticated;

-- Búsqueda del directorio, con cuántos productos suyos hay en Vivinati
create or replace function public.buscar_proveedores(q text default null, p_categoria text default null, p_estado text default null)
returns table(id uuid, slug text, nombre text, web text, descripcion text, categorias text[], marcas text[], estado text, ciudad text,
              catalogos jsonb, fuente_productos text, productos integer)
language sql stable set search_path to '' as $$
  select v.id, v.slug, v.nombre, v.web, v.descripcion, v.categorias, v.marcas, v.estado, v.ciudad, v.catalogos, v.fuente_productos,
         (select count(*)::int from public.productos p where p.fuente = v.fuente_productos and p.activo)
  from public.proveedores v
  where v.activo
    and (nullif(trim(q), '') is null or v.busqueda @@ websearch_to_tsquery('spanish', public.f_unaccent(q))
         or public.f_unaccent(lower(v.nombre)) like '%' || public.f_unaccent(lower(trim(q))) || '%')
    and (p_categoria is null or p_categoria = any (v.categorias))
    and (p_estado is null or v.estado = p_estado)
  order by (v.fuente_productos is not null) desc, jsonb_array_length(v.catalogos) desc, v.nombre
  limit 300
$$;
grant execute on function public.buscar_proveedores(text, text, text) to anon, authenticated;
