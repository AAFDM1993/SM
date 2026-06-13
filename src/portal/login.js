import './login.css';
import { apiPost } from './api.js';
import { isAuthenticated, setSession, redirectTo, getQueryParam } from './session.js';

export function initLogin() {
  if (isAuthenticated()) {
    redirectTo('/portal/dashboard.html');
    return;
  }

  showBanner();

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    const codigo = document.getElementById('codigo').value.trim();
    const password = document.getElementById('password').value;

    if (!codigo || !password) {
      errorEl.textContent = 'Código y contraseña son requeridos';
      errorEl.hidden = false;
      return;
    }

    const result = await apiPost({ accion: 'login', codigo, password });

    if (result.error) {
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }

    setSession({
      token: result.token,
      codigo: result.codigo,
      rol: result.rol,
      nombre: result.nombre,
      debeCambiarPassword: !!result.debeCambiarPassword,
    });
    redirectTo('/portal/dashboard.html');
  });
}

function showBanner() {
  const banner = document.getElementById('login-banner');

  if (getQueryParam('expired') === '1') {
    banner.textContent = 'Tu sesión expiró. Por favor inicia sesión nuevamente.';
    banner.hidden = false;
  } else if (getQueryParam('passwordChanged') === '1') {
    banner.textContent = 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.';
    banner.hidden = false;
  }
}
