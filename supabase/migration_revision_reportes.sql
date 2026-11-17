-- =====================================================================
-- Vivinati · Revisión de anuncios reportados
--
-- Tabla «revision_reportes»: UNA fila por anuncio reportado, con su
-- título, enlace, cuántas veces lo reportaron, los motivos y los
-- comentarios. Se rellena sola cada vez que alguien pulsa «Reportar».
--
-- Para decidir, en Supabase → Table Editor → revision_reportes, cambia la
-- columna «decision» (lista desplegable) y guarda:
--   eliminar  → el anuncio se borra de Vivinati. Si venía de otra web, su
--               dirección queda bloqueada para que el indexador no lo
--               vuelva a mostrar.
--   mantener  → el anuncio vuelve a estar visible y se borran sus reportes.
--   pendiente → (por defecto) sin decidir.
-- =====================================================================

do $$ begin
  create type public.decision_reporte as enum ('pendiente', 'eliminar', 'mantener');
exception when duplicate_object then null; end $$;

create table if not exists public.revision_reportes (
  inmueble_id       uuid primary key,
  decision          public.decision_reporte not null default 'pendiente',
  titulo            text,
  enlace            text,
  num_reportes      integer not null default 0,
  motivos           text,
  comentarios       text,
  estado_anuncio    text,
  origen            text,
  web_original      text,
  publicado_por     text,
  primer_reporte    timestamptz,
  ultimo_reporte    timestamptz,
  decidido_en       timestamptz
);
comment on table public.revision_reportes is
  'Anuncios reportados. Cambia «decision» a eliminar o mantener y guarda: la base de datos hace el resto.';
comment on column public.revision_reportes.decision is 'pendiente · eliminar (borra el anuncio) · mantener (lo vuelve a mostrar y borra sus reportes)';
alter table public.revision_reportes enable row level security;
drop policy if exists "Solo admin" on public.revision_reportes;
create policy "Solo admin" on public.revision_reportes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create index if not exists revision_reportes_pendientes_idx on public.revision_reportes (decision, ultimo_reporte desc);

-- Direcciones de otras webs que no se deben volver a mostrar.
create table if not exists public.bloqueados (
  url_original text primary key,
  motivo       text,
  creado       timestamptz not null default now()
);
alter table public.bloqueados enable row level security;
drop policy if exists "Solo admin" on public.bloqueados;
create policy "Solo admin" on public.bloqueados for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Rehace la fila de revisión de un anuncio con sus reportes actuales.
create or replace function public.actualizar_revision(p_inmueble uuid)
returns void language sql security definer set search_path = '' as $function$
  insert into public.revision_reportes as r (inmueble_id, titulo, enlace, num_reportes, motivos, comentarios,
    estado_anuncio, origen, web_original, publicado_por, primer_reporte, ultimo_reporte)
  select i.id, i.titulo, 'https://vivinati.com/anuncio.html?id=' || i.id,
    (select count(*) from public.reportes x where x.inmueble_id = i.id),
    (select string_agg(m.motivo || ' (' || m.n || ')', ', ' order by m.n desc)
       from (select case x.motivo when 'estafa' then 'Estafa' when 'vendido' then 'Ya vendido/alquilado'
                    when 'datos_falsos' then 'Datos falsos' when 'duplicado' then 'Repetido' else 'Otro' end as motivo,
                    count(*) n from public.reportes x where x.inmueble_id = i.id group by 1) m),
    (select string_agg(x.detalle, ' | ' order by x.creado desc) from public.reportes x where x.inmueble_id = i.id and x.detalle is not null),
    case when i.activo then 'Visible' when i.revision = 'reportado' then 'Pausado por reportes' else 'Pausado' end,
    case i.origen when 'usuario' then 'Publicado en Vivinati' else 'Otra web: ' || coalesce(i.fuente, '?') end,
    i.url_original,
    (select '@' || p.usuario from public.profiles p where p.id = i.user_id),
    (select min(x.creado) from public.reportes x where x.inmueble_id = i.id),
    (select max(x.creado) from public.reportes x where x.inmueble_id = i.id)
  from public.inmuebles i where i.id = p_inmueble
  on conflict (inmueble_id) do update set
    titulo = excluded.titulo, enlace = excluded.enlace, num_reportes = excluded.num_reportes,
    motivos = excluded.motivos, comentarios = excluded.comentarios, estado_anuncio = excluded.estado_anuncio,
    origen = excluded.origen, web_original = excluded.web_original, publicado_por = excluded.publicado_por,
    primer_reporte = excluded.primer_reporte, ultimo_reporte = excluded.ultimo_reporte,
    -- un reporte nuevo sobre algo que ya se había «mantenido» vuelve a pendiente
    decision = case when r.decision = 'mantener' then 'pendiente'::public.decision_reporte else r.decision end
$function$;

-- Cada reporte: pausa con 3 personas distintas (como antes) y actualiza la revisión.
create or replace function public.reportes_despues()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if (select count(distinct reportante) from public.reportes where inmueble_id = new.inmueble_id) >= 3 then
    update public.inmuebles set activo = false, revision = 'reportado' where id = new.inmueble_id and activo;
  end if;
  perform public.actualizar_revision(new.inmueble_id);
  return null;
end $function$;

-- Al cambiar «decision»: se aplica.
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
      delete from public.inmuebles where id = i.id;          -- también borra sus reportes
    end if;
    new.estado_anuncio := 'Eliminado';
  elsif new.decision = 'mantener' then
    delete from public.reportes where inmueble_id = new.inmueble_id;
    update public.inmuebles set activo = true, revision = null where id = new.inmueble_id;
    new.estado_anuncio := 'Visible (revisado)';
    new.num_reportes := 0;
  end if;
  new.decidido_en := case when new.decision = 'pendiente' then null else now() end;
  return new;
end $function$;
drop trigger if exists revision_decidir on public.revision_reportes;
create trigger revision_decidir before update of decision on public.revision_reportes
  for each row execute function public.revision_decidir();

-- El indexador no puede volver a mostrar lo que se eliminó (queda oculto).
create or replace function public.inmuebles_bloqueados()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.origen = 'externo' and new.url_original is not null
     and exists (select 1 from public.bloqueados b where b.url_original = new.url_original) then
    new.activo := false;
  end if;
  return new;
end $function$;
drop trigger if exists inmuebles_bloqueados on public.inmuebles;
create trigger inmuebles_bloqueados before insert or update on public.inmuebles
  for each row execute function public.inmuebles_bloqueados();

revoke execute on function public.actualizar_revision(uuid) from public, anon, authenticated;
revoke execute on function public.revision_decidir() from public, anon, authenticated;
revoke execute on function public.inmuebles_bloqueados() from public, anon, authenticated;

-- Lo que ya estuviera reportado entra en la tabla.
select public.actualizar_revision(inmueble_id) from (select distinct inmueble_id from public.reportes) x;
