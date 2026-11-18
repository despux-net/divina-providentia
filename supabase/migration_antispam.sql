-- Antispam para los anuncios que trae el indexador (origen 'externo'): lo
-- que no es un inmueble (artículos de blog, preguntas sin precio, anuncios de
-- servicios) se guarda desactivado con revision = 'spam'. Como el indexador
-- reescribe cada ficha al verla, la regla se aplica sola a lo nuevo y a lo
-- que ya estaba. Los anuncios publicados por usuarios no se tocan.

alter table public.inmuebles drop constraint if exists inmuebles_revision_check;
alter table public.inmuebles add constraint inmuebles_revision_check
  check (revision is null or revision = any (array['reportado', 'oculto_admin', 'spam']));

create or replace function public.es_spam_inmueble(p_titulo text, p_url text, p_precio numeric, p_habitaciones integer, p_metros numeric)
returns boolean language sql immutable set search_path to '' as $$
  select
    -- 1) Páginas de blog, noticias o artículos de la web de la inmobiliaria
    coalesce(p_url, '') ~* '/(blog|noticias?|articulos?|news|posts?|guias?|consejos)/'
    -- 2) Sin precio, habitaciones ni metros, y además el título es una pregunta
    --    («¿Por qué tu apartamento no se vende?») o anuncia un servicio o una búsqueda
    or (p_precio is null and p_habitaciones is null and p_metros is null and (
          p_titulo ~ '^\s*¿' or p_titulo ~ '\?\s*$'
          or public.f_unaccent(lower(coalesce(p_titulo, ''))) ~
            '(asesoria|gestoria|te ayudo a|servicios? inmobiliarios?|tramites|avaluos?|credito hipotecario|prestamos?|\mcurso\M|\mtaller\M|webinar|\mse busca\M|\mbusco\M|compro tu|compramos)'))
$$;

create or replace function public.inmuebles_spam()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.origen = 'externo' and public.es_spam_inmueble(new.titulo, new.url_original, new.precio, new.habitaciones, new.metros) then
    new.activo := false;
    new.revision := 'spam';
  elsif new.origen = 'externo' and new.revision = 'spam' then
    new.revision := null;   -- dejó de parecer spam (la fuente lo corrigió)
  end if;
  return new;
end $$;

drop trigger if exists inmuebles_spam on public.inmuebles;
create trigger inmuebles_spam before insert or update on public.inmuebles
  for each row execute function public.inmuebles_spam();

-- Aplicarlo a lo que ya está
update public.inmuebles set revision = revision
where origen = 'externo' and activo and public.es_spam_inmueble(titulo, url_original, precio, habitaciones, metros);

-- La llama cada día el robot de portadas (scripts/portadas/revisar.py):
-- desactiva como spam los externos activos que cumplen la regla, por si la
-- regla cambió y la fuente aún no volvió a pasar por esa ficha.
create or replace function public.limpiar_spam()
returns integer language plpgsql security definer set search_path to '' as $$
declare n integer;
begin
  update public.inmuebles set revision = 'spam', activo = false
  where origen = 'externo' and activo and public.es_spam_inmueble(titulo, url_original, precio, habitaciones, metros);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.limpiar_spam() from public, anon, authenticated;
grant execute on function public.limpiar_spam() to service_role;
