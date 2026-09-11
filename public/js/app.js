const state = {
  team: [],
  tasks: [],
  filters: { status: '', priority: '', assignee_id: '' },
  editingTaskId: null,
};

const PRIORITY_LABELS = { baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' };
const STATUS_LABELS = { pendiente: 'Pendiente', en_curso: 'En curso', hecha: 'Hecha' };

// ---------- Arranque ----------
(async function init() {
  const authRes = await fetch('/api/session');
  const authData = await authRes.json();
  if (!authData.authenticated) {
    window.location.href = '/login.html';
    return;
  }
  await Promise.all([loadTeam(), loadTasks()]);
  bindEvents();
  setInterval(loadTasks, 20000); // refresco periódico para simular actualización en vivo
})();

// ---------- Carga de datos ----------
async function loadTeam() {
  const res = await fetch('/api/team');
  if (res.status === 401) return redirectToLogin();
  state.team = await res.json();
  renderAssigneeSelects();
  renderTeamList();
}

async function loadTasks() {
  const params = new URLSearchParams();
  if (state.filters.status) params.set('status', state.filters.status);
  if (state.filters.priority) params.set('priority', state.filters.priority);
  if (state.filters.assignee_id) params.set('assignee_id', state.filters.assignee_id);

  const res = await fetch(`/api/tasks?${params.toString()}`);
  if (res.status === 401) return redirectToLogin();
  state.tasks = await res.json();
  renderStats();
  renderBoard();
}

function redirectToLogin() {
  window.location.href = '/login.html';
}

// ---------- Render: estadísticas ----------
function renderStats() {
  const total = state.tasks.length;
  const pendientes = state.tasks.filter((t) => t.status === 'pendiente').length;
  const enCurso = state.tasks.filter((t) => t.status === 'en_curso').length;
  const hechas = state.tasks.filter((t) => t.status === 'hecha').length;
  const vencidas = state.tasks.filter((t) => isOverdue(t)).length;

  const stats = [
    { label: 'Total', num: total },
    { label: 'Pendientes', num: pendientes },
    { label: 'En curso', num: enCurso },
    { label: 'Hechas', num: hechas },
    { label: 'Vencidas', num: vencidas },
  ];

  document.getElementById('stats-row').innerHTML = stats
    .map((s) => `<div class="stat-box"><div class="num">${s.num}</div><div class="label">${s.label}</div></div>`)
    .join('');
}

function isOverdue(task) {
  if (!task.due_date || task.status === 'hecha') return false;
  const today = new Date().toISOString().slice(0, 10);
  return task.due_date < today;
}

// ---------- Render: selects de asignación/filtro ----------
function renderAssigneeSelects() {
  const options = state.team.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');

  const taskSelect = document.getElementById('task-assignee');
  taskSelect.innerHTML = options || '<option value="">Añade primero un integrante al equipo</option>';

  const filterSelect = document.getElementById('filter-assignee');
  const current = filterSelect.value;
  filterSelect.innerHTML = '<option value="">Todo el equipo</option>' + options;
  filterSelect.value = current;
}

// ---------- Render: tablero agrupado por integrante ----------
function renderBoard() {
  const board = document.getElementById('board');

  if (state.team.length === 0) {
    board.innerHTML = `<div class="empty-state">Todavía no hay integrantes en el equipo. Usa "Gestionar equipo" para añadir el primero.</div>`;
    return;
  }

  const groups = state.team
    .filter((m) => !state.filters.assignee_id || String(m.id) === String(state.filters.assignee_id))
    .map((member) => {
      const tasks = state.tasks.filter((t) => t.assignee_id === member.id);
      return { member, tasks };
    })
    .filter((g) => g.tasks.length > 0 || !state.filters.status && !state.filters.priority);

  if (groups.every((g) => g.tasks.length === 0)) {
    board.innerHTML = `<div class="empty-state">No hay tareas que coincidan con los filtros seleccionados.</div>`;
    return;
  }

  board.innerHTML = groups
    .map(({ member, tasks }) => {
      if (tasks.length === 0) return '';
      const openCount = tasks.filter((t) => t.status !== 'hecha').length;
      return `
        <div class="member-group">
          <div class="member-group-header">
            <div>
              <div class="name">${escapeHtml(member.name)}</div>
              <div class="meta">${escapeHtml(member.email)}</div>
            </div>
            <div class="meta">${openCount} tarea(s) pendiente(s) de ${tasks.length}</div>
          </div>
          ${tasks.map(renderTaskRow).join('')}
        </div>
      `;
    })
    .join('');

  board.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', handleTaskAction);
  });
}

function renderTaskRow(task) {
  const overdue = isOverdue(task);
  const dueLabel = task.due_date
    ? `<span class="${overdue ? 'overdue' : ''}">Vence: ${task.due_date}${overdue ? ' (vencida)' : ''}</span>`
    : '<span>Sin fecha límite</span>';

  const emailInfo = task.email_sent_at
    ? `<span>Correo enviado</span>`
    : task.email_error
    ? `<span class="overdue" title="${escapeHtml(task.email_error)}">Error al enviar correo</span>`
    : `<span>Correo no enviado (modo prueba)</span>`;

  return `
    <div class="task-row">
      <div class="task-main">
        <div class="task-title">${escapeHtml(task.title)}</div>
        ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
        <div class="task-meta">
          <span class="badge badge-${task.priority}">${PRIORITY_LABELS[task.priority]}</span>
          <span class="status-pill status-${task.status}">${STATUS_LABELS[task.status]}</span>
          ${dueLabel}
          ${emailInfo}
        </div>
      </div>
      <div class="task-actions">
        ${
          task.status !== 'hecha'
            ? `<button class="btn-success btn-sm" data-action="complete" data-id="${task.id}">Marcar hecha</button>`
            : `<button class="btn-secondary btn-sm" data-action="reopen" data-id="${task.id}">Reabrir</button>`
        }
        <button class="btn-secondary btn-sm" data-action="resend" data-id="${task.id}">Reenviar correo</button>
        <button class="btn-secondary btn-sm" data-action="edit" data-id="${task.id}">Editar</button>
        <button class="btn-danger btn-sm" data-action="delete" data-id="${task.id}">Eliminar</button>
      </div>
    </div>
  `;
}

async function handleTaskAction(e) {
  const action = e.currentTarget.dataset.action;
  const id = Number(e.currentTarget.dataset.id);
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;

  if (action === 'complete') {
    await patchTask(id, { status: 'hecha' });
  } else if (action === 'reopen') {
    await patchTask(id, { status: 'pendiente' });
  } else if (action === 'delete') {
    if (!confirm(`¿Eliminar la tarea "${task.title}"? Esta acción no se puede deshacer.`)) return;
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    showToast('Tarea eliminada.');
    await loadTasks();
  } else if (action === 'resend') {
    const res = await fetch(`/api/tasks/${id}/resend`, { method: 'POST' });
    const data = await res.json();
    if (data.mail && data.mail.sent) {
      showToast('Correo reenviado.');
    } else if (data.mail && data.mail.dryRun) {
      showToast('Modo prueba: no hay Gmail configurado, no se envió correo real.');
    } else {
      showToast('No se pudo enviar el correo.');
    }
    await loadTasks();
  } else if (action === 'edit') {
    openTaskModal(task);
  }
}

async function patchTask(id, patch) {
  await fetch(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  await loadTasks();
}

// ---------- Modal de tarea ----------
function openTaskModal(task) {
  document.getElementById('task-error').textContent = '';
  document.getElementById('task-modal-title').textContent = task ? 'Editar tarea' : 'Nueva tarea';
  document.getElementById('task-submit').textContent = task ? 'Guardar cambios' : 'Crear y enviar correo';
  document.getElementById('task-id').value = task ? task.id : '';
  document.getElementById('task-title').value = task ? task.title : '';
  document.getElementById('task-description').value = task ? task.description || '' : '';
  document.getElementById('task-assignee').value = task ? task.assignee_id : (state.team[0] ? state.team[0].id : '');
  document.getElementById('task-priority').value = task ? task.priority : 'media';
  document.getElementById('task-due').value = task ? task.due_date || '' : '';
  state.editingTaskId = task ? task.id : null;
  document.getElementById('task-modal-overlay').classList.remove('hidden');
}

function closeTaskModal() {
  document.getElementById('task-modal-overlay').classList.add('hidden');
  document.getElementById('task-form').reset();
  state.editingTaskId = null;
}

async function submitTaskForm(e) {
  e.preventDefault();
  const errorEl = document.getElementById('task-error');
  errorEl.textContent = '';

  if (state.team.length === 0) {
    errorEl.textContent = 'Añade primero al menos un integrante al equipo.';
    return;
  }

  const payload = {
    title: document.getElementById('task-title').value,
    description: document.getElementById('task-description').value,
    assignee_id: Number(document.getElementById('task-assignee').value),
    priority: document.getElementById('task-priority').value,
    due_date: document.getElementById('task-due').value || null,
  };

  const isEdit = Boolean(state.editingTaskId);
  const url = isEdit ? `/api/tasks/${state.editingTaskId}` : '/api/tasks';
  const method = isEdit ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();

  if (!res.ok) {
    errorEl.textContent = data.error || 'No se pudo guardar la tarea.';
    return;
  }

  if (!isEdit) {
    if (data.mail && data.mail.sent) {
      showToast('Tarea creada y correo enviado.');
    } else if (data.mail && data.mail.dryRun) {
      showToast('Tarea creada. Modo prueba: configura Gmail para enviar correos reales.');
    } else {
      showToast('Tarea creada, pero no se pudo enviar el correo.');
    }
  } else {
    showToast('Tarea actualizada.');
  }

  closeTaskModal();
  await loadTasks();
}

// ---------- Modal de equipo ----------
function renderTeamList() {
  const el = document.getElementById('team-list');
  if (state.team.length === 0) {
    el.innerHTML = '<p style="color:#6b7280;font-size:13.5px;">Aún no hay integrantes.</p>';
    return;
  }
  el.innerHTML = state.team
    .map(
      (m) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #e5e7eb;">
        <div>
          <div style="font-weight:600;font-size:14px;">${escapeHtml(m.name)}</div>
          <div style="font-size:12.5px;color:#6b7280;">${escapeHtml(m.email)} · ${m.open_tasks || 0} tarea(s) abierta(s)</div>
        </div>
        <button class="btn-danger btn-sm" data-remove-member="${m.id}">Eliminar</button>
      </div>
    `
    )
    .join('');

  el.querySelectorAll('[data-remove-member]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.removeMember;
      const res = await fetch(`/api/team/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'No se pudo eliminar.');
        return;
      }
      await loadTeam();
    });
  });
}

async function submitTeamForm(e) {
  e.preventDefault();
  const errorEl = document.getElementById('team-error');
  errorEl.textContent = '';

  const payload = {
    name: document.getElementById('member-name').value,
    email: document.getElementById('member-email').value,
  };

  const res = await fetch('/api/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    errorEl.textContent = data.error || 'No se pudo añadir.';
    return;
  }
  document.getElementById('team-form').reset();
  await loadTeam();
  showToast('Integrante añadido.');
}

// ---------- Utilidades ----------
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

// ---------- Eventos ----------
function bindEvents() {
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    redirectToLogin();
  });

  document.getElementById('btn-new-task').addEventListener('click', () => openTaskModal(null));
  document.getElementById('task-cancel').addEventListener('click', closeTaskModal);
  document.getElementById('task-form').addEventListener('submit', submitTaskForm);
  document.getElementById('task-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'task-modal-overlay') closeTaskModal();
  });

  document.getElementById('btn-team').addEventListener('click', () => {
    document.getElementById('team-modal-overlay').classList.remove('hidden');
  });
  document.getElementById('team-close').addEventListener('click', () => {
    document.getElementById('team-modal-overlay').classList.add('hidden');
  });
  document.getElementById('team-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'team-modal-overlay') document.getElementById('team-modal-overlay').classList.add('hidden');
  });
  document.getElementById('team-form').addEventListener('submit', submitTeamForm);

  document.getElementById('filter-status').addEventListener('change', (e) => {
    state.filters.status = e.target.value;
    loadTasks();
  });
  document.getElementById('filter-priority').addEventListener('change', (e) => {
    state.filters.priority = e.target.value;
    loadTasks();
  });
  document.getElementById('filter-assignee').addEventListener('change', (e) => {
    state.filters.assignee_id = e.target.value;
    loadTasks();
  });
  document.getElementById('btn-refresh').addEventListener('click', loadTasks);
}
