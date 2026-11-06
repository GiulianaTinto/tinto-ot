-- Órdenes de trabajo: vínculo con el producto — ejecutar en Supabase → SQL Editor
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ordenes_producto ON ordenes(producto_id);
