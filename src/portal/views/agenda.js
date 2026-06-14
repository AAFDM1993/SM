import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';
import { initAgendaHorarioView } from './agenda-horario.js';

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function formatearFecha(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatearFechaDDMM(fecha) {
  const [, m, d] = fecha.split('-');
  return `${d}/${m}`;
}

function formatearFechaCorta(fecha) {
  const date = new Date(`${fecha}T00:00:00`);
  const dia = (date.getDay() + 6) % 7;
  const d = String(date.getDate()).padStart(2, '0');
  return `${DIAS_CORTOS[dia]} ${d}`;
}

function lunesDeSemana(date) {
  const dia = (date.getDay() + 6) % 7;
  const lunes = new Date(date);
  lunes.setDate(date.getDate() - dia);
  return lunes;
}

function sumarDias(date, dias) {
  const result = new Date(date);
  result.setDate(date.getDate() + dias);
  return result;
}

export function initAgendaView(container, ctx) {
  container.innerHTML = '';

  let semanaInicio = lunesDeSemana(new Date());

  const wrapper = document.createElement('div');
  wrapper.className = 'view-agenda';

  const header = document.createElement('div');
  header.className = 'view-agenda__header';

  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.className = 'view-agenda__prev';
  prevButton.textContent = '‹';
  prevButton.addEventListener('click', () => {
    semanaInicio = sumarDias(semanaInicio, -7);
    loadAgenda();
  });
  header.appendChild(prevButton);

  const semanaLabel = document.createElement('span');
  semanaLabel.className = 'view-agenda__semana-label';
  header.appendChild(semanaLabel);

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'view-agenda__next';
  nextButton.textContent = '›';
  nextButton.addEventListener('click', () => {
    semanaInicio = sumarDias(semanaInicio, 7);
    loadAgenda();
  });
  header.appendChild(nextButton);

  const configurarHorarioButton = document.createElement('button');
  configurarHorarioButton.type = 'button';
  configurarHorarioButton.className = 'button button--primary view-agenda__configurar-horario';
  configurarHorarioButton.textContent = 'Configurar horario';
  configurarHorarioButton.addEventListener('click', () => {
    panelContainer.hidden = false;
    panelContainer.innerHTML = '';

    const cerrarButton = document.createElement('button');
    cerrarButton.type = 'button';
    cerrarButton.className = 'view-agenda__panel-cerrar';
    cerrarButton.textContent = 'Cerrar';
    cerrarButton.addEventListener('click', () => {
      panelContainer.hidden = true;
      panelContainer.innerHTML = '';
      loadAgenda();
    });
    panelContainer.appendChild(cerrarButton);

    const panelContent = document.createElement('div');
    panelContainer.appendChild(panelContent);
    initAgendaHorarioView(panelContent, ctx);
  });
  header.appendChild(configurarHorarioButton);

  wrapper.appendChild(header);

  const errorEl = document.createElement('div');
  errorEl.className = 'view-agenda__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const gridTable = document.createElement('table');
  gridTable.className = 'view-agenda__grid';
  wrapper.appendChild(gridTable);

  const panelContainer = document.createElement('div');
  panelContainer.className = 'view-agenda__panel';
  panelContainer.hidden = true;
  wrapper.appendChild(panelContainer);

  const citaPanel = document.createElement('div');
  citaPanel.className = 'view-agenda__cita-panel';
  citaPanel.hidden = true;
  wrapper.appendChild(citaPanel);

  container.appendChild(wrapper);

  async function loadAgenda() {
    const fechaInicio = formatearFecha(semanaInicio);
    const fechaFin = formatearFecha(sumarDias(semanaInicio, 6));
    semanaLabel.textContent = `Semana del ${formatearFechaDDMM(fechaInicio)} al ${formatearFechaDDMM(fechaFin)}`;

    const result = await apiGet('leerAgenda', { token: ctx.session.token, fechaInicio, fechaFin });
    if (result.error) {
      if (handleAuthError(result)) return;
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    renderGrid(result.slots);
  }

  function renderGrid(slots) {
    gridTable.innerHTML = '';

    const fechas = [...new Set(slots.map((s) => s.fecha))].sort();
    const horas = [...new Set(slots.map((s) => s.horaInicio))].sort();

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const horaTh = document.createElement('th');
    horaTh.textContent = 'Hora';
    headerRow.appendChild(horaTh);
    fechas.forEach((fecha) => {
      const th = document.createElement('th');
      th.textContent = formatearFechaCorta(fecha);
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    gridTable.appendChild(thead);

    const tbody = document.createElement('tbody');
    horas.forEach((hora) => {
      const tr = document.createElement('tr');
      const horaTd = document.createElement('td');
      horaTd.textContent = hora;
      tr.appendChild(horaTd);

      fechas.forEach((fecha) => {
        const slot = slots.find((s) => s.fecha === fecha && s.horaInicio === hora);
        const td = document.createElement('td');
        td.className = 'view-agenda__cell';

        if (!slot) {
          td.classList.add('view-agenda__cell--vacio');
        } else if (slot.estado === 'disponible') {
          td.classList.add('view-agenda__cell--disponible');
          td.dataset.fecha = slot.fecha;
          td.dataset.horaInicio = slot.horaInicio;
          td.dataset.horaFin = slot.horaFin;
          td.addEventListener('click', () => abrirNuevaCita(slot));
        } else if (slot.estado === 'ocupado') {
          td.classList.add('view-agenda__cell--ocupado');
          td.textContent = slot.pacienteNombre;
          td.dataset.citaId = slot.citaId;
          td.dataset.fecha = slot.fecha;
          td.dataset.horaInicio = slot.horaInicio;
          td.dataset.horaFin = slot.horaFin;
          td.dataset.estadoCita = slot.estadoCita;
        } else if (slot.estado === 'bloqueado') {
          td.classList.add('view-agenda__cell--bloqueado');
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
    gridTable.appendChild(tbody);
  }

  async function abrirNuevaCita(slot) {
    citaPanel.innerHTML = '';
    citaPanel.hidden = false;

    const heading = document.createElement('h3');
    heading.textContent = 'Nueva cita';
    citaPanel.appendChild(heading);

    const info = document.createElement('p');
    info.textContent = `Fecha: ${slot.fecha} — Horario: ${slot.horaInicio} a ${slot.horaFin}`;
    citaPanel.appendChild(info);

    const pacienteInput = document.createElement('input');
    pacienteInput.type = 'text';
    pacienteInput.className = 'view-agenda__paciente-input';
    pacienteInput.placeholder = 'Buscar paciente...';
    citaPanel.appendChild(pacienteInput);

    const pacienteCodigoInput = document.createElement('input');
    pacienteCodigoInput.type = 'hidden';
    pacienteCodigoInput.className = 'view-agenda__paciente-codigo';
    citaPanel.appendChild(pacienteCodigoInput);

    const resultadosList = document.createElement('ul');
    resultadosList.className = 'view-agenda__paciente-resultados';
    citaPanel.appendChild(resultadosList);

    const citaError = document.createElement('div');
    citaError.className = 'view-agenda__cita-error';
    citaError.hidden = true;
    citaPanel.appendChild(citaError);

    const guardarButton = document.createElement('button');
    guardarButton.type = 'button';
    guardarButton.className = 'button button--primary view-agenda__guardar-cita';
    guardarButton.textContent = 'Guardar';
    citaPanel.appendChild(guardarButton);

    const cancelarButton = document.createElement('button');
    cancelarButton.type = 'button';
    cancelarButton.className = 'view-agenda__cancelar-cita';
    cancelarButton.textContent = 'Cancelar';
    cancelarButton.addEventListener('click', () => {
      citaPanel.hidden = true;
      citaPanel.innerHTML = '';
    });
    citaPanel.appendChild(cancelarButton);

    const result = await apiGet('listarPacientes', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      citaError.textContent = result.error;
      citaError.hidden = false;
      return;
    }
    const pacientes = result.pacientes;

    pacienteInput.addEventListener('input', () => {
      const texto = pacienteInput.value.trim().toLowerCase();
      resultadosList.innerHTML = '';
      pacienteCodigoInput.value = '';
      if (!texto) return;
      pacientes
        .filter((p) => p.nombre.toLowerCase().includes(texto))
        .forEach((p) => {
          const li = document.createElement('li');
          li.textContent = p.nombre;
          li.addEventListener('click', () => {
            pacienteInput.value = p.nombre;
            pacienteCodigoInput.value = p.codigo;
            resultadosList.innerHTML = '';
          });
          resultadosList.appendChild(li);
        });
    });

    guardarButton.addEventListener('click', async () => {
      citaError.hidden = true;
      const resultCita = await apiPost({
        accion: 'crearCita',
        token: ctx.session.token,
        fecha: slot.fecha,
        horaInicio: slot.horaInicio,
        pacienteCodigo: pacienteCodigoInput.value,
      });
      if (resultCita.error) {
        if (handleAuthError(resultCita)) return;
        citaError.textContent = resultCita.error;
        citaError.hidden = false;
        return;
      }
      citaPanel.hidden = true;
      citaPanel.innerHTML = '';
      await loadAgenda();
    });
  }

  loadAgenda();
}
