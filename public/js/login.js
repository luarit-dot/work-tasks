const form = document.getElementById('login-form');
const errorText = document.getElementById('error-text');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorText.textContent = '';
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errorText.textContent = data.error || 'No se pudo iniciar sesión.';
      return;
    }
    window.location.href = '/';
  } catch (err) {
    errorText.textContent = 'Error de conexión con el servidor.';
  }
});
