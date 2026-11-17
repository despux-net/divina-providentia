-- =====================================================================
-- Vivinati · Red de seguridad para las fotos de los anuncios
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces.
--
-- La web ya optimiza cada foto en el navegador antes de subirla
-- (WebP de 1600 px, ~100–400 KB). Esto hace que Supabase RECHACE
-- cualquier archivo que llegue sin optimizar (p. ej. alguien que suba
-- fotos saltándose la web): máximo 1,5 MB y solo WebP o JPEG.
-- No borra ni toca las fotos que ya existen.
-- =====================================================================
update storage.buckets
set file_size_limit    = 1572864,                          -- 1,5 MB
    allowed_mime_types = array['image/webp', 'image/jpeg']
where id = 'inmuebles';

select id, file_size_limit, allowed_mime_types from storage.buckets where id = 'inmuebles';
