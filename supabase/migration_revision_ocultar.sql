-- =====================================================================
-- Vivinati · Revisión de reportes: opción «ocultar»
--   ocultar → el anuncio deja de verse, pero NO se borra. Su dueño no
--             puede volver a activarlo; solo tú (eligiendo «mantener»).
-- =====================================================================
alter type public.decision_reporte add value if not exists 'ocultar' after 'eliminar';

alter table public.inmuebles drop constraint if exists inmuebles_revision_check;
alter table public.inmuebles add constraint inmuebles_revision_check check (revision is null or revision in ('reportado', 'oculto_admin'));

-- Disparador de inmuebles: igual que antes, pero un anuncio ocultado por
-- el administrador no lo puede reactivar su dueño.
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
      if old.revision = 'oculto_admin' then
        new.activo := false; new.revision := old.revision;          -- solo el administrador lo reactiva
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

-- Al cambiar «decision» en revision_reportes.
create or replace function public.revision_decidir()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare i public.inmuebles;
begin
  if new.decision is not distinct from old.decision then return new; end if;
  select * into i from public.inmuebles where id = new.inmueble_id;
  if new.decision = 'eliminar' then
    if i.id is not null then
      if i.origen = 'externo' and i.url_original is not null then
        insert into public.bloqueados (url_original, motivo) values (i.url_original, 'Reportado: ' || coalesce(new.motivos, ''))
        on conflict (url_original) do nothing;
      end if;
      delete from public.inmuebles where id = i.id;
    end if;
    new.estado_anuncio := 'Eliminado';
  elsif new.decision = 'ocultar' then
    if i.id is not null and i.origen = 'externo' and i.url_original is not null then
      insert into public.bloqueados (url_original, motivo) values (i.url_original, 'Ocultado: ' || coalesce(new.motivos, ''))
      on conflict (url_original) do nothing;
    end if;
    update public.inmuebles set activo = false, revision = 'oculto_admin' where id = new.inmueble_id;
    new.estado_anuncio := 'Oculto (por el administrador)';
  elsif new.decision = 'mantener' then
    delete from public.bloqueados where url_original = i.url_original;
    delete from public.reportes where inmueble_id = new.inmueble_id;
    update public.inmuebles set activo = true, revision = null where id = new.inmueble_id;
    new.estado_anuncio := 'Visible (revisado)';
    new.num_reportes := 0;
  end if;
  new.decidido_en := case when new.decision = 'pendiente' then null else now() end;
  return new;
end $function$;

comment on column public.revision_reportes.decision is
  'pendiente · ocultar (deja de verse, no se borra) · eliminar (se borra) · mantener (vuelve a verse y se borran sus reportes)';
