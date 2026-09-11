const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const asyncHandler = require('../asyncHandler');
const { sendTaskAssignedEmail } = require('../mailer');

const router = express.Router();

const VALID_PRIORITIES = ['baja', 'media', 'alta', 'urgente'];
const VALID_STATUSES = ['pendiente', 'en_curso', 'hecha'];

function getBaseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

async function attachMember(task) {
  if (!task) return task;
  const { rows } = await db.query('SELECT id, name, email FROM team_members WHERE id = $1', [task.assignee_id]);
  return { ...task, assignee: rows[0] || null };
}

// Listar tareas, con filtros opcionales ?status=&priority=&assignee_id=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, priority, assignee_id } = req.query;
    const conditions = [];
    const params = [];

    if (status && VALID_STATUSES.includes(status)) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (priority && VALID_PRIORITIES.includes(priority)) {
      params.push(priority);
      conditions.push(`priority = $${params.length}`);
    }
    if (assignee_id) {
      params.push(Number(assignee_id));
      conditions.push(`assignee_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM tasks ${where} ORDER BY (due_date IS NULL), due_date ASC, id DESC`,
      params
    );
    const withMembers = await Promise.all(rows.map(attachMember));
    res.json(withMembers);
  })
);

// Crear tarea + enviar correo de asignación
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { title, description, assignee_id, priority, due_date } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'El título es obligatorio.' });
    }
    const { rows: memberRows } = await db.query('SELECT * FROM team_members WHERE id = $1', [Number(assignee_id)]);
    const member = memberRows[0];
    if (!member) {
      return res.status(400).json({ error: 'Debes seleccionar un integrante del equipo válido.' });
    }
    const finalPriority = VALID_PRIORITIES.includes(priority) ? priority : 'media';
    if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
      return res.status(400).json({ error: 'Fecha límite no válida.' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const { rows } = await db.query(
      `INSERT INTO tasks (title, description, assignee_id, priority, due_date, token)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title.trim(), description ? String(description).trim() : null, member.id, finalPriority, due_date || null, token]
    );
    let task = rows[0];

    const result = await sendTaskAssignedEmail({ task, member, baseUrl: getBaseUrl(req) });
    if (result.sent) {
      const { rows: updated } = await db.query(
        "UPDATE tasks SET email_sent_at = NOW(), email_error = NULL WHERE id = $1 RETURNING *",
        [task.id]
      );
      task = updated[0];
    } else if (result.error) {
      const { rows: updated } = await db.query('UPDATE tasks SET email_error = $1 WHERE id = $2 RETURNING *', [
        result.error,
        task.id,
      ]);
      task = updated[0];
    }

    res.status(201).json({ ...(await attachMember(task)), mail: result });
  })
);

// Reenviar correo de asignación
router.post(
  '/:id/resend',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { rows: taskRows } = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
    const task = taskRows[0];
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });

    const { rows: memberRows } = await db.query('SELECT * FROM team_members WHERE id = $1', [task.assignee_id]);
    const member = memberRows[0];
    if (!member) return res.status(400).json({ error: 'El integrante asignado ya no existe.' });

    const result = await sendTaskAssignedEmail({ task, member, baseUrl: getBaseUrl(req) });
    if (result.sent) {
      await db.query("UPDATE tasks SET email_sent_at = NOW(), email_error = NULL WHERE id = $1", [id]);
    } else if (result.error) {
      await db.query('UPDATE tasks SET email_error = $1 WHERE id = $2', [result.error, id]);
    }
    res.json({ mail: result });
  })
);

// Editar tarea (título, descripción, prioridad, fecha, estado, reasignar)
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { rows: existingRows } = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Tarea no encontrada.' });

    const { title, description, assignee_id, priority, due_date, status } = req.body || {};

    const newTitle = typeof title === 'string' && title.trim() ? title.trim() : existing.title;
    const newDescription =
      description !== undefined ? (description ? String(description).trim() : null) : existing.description;
    const newAssignee = assignee_id !== undefined ? Number(assignee_id) : existing.assignee_id;
    const newPriority = VALID_PRIORITIES.includes(priority) ? priority : existing.priority;
    const newDueDate = due_date !== undefined ? due_date || null : existing.due_date;
    const newStatus = VALID_STATUSES.includes(status) ? status : existing.status;

    if (assignee_id !== undefined) {
      const { rows: memberRows } = await db.query('SELECT id FROM team_members WHERE id = $1', [newAssignee]);
      if (!memberRows[0]) return res.status(400).json({ error: 'Integrante no válido.' });
    }
    if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
      return res.status(400).json({ error: 'Fecha límite no válida.' });
    }

    let completedAt = existing.completed_at;
    if (newStatus === 'hecha' && existing.status !== 'hecha') {
      completedAt = new Date().toISOString();
    } else if (newStatus !== 'hecha') {
      completedAt = null;
    }

    const { rows } = await db.query(
      `UPDATE tasks SET title=$1, description=$2, assignee_id=$3, priority=$4, due_date=$5, status=$6, completed_at=$7
       WHERE id=$8 RETURNING *`,
      [newTitle, newDescription, newAssignee, newPriority, newDueDate, newStatus, completedAt, id]
    );
    res.json(await attachMember(rows[0]));
  })
);

// Eliminar tarea
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { rowCount } = await db.query('DELETE FROM tasks WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Tarea no encontrada.' });
    res.json({ ok: true });
  })
);

module.exports = router;
