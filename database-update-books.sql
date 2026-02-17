-- Add max_pages_preview column if not exists
alter table books add column if not exists max_pages_preview integer default 15;
