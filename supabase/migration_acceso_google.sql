-- Acceso con Google: el nombre llega como «full_name» o «name» en los
-- metadatos (no como «nombre»). El @usuario queda vacío y la persona lo
-- elige en «Mi perfil» la primera vez.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path to ''
as $function$
declare
  v_usuario text := nullif(lower(trim(new.raw_user_meta_data->>'usuario')), '');
  v_nombre text := coalesce(nullif(trim(new.raw_user_meta_data->>'nombre'), ''),
                            nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
                            nullif(trim(new.raw_user_meta_data->>'name'), ''));
begin
  if v_usuario is not null and (v_usuario !~ '^[a-z0-9_]{3,20}$' or public.usuario_reservado(v_usuario)) then
    raise exception 'usuario_invalido';
  end if;
  if v_usuario is not null and exists (select 1 from public.profiles where usuario = v_usuario) then
    raise exception 'usuario_ocupado';
  end if;
  insert into public.profiles (id, email, usuario, full_name, first_name, last_name, country, age, message_to_moderators)
  values (
    new.id, new.email, v_usuario, left(v_nombre, 80),
    new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'country', (new.raw_user_meta_data->>'age')::integer,
    new.raw_user_meta_data->>'message'
  )
  on conflict (id) do update set email = excluded.email,
    usuario = coalesce(public.profiles.usuario, excluded.usuario),
    full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end $function$;
