import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';

export function initMiAgendaView(container, ctx) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'view-mi-agenda';

  const errorEl = document.createElement('div');
  errorEl.className = 'view-mi-agenda__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const proximasHeading = document.createElement('h2');
  proximasHeading.textContent = 'Próximas citas';
  wrapper.appendChild(proximasHeading);

  const proximasList = document.createElement('ul');
  proximasList.className = 'view-mi-agenda__proximas';
  wrapper.appendChild(proximasList);

  const historialHeading = document.createElement('h2');
  historialHeading.textContent = 'Historial';
  wrapper.appendChild(historialHeading);

  const historialList = document.createElement('ul');
  historialList.className = 'view-mi-agenda__historial';
  wrapper.appendChild(historialList);

  container.appendChild(wrapper);

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.hidden = true;
  }

  async function loadMiAgenda() {
    const result = await apiGet('leerMiAgenda', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    clearError();
    renderProximas(result.proximas);
    renderHistorial(result.historial);
  }

  function renderProximas(proximas) {
    proximasList.innerHTML = '';
    if (proximas.length === 0) {
      const li = document.createElement('li');
      li.className = 'view-mi-agenda__vacio';
      li.textContent = 'No tienes citas próximas.';
      proximasList.appendChild(li);
      return;
    }
    proximas.forEach((cita) => {
      const li = document.createElement('li');
      li.className = 'view-mi-agenda__cita';
      li.dataset.id = cita.id;

      const span = document.createElement('span');
      span.textContent = `${cita.fecha} ${cita.horaInicio} - ${cita.horaFin} (${cita.estado})`;
      li.appendChild(span);

      if (cita.estado === 'Programada') {
        const cancelarButton = document.createElement('button');
        cancelarButton.type = 'button';
        cancelarButton.className = 'view-mi-agenda__cancelar';
        cancelarButton.textContent = 'Cancelar';
        cancelarButton.addEventListener('click', () => handleCancelar(cita.id));
        li.appendChild(cancelarButton);
      }

      proximasList.appendChild(li);
    });
  }

  function renderHistorial(historial) {
    historialList.innerHTML = '';
    if (historial.length === 0) {
      const li = document.createElement('li');
      li.className = 'view-mi-agenda__vacio';
      li.textContent = 'No tienes citas en tu historial.';
      historialList.appendChild(li);
      return;
    }
    historial.forEach((cita) => {
      const li = document.createElement('li');
      li.className = 'view-mi-agenda__cita';
      li.textContent = `${cita.fecha} ${cita.horaInicio} - ${cita.horaFin} (${cita.estado})`;
      historialList.appendChild(li);
    });
  }

  async function handleCancelar(citaId) {
    if (!window.confirm('¿Cancelar esta cita?')) return;
    const result = await apiPost({ accion: 'cancelarMiCita', token: ctx.session.token, citaId });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    await loadMiAgenda();
  }

  loadMiAgenda();
}
