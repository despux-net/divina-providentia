-- Confianza: ajustes editables (redes sociales y correo de contacto) y
-- mensajes del formulario de contacto. Se puede ejecutar más de una vez.

-- ---------- Ajustes del sitio ----------
-- Para activar una red: Supabase → Table Editor → ajustes_sitio → pega el
-- enlace en «valor». El icono aparece solo en el pie de la web.
create table if not exists public.ajustes_sitio (
  clave text primary key,
  valor text,
  descripcion text,
  actualizado timestamptz not null default now()
);
alter table public.ajustes_sitio enable row level security;
drop policy if exists "Ajustes: lectura pública" on public.ajustes_sitio;
create policy "Ajustes: lectura pública" on public.ajustes_sitio for select using (true);
drop policy if exists "Ajustes: solo admin cambia" on public.ajustes_sitio;
create policy "Ajustes: solo admin cambia" on public.ajustes_sitio for all
  using (public.is_admin()) with check (public.is_admin());

insert into public.ajustes_sitio (clave, valor, descripcion) values
  ('instagram', null, 'Enlace completo de Instagram, p. ej. https://instagram.com/vivinati'),
  ('facebook',  null, 'Enlace completo de la página de Facebook'),
  ('tiktok',    null, 'Enlace completo de TikTok, p. ej. https://www.tiktok.com/@vivinati'),
  ('x',         null, 'Enlace completo de X (Twitter)'),
  ('youtube',   null, 'Enlace completo del canal de YouTube'),
  ('whatsapp',  null, 'Enlace de WhatsApp de soporte, p. ej. https://wa.me/584141234567'),
  ('correo_contacto', null, 'Correo público de contacto, p. ej. hola@vivinati.com')
on conflict (clave) do nothing;

-- ---------- Mensajes del formulario de contacto ----------
-- Se leen en Supabase → Table Editor → contacto_web. «atendido» para marcarlos.
create table if not exists public.contacto_web (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  nombre text not null check (length(trim(nombre)) between 2 and 80),
  correo text not null check (correo ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and length(correo) <= 120),
  motivo text not null default 'otro' check (motivo in ('duda','anuncio','estafa','retirar','prensa','otro')),
  mensaje text not null check (length(trim(mensaje)) between 10 and 2000),
  enlace text check (enlace is null or (enlace ~ '^https?://' and length(enlace) <= 300)),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  atendido boolean not null default false
);
alter table public.contacto_web enable row level security;
drop policy if exists "Contacto: cualquiera escribe" on public.contacto_web;
create policy "Contacto: cualquiera escribe" on public.contacto_web for insert
  with check (atendido = false and (user_id is null or user_id = auth.uid()));
drop policy if exists "Contacto: solo admin lee" on public.contacto_web;
create policy "Contacto: solo admin lee" on public.contacto_web for select using (public.is_admin());
drop policy if exists "Contacto: solo admin cambia" on public.contacto_web;
create policy "Contacto: solo admin cambia" on public.contacto_web for update using (public.is_admin());
grant insert on public.contacto_web to anon, authenticated;

-- Freno al spam: máximo 3 mensajes por correo y hora, y 60 en total por hora.
create or replace function public.contacto_web_limite()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if (select count(*) from public.contacto_web
      where lower(correo) = lower(new.correo) and creado > now() - interval '1 hour') >= 3
     or (select count(*) from public.contacto_web where creado > now() - interval '1 hour') >= 60 then
    raise exception 'demasiados_mensajes';
  end if;
  new.correo := lower(trim(new.correo));
  return new;
end $$;
drop trigger if exists contacto_web_limite on public.contacto_web;
create trigger contacto_web_limite before insert on public.contacto_web
  for each row execute function public.contacto_web_limite();

-- Aviso por correo de mensajes nuevos (scripts/contacto/avisar.mjs) y correo público.
alter table public.contacto_web add column if not exists avisado boolean not null default false;
update public.ajustes_sitio set valor = 'contact@vivinati.com', actualizado = now()
  where clave = 'correo_contacto' and (valor is null or valor = '');

-- Desde que existe la función «contacto» (con «No soy un robot»), la web ya no
-- escribe directamente en la tabla: así ningún robot se salta la comprobación.
drop policy if exists "Contacto: cualquiera escribe" on public.contacto_web;
revoke insert on public.contacto_web from anon, authenticated;
