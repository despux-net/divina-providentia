-- =====================================================================
-- DIVINA PROVIDENTIA — PANEL DE ADMINISTRACIÓN
-- Esquema, seguridad (RLS) y lógica de pedidos.
--
-- CÓMO EJECUTARLO
--   1. Entra en https://supabase.com/dashboard  ->  tu proyecto
--   2. Menú lateral  ->  SQL Editor  ->  New query
--   3. Pega este archivo entero y pulsa RUN
--
-- Es idempotente: puedes ejecutarlo varias veces sin romper nada.
-- =====================================================================


-- =====================================================================
-- 0. QUIÉN ES EL ADMINISTRADOR
--    Cambia este correo si algún día quieres otro dueño del panel.
-- =====================================================================

create schema if not exists dp;

create or replace function dp.admin_email()
returns text language sql immutable as $$
  select 'marcosdespujos@gmail.com'::text;
$$;


-- =====================================================================
-- 1. COLUMNAS NUEVAS
-- =====================================================================

-- 1.1 Marca de administrador en los perfiles
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- 1.2 Stock por talla en productos.
--     Formato: {"S": 4, "M": 0, "L": 12}
--     Una talla que no aparezca en el objeto se considera sin existencias.
alter table public.products
  add column if not exists stock_by_size jsonb not null default '{}'::jsonb,
  add column if not exists updated_at    timestamptz not null default now();

-- 1.3 Datos del cliente en el pedido (hoy la tabla no los guarda)
alter table public.orders
  add column if not exists customer_name    text,
  add column if not exists customer_phone   text,
  add column if not exists customer_message text,
  add column if not exists updated_at       timestamptz not null default now();

-- 1.4 Talla comprada y nombre/precio congelados en el momento de la venta.
--     Si mañana renombras o resubes un producto, el pedido antiguo
--     debe seguir contando lo que se vendió aquel día.
alter table public.order_items
  add column if not exists size         text,
  add column if not exists product_name text;

-- 1.5 Bandeja de contacto con marca de leído
alter table public.mensajes_contacto
  add column if not exists leido boolean not null default false;


-- =====================================================================
-- 2. FUNCIÓN DE ADMINISTRADOR
--    SECURITY DEFINER a propósito: si consultara 'profiles' con los
--    permisos de quien llama, la política de 'profiles' volvería a
--    llamar a esta función y entraría en recursión infinita.
-- =====================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;


-- =====================================================================
-- 3. NADIE PUEDE ASCENDERSE A ADMIN
--    La política de UPDATE de 'profiles' deja a cada usuario editar su
--    propia fila, y eso incluiría la columna is_admin. Este disparador
--    lo impide.
--
--    La condición 'auth.uid() is not null' es lo que permite nombrar al
--    primer administrador: en el editor SQL del panel de Supabase no hay
--    sesión de usuario, así que auth.uid() es NULL. Sin esa condición el
--    disparador se bloquearía a sí mismo y nunca habría un admin.
--
--    No abre ningún hueco: una petición anónima contra la API tampoco
--    tiene auth.uid(), pero la política profiles_self_update del punto
--    5.5 le impide tocar ninguna fila. Aquí solo se filtra al usuario
--    autenticado que intente ascenderse él mismo.
-- =====================================================================

create or replace function public.protect_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'No autorizado: is_admin solo lo puede cambiar un administrador.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_admin_flag on public.profiles;
create trigger trg_protect_admin_flag
  before update on public.profiles
  for each row execute function public.protect_admin_flag();


-- =====================================================================
-- 4. LIMPIEZA DE POLÍTICAS ANTIGUAS
--    Las políticas se suman con OR: basta una permisiva heredada para
--    que todo lo de abajo no sirva de nada. Por eso se borran todas
--    antes de crear el juego nuevo.
-- =====================================================================

do $$
declare r record;
begin
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('products','orders','order_items','lookbook_images',
                         'mensajes_contacto','books','articles','profiles')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.products          enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.lookbook_images   enable row level security;
alter table public.mensajes_contacto enable row level security;
alter table public.profiles          enable row level security;
alter table public.books             enable row level security;
alter table public.articles          enable row level security;


-- =====================================================================
-- 5. POLÍTICAS
-- =====================================================================

-- 5.1 PRODUCTOS — el público solo ve los publicados; escribe solo el admin
create policy products_public_read on public.products
  for select using (published = true or public.is_admin());

create policy products_admin_insert on public.products
  for insert with check (public.is_admin());

create policy products_admin_update on public.products
  for update using (public.is_admin()) with check (public.is_admin());

create policy products_admin_delete on public.products
  for delete using (public.is_admin());


-- 5.2 PEDIDOS — nadie escribe directamente.
--     Los pedidos entran solo por la función place_order() del punto 7,
--     que es quien calcula el precio de verdad. Así un cliente no puede
--     inventarse un total de 0 €.
create policy orders_admin_read on public.orders
  for select using (public.is_admin());

create policy orders_admin_update on public.orders
  for update using (public.is_admin()) with check (public.is_admin());

create policy orders_admin_delete on public.orders
  for delete using (public.is_admin());

create policy order_items_admin_read on public.order_items
  for select using (public.is_admin());

create policy order_items_admin_update on public.order_items
  for update using (public.is_admin()) with check (public.is_admin());

create policy order_items_admin_delete on public.order_items
  for delete using (public.is_admin());


-- 5.3 LOOKBOOK — lectura pública, escritura del admin
create policy lookbook_public_read on public.lookbook_images
  for select using (true);

create policy lookbook_admin_write on public.lookbook_images
  for all using (public.is_admin()) with check (public.is_admin());


-- 5.4 CONTACTO — cualquiera escribe, solo el admin lee
create policy contacto_public_insert on public.mensajes_contacto
  for insert with check (true);

create policy contacto_admin_read on public.mensajes_contacto
  for select using (public.is_admin());

create policy contacto_admin_update on public.mensajes_contacto
  for update using (public.is_admin()) with check (public.is_admin());

create policy contacto_admin_delete on public.mensajes_contacto
  for delete using (public.is_admin());


-- 5.5 PERFILES — cada uno el suyo; el admin los ve todos
create policy profiles_self_read on public.profiles
  for select using (auth.uid() = id or public.is_admin());

create policy profiles_self_insert on public.profiles
  for insert with check (auth.uid() = id);

create policy profiles_self_update on public.profiles
  for update using (auth.uid() = id or public.is_admin());


-- 5.6 LIBROS Y ARTÍCULOS — lectura pública, escritura del admin.
--     Ya no se enlazan desde la web, pero las tablas siguen expuestas.
create policy books_public_read on public.books
  for select using (true);

create policy books_admin_write on public.books
  for all using (public.is_admin()) with check (public.is_admin());

create policy articles_public_read on public.articles
  for select using (true);

create policy articles_admin_write on public.articles
  for all using (public.is_admin()) with check (public.is_admin());


-- =====================================================================
-- 6. STORAGE — mismo criterio para las imágenes
--    Lectura pública (las fotos se ven en la tienda), subida y borrado
--    solo del admin.
-- =====================================================================

-- Storage pertenece al rol supabase_storage_admin. Según el proyecto, el
-- rol del editor SQL puede no ser dueño de storage.objects y entonces
-- DROP POLICY falla. Va dentro de un bloque con captura de errores para
-- que eso no tumbe toda la migración: si no se puede, avisa y sigue.
do $$
declare r record;
begin
  begin
    insert into storage.buckets (id, name, public)
    values ('products','products',true), ('lookbook','lookbook',true)
    on conflict (id) do update set public = true;
  exception when others then
    raise warning 'No se pudieron crear/actualizar los buckets: %', sqlerrm;
  end;

  for r in select policyname from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;

  execute 'create policy storage_public_read on storage.objects
             for select using (true)';
  execute 'create policy storage_admin_insert on storage.objects
             for insert with check (public.is_admin())';
  execute 'create policy storage_admin_update on storage.objects
             for update using (public.is_admin()) with check (public.is_admin())';
  execute 'create policy storage_admin_delete on storage.objects
             for delete using (public.is_admin())';

  raise notice 'Políticas de Storage aplicadas.';
exception when others then
  raise warning
    'STORAGE SIN PROTEGER: no hay permisos para cambiar las politicas de storage.objects (%). Hazlo a mano en Storage -> Policies. El resto de la migracion si se ha aplicado.',
    sqlerrm;
end $$;


-- =====================================================================
-- 7. ALTA DE PEDIDO
--    Toda la venta ocurre aquí dentro, en el servidor:
--      - el precio se lee de la tabla, no lo manda el navegador
--      - se comprueba que haya stock de esa talla
--      - se descuenta el stock
--      - se crea el pedido y sus líneas
--    Si algo falla, la transacción entera se deshace.
--
--    p_items: [{"id": 22, "size": "M", "quantity": 2}, ...]
-- =====================================================================

create or replace function public.place_order(
  p_name    text,
  p_phone   text,
  p_message text,
  p_items   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id  uuid;
  v_total     numeric(10,2) := 0;
  v_item      jsonb;
  v_product   public.products%rowtype;
  v_size      text;
  v_qty       int;
  v_stock     int;
  v_line      numeric(10,2);
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Falta el nombre del cliente.';
  end if;
  if p_phone is null or btrim(p_phone) = '' then
    raise exception 'Falta el teléfono del cliente.';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene artículos.';
  end if;

  insert into public.orders (customer_name, customer_phone, customer_message,
                             total_amount, status, user_id)
  values (btrim(p_name), btrim(p_phone), nullif(btrim(coalesce(p_message,'')),''),
          0, 'pending', auth.uid())
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty  := greatest(coalesce((v_item->>'quantity')::int, 0), 0);
    v_size := nullif(btrim(coalesce(v_item->>'size','')), '');

    if v_qty = 0 then
      continue;
    end if;

    -- FOR UPDATE bloquea la fila: dos clientes comprando la última
    -- unidad a la vez no pueden dejar el stock en negativo.
    select * into v_product
      from public.products
     where id = (v_item->>'id')::bigint
     for update;

    if not found then
      raise exception 'El producto % ya no existe.', v_item->>'id';
    end if;
    if v_product.published is not true or v_product.available is not true then
      raise exception 'El producto "%" no está a la venta.', v_product.name;
    end if;

    if v_size is not null then
      v_stock := coalesce((v_product.stock_by_size ->> v_size)::int, 0);
      if v_stock < v_qty then
        raise exception 'Solo quedan % unidades de "%" en talla %.',
          v_stock, v_product.name, v_size;
      end if;

      update public.products
         set stock_by_size = stock_by_size || jsonb_build_object(v_size, v_stock - v_qty),
             updated_at    = now()
       where id = v_product.id;
    end if;

    v_line  := round(v_product.price * v_qty, 2);
    v_total := v_total + v_line;

    insert into public.order_items (order_id, product_id, product_name,
                                    size, quantity, price_at_purchase)
    values (v_order_id, v_product.id, v_product.name,
            v_size, v_qty, v_product.price);
  end loop;

  if v_total = 0 then
    raise exception 'El pedido quedó vacío.';
  end if;

  update public.orders
     set total_amount = v_total, updated_at = now()
   where id = v_order_id;

  return jsonb_build_object('order_id', v_order_id, 'total', v_total);
end;
$$;

revoke all on function public.place_order(text,text,text,jsonb) from public;
grant execute on function public.place_order(text,text,text,jsonb) to anon, authenticated;


-- =====================================================================
-- 8. RESUMEN DE VENTAS PARA EL PANEL
-- =====================================================================

create or replace function public.admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.is_admin() then '{}'::jsonb else
    jsonb_build_object(
      'orders_total',   (select count(*) from public.orders),
      'orders_pending', (select count(*) from public.orders where status = 'pending'),
      'revenue',        (select coalesce(sum(total_amount),0) from public.orders
                          where status <> 'cancelled'),
      'revenue_30d',    (select coalesce(sum(total_amount),0) from public.orders
                          where status <> 'cancelled'
                            and created_at > now() - interval '30 days'),
      'products',       (select count(*) from public.products),
      'published',      (select count(*) from public.products where published),
      'unread_msgs',    (select count(*) from public.mensajes_contacto where not leido)
    )
  end;
$$;

revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;


-- =====================================================================
-- 9. MANTENIMIENTO DE updated_at
-- =====================================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_orders_touch on public.orders;
create trigger trg_orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();


-- =====================================================================
-- 10. NOMBRAR AL ADMINISTRADOR
--     Requiere que la cuenta ya exista en Authentication -> Users.
--     Si aún no existe: regístrate primero en divinaprovidentia.com con
--     ese correo (o créala en el panel de Supabase) y vuelve a ejecutar
--     este archivo.
-- =====================================================================

insert into public.profiles (id, email, is_admin)
select u.id, u.email, true
  from auth.users u
 where lower(u.email) = lower(dp.admin_email())
on conflict (id) do update set is_admin = true;

do $$
declare v_count int;
begin
  select count(*) into v_count
    from public.profiles p
    join auth.users u on u.id = p.id
   where lower(u.email) = lower(dp.admin_email())
     and p.is_admin;

  if v_count = 0 then
    raise warning
      'AVISO: no existe ninguna cuenta con el correo %. Regístrala en la web o en Authentication -> Users y vuelve a ejecutar este archivo.',
      dp.admin_email();
  else
    raise notice 'Administrador configurado correctamente: %', dp.admin_email();
  end if;
end $$;


-- =====================================================================
-- 11. COMPROBACIÓN
--     Debe devolver una fila por tabla, todas con rls_activa = true.
-- =====================================================================

select c.relname            as tabla,
       c.relrowsecurity     as rls_activa,
       count(p.policyname)  as politicas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
 where n.nspname = 'public'
   and c.relname in ('products','orders','order_items','lookbook_images',
                     'mensajes_contacto','profiles','books','articles')
 group by c.relname, c.relrowsecurity
 order by c.relname;
