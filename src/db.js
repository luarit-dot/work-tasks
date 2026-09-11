const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn(
    '[AVISO] No has definido DATABASE_URL en .env. La app no podrá conectarse a la base de datos Postgres (Neon).'
  );
}

// Neon (y la mayoría de Postgres gestionados) exigen SSL. En un Postgres local
// de pruebas sin SSL, pon PGSSL=false en tu .env.
const useSSL = process.env.PGSSL !== 'false';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  // Errores en clientes inactivos del pool: no deben tumbar el proceso.
  console.error('Error inesperado en el pool de Postgres:', err.message);
});

/** Ejecuta una consulta parametrizada ($1, $2, ...) y devuelve el resultado de "pg". */
function query(text, params = []) {
  return pool.query(text, params);
}

/** Crea las tablas si no existen. Se llama una vez al arrancar el servidor. */
async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      assignee_id INTEGER NOT NULL REFERENCES team_members(id),
      priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baja','media','alta','urgente')),
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','en_curso','hecha')),
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      email_sent_at TIMESTAMPTZ,
      email_error TEXT
    );
  `);
  // Nota: due_date se guarda como TEXT ("YYYY-MM-DD") a propósito, en vez de
  // como tipo DATE. Así evitamos que el driver de Postgres la convierta a un
  // objeto Date con desfases de zona horaria; el formato ya se valida en las rutas.

  await query('CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);');
  await query('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);');
  await query('CREATE INDEX IF NOT EXISTS idx_tasks_token ON tasks(token);');

  console.log('Base de datos (Postgres/Neon) lista: tablas verificadas/creadas.');
}

module.exports = { query, initDb, pool };
