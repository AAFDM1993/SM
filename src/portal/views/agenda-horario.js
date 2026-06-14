import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

export function initAgendaHorarioView(container, ctx) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'view-agenda-horario';

  const heading = document.createElement('h2');
  heading.textContent = 'Configurar horario';
  wrapper.appendChild(heading);

  const errorEl = document.createElement('div');
  errorEl.className = 'view-agenda-horario__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const horarioTable = document.createElement('table');
  horarioTable.className = 'view-agenda-horario__horario-table';
  wrapper.appendChild(horarioTable);

  const horarioError = document.createElement('div');
  horarioError.className = 'view-agenda-horario__horario-error';
  horarioError.hidden = true;
  wrapper.appendChild(horarioError);

  const puedeEditar = ctx.session.rol === 'administrador' || ctx.session.rol === 'psiquiatra';

  if (puedeEditar) {
    const guardarButton = document.createElement('button');
    guardarButton.type = 'button';
    guardarButton.className = 'button button--primary view-agenda-horario__guardar-horario';
    guardarButton.textContent = 'Guardar horario';
    guardarButton.addEventListener('click', handleGuardarHorario);
    wrapper.appendChild(guardarButton);
  }

  container.appendChild(wrapper);

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.hidden = true;
  }

  async function loadHorario() {
    const result = await apiGet('leerHorarioConfig', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    clearError();
    renderHorarioTable(result.horario);
  }

  function renderHorarioTable(horario) {
    horarioTable.innerHTML = '';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Día</th><th>Activo</th><th>Hora inicio</th><th>Hora fin</th><th>Duración (min)</th></tr>';
    horarioTable.appendChild(thead);

    const tbody = document.createElement('tbody');
    DIAS_SEMANA.forEach((dia) => {
      const fila = horario.find((f) => f.diaSemana === dia) || {
        diaSemana: dia, activo: false, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45,
      };

      const tr = document.createElement('tr');
      tr.dataset.dia = dia;

      const tdDia = document.createElement('td');
      tdDia.textContent = dia;
      tr.appendChild(tdDia);

      const tdActivo = document.createElement('td');
      const activoInput = document.createElement('input');
      activoInput.type = 'checkbox';
      activoInput.checked = !!fila.activo;
      activoInput.disabled = !puedeEditar;
      activoInput.className = 'view-agenda-horario__activo';
      tdActivo.appendChild(activoInput);
      tr.appendChild(tdActivo);

      const tdInicio = document.createElement('td');
      const inicioInput = document.createElement('input');
      inicioInput.type = 'time';
      inicioInput.value = fila.horaInicio;
      inicioInput.disabled = !puedeEditar;
      inicioInput.className = 'view-agenda-horario__hora-inicio';
      tdInicio.appendChild(inicioInput);
      tr.appendChild(tdInicio);

      const tdFin = document.createElement('td');
      const finInput = document.createElement('input');
      finInput.type = 'time';
      finInput.value = fila.horaFin;
      finInput.disabled = !puedeEditar;
      finInput.className = 'view-agenda-horario__hora-fin';
      tdFin.appendChild(finInput);
      tr.appendChild(tdFin);

      const tdDuracion = document.createElement('td');
      const duracionInput = document.createElement('input');
      duracionInput.type = 'number';
      duracionInput.value = String(fila.duracionSlotMin);
      duracionInput.disabled = !puedeEditar;
      duracionInput.className = 'view-agenda-horario__duracion';
      tdDuracion.appendChild(duracionInput);
      tr.appendChild(tdDuracion);

      tbody.appendChild(tr);
    });
    horarioTable.appendChild(tbody);
  }

  async function handleGuardarHorario() {
    horarioError.hidden = true;

    const horario = DIAS_SEMANA.map((dia) => {
      const tr = horarioTable.querySelector(`tbody tr[data-dia="${dia}"]`);
      return {
        diaSemana: dia,
        activo: tr.querySelector('.view-agenda-horario__activo').checked,
        horaInicio: tr.querySelector('.view-agenda-horario__hora-inicio').value,
        horaFin: tr.querySelector('.view-agenda-horario__hora-fin').value,
        duracionSlotMin: Number(tr.querySelector('.view-agenda-horario__duracion').value),
      };
    });

    const result = await apiPost({ accion: 'actualizarHorarioConfig', token: ctx.session.token, horario });
    if (result.error) {
      if (handleAuthError(result)) return;
      horarioError.textContent = result.error;
      horarioError.hidden = false;
      return;
    }
    await loadHorario();
  }

  loadHorario();
}
