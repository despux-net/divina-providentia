-- «Busco inmueble»: personas registradas publican lo que buscan y los
-- anunciantes les escriben por el chat. Caducan a los 60 días; máximo 5
-- activas por persona. Se pueden ocultar desde Supabase (activo = false).

create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  operacion text not null check (operacion in ('venta', 'alquiler')),
  tipo text check (tipo is null or tipo in ('apartamento','casa','townhouse','anexo','habitacion','terreno','local','oficina','galpon','otro')),
  estado text not null check (length(estado) between 3 and 40),
  zona text check (zona is null or length(zona) <= 80),
  presupuesto numeric check (presupuesto is null or (presupuesto > 0 and presupuesto < 100000000)),
  habitaciones integer check (habitaciones is null or habitaciones between 0 and 20),
  descripcion text not null check (length(trim(descripcion)) between 20 and 800),
  activo boolean not null default true,
  creado timestamptz not null default now(),
  expira timestamptz not null default now() + interval '60 days'
);
create index if not exists solicitudes_activas on public.solicitudes (creado desc) where activo;

alter table public.solicitudes enable row level security;
drop policy if exists "Solicitudes: ver activas o propias" on public.solicitudes;
create policy "Solicitudes: ver activas o propias" on public.solicitudes for select
  using ((activo and expira > now()) or user_id = auth.uid() or public.is_admin());
drop policy if exists "Solicitudes: crear propias" on public.solicitudes;
create policy "Solicitudes: crear propias" on public.solicitudes for insert
  with check (user_id = auth.uid());
drop policy if exists "Solicitudes: cambiar propias" on public.solicitudes;
create policy "Solicitudes: cambiar propias" on public.solicitudes for update
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "Solicitudes: borrar propias" on public.solicitudes;
create policy "Solicitudes: borrar propias" on public.solicitudes for delete
  using (user_id = auth.uid() or public.is_admin());
grant select on public.solicitudes to anon, authenticated;
grant insert, update, delete on public.solicitudes to authenticated;

-- Límite: 5 activas por persona; necesita @usuario (para que le puedan escribir).
create or replace function public.solicitudes_antes()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.profiles where id = new.user_id and usuario is not null) then
      raise exception 'Elige un @usuario en tu perfil antes de publicar.';
    end if;
    if (select count(*) from public.solicitudes where user_id = new.user_id and activo and expira > now()) >= 5 then
      raise exception 'Puedes tener como máximo 5 búsquedas publicadas.';
    end if;
    new.creado := now(); new.expira := now() + interval '60 days'; new.activo := true;
  else
    -- Al reactivar, se renueva el plazo de 60 días.
    if new.activo and not old.activo then new.expira := now() + interval '60 days'; end if;
    new.user_id := old.user_id; new.creado := old.creado;
  end if;
  return new;
end $$;
drop trigger if exists solicitudes_antes on public.solicitudes;
create trigger solicitudes_antes before insert or update on public.solicitudes
  for each row execute function public.solicitudes_antes();

-- Lista pública con el autor (nombre, @usuario, foto, estrellas).
create or replace function public.solicitudes_publicas(
  p_operacion text default null, p_estado text default null, p_tipo text default null,
  p_limite integer default 30, p_desde integer default 0)
returns table(id uuid, user_id uuid, operacion text, tipo text, estado text, zona text, presupuesto numeric,
              habitaciones integer, descripcion text, creado timestamptz,
              usuario text, nombre text, avatar_url text, estrellas numeric, valoraciones integer)
language sql stable security definer set search_path to '' as $$
  select s.id, s.user_id, s.operacion, s.tipo, s.estado, s.zona, s.presupuesto, s.habitaciones, s.descripcion, s.creado,
         p.usuario, p.full_name, p.avatar_url,
         (select round(avg(v.estrellas)::numeric, 1) from public.valoraciones v where v.usuario_id = s.user_id),
         (select count(*)::int from public.valoraciones v where v.usuario_id = s.user_id)
  from public.solicitudes s join public.profiles p on p.id = s.user_id
  where s.activo and s.expira > now()
    and (p_operacion is null or s.operacion = p_operacion)
    and (p_estado is null or s.estado = p_estado)
    and (p_tipo is null or s.tipo = p_tipo)
  order by s.creado desc
  limit least(greatest(p_limite, 1), 60) offset greatest(p_desde, 0)
$$;
grant execute on function public.solicitudes_publicas(text, text, text, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------
-- «Cerca de»: lugares cercanos (OpenStreetMap) guardados por zona de ~500 m.
-- Los rellena scripts/cercanias/generar.mjs (GitHub Actions, con calma).
create table if not exists public.cercanias (
  celda text primary key,
  datos jsonb not null default '[]'::jsonb,
  actualizado timestamptz not null default now()
);
alter table public.cercanias enable row level security;
drop policy if exists "Cercanías: lectura pública" on public.cercanias;
create policy "Cercanías: lectura pública" on public.cercanias for select using (true);
grant select on public.cercanias to anon, authenticated;

-- ---------------------------------------------------------------
-- Pin rojo de la demanda: zona donde busca la persona (redondeada a ~100 m).
alter table public.solicitudes
  add column if not exists lat double precision,
  add column if not exists lng double precision;
alter table public.solicitudes drop constraint if exists solicitudes_pin_venezuela;
alter table public.solicitudes add constraint solicitudes_pin_venezuela check (
  (lat is null and lng is null) or (lat between 0.5 and 12.6 and lng between -73.5 and -59.5));

create or replace function public.solicitudes_redondear_pin()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.lat is not null then new.lat := round(new.lat::numeric, 3); end if;
  if new.lng is not null then new.lng := round(new.lng::numeric, 3); end if;
  return new;
end $$;
drop trigger if exists solicitudes_redondear_pin on public.solicitudes;
create trigger solicitudes_redondear_pin before insert or update on public.solicitudes
  for each row execute function public.solicitudes_redondear_pin();

drop function if exists public.solicitudes_publicas(text, text, text, integer, integer);
create function public.solicitudes_publicas(
  p_operacion text default null, p_estado text default null, p_tipo text default null,
  p_limite integer default 30, p_desde integer default 0)
returns table(id uuid, user_id uuid, operacion text, tipo text, estado text, zona text, presupuesto numeric,
              habitaciones integer, descripcion text, creado timestamptz, lat double precision, lng double precision,
              usuario text, nombre text, avatar_url text, estrellas numeric, valoraciones integer)
language sql stable security definer set search_path to '' as $$
  select s.id, s.user_id, s.operacion, s.tipo, s.estado, s.zona, s.presupuesto, s.habitaciones, s.descripcion, s.creado,
         s.lat, s.lng, p.usuario, p.full_name, p.avatar_url,
         (select round(avg(v.estrellas)::numeric, 1) from public.valoraciones v where v.usuario_id = s.user_id),
         (select count(*)::int from public.valoraciones v where v.usuario_id = s.user_id)
  from public.solicitudes s join public.profiles p on p.id = s.user_id
  where s.activo and s.expira > now()
    and (p_operacion is null or s.operacion = p_operacion)
    and (p_estado is null or s.estado = p_estado)
    and (p_tipo is null or s.tipo = p_tipo)
  order by s.creado desc
  limit least(greatest(p_limite, 1), 60) offset greatest(p_desde, 0)
$$;
grant execute on function public.solicitudes_publicas(text, text, text, integer, integer) to anon, authenticated;

-- Puntos rojos para los mapas (hasta 1.000, solo las que tienen pin).
create or replace function public.mapa_solicitudes(
  p_operacion text default null, p_estado text default null, p_tipo text default null)
returns table(id uuid, user_id uuid, operacion text, tipo text, estado text, zona text, presupuesto numeric,
              habitaciones integer, descripcion text, creado timestamptz, lat double precision, lng double precision,
              usuario text, nombre text)
language sql stable security definer set search_path to '' as $$
  select s.id, s.user_id, s.operacion, s.tipo, s.estado, s.zona, s.presupuesto, s.habitaciones, left(s.descripcion, 160),
         s.creado, s.lat, s.lng, p.usuario, p.full_name
  from public.solicitudes s join public.profiles p on p.id = s.user_id
  where s.activo and s.expira > now() and s.lat is not null and s.lng is not null
    and (p_operacion is null or s.operacion = p_operacion)
    and (p_estado is null or s.estado = p_estado)
    and (p_tipo is null or s.tipo = p_tipo)
  order by s.creado desc
  limit 1000
$$;
grant execute on function public.mapa_solicitudes(text, text, text) to anon, authenticated;
