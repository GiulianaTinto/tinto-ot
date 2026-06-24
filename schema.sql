-- Ejecutar esto en Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'PRODUCCION',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  codigo_cliente VARCHAR(10),
  domicilio TEXT,
  codigo_postal TEXT,
  localidad TEXT,
  telefono TEXT,
  mail TEXT,
  celular TEXT,
  contacto TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ordenes (
  id SERIAL PRIMARY KEY,
  numero_ot TEXT UNIQUE NOT NULL,
  cliente TEXT,
  cliente_id INTEGER REFERENCES clientes(id),
  numero_oc TEXT,
  marca_varietal TEXT,
  detalle TEXT,
  codigo TEXT,
  fecha_emision DATE,
  fecha_entrega DATE,
  maquina TEXT,
  ficha_tecnica TEXT,
  tipo_etiqueta TEXT,
  anio TEXT,
  alcohol TEXT,
  contenido TEXT,
  pais_importador TEXT,
  desarrollo TEXT DEFAULT 'NUEVO',
  cantidad TEXT,
  papel TEXT,
  troquel TEXT,
  ancho TEXT,
  alto TEXT,
  z TEXT,
  gap_avance TEXT,
  gap_alto TEXT,
  rep_avance TEXT,
  columnas TEXT,
  ancho_sustrato TEXT,
  metros_lineales TEXT,
  tintas JSONB DEFAULT '[]',
  herramentales JSONB DEFAULT '{}',
  trazabilidad JSONB DEFAULT '{}',
  control_calidad JSONB DEFAULT '{}',
  ingreso_stock JSONB DEFAULT '[]',
  observaciones TEXT,
  estado TEXT DEFAULT 'PENDIENTE',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usuario admin inicial (contraseña: admin1234)
INSERT INTO usuarios (nombre, email, password, rol)
VALUES ('Administrador', 'admin@tintolabels.com', '$2b$10$EcXvv.7U3.MjNth8dEgkA.FAayPQZl9HfERllott3OrvZjarwD7z2', 'ADMIN')
ON CONFLICT (email) DO NOTHING;
