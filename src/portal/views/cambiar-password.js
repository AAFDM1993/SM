import { apiPost } from '../api.js';
import { clearSession, redirectTo, handleAuthError } from '../session.js';

export function initCambiarPasswordView(container, ctx) {
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'view-cambiar-password';

  const heading = document.createElement('h2');
  heading.textContent = 'Cambiar contraseña';
  wrapper.appendChild(heading);

  if (ctx.forced) {
    const notice = document.createElement('p');
    notice.className = 'view-cambiar-password__notice';
    notice.textContent = 'Debes cambiar tu contraseña antes de continuar.';
    wrapper.appendChild(notice);
  }

  const form = document.createElement('form');
  form.className = 'view-cambiar-password__form';
  form.innerHTML = `
    <label for="password-actual">Contraseña actual</label>
    <input type="password" id="password-actual" autocomplete="current-password" />

    <label for="password-nueva">Contraseña nueva</label>
    <input type="password" id="password-nueva" autocomplete="new-password" />

    <label for="password-confirmar">Confirmar contraseña nueva</label>
    <input type="password" id="password-confirmar" autocomplete="new-password" />

    <button type="submit" class="button button--primary">Guardar</button>
  `;

  const errorEl = document.createElement('div');
  errorEl.className = 'view-cambiar-password__error';
  errorEl.hidden = true;
  form.appendChild(errorEl);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    const passwordActual = form.querySelector('#password-actual').value;
    const passwordNueva = form.querySelector('#password-nueva').value;
    const passwordConfirmar = form.querySelector('#password-confirmar').value;

    if (!passwordActual || !passwordNueva || !passwordConfirmar) {
      errorEl.textContent = 'Todos los campos son requeridos';
      errorEl.hidden = false;
      return;
    }

    if (passwordNueva.length < 6) {
      errorEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres';
      errorEl.hidden = false;
      return;
    }

    if (passwordNueva !== passwordConfirmar) {
      errorEl.textContent = 'Las contraseñas no coinciden';
      errorEl.hidden = false;
      return;
    }

    const result = await apiPost({
      accion: 'cambiarPassword',
      token: ctx.session.token,
      passwordActual,
      passwordNueva,
    });

    if (result.error) {
      if (handleAuthError(result)) return;
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }

    clearSession();
    redirectTo('/portal/?passwordChanged=1');
  });

  wrapper.appendChild(form);
  container.appendChild(wrapper);
}
