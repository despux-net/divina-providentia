-- Directorio de constructoras (constructoras.html y /constructoras/<estado>/).
-- Solo datos que ya son públicos en el perfil (perfil_por_usuario); el
-- teléfono solo si la empresa marcó «Mostrar mi WhatsApp en mi perfil».

create or replace function public.directorio_constructoras(p_estado text default null)
returns table(usuario text, nombre text, empresa text, avatar_url text, estado text, ciudad text,
              biografia text, sitio_web text, instagram text, whatsapp text,
              estrellas numeric, valoraciones integer, miembro_desde date, anuncios integer, proyectos integer)
language sql stable security definer set search_path to '' as $$
  select p.usuario, p.full_name, nullif(trim(p.empresa), ''), p.avatar_url, p.estado, nullif(trim(p.ciudad), ''),
         left(nullif(trim(p.biography), ''), 400), p.sitio_web, p.instagram,
         case when p.mostrar_telefono then nullif(trim(p.phone), '') end,
         v.estrellas, coalesce(v.n, 0),
         (select u.created_at::date from auth.users u where u.id = p.id),
         (select count(*)::int from public.inmuebles i where i.user_id = p.id and i.activo and i.operacion <> 'concepto'),
         (select count(*)::int from public.inmuebles i where i.user_id = p.id and i.activo and i.operacion = 'concepto')
  from public.profiles p
  left join lateral (select round(avg(x.estrellas)::numeric, 1) as estrellas, count(*)::int as n
                     from public.valoraciones x where x.usuario_id = p.id) v on true
  where p.tipo_perfil = 'constructora' and p.usuario is not null
    and (p_estado is null or p.estado = p_estado)
  order by (select count(*) from public.inmuebles i where i.user_id = p.id and i.activo) desc,
           v.estrellas desc nulls last, p.usuario
  limit 500
$$;
grant execute on function public.directorio_constructoras(text) to anon, authenticated;
