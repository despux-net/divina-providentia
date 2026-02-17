-- Create books table
create table if not exists books (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  author text not null,
  description text,
  drive_file_id text not null,
  cover_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table books enable row level security;

-- Policy for reading (public)
create policy "Public books are viewable by everyone"
  on books for select
  using ( true );

-- Insert sample book
insert into books (title, author, description, drive_file_id, cover_url)
values (
  'Ejemplo de Libro (Base de Datos)',
  'Autor Ejemplo',
  'Este libro se carga desde Supabase, no desde content.json. Edítalo en la tabla "books".',
  '1ApP6joys40VO2hHZyZbvuvLKp_E64Azt',
  'LOGOV4.png'
);
