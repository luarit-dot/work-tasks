# Gestor de Tareas por Correo — guía de uso y despliegue

Aplicación de gestión de tareas para tu equipo:

- Tú (jefe de proyecto) entras a un cuadro de mandos privado con contraseña.
- Creas una tarea y la asignas a un integrante del equipo → la app le envía **un correo real** con los datos de la tarea y un botón **"Marcar como hecha"**.
- El integrante **no necesita cuenta ni contraseña**: solo hace clic en el botón del correo, confirma, y la tarea se marca como hecha automáticamente.
- Tu cuadro de mandos se actualiza solo (se refresca cada 20 segundos, y también tiene un botón "Actualizar ahora").

Incluye: prioridad (baja/media/alta/urgente), fecha límite (con aviso de tareas vencidas), agrupación por integrante, reenvío de correos, edición/eliminación de tareas y gestión del equipo.

Los datos se guardan en una base de datos **Postgres gratuita en Neon**, separada del servidor que ejecuta la app. Esto es importante: así, aunque el hosting gratuito "duerma" o se reinicie, tus tareas nunca se pierden.

---

## 1. Crear la base de datos gratuita en Neon (5 minutos)

1. Ve a https://neon.tech y crea una cuenta gratuita (no pide tarjeta).
2. Crea un proyecto nuevo (cualquier nombre, por ejemplo "gestor-tareas").
3. En el panel del proyecto, busca **Connection string** / "Cadena de conexión". Cópiala tal cual — tiene una forma parecida a:
   ```
   postgresql://usuario:contraseña@ep-xxxx-xxxx.region.aws.neon.tech/neondb?sslmode=require
   ```
4. Guarda esa cadena, la necesitarás como `DATABASE_URL` tanto para probar en tu ordenador como para desplegar.

La app crea las tablas que necesita sola la primera vez que arranca — no hace falta ejecutar nada más en Neon.

---

## 2. Probarla en tu ordenador (opcional pero recomendado)

Necesitas tener instalado [Node.js](https://nodejs.org/) (versión 18 o superior). No necesitas instalar Postgres: usarás directamente tu base de datos gratuita de Neon.

```bash
cd task-manager-app
npm install
cp .env.example .env
```

Abre `.env` con un editor de texto y rellena:

- `DATABASE_URL` → pega la cadena de conexión de Neon del paso 1.
- `ADMIN_PASSWORD` → la contraseña con la que entrarás al cuadro de mandos.
- `SESSION_SECRET` → cualquier cadena larga y aleatoria (por ejemplo, generada en https://1password.com/password-generator/).

Puedes dejar `GMAIL_USER` y `GMAIL_APP_PASSWORD` vacíos por ahora: la app funcionará en **modo prueba** (no envía correos reales, pero te muestra en la consola qué habría enviado y el enlace de "marcar como hecha", para que puedas probar todo el flujo).

```bash
npm start
```

Abre `http://localhost:3000`, entra con tu contraseña, añade un integrante del equipo (puedes poner tu propio correo para probar) y crea una tarea. En la consola donde ejecutaste `npm start` verás el enlace de "marcar como hecha"; ábrelo en el navegador para comprobar que funciona.

---

## 3. Conectar Gmail para enviar correos reales

1. Entra en tu cuenta de Gmail (recomendable crear una cuenta dedicada tipo `tareas.tuequipo@gmail.com`, aunque también puedes usar tu cuenta personal).
2. Activa la verificación en dos pasos si no la tienes ya: https://myaccount.google.com/signinoptions/two-step-verification
3. Ve a **Contraseñas de aplicaciones**: https://myaccount.google.com/apppasswords
4. Crea una nueva contraseña de aplicación (elige "Otra" y ponle un nombre como "Gestor de tareas"). Google te dará un código de 16 caracteres.
5. En tu archivo `.env` (o en las variables de entorno del hosting, ver más abajo):
   - `GMAIL_USER=` tu dirección de Gmail completa.
   - `GMAIL_APP_PASSWORD=` el código de 16 caracteres (puedes dejarlo con o sin espacios).

A partir de aquí, cada tarea nueva enviará un correo real.

> Gmail limita el envío a unos 500 correos/día por cuenta, más que suficiente para un equipo normal.

---

## 4. Desplegar gratis en Render (para tener una dirección pública)

Render ejecutará la app; Neon (paso 1) guarda los datos. Con esta combinación **no necesitas ningún plan de pago**: la app puede "dormirse" tras 15 minutos sin uso (la primera visita tras estar dormida tarda ~30-60 segundos en despertar — normal en un plan gratuito y sin importancia para una herramienta interna), pero como los datos viven en Neon, nunca se pierden aunque Render reinicie o duerma el servicio.

1. Sube la carpeta `task-manager-app` a un repositorio de GitHub (crea uno nuevo, privado si prefieres, y sube estos archivos).
2. Crea una cuenta gratuita en https://render.com (no pide tarjeta para el plan gratuito).
3. Pulsa **New +** → **Web Service** y conecta ese repositorio.
4. Configuración del servicio:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. En la pestaña **Environment**, añade estas variables (los mismos valores que tengas en tu `.env` local):
   - `DATABASE_URL` (la cadena de Neon)
   - `PGSSL` = `true`
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
   - `GMAIL_USER`
   - `GMAIL_APP_PASSWORD`
   - `MAIL_FROM_NAME`
   - `NODE_ENV` = `production`

   No hace falta que añadas `PORT`: Render la gestiona automáticamente.
6. Pulsa **Create Web Service**. Render instalará las dependencias y arrancará la app; tarda uno o dos minutos la primera vez.
7. Cuando termine, Render te da una URL pública (algo como `https://tu-app.onrender.com`). Vuelve a la pestaña **Environment** y añade una variable más:
   - `BASE_URL` = esa misma URL (así los enlaces de los correos apuntarán bien). Guarda; Render volverá a desplegar automáticamente.

Ya está: abre esa URL, entra con tu `ADMIN_PASSWORD`, añade tu equipo y empieza a asignar tareas.

### Alternativa: Railway.app

Funciona de forma muy parecida a Render (conecta el repositorio, añade las mismas variables de entorno). Ya no tiene un nivel gratuito permanente (solo un crédito inicial de un uso), así que Render es la opción recomendada si quieres coste cero de verdad.

---

## 5. Uso del día a día

- Entra en la URL pública de tu app con tu contraseña.
- **Gestionar equipo** → añade a cada persona (nombre + correo).
- **+ Nueva tarea** → título, descripción opcional, a quién se la asignas, prioridad y fecha límite → al guardar, se envía el correo automáticamente.
- Cuando la persona hace clic en "Marcar como hecha" en su correo y confirma, tu cuadro de mandos la muestra como **Hecha** (se refresca solo).
- Si necesitas marcarla tú manualmente, reenviar el correo, editarla o eliminarla, tienes esos botones en cada tarea.

## 6. Seguridad

- Solo tú entras al cuadro de mandos, con contraseña (protección adicional contra intentos de adivinarla).
- El enlace de cada correo es un código único y muy difícil de adivinar (48 caracteres aleatorios); solo sirve para esa tarea.
- Abrir el enlace **no** marca la tarea como hecha por sí solo (evita que un antivirus de correo la marque por error al "escanear" el enlace): hace falta pulsar el botón de confirmación en la página.
- No compartas tu archivo `.env` ni lo subas a un repositorio público (`.gitignore` ya lo excluye).
- La conexión a Neon va siempre cifrada (SSL).

## 7. Posibles mejoras futuras (no incluidas en esta primera versión)

- Recordatorios automáticos por correo para tareas vencidas.
- Estadísticas o exportar a Excel.
- Varios jefes de proyecto con su propio inicio de sesión.
- Actualización instantánea del cuadro de mandos (en vez de cada 20 segundos) mediante WebSockets.

Si quieres que añada alguna de estas, dímelo y la incorporamos.
