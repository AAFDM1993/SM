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

  const bloqueosHeading = document.createElement('h2');
  bloqueosHeading.textContent = 'Bloqueos';
  wrapper.appendChild(bloqueosHeading);

  const bloqueosError = document.createElement('div');
  bloqueosError.className = 'view-agenda-horario__bloqueos-error';
  bloqueosError.hidden = true;
  wrapper.appendChild(bloqueosError);

  const bloqueosList = document.createElement('ul');
  bloqueosList.className = 'view-agenda-horario__bloqueos-list';
  wrapper.appendChild(bloqueosList);

  if (puedeEditar) {
    const bloqueoForm = document.createElement('form');
    bloqueoForm.className = 'view-agenda-horario__bloqueo-form';

    const fechaInicioInput = document.createElement('input');
    fechaInicioInput.type = 'date';
    fechaInicioInput.className = 'view-agenda-horario__bloqueo-fecha-inicio';
    bloqueoForm.appendChild(fechaInicioInput);

    const fechaFinInput = document.createElement('input');
    fechaFinInput.type = 'date';
    fechaFinInput.className = 'view-agenda-horario__bloqueo-fecha-fin';
    bloqueoForm.appendChild(fechaFinInput);

    const motivoInput = document.createElement('input');
    motivoInput.type = 'text';
    motivoInput.placeholder = 'Motivo (opcional)';
    motivoInput.className = 'view-agenda-horario__bloqueo-motivo';
    bloqueoForm.appendChild(motivoInput);

    const agregarButton = document.createElement('button');
    agregarButton.type = 'submit';
    agregarButton.className = 'button button--primary view-agenda-horario__bloqueo-agregar';
    agregarButton.textContent = 'Agregar bloqueo';
    bloqueoForm.appendChild(agregarButton);

    bloqueoForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleCrearBloqueo(false);
    });

    wrapper.appendChild(bloqueoForm);

    const bloqueoConfirm = document.createElement('div');
    bloqueoConfirm.className = 'view-agenda-horario__bloqueo-confirm';
    bloqueoConfirm.hidden = true;

    const confirmText = document.createElement('p');
    confirmText.textContent = 'Hay citas programadas en este rango:';
    bloqueoConfirm.appendChild(confirmText);

    const citasAfectadasList = document.createElement('ul');
    citasAfectadasList.className = 'view-agenda-horario__citas-afectadas';
    bloqueoConfirm.appendChild(citasAfectadasList);

    const confirmarButton = document.createElement('button');
    confirmarButton.type = 'button';
    confirmarButton.className = 'button button--primary view-agenda-horario__bloqueo-confirmar';
    confirmarButton.textContent = 'Crear bloqueo de todos modos';
    confirmarButton.addEventListener('click', () => handleCrearBloqueo(true));
    bloqueoConfirm.appendChild(confirmarButton);

    const cancelarConfirmButton = document.createElement('button');
    cancelarConfirmButton.type = 'button';
    cancelarConfirmButton.className = 'view-agenda-horario__bloqueo-cancelar-confirm';
    cancelarConfirmButton.textContent = 'Cancelar';
    cancelarConfirmButton.addEventListener('click', () => {
      bloqueoConfirm.hidden = true;
    });
    bloqueoConfirm.appendChild(cancelarConfirmButton);

    wrapper.appendChild(bloqueoConfirm);
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

  async function loadBloqueos() {
    const result = await apiGet('leerBloqueos', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      bloqueosError.textContent = result.error;
      bloqueosError.hidden = false;
      return;
    }
    bloqueosError.hidden = true;
    renderBloqueosList(result.bloqueos);
  }

  function renderBloqueosList(bloqueos) {
    bloqueosList.innerHTML = '';
    bloqueos.forEach((bloqueo) => {
      const li = document.createElement('li');
      li.className = 'view-agenda-horario__bloqueo-item';
      li.dataset.id = bloqueo.id;

      const texto = document.createElement('span');
      texto.textContent = `${bloqueo.fechaInicio} – ${bloqueo.fechaFin}: ${bloqueo.motivo}`;
      li.appendChild(texto);

      if (puedeEditar) {
        const eliminarButton = document.createElement('button');
        eliminarButton.type = 'button';
        eliminarButton.className = 'view-agenda-horario__bloqueo-eliminar';
        eliminarButton.textContent = 'Eliminar';
        eliminarButton.addEventListener('click', () => handleEliminarBloqueo(bloqueo.id));
        li.appendChild(eliminarButton);
      }

      bloqueosList.appendChild(li);
    });
  }

  async function handleEliminarBloqueo(bloqueoId) {
    if (!window.confirm('¿Eliminar este bloqueo?')) return;
    const result = await apiPost({ accion: 'eliminarBloqueo', token: ctx.session.token, bloqueoId });
    if (result.error) {
      if (handleAuthError(result)) return;
      bloqueosError.textContent = result.error;
      bloqueosError.hidden = false;
      return;
    }
    bloqueosError.hidden = true;
    await loadBloqueos();
  }

  async function handleCrearBloqueo(confirmar) {
    bloqueosError.hidden = true;

    const fechaInicio = wrapper.querySelector('.view-agenda-horario__bloqueo-fecha-inicio').value;
    const fechaFin = wrapper.querySelector('.view-agenda-horario__bloqueo-fecha-fin').value;
    const motivo = wrapper.querySelector('.view-agenda-horario__bloqueo-motivo').value;

    const result = await apiPost({ accion: 'crearBloqueo', token: ctx.session.token, fechaInicio, fechaFin, motivo, confirmar });
    if (result.error) {
      if (handleAuthError(result)) return;
      bloqueosError.textContent = result.error;
      bloqueosError.hidden = false;
      return;
    }

    const bloqueoConfirm = wrapper.querySelector('.view-agenda-horario__bloqueo-confirm');
    if (result.requiereConfirmacion) {
      const citasAfectadasList = wrapper.querySelector('.view-agenda-horario__citas-afectadas');
      citasAfectadasList.innerHTML = '';
      result.citasAfectadas.forEach((cita) => {
        const li = document.createElement('li');
        li.textContent = `${cita.fecha} ${cita.horaInicio} - ${cita.pacienteNombre}`;
        citasAfectadasList.appendChild(li);
      });
      bloqueoConfirm.hidden = false;
      return;
    }

    bloqueoConfirm.hidden = true;
    wrapper.querySelector('.view-agenda-horario__bloqueo-fecha-inicio').value = '';
    wrapper.querySelector('.view-agenda-horario__bloqueo-fecha-fin').value = '';
    wrapper.querySelector('.view-agenda-horario__bloqueo-motivo').value = '';
    await loadBloqueos();
  }

  loadHorario();
  loadBloqueos();
}
