-- Carga masiva de anuncios (importar.html): referencia propia del anunciante
-- para actualizar con el mismo Excel, y límite de anuncios activos según el
-- tipo de perfil (30 particulares; 300 agentes, inmobiliarias y constructoras).

alter table public.inmuebles add column if not exists referencia text;
alter table public.inmuebles drop constraint if exists inmuebles_referencia_check;
alter table public.inmuebles add constraint inmuebles_referencia_check check (referencia is null or char_length(referencia) between 1 and 40);
alter table public.inmuebles drop constraint if exists inmuebles_referencia_unica;
alter table public.inmuebles add constraint inmuebles_referencia_unica unique (user_id, referencia);

create or replace function public.limite_anuncios(p_user uuid)
returns integer language sql stable security definer set search_path to '' as $$
  select case when exists (select 1 from public.profiles where id = p_user and tipo_perfil in ('agente', 'inmobiliaria', 'constructora'))
              then 300 else 30 end
$$;
grant execute on function public.limite_anuncios(uuid) to authenticated;

create or replace function public.inmuebles_antes_de_guardar()
returns trigger
language plpgsql security definer set search_path to ''
as $function$
declare
  es_servicio boolean := coalesce(auth.role(), 'service_role') = 'service_role';
  v_limite integer;
begin
  if not es_servicio and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.user_id := auth.uid();
      new.origen := 'usuario';
      new.fuente := null;
      new.url_original := null;
      new.creado := now();
      new.revision := null;
      v_limite := public.limite_anuncios(auth.uid());
      if (select count(*) from public.inmuebles where user_id = auth.uid() and activo) >= v_limite then
        raise exception 'Has llegado al máximo de % anuncios activos.', v_limite;
      end if;
    else
      new.user_id := old.user_id;
      new.origen := old.origen;
      new.fuente := old.fuente;
      new.url_original := old.url_original;
      new.creado := old.creado;
      new.prioridad := old.prioridad;
      if old.revision = 'oculto_admin' then
        new.activo := false; new.revision := old.revision;
      else
        new.revision := case when new.activo and not old.activo then null else old.revision end;
      end if;
    end if;
  end if;

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
