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
