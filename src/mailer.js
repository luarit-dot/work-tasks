const PRIORITY_LABELS = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
};

const PRIORITY_COLORS = {
  baja: '#4b7bec',
  media: '#f6a821',
  alta: '#e8590c',
  urgente: '#d6336c',
};
// Enviamos por la API HTTP de Brevo (https://api.brevo.com) en vez de SMTP.
// Render (y la mayoría de hostings gratuitos) bloquean los puertos SMTP salientes
// (587/465) en su plan gratuito para prevenir spam, así que una conexión SMTP directa
// a Gmail nunca llega a completarse ahí (da "Connection timeout"). La API HTTP de Brevo
// usa el puerto 443 normal, así que sí funciona. El remitente que se ve en el correo
// sigue siendo tu propio Gmail (BREVO_SENDER_EMAIL), verificado como "remitente" en Brevo.
function isMailConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}
function formatDueDate(dueDate) {
  if (!dueDate) return 'Sin fecha límite';
  try {
    const d = new Date(dueDate + 'T00:00:00');
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) {
    return dueDate;
  }
}
function buildTaskEmailHtml({ task, member, completeUrl }) {
  const priorityLabel = PRIORITY_LABELS[task.priority] || task.priority;
  const priorityColor = PRIORITY_COLORS[task.priority] || '#4b7bec';
  const dueLabel = formatDueDate(task.due_date);
  const description = task.description
    ? `<p style="margin:16px 0 0;color:#333;white-space:pre-wrap;line-height:1.5;">${escapeHtml(task.description)}</p>`
    : '';

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f5f7;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#1f2937;padding:20px 28px;">
        <p style="margin:0;color:#ffffff;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;">Nueva tarea asignada</p>
      </div>
      <div style="padding:28px;">
        <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Hola ${escapeHtml(member.name)},</p>
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">${escapeHtml(task.title)}</h1>
        <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
          <tr>
            <td style="padding:4px 0;color:#6b7280;font-size:13px;width:120px;">Prioridad</td>
            <td style="padding:4px 0;">
              <span style="background:${priorityColor};color:#ffffff;font-size:12px;padding:3px 10px;border-radius:999px;">${priorityLabel}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#6b7280;font-size:13px;">Fecha límite</td>
            <td style="padding:4px 0;color:#111827;font-size:14px;">${dueLabel}</td>
          </tr>
        </table>

        ${description}

        <div style="margin-top:28px;text-align:center;">
          <a href="${completeUrl}"
             style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;
                    font-size:15px;font-weight:bold;padding:12px 28px;border-radius:8px;">
            Marcar como hecha
          </a>
        </div>
        <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;text-align:center;">
          Pulsa el botón cuando hayas terminado la tarea. Se te pedirá confirmarlo antes de marcarla como completada.
        </p>
      </div>
    </div>
  </div>`;
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
/**
 * Envía el correo de asignación de tarea.
 * Devuelve { sent: boolean, dryRun: boolean, error?: string }
 */
async function sendTaskAssignedEmail({ task, member, baseUrl }) {
  const completeUrl = `${baseUrl.replace(/\/$/, '')}/completar/${task.token}`;
  const html = buildTaskEmailHtml({ task, member, completeUrl });
  const fromName = process.env.MAIL_FROM_NAME || 'Gestor de Tareas';

  if (!isMailConfigured()) {
    // Modo de prueba: no hay credenciales de Brevo configuradas.
    // Esto permite probar toda la app en local sin enviar correos reales.
    console.log('--- [MODO PRUEBA] No hay BREVO_API_KEY/BREVO_SENDER_EMAIL configurados. ---');
    console.log(`Correo que se habría enviado a: ${member.email}`);
    console.log(`Enlace para marcar como hecha: ${completeUrl}`);
    return { sent: false, dryRun: true, completeUrl };
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: fromName, email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email: member.email, name: member.name }],
        subject: `Nueva tarea asignada: ${task.title}`,
        htmlContent: html,
      }),
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new Error(`Brevo respondió ${res.status}: ${bodyText.slice(0, 300)}`);
    }

    return { sent: true, dryRun: false, completeUrl };
  } catch (err) {
    console.error('Error enviando correo:', err.message);
    return { sent: false, dryRun: false, error: err.message, completeUrl };
  }
}

module.exports = { sendTaskAssignedEmail, isMailConfigured };
