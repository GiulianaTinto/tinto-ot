const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const JWT_SECRET = process.env.JWT_SECRET || 'tinto-dev-secret-change-in-prod';

app.use(express.json());
app.use(cookieParser());

// ---- Auth helpers ----
function signToken(user) {
  return jwt.sign({ id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }, JWT_SECRET, { expiresIn: '8h' });
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie('token');
    res.status(401).json({ error: 'Sesión expirada' });
  }
}

function solo(...roles) {
  return (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'No autenticado' });
    try { req.user = jwt.verify(token, JWT_SECRET); } catch { return res.status(401).json({ error: 'Sesión expirada' }); }
    if (!roles.includes(req.user.rol)) return res.status(403).json({ error: 'Sin permiso' });
    next();
  };
}

// Páginas públicas
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

// Páginas protegidas — redirigir al login si no hay token
app.use((req, res, next) => {
  const pub = ['/login', '/api/login', '/favicon.ico'];
  if (pub.includes(req.path)) return next();
  if (req.path.startsWith('/api/')) return next(); // APIs manejan su propio auth
  const token = req.cookies?.token;
  if (!token) return res.redirect('/login');
  try { jwt.verify(token, JWT_SECRET); next(); } catch { res.redirect('/login'); }
});

app.use(express.static(path.join(__dirname, 'public')));

// ---- Auth endpoints ----
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE email=$1 AND activo=true', [email]);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 });
  res.json({ ok: true, user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol } });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/me', authMiddleware, (req, res) => res.json(req.user));

// ---- Usuarios ----
app.get('/api/usuarios', solo('ADMIN'), async (req, res) => {
  const { rows } = await pool.query('SELECT id, nombre, email, rol, activo, created_at FROM usuarios ORDER BY nombre');
  res.json(rows);
});

app.post('/api/usuarios', solo('ADMIN'), async (req, res) => {
  const { nombre, email, password, rol } = req.body;
  if (!nombre || !email || !password || !rol) return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query('INSERT INTO usuarios (nombre,email,password,rol) VALUES ($1,$2,$3,$4) RETURNING id', [nombre, email, hash, rol]);
    res.json({ id: rows[0].id });
  } catch(e) { res.status(400).json({ error: 'El email ya existe' }); }
});

app.put('/api/usuarios/:id', solo('ADMIN'), async (req, res) => {
  const { nombre, email, rol, activo, password } = req.body;
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    await pool.query('UPDATE usuarios SET nombre=$1,email=$2,rol=$3,activo=$4,password=$5 WHERE id=$6', [nombre, email, rol, activo, hash, req.params.id]);
  } else {
    await pool.query('UPDATE usuarios SET nombre=$1,email=$2,rol=$3,activo=$4 WHERE id=$5', [nombre, email, rol, activo, req.params.id]);
  }
  res.json({ ok: true });
});

app.delete('/api/usuarios/:id', solo('ADMIN'), async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'No podés eliminarte a vos mismo' });
  await pool.query('DELETE FROM usuarios WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ---- Clientes ----
const EDITAN_CLIENTES = ['ADMIN', 'COMERCIAL', 'COMPRAS'];

app.get('/api/clientes', authMiddleware, async (req, res) => {
  const { q } = req.query;
  const { rows } = q
    ? await pool.query("SELECT * FROM clientes WHERE nombre ILIKE $1 OR contacto ILIKE $1 OR codigo_cliente ILIKE $1 ORDER BY nombre", [`%${q}%`])
    : await pool.query('SELECT * FROM clientes ORDER BY nombre');
  res.json(rows);
});

app.get('/api/clientes/:id', authMiddleware, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM clientes WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  res.json(rows[0]);
});

app.post('/api/clientes', solo(...EDITAN_CLIENTES), async (req, res) => {
  const d = req.body;
  if (!d.nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO clientes (nombre,codigo_cliente,domicilio,codigo_postal,localidad,telefono,mail,celular,contacto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [d.nombre, (d.codigo_cliente||'').toUpperCase().slice(0,10), d.domicilio, d.codigo_postal, d.localidad, d.telefono, d.mail, d.celular, d.contacto]
    );
    res.json({ id: rows[0].id });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/clientes/:id', solo(...EDITAN_CLIENTES), async (req, res) => {
  const d = req.body;
  await pool.query(
    'UPDATE clientes SET nombre=$1,codigo_cliente=$2,domicilio=$3,codigo_postal=$4,localidad=$5,telefono=$6,mail=$7,celular=$8,contacto=$9 WHERE id=$10',
    [d.nombre, (d.codigo_cliente||'').toUpperCase().slice(0,10), d.domicilio, d.codigo_postal, d.localidad, d.telefono, d.mail, d.celular, d.contacto, req.params.id]
  );
  res.json({ ok: true });
});

app.delete('/api/clientes/:id', solo('ADMIN'), async (req, res) => {
  await pool.query('DELETE FROM clientes WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Catálogos (listas desplegables de Productos) — solo ADMIN por ahora
const TIPOS_CATALOGO = ['papel', 'serigrafia', 'stamping_marca'];
app.get('/api/catalogos', solo('ADMIN'), async (req, res) => {
  const { tipo } = req.query;
  const { rows } = tipo
    ? await pool.query('SELECT * FROM catalogos WHERE tipo=$1 ORDER BY nombre', [tipo])
    : await pool.query('SELECT * FROM catalogos ORDER BY tipo, nombre');
  res.json(rows);
});
app.post('/api/catalogos', solo('ADMIN'), async (req, res) => {
  const { tipo, nombre } = req.body;
  if (!TIPOS_CATALOGO.includes(tipo)) return res.status(400).json({ error: 'Tipo de catálogo inválido' });
  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  try {
    const { rows } = await pool.query('INSERT INTO catalogos (tipo,nombre) VALUES ($1,$2) RETURNING id', [tipo, nombre.trim()]);
    res.json({ id: rows[0].id });
  } catch(e) { res.status(400).json({ error: 'Ya existe esa opción en la lista' }); }
});
app.put('/api/catalogos/:id', solo('ADMIN'), async (req, res) => {
  const { nombre, activo } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  try {
    await pool.query('UPDATE catalogos SET nombre=$1,activo=$2 WHERE id=$3', [nombre.trim(), activo !== false, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: 'Ya existe esa opción en la lista' }); }
});
app.delete('/api/catalogos/:id', solo('ADMIN'), async (req, res) => {
  try {
    await pool.query('DELETE FROM catalogos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: 'No se puede eliminar: hay productos que usan esta opción. Desactivala en su lugar.' }); }
});

// Productos — solo ADMIN por ahora
const num = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
const idOrNull = v => (v === '' || v == null) ? null : parseInt(v);
function valoresProducto(d) {
  const tintas = (Array.isArray(d.tintas) ? d.tintas : []).map(t => String(t || '').trim()).filter(Boolean).slice(0, 8);
  const relieve = idOrNull(d.relieve_id) != null;   // lleva relieve si se eligió un cuño
  return [
    idOrNull(d.cliente_id), d.marca, d.detalle, d.tipo_etiqueta, d.mercado,
    idOrNull(d.papel_id), idOrNull(d.papel_alt_id), d.liner, idOrNull(d.troquel_id),
    num(d.ancho), num(d.alto), num(d.gap_avance), num(d.gap_alto), num(d.rep_avance), num(d.filas), num(d.ancho_sustrato),
    num(d.sentido_bobinado), num(d.max_etiquetas_rollo),
    JSON.stringify(tintas), d.barniz,
    idOrNull(d.serigrafia_id), idOrNull(d.stamping_marca_id), idOrNull(d.stamping_cuno_id), relieve, idOrNull(d.relieve_id),
    d.anada, d.cubicacion, d.alcohol, d.observaciones, d.tecnologia
  ];
}
const COLS_PRODUCTO = ['cliente_id','marca','detalle','tipo_etiqueta','mercado','papel_id','papel_alt_id','liner','troquel_id','ancho','alto','gap_avance','gap_alto','rep_avance','filas','ancho_sustrato','sentido_bobinado','max_etiquetas_rollo','tintas','barniz','serigrafia_id','stamping_marca_id','stamping_cuno_id','relieve','relieve_id','anada','cubicacion','alcohol','observaciones','tecnologia'];
app.get('/api/productos', solo('ADMIN'), async (req, res) => {
  const { q } = req.query;
  const sql = `SELECT p.id, p.codigo, p.tecnologia, p.marca, p.detalle, p.tipo_etiqueta, p.mercado, c.nombre AS cliente, pa.nombre AS papel, pb.nombre AS papel_alt, t.codigo AS troquel
    FROM productos p JOIN clientes c ON c.id=p.cliente_id
    LEFT JOIN catalogos pa ON pa.id=p.papel_id LEFT JOIN catalogos pb ON pb.id=p.papel_alt_id LEFT JOIN troqueles t ON t.id=p.troquel_id
    ${q ? 'WHERE c.nombre ILIKE $1 OR p.marca ILIKE $1 OR p.detalle ILIKE $1 OR p.codigo ILIKE $1' : ''} ORDER BY c.nombre, p.marca, p.detalle`;
  const { rows } = await pool.query(sql, q ? [`%${q}%`] : []);
  res.json(rows);
});
app.get('/api/productos/:id', solo('ADMIN'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM productos WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  res.json(rows[0]);
});
app.post('/api/productos', solo('ADMIN'), async (req, res) => {
  const d = req.body;
  if (!idOrNull(d.cliente_id)) return res.status(400).json({ error: 'El cliente es obligatorio' });
  // Código: CLIENTE(6)-MARCA(3)-DETALLE(10)-TIPO(2)-AÑADA(4)-CUBICACIÓN(4)-ALCOHOL(3)-VERSIÓN(3); el alcohol va en décimas (13,5 → 135) y es 000 si no se cargó. Se genera al crear y no cambia al editar.
  const limpio = (s, n) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, n).padEnd(n, 'X');
  // marca de una palabra: 3 primeras letras · dos palabras: inicial + 2 primeras de la segunda (Los Haroldos → LHA) · tres o más: iniciales
  const marca3 = s => {
    const p = String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    if (p.length <= 1) return limpio(p[0], 3);
    if (p.length === 2) return limpio(p[0][0] + p[1].slice(0, 2), 3);
    return limpio(p.slice(0, 3).map(w => w[0]).join(''), 3);
  };
  const { rows: cli } = await pool.query('SELECT codigo_cliente FROM clientes WHERE id=$1', [idOrNull(d.cliente_id)]);
  if (!cli[0]?.codigo_cliente) return res.status(400).json({ error: 'El cliente no tiene Código Cliente: cargalo en Clientes para poder generar el código del producto' });
  if (!String(d.marca || '').trim() || !String(d.detalle || '').trim()) return res.status(400).json({ error: 'Marca y Detalle / Varietal son obligatorios para generar el código' });
  const digitos4 = v => String(v || '').replace(/\D/g, '').slice(0, 4).padStart(4, '0');
  const anada = (() => { const dg = String(d.anada || '').replace(/\D/g, ''); return dg.length === 2 ? '20' + dg : digitos4(dg); })();
  const TIPOS_COD = { FRENTE: 'FR', CONTRA: 'CT', MEDALLA: 'MD', COLLARIN: 'CL', STICKER: 'ST', FAJA: 'FJ' };
  const tipoCod = TIPOS_COD[limpio(d.tipo_etiqueta, 12).replace(/X+$/, '')];
  if (!tipoCod) return res.status(400).json({ error: 'El Tipo de etiqueta es obligatorio para generar el código' });
  const alc = Math.round(parseFloat(String(d.alcohol || '').replace(',', '.')) * 10);   // 13,5 → 135 · 14 → 140
  const alcohol = alc > 0 && alc < 1000 ? String(alc).padStart(3, '0') : '000';
  const base = [limpio(cli[0].codigo_cliente, 6), marca3(d.marca), limpio(d.detalle, 10), tipoCod, anada, digitos4(d.cubicacion), alcohol].join('-');
  try {
    for (let intento = 0; intento < 5; intento++) {
      const { rows: v } = await pool.query('SELECT COALESCE(MAX(RIGHT(codigo, 3)::int), 0) + 1 AS n FROM productos WHERE codigo ~ $1', ['^' + base + '-[0-9]{3}$']);
      const codigo = base + '-' + String(v[0].n).padStart(3, '0');
      try {
        const { rows } = await pool.query(
          `INSERT INTO productos (codigo,${COLS_PRODUCTO.join(',')}) VALUES ($${COLS_PRODUCTO.length + 1},${COLS_PRODUCTO.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`,
          [...valoresProducto(d), codigo]
        );
        return res.json({ id: rows[0].id, codigo });
      } catch(e) { if (e.code !== '23505') throw e; }   // otro alta simultánea tomó ese código: reintenta con el siguiente
    }
    res.status(409).json({ error: 'No se pudo generar un código único, intentá de nuevo' });
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/productos/:id', solo('ADMIN'), async (req, res) => {
  const d = req.body;
  if (!idOrNull(d.cliente_id)) return res.status(400).json({ error: 'El cliente es obligatorio' });
  try {
    await pool.query(
      `UPDATE productos SET ${COLS_PRODUCTO.map((c, i) => `${c}=$${i + 1}`).join(',')},updated_at=NOW() WHERE id=$${COLS_PRODUCTO.length + 1}`,
      [...valoresProducto(d), req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/productos/:id', solo('ADMIN'), async (req, res) => {
  await pool.query('DELETE FROM productos WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Troqueles (rotativos y semirotativos) — solo ADMIN por ahora
const TIPOS_TROQUEL = ['rotativo', 'semirotativo'];
const COLS_TROQUEL = ['codigo','tipo','ancho_etiqueta','alto_etiqueta','ancho_x_alto','rep_avance','rep_ancho','gap_avance','gap_ancho','z','formato','observaciones','activo'];
function valoresTroquel(d) {
  return [String(d.codigo || '').trim(), d.tipo, num(d.ancho_etiqueta), num(d.alto_etiqueta), d.ancho_x_alto, num(d.rep_avance), num(d.rep_ancho), num(d.gap_avance), num(d.gap_ancho), d.z, d.formato, d.observaciones, d.activo !== false];
}
app.get('/api/troqueles', solo('ADMIN'), async (req, res) => {
  const { q, tipo } = req.query;
  const params = [];
  let sql = 'SELECT * FROM troqueles WHERE 1=1';
  if (tipo) { params.push(tipo); sql += ` AND tipo=$${params.length}`; }
  if (q) { params.push(`%${q}%`); sql += ` AND (codigo ILIKE $${params.length} OR formato ILIKE $${params.length} OR observaciones ILIKE $${params.length})`; }
  const { rows } = await pool.query(sql + ' ORDER BY codigo', params);
  res.json(rows);
});
app.get('/api/troqueles/:id', solo('ADMIN'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM troqueles WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  res.json(rows[0]);
});
app.post('/api/troqueles', solo('ADMIN'), async (req, res) => {
  const d = req.body;
  if (!String(d.codigo || '').trim()) return res.status(400).json({ error: 'El código es obligatorio' });
  if (!TIPOS_TROQUEL.includes(d.tipo)) return res.status(400).json({ error: 'El tipo es obligatorio (rotativo o semirotativo)' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO troqueles (${COLS_TROQUEL.join(',')}) VALUES (${COLS_TROQUEL.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`,
      valoresTroquel(d)
    );
    res.json({ id: rows[0].id });
  } catch(e) { res.status(400).json({ error: e.code === '23505' ? 'Ya existe un troquel con ese código' : e.message }); }
});
app.put('/api/troqueles/:id', solo('ADMIN'), async (req, res) => {
  const d = req.body;
  if (!String(d.codigo || '').trim()) return res.status(400).json({ error: 'El código es obligatorio' });
  if (!TIPOS_TROQUEL.includes(d.tipo)) return res.status(400).json({ error: 'El tipo es obligatorio (rotativo o semirotativo)' });
  try {
    await pool.query(
      `UPDATE troqueles SET ${COLS_TROQUEL.map((c, i) => `${c}=$${i + 1}`).join(',')} WHERE id=$${COLS_TROQUEL.length + 1}`,
      [...valoresTroquel(d), req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.code === '23505' ? 'Ya existe un troquel con ese código' : e.message }); }
});
app.delete('/api/troqueles/:id', solo('ADMIN'), async (req, res) => {
  try {
    await pool.query('DELETE FROM troqueles WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: 'No se puede eliminar: hay productos que usan este troquel. Desactivalo en su lugar.' }); }
});

// Cuños (stamping y relieve comparten la misma lista) — solo ADMIN por ahora
const COLS_CUNO = ['codigo','tipo','cliente','producto','tipo_etiqueta','material','imagenes','observaciones','contraparte','nombre','activo'];
function valoresCuno(d) {
  return [String(d.codigo || '').trim().toUpperCase(), d.tipo, d.cliente, d.producto, d.tipo_etiqueta, d.material, num(d.imagenes), d.observaciones, d.contraparte, d.nombre, d.activo !== false];
}
app.get('/api/cunos', solo('ADMIN'), async (req, res) => {
  const { q } = req.query;
  const { rows } = q
    ? await pool.query('SELECT * FROM cunos WHERE codigo ILIKE $1 OR cliente ILIKE $1 OR producto ILIKE $1 OR nombre ILIKE $1 ORDER BY codigo', [`%${q}%`])
    : await pool.query('SELECT * FROM cunos ORDER BY codigo');
  res.json(rows);
});
app.get('/api/cunos/:id', solo('ADMIN'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM cunos WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  res.json(rows[0]);
});
app.post('/api/cunos', solo('ADMIN'), async (req, res) => {
  const d = req.body;
  if (!String(d.codigo || '').trim()) return res.status(400).json({ error: 'El código es obligatorio' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO cunos (${COLS_CUNO.join(',')}) VALUES (${COLS_CUNO.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`,
      valoresCuno(d)
    );
    res.json({ id: rows[0].id });
  } catch(e) { res.status(400).json({ error: e.code === '23505' ? 'Ya existe un cuño con ese código' : e.message }); }
});
app.put('/api/cunos/:id', solo('ADMIN'), async (req, res) => {
  const d = req.body;
  if (!String(d.codigo || '').trim()) return res.status(400).json({ error: 'El código es obligatorio' });
  try {
    await pool.query(
      `UPDATE cunos SET ${COLS_CUNO.map((c, i) => `${c}=$${i + 1}`).join(',')} WHERE id=$${COLS_CUNO.length + 1}`,
      [...valoresCuno(d), req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.code === '23505' ? 'Ya existe un cuño con ese código' : e.message }); }
});
app.delete('/api/cunos/:id', solo('ADMIN'), async (req, res) => {
  try {
    await pool.query('DELETE FROM cunos WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: 'No se puede eliminar: hay productos que usan este cuño. Desactivalo en su lugar.' }); }
});

// ---- Órdenes ----
const EDITAN_OT = ['ADMIN', 'COMERCIAL', 'PRODUCCION', 'PREPRENSA'];

app.get('/api/ordenes', authMiddleware, async (req, res) => {
  const { estado, q } = req.query;
  let sql = 'SELECT id, numero_ot, cliente, marca_varietal, detalle, fecha_entrega, estado, created_at FROM ordenes WHERE 1=1';
  const params = [];
  if (estado) { params.push(estado); sql += ` AND estado=$${params.length}`; }
  if (q) { params.push(`%${q}%`); sql += ` AND (numero_ot ILIKE $${params.length} OR cliente ILIKE $${params.length} OR marca_varietal ILIKE $${params.length})`; }
  sql += ' ORDER BY id DESC';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

app.get('/api/ordenes/:id', authMiddleware, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM ordenes WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
  res.json(rows[0]);
});

app.post('/api/ordenes', solo(...EDITAN_OT), async (req, res) => {
  const d = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO ordenes (numero_ot,cliente,cliente_id,numero_oc,marca_varietal,detalle,codigo,fecha_emision,fecha_entrega,maquina,ficha_tecnica,tipo_etiqueta,anio,alcohol,contenido,pais_importador,desarrollo,cantidad,papel,troquel,ancho,alto,z,gap_avance,gap_alto,rep_avance,columnas,ancho_sustrato,metros_lineales,tintas,herramentales,trazabilidad,control_calidad,ingreso_stock,observaciones,estado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36) RETURNING id`,
      [d.numero_ot, d.cliente, d.cliente_id||null, d.numero_oc, d.marca_varietal, d.detalle, d.codigo, d.fecha_emision, d.fecha_entrega, d.maquina, d.ficha_tecnica, d.tipo_etiqueta, d.anio, d.alcohol, d.contenido, d.pais_importador, d.desarrollo||'NUEVO', d.cantidad, d.papel, d.troquel, d.ancho, d.alto, d.z, d.gap_avance, d.gap_alto, d.rep_avance, d.columnas, d.ancho_sustrato, d.metros_lineales,
       JSON.stringify(d.tintas||[]), JSON.stringify(d.herramentales||{}), JSON.stringify(d.trazabilidad||{}), JSON.stringify(d.control_calidad||{}), JSON.stringify(d.ingreso_stock||[]), d.observaciones, d.estado||'PENDIENTE']
    );
    res.json({ id: rows[0].id });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/ordenes/:id', solo(...EDITAN_OT), async (req, res) => {
  const d = req.body;
  await pool.query(`
    UPDATE ordenes SET cliente=$1,cliente_id=$2,numero_oc=$3,marca_varietal=$4,detalle=$5,codigo=$6,fecha_emision=$7,fecha_entrega=$8,maquina=$9,ficha_tecnica=$10,tipo_etiqueta=$11,anio=$12,alcohol=$13,contenido=$14,pais_importador=$15,desarrollo=$16,cantidad=$17,papel=$18,troquel=$19,ancho=$20,alto=$21,z=$22,gap_avance=$23,gap_alto=$24,rep_avance=$25,columnas=$26,ancho_sustrato=$27,metros_lineales=$28,tintas=$29,herramentales=$30,trazabilidad=$31,control_calidad=$32,ingreso_stock=$33,observaciones=$34,estado=$35,updated_at=NOW() WHERE id=$36`,
    [d.cliente, d.cliente_id||null, d.numero_oc, d.marca_varietal, d.detalle, d.codigo, d.fecha_emision, d.fecha_entrega, d.maquina, d.ficha_tecnica, d.tipo_etiqueta, d.anio, d.alcohol, d.contenido, d.pais_importador, d.desarrollo, d.cantidad, d.papel, d.troquel, d.ancho, d.alto, d.z, d.gap_avance, d.gap_alto, d.rep_avance, d.columnas, d.ancho_sustrato, d.metros_lineales,
     JSON.stringify(d.tintas||[]), JSON.stringify(d.herramentales||{}), JSON.stringify(d.trazabilidad||{}), JSON.stringify(d.control_calidad||{}), JSON.stringify(d.ingreso_stock||[]), d.observaciones, d.estado, req.params.id]
  );
  res.json({ ok: true });
});

app.delete('/api/ordenes/:id', solo('ADMIN', 'COMERCIAL'), async (req, res) => {
  await pool.query('DELETE FROM ordenes WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/proximo-numero', authMiddleware, async (req, res) => {
  const { rows } = await pool.query('SELECT numero_ot FROM ordenes ORDER BY id DESC LIMIT 1');
  if (!rows[0]) return res.json({ numero: '39000' });
  const n = parseInt(rows[0].numero_ot) + 1;
  res.json({ numero: isNaN(n) ? '39000' : String(n) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tinto Labels OT en http://localhost:${PORT}`));

module.exports = app;
