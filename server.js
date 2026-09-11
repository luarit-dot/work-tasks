require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const { router: authRouter, requireAuth } = require('./src/routes/auth');
const teamRouter = require('./src/routes/team');
const tasksRouter = require('./src/routes/tasks');
const publicRouter = require('./src/routes/public');
const { initDb } = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET) {
  console.warn(
    '[AVISO] No has definido SESSION_SECRET en .env. Usando un valor temporal solo válido para esta ejecución.'
  );
}

app.set('trust proxy', 1); // necesario en Render/Railway/Heroku para que las cookies "secure" funcionen tras su proxy

app.use(
  helmet({
    contentSecurityPolicy: false, // el frontend es estático y sencillo; se puede endurecer más adelante
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'clave-temporal-solo-para-desarrollo',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
    },
  })
);

// --- API ---
app.use('/api', authRouter);
app.use('/api/team', requireAuth, teamRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/public', publicRouter); // sin autenticación: es lo que abre el equipo desde el correo

// --- Página pública de "marcar como hecha" (sin login) ---
app.get('/completar/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'completar.html'));
});

// --- Frontend estático (cuadro de mandos del jefe de proyecto) ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'No encontrado.' });
});

// Middleware de errores: captura cualquier fallo de las rutas async
// (por ejemplo, un problema de conexión con la base de datos) en vez de
// dejar la petición colgada o tumbar el proceso.
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Ha ocurrido un error en el servidor.' });
});

async function start() {
  try {
    await initDb();
  } catch (err) {
    console.error('No se pudo conectar/inicializar la base de datos Postgres (Neon):', err.message);
    console.error('Comprueba que DATABASE_URL está bien configurada en tu .env o en las variables de entorno del hosting.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Gestor de tareas escuchando en el puerto ${PORT}`);
    console.log(`BASE_URL configurada: ${process.env.BASE_URL || '(no definida, se usará el host de cada petición)'}`);
  });
}

start();
