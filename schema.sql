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
  observaciones TEXT,
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

-- Listas desplegables administrables (papel, troquel, serigrafía, stamping marca/cuño, relieve)
CREATE TABLE IF NOT EXISTS catalogos (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tipo, nombre)
);

CREATE TABLE IF NOT EXISTS troqueles (
  id SERIAL PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('rotativo','semirotativo')),
  ancho_etiqueta NUMERIC,
  alto_etiqueta NUMERIC,
  ancho_x_alto TEXT,
  rep_avance NUMERIC,
  rep_ancho NUMERIC,
  gap_avance NUMERIC,
  gap_ancho NUMERIC,
  z TEXT,
  formato TEXT,
  observaciones TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cunos (
  id SERIAL PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,
  tipo TEXT,                  -- ST, REL, ST-REL, BAJOREL, MICROREL...
  cliente TEXT,
  producto TEXT,
  tipo_etiqueta TEXT,
  material TEXT,
  imagenes INTEGER,
  observaciones TEXT,
  contraparte TEXT,
  nombre TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS productos (
  id SERIAL PRIMARY KEY,
  codigo TEXT UNIQUE,                       -- reservado: la generación del código se define más adelante
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  marca TEXT,
  detalle TEXT,                             -- detalle / varietal
  tipo_etiqueta TEXT,
  mercado TEXT,
  papel_id INTEGER REFERENCES catalogos(id),
  papel_alt_id INTEGER REFERENCES catalogos(id),   -- papel alternativo (opcional, cuando el liner es indiferente)
  liner TEXT,                               -- 'Pet / Glassine' | 'Pet' | 'Glassine'
  troquel_id INTEGER REFERENCES troqueles(id),
  ancho NUMERIC,
  alto NUMERIC,
  gap_avance NUMERIC,
  gap_alto NUMERIC,
  rep_avance INTEGER,
  filas INTEGER,
  ancho_sustrato NUMERIC,
  sentido_bobinado SMALLINT,                -- 1 a 4
  max_etiquetas_rollo INTEGER,
  tintas JSONB DEFAULT '[]',                -- hasta 8 nombres
  barniz TEXT,
  serigrafia_id INTEGER REFERENCES catalogos(id),
  stamping_marca_id INTEGER REFERENCES catalogos(id),
  stamping_cuno_id INTEGER REFERENCES cunos(id),
  relieve BOOLEAN NOT NULL DEFAULT false,
  relieve_id INTEGER REFERENCES cunos(id),
  anada TEXT,                               -- datos variables
  cubicacion TEXT,
  alcohol TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usuario admin inicial (contraseña: admin1234)
INSERT INTO usuarios (nombre, email, password, rol)
VALUES ('Administrador', 'admin@tintolabels.com', '$2b$10$EcXvv.7U3.MjNth8dEgkA.FAayPQZl9HfERllott3OrvZjarwD7z2', 'ADMIN')
ON CONFLICT (email) DO NOTHING;
