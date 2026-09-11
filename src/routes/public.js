const express = require('express');
const db = require('../db');
const asyncHandler = require('../asyncHandler');

const router = express.Router();

const PRIORITY_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' };
const STATUS_LABELS = { pendiente: 'Pendiente', en_curso: 'En curso', hecha: 'Hecha' };

async function getTaskByToken(token) {
  const { rows } = await db.query('SELECT * FROM tasks WHERE token = $1', [token]);
  return rows[0];
}

// Información mínima de la tarea para mostrar en la página pública de confirmación.
// Deliberadamente NO cambia nada de estado (una petición GET no debe tener efectos:
// muchos filtros de seguridad de correo "visitan" los enlaces automáticamente).
router.get(
  '/task/:token',
  asyncHandler(async (req, res) => {
    const task = await getTaskByToken(req.params.token);
    if (!task) return res.status(404).json({ error: 'Enlace no válido o caducado.' });

    const { rows: memberRows } = await db.query('SELECT name, email FROM team_members WHERE id = $1', [
      task.assignee_id,
    ]);
    const member = memberRows[0];

    res.json({
      title: task.title,
      description: task.description,
      priority: task.priority,
      priorityLabel: PRIORITY_LABELS[task.priority] || task.priority,
      status: task.status,
      statusLabel: STATUS_LABELS[task.status] || task.status,
      dueDate: task.due_date,
      assigneeName: member ? member.name : null,
      alreadyDone: task.status === 'hecha',
    });
  })
);

// Esta es la única acción que cambia el estado, y solo se dispara con un clic
// explícito del usuario en la página (fetch POST), nunca por la simple carga del enlace.
router.post(
  '/complete/:token',
  asyncHandler(async (req, res) => {
    const task = await getTaskByToken(req.params.token);
    if (!task) return res.status(404).json({ error: 'Enlace no válido o caducado.' });

    if (task.status !== 'hecha') {
      await db.query("UPDATE tasks SET status = 'hecha', completed_at = NOW() WHERE id = $1", [task.id]);
    }
    res.json({ ok: true });
  })
);

module.exports = router;
