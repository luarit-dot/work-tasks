const express = require('express');
const db = require('../db');
const asyncHandler = require('../asyncHandler');

const router = express.Router();

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Listar miembros del equipo (con contador de tareas)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT tm.id, tm.name, tm.email, tm.active, tm.created_at,
              COUNT(t.id)::int AS total_tasks,
              COALESCE(SUM(CASE WHEN t.status != 'hecha' THEN 1 ELSE 0 END), 0)::int AS open_tasks
       FROM team_members tm
       LEFT JOIN tasks t ON t.assignee_id = tm.id
       GROUP BY tm.id
       ORDER BY LOWER(tm.name) ASC`
    );
    res.json(rows);
  })
);

// Añadir miembro
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, email } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'El nombre es obligatorio.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'El correo electrónico no es válido.' });
    }

    const { rows } = await db.query(
      'INSERT INTO team_members (name, email) VALUES ($1, $2) RETURNING *',
      [name.trim(), email.trim().toLowerCase()]
    );
    res.status(201).json(rows[0]);
  })
);

// Editar miembro
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { rows: existingRows } = await db.query('SELECT * FROM team_members WHERE id = $1', [id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Integrante no encontrado.' });

    const { name, email, active } = req.body || {};
    if (email !== undefined && !isValidEmail(email)) {
      return res.status(400).json({ error: 'El correo electrónico no es válido.' });
    }
    const newName = typeof name === 'string' && name.trim() ? name.trim() : existing.name;
    const newEmail = email !== undefined ? String(email).trim().toLowerCase() : existing.email;
    const newActive = active !== undefined ? Boolean(active) : existing.active;

    const { rows } = await db.query(
      'UPDATE team_members SET name = $1, email = $2, active = $3 WHERE id = $4 RETURNING *',
      [newName, newEmail, newActive, id]
    );
    res.json(rows[0]);
  })
);

// Eliminar miembro (solo si no tiene tareas asignadas)
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { rows: countRows } = await db.query('SELECT COUNT(*)::int AS c FROM tasks WHERE assignee_id = $1', [id]);
    if (countRows[0].c > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar: este integrante tiene tareas asociadas. Reasígnalas o elimínalas primero.',
      });
    }
    const { rowCount } = await db.query('DELETE FROM team_members WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Integrante no encontrado.' });
    res.json({ ok: true });
  })
);

module.exports = router;
