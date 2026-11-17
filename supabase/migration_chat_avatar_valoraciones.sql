-- =====================================================================
-- Vivinati · Avatares, valoraciones con estrellas y chat cifrado de
-- extremo a extremo entre usuarios.
--
-- Cifrado: cada persona crea en SU navegador un par de claves ECDH P-256.
-- Aquí solo se guarda la clave PÚBLICA y una copia de la privada cifrada
-- con una clave derivada de su contraseña (PBKDF2), que el servidor nunca
-- ve. Los mensajes se guardan cifrados con AES-GCM: la base de datos solo
-- ve quién habla con quién y cuándo, nunca el texto.
-- =====================================================================

-- ---------- Avatar ----------
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles drop constraint if exists profiles_avatar_propio;
alter table public.profiles add constraint profiles_avatar_propio
  check (avatar_url is null or (split_part(avatar_url, '/', 1) = id::text and avatar_url ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}\.(webp|jpg)$'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 307200, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 307200, allowed_mime_types = array['image/webp', 'image/jpeg'];

drop policy if exists "Avatar: subir el propio" on storage.objects;
create policy "Avatar: subir el propio" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Avatar: cambiar el propio" on storage.objects;
create policy "Avatar: cambiar el propio" on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Avatar: borrar el propio" on storage.objects;
create policy "Avatar: borrar el propio" on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- Chat: claves ----------
create table if not exists public.claves_publicas (
  user_id     uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  jwk         jsonb not null check (jwk->>'kty' = 'EC' and jwk->>'crv' = 'P-256' and not (jwk ? 'd')),  -- nunca la privada
  actualizado timestamptz not null default now()
);
alter table public.claves_publicas enable row level security;
drop policy if exists "Claves públicas: leer" on public.claves_publicas;
create policy "Claves públicas: leer" on public.claves_publicas for select to authenticated using (true);
drop policy if exists "Claves públicas: la mía" on public.claves_publicas;
create policy "Claves públicas: la mía" on public.claves_publicas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.claves_publicas to authenticated;

create table if not exists public.claves_respaldo (
  user_id     uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  cifrada     text not null check (char_length(cifrada) < 4000),   -- clave privada cifrada (AES-GCM)
  sal         text not null check (char_length(sal) < 100),
  iv          text not null check (char_length(iv) < 100),
  iteraciones integer not null check (iteraciones between 100000 and 5000000),
  actualizado timestamptz not null default now()
);
alter table public.claves_respaldo enable row level security;
drop policy if exists "Respaldo: solo el dueño" on public.claves_respaldo;
create policy "Respaldo: solo el dueño" on public.claves_respaldo for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.claves_respaldo to authenticated;

-- ---------- Chat: conversaciones y mensajes ----------
create table if not exists public.conversaciones (
  id          uuid primary key default gen_random_uuid(),
  usuario_a   uuid not null references auth.users(id) on delete cascade,
  usuario_b   uuid not null references auth.users(id) on delete cascade,
  inmueble_id uuid references public.inmuebles(id) on delete set null,
  creado      timestamptz not null default now(),
  ultimo      timestamptz not null default now(),
  check (usuario_a < usuario_b)
);
create unique index if not exists conversaciones_par_idx
  on public.conversaciones (usuario_a, usuario_b, coalesce(inmueble_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists conversaciones_b_idx on public.conversaciones (usuario_b);
alter table public.conversaciones enable row level security;
drop policy if exists "Conversaciones: participantes" on public.conversaciones;
create policy "Conversaciones: participantes" on public.conversaciones for select to authenticated
  using ((select auth.uid()) in (usuario_a, usuario_b));
grant select on public.conversaciones to authenticated;

create table if not exists public.mensajes (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  emisor_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  iv              text not null check (char_length(iv) between 12 and 40),
  cifrado         text not null check (char_length(cifrado) between 16 and 16000),
  creado          timestamptz not null default now(),
  leido_en        timestamptz
);
create index if not exists mensajes_conv_idx on public.mensajes (conversacion_id, creado);
alter table public.mensajes enable row level security;
drop policy if exists "Mensajes: leer" on public.mensajes;
create policy "Mensajes: leer" on public.mensajes for select to authenticated
  using (exists (select 1 from public.conversaciones c where c.id = conversacion_id and (select auth.uid()) in (c.usuario_a, c.usuario_b)));
drop policy if exists "Mensajes: escribir" on public.mensajes;
create policy "Mensajes: escribir" on public.mensajes for insert to authenticated
  with check (emisor_id = (select auth.uid())
    and exists (select 1 from public.conversaciones c where c.id = conversacion_id and (select auth.uid()) in (c.usuario_a, c.usuario_b)));
grant select, insert on public.mensajes to authenticated;

-- Al escribir: la conversación sube arriba y se limita el envío masivo.
create or replace function public.mensajes_antes()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  new.emisor_id := auth.uid(); new.creado := now(); new.leido_en := null;
  if (select count(*) from public.mensajes where emisor_id = new.emisor_id and creado > now() - interval '1 minute') >= 30 then
    raise exception 'Estás enviando mensajes muy rápido. Espera un momento.';
  end if;
  update public.conversaciones set ultimo = now() where id = new.conversacion_id;
  return new;
end $function$;
drop trigger if exists mensajes_antes on public.mensajes;
create trigger mensajes_antes before insert on public.mensajes for each row execute function public.mensajes_antes();
revoke execute on function public.mensajes_antes() from public, anon, authenticated;

-- Abrir (o reutilizar) la conversación con otra persona, sobre un anuncio o no.
create or replace function public.abrir_conversacion(p_otro uuid, p_inmueble uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare yo uuid := auth.uid(); a uuid; b uuid; cid uuid;
begin
  if yo is null then raise exception 'Necesitas iniciar sesión.'; end if;
  if p_otro is null or p_otro = yo then raise exception 'No puedes escribirte a ti mismo.'; end if;
  if not exists (select 1 from public.profiles where id = p_otro and usuario is not null) then
    raise exception 'Esa persona no tiene cuenta en Vivinati.';
  end if;
  a := least(yo, p_otro); b := greatest(yo, p_otro);
  select id into cid from public.conversaciones
    where usuario_a = a and usuario_b = b and inmueble_id is not distinct from p_inmueble;
  if cid is null then
    insert into public.conversaciones (usuario_a, usuario_b, inmueble_id) values (a, b, p_inmueble) returning id into cid;
  end if;
  return cid;
end $function$;

-- Mis conversaciones, con nombre y avatar de la otra persona y no leídos.
create or replace function public.mis_conversaciones()
returns table(id uuid, otro_id uuid, otro_usuario text, otro_nombre text, otro_avatar text,
              inmueble_id uuid, inmueble_titulo text, ultimo timestamptz, no_leidos integer)
language sql stable security definer set search_path = '' as $function$
  select c.id, o.id, o.usuario, o.full_name, o.avatar_url, c.inmueble_id, i.titulo, c.ultimo,
         (select count(*)::int from public.mensajes m where m.conversacion_id = c.id and m.emisor_id <> auth.uid() and m.leido_en is null)
  from public.conversaciones c
  join public.profiles o on o.id = case when c.usuario_a = auth.uid() then c.usuario_b else c.usuario_a end
  left join public.inmuebles i on i.id = c.inmueble_id
  where auth.uid() in (c.usuario_a, c.usuario_b)
  order by c.ultimo desc
  limit 200
$function$;

create or replace function public.marcar_leidos(p_conv uuid)
returns void language sql security definer set search_path = '' as $function$
  update public.mensajes m set leido_en = now()
  from public.conversaciones c
  where m.conversacion_id = p_conv and c.id = p_conv and auth.uid() in (c.usuario_a, c.usuario_b)
    and m.emisor_id <> auth.uid() and m.leido_en is null
$function$;

create or replace function public.no_leidos_total()
returns integer language sql stable security definer set search_path = '' as $function$
  select count(*)::int from public.mensajes m join public.conversaciones c on c.id = m.conversacion_id
  where auth.uid() in (c.usuario_a, c.usuario_b) and m.emisor_id <> auth.uid() and m.leido_en is null
$function$;

-- Mensajes en tiempo real (la RLS también se aplica aquí).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'mensajes') then
    alter publication supabase_realtime add table public.mensajes;
  end if;
end $$;

-- ---------- Valoraciones con estrellas ----------
create table if not exists public.valoraciones (
  id          uuid primary key default gen_random_uuid(),
  autor_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  estrellas   smallint not null check (estrellas between 1 and 5),
  comentario  text check (char_length(comentario) <= 600),
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (autor_id, usuario_id),
  check (autor_id <> usuario_id)
);
create index if not exists valoraciones_usuario_idx on public.valoraciones (usuario_id, creado desc);

-- Solo valora quien ha conversado de verdad: ambos escribieron en el chat.
create or replace function public.puede_valorar(p_usuario uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select auth.uid() is not null and p_usuario <> auth.uid() and exists (
    select 1 from public.conversaciones c
    where c.usuario_a = least(auth.uid(), p_usuario) and c.usuario_b = greatest(auth.uid(), p_usuario)
      and exists (select 1 from public.mensajes m where m.conversacion_id = c.id and m.emisor_id = auth.uid())
      and exists (select 1 from public.mensajes m where m.conversacion_id = c.id and m.emisor_id = p_usuario))
$function$;

alter table public.valoraciones enable row level security;
drop policy if exists "Valoraciones: públicas" on public.valoraciones;
create policy "Valoraciones: públicas" on public.valoraciones for select to anon, authenticated using (true);
drop policy if exists "Valoraciones: crear" on public.valoraciones;
create policy "Valoraciones: crear" on public.valoraciones for insert to authenticated
  with check (autor_id = (select auth.uid()) and (select public.puede_valorar(usuario_id)));
drop policy if exists "Valoraciones: cambiar la mía" on public.valoraciones;
create policy "Valoraciones: cambiar la mía" on public.valoraciones for update to authenticated
  using (autor_id = (select auth.uid())) with check (autor_id = (select auth.uid()));
drop policy if exists "Valoraciones: borrar la mía" on public.valoraciones;
create policy "Valoraciones: borrar la mía" on public.valoraciones for delete to authenticated using (autor_id = (select auth.uid()));
grant select on public.valoraciones to anon, authenticated;
grant insert, update, delete on public.valoraciones to authenticated;

-- Reseñas con nombre y avatar de quien las escribe (sin datos privados).
create or replace function public.resenas_de(p_usuario uuid, p_limite integer default 20)
returns table(estrellas smallint, comentario text, creado timestamptz, autor_usuario text, autor_nombre text, autor_avatar text)
language sql stable security definer set search_path = '' as $function$
  select v.estrellas, v.comentario, v.creado, p.usuario, p.full_name, p.avatar_url
  from public.valoraciones v join public.profiles p on p.id = v.autor_id
  where v.usuario_id = p_usuario order by v.creado desc limit least(greatest(p_limite, 1), 50)
$function$;

-- ---------- Perfil público: ahora con avatar, estrellas y antigüedad ----------
drop function if exists public.perfil_publico(uuid);
create function public.perfil_publico(p_id uuid)
returns table(usuario text, nombre text, avatar_url text, estrellas numeric, valoraciones integer, miembro_desde date)
language sql stable security definer set search_path = '' as $function$
  select p.usuario, p.full_name, p.avatar_url,
         (select round(avg(v.estrellas)::numeric, 1) from public.valoraciones v where v.usuario_id = p.id),
         (select count(*)::int from public.valoraciones v where v.usuario_id = p.id),
         (select u.created_at::date from auth.users u where u.id = p.id)
  from public.profiles p where p.id = p_id
$function$;

drop function if exists public.perfil_por_usuario(text);
create function public.perfil_por_usuario(p_usuario text)
returns table(id uuid, usuario text, nombre text, avatar_url text, estrellas numeric, valoraciones integer, miembro_desde date)
language sql stable security definer set search_path = '' as $function$
  select p.id, p.usuario, p.full_name, p.avatar_url,
         (select round(avg(v.estrellas)::numeric, 1) from public.valoraciones v where v.usuario_id = p.id),
         (select count(*)::int from public.valoraciones v where v.usuario_id = p.id),
         (select u.created_at::date from auth.users u where u.id = p.id)
  from public.profiles p where p.usuario = lower(trim(leading '@' from p_usuario)) limit 1
$function$;

grant execute on function public.perfil_publico(uuid) to anon, authenticated;
grant execute on function public.perfil_por_usuario(text) to anon, authenticated;
grant execute on function public.resenas_de(uuid, integer) to anon, authenticated;
grant execute on function public.puede_valorar(uuid) to authenticated;
revoke execute on function public.abrir_conversacion(uuid, uuid) from public, anon;
grant execute on function public.abrir_conversacion(uuid, uuid) to authenticated;
revoke execute on function public.mis_conversaciones() from public, anon;
grant execute on function public.mis_conversaciones() to authenticated;
revoke execute on function public.marcar_leidos(uuid) from public, anon;
grant execute on function public.marcar_leidos(uuid) to authenticated;
revoke execute on function public.no_leidos_total() from public, anon;
grant execute on function public.no_leidos_total() to authenticated;

notify pgrst, 'reload schema';

-- Una valoración no puede cambiar de destinatario ni de autor al editarla.
create or replace function public.valoraciones_antes()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if tg_op = 'UPDATE' then new.autor_id := old.autor_id; new.usuario_id := old.usuario_id; new.creado := old.creado; end if;
  new.actualizado := now();
  return new;
end $function$;
drop trigger if exists valoraciones_antes on public.valoraciones;
create trigger valoraciones_antes before insert or update on public.valoraciones for each row execute function public.valoraciones_antes();
revoke execute on function public.valoraciones_antes() from public, anon, authenticated;
