# Migraciones del buscador de inmuebles

Aplicadas en Supabase (proyecto nzwtafacdpdgulzcwntx) el 2026-11-16:

1. `20261116123934_inmuebles_buscador_v1` — tabla `inmuebles`, búsqueda `buscar_inmuebles()`, RLS y bucket de fotos `inmuebles`.
2. `20261116123957_inmuebles_trigger_rol_fix` — el trigger mira el rol en el JWT (dentro de SECURITY DEFINER `current_user` siempre es el dueño).
3. `20261116124043_inmuebles_revocar_trigger_rpc` — el trigger no se puede llamar por la API.

El SQL completo está guardado en la propia base: `select * from supabase_migrations.schema_migrations where name like 'inmuebles%'`.
4. `inmuebles_externos_v2` — columnas `fuente_modificado` y `visto_en`; los anuncios externos no llevan WhatsApp y siempre tienen `fuente` y `url_original`. Los escribe `scripts/indexador/indexar.mjs` (workflow «Indexador de inmuebles», cada 6 h).
