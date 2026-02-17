-- =============================================
-- DIVINA PROVIDENTIA - DATABASE SCHEMA
-- Products and Orders Tables
-- =============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PRODUCTS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  category TEXT NOT NULL CHECK (category IN ('vestments', 'headwear', 'accessories', 'prints')),
  image_url TEXT,
  stock INTEGER DEFAULT 0 CHECK (stock >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster category queries
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- Create index for faster created_at queries
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

-- =============================================
-- ORDERS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  customer_address TEXT,
  items JSONB NOT NULL,
  total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster email queries
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);

-- Create index for faster status queries
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Create index for faster created_at queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on products table
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Allow public read access to products
CREATE POLICY "Public read access for products"
  ON products
  FOR SELECT
  USING (true);

-- Enable RLS on orders table
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert orders (for checkout)
CREATE POLICY "Public insert access for orders"
  ON orders
  FOR INSERT
  WITH CHECK (true);

-- Allow users to read their own orders by email
CREATE POLICY "Users can read their own orders"
  ON orders
  FOR SELECT
  USING (true);

-- =============================================
-- SAMPLE DATA (Optional - for testing)
-- =============================================

INSERT INTO products (name, description, price, category, stock) VALUES
  ('Camiseta Virtus', 'Diseño minimalista con el símbolo de la virtud estoica. Algodón 100% orgánico.', 29.99, 'vestments', 25),
  ('Sudadera Sapientia', 'Comodidad y sabiduría en cada fibra. Tejido premium con forro interior suave.', 49.99, 'vestments', 15),
  ('Camiseta Amor Fati', 'Ama tu destino, vístelo con orgullo. Diseño exclusivo con tipografía clásica.', 29.99, 'vestments', 20),
  ('Hoodie Memento Mori', 'Recuerda que eres mortal. Vive plenamente. Diseño bordado de alta calidad.', 54.99, 'vestments', 12),
  
  ('Gorra Fortitudo', 'Protege tu mente con fortaleza. Ajuste perfecto y diseño atemporal.', 24.99, 'headwear', 30),
  ('Gorra Stoic', 'Estilo atemporal para mentes filosóficas. Logo bordado discreto.', 24.99, 'headwear', 28),
  ('Beanie Temperantia', 'Moderación y estilo en los días fríos. Tejido suave y cálido.', 19.99, 'headwear', 35),
  
  ('Bolsa Temperantia', 'Lleva lo esencial con moderación. Lona resistente y diseño funcional.', 34.99, 'accessories', 18),
  ('Pin Marco Aurelio', 'Pequeño recordatorio de grandes enseñanzas. Esmalte de alta calidad.', 9.99, 'accessories', 100),
  ('Pin Séneca', 'La sabiduría de Séneca en tu solapa. Diseño elegante y duradero.', 9.99, 'accessories', 100),
  ('Llavero Epicteto', 'Lleva la filosofía contigo. Metal resistente con grabado láser.', 12.99, 'accessories', 50),
  
  ('Lámina Memento Mori', 'Arte filosófico para tu espacio. Impresión de calidad museo.', 19.99, 'prints', 40),
  ('Lámina Virtud Cardinal', 'Las cuatro virtudes cardinales en diseño minimalista.', 24.99, 'prints', 35),
  ('Póster Dicotomía del Control', 'Visualiza lo que puedes y no puedes controlar. Tamaño A2.', 22.99, 'prints', 30)
ON CONFLICT DO NOTHING;

-- =============================================
-- FUNCTIONS FOR AUTOMATIC TIMESTAMP UPDATES
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
