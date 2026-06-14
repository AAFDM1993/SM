import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initAgendaView } from '../../../src/portal/views/agenda.js';
import { initAgendaHorarioView } from '../../../src/portal/views/agenda-horario.js';
import { setSession, getSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('../../../src/portal/views/agenda-horario.js', () => ({
  initAgendaHorarioView: vi.fn((container) => {
    container.textContent = 'agenda-horario-mock';
  }),
}));

const ADMIN_SESSION = { token: 'admin-tok', codigo: 'ADM001', rol: 'administrador', nombre: 'Admin', debeCambiarPassword: false };

const AGENDA_RESPONSE = {
  ok: true,
  horarioConfig: [],
  bloqueos: [],
  slots: [
    { fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', estado: 'ocupado', citaId: 'c1', pacienteNombre: 'M. Garcia', estadoCita: 'Programada' },
    { fecha: '2026-06-15', horaInicio: '09:45', horaFin: '10:30', estado: 'disponible' },
    { fecha: '2026-06-16', horaInicio: '09:00', horaFin: '09:45', estado: 'bloqueado' },
    { fecha: '2026-06-16', horaInicio: '09:45', horaFin: '10:30', estado: 'disponible' },
    { fecha: '2026-06-17', horaInicio: '09:00', horaFin: '09:45', estado: 'disponible' },
  ],
};

const PACIENTES_RESPONSE = {
  ok: true,
  pacientes: [
    { codigo: 'P001', nombre: 'Maria Garcia' },
    { codigo: 'P002', nombre: 'Juan Lopez' },
    { codigo: 'P003', nombre: 'Ana Ruiz' },
  ],
};

// Reimplementacion local de las funciones de fecha para calcular el valor
// esperado de "la semana actual" sin depender de mockear el reloj.
function formatearFecha(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

function ddmm(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initAgendaView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(ADMIN_SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockImplementation((accion) => {
      if (accion === 'leerAgenda') return Promise.resolve(AGENDA_RESPONSE);
      if (accion === 'listarPacientes') return Promise.resolve(PACIENTES_RESPONSE);
      return Promise.resolve({ error: 'Accion no reconocida' });
    });
    apiPost.mockReset();
    initAgendaHorarioView.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renderiza la cuadricula semanal a partir de leerAgenda', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const headerCells = container.querySelectorAll('.view-agenda__grid thead th');
    expect(headerCells.length).toBe(4);
    expect(headerCells[0].textContent).toBe('Hora');
    expect(headerCells[1].textContent).toBe('Lun 15');
    expect(headerCells[2].textContent).toBe('Mar 16');
    expect(headerCells[3].textContent).toBe('Mié 17');

    const rows = container.querySelectorAll('.view-agenda__grid tbody tr');
    expect(rows.length).toBe(2);

    const row1 = rows[0].querySelectorAll('td');
    expect(row1[0].textContent).toBe('09:00');
    expect(row1[1].className).toContain('view-agenda__cell--ocupado');
    expect(row1[1].textContent).toBe('M. Garcia');
    expect(row1[1].dataset.citaId).toBe('c1');
    expect(row1[2].className).toContain('view-agenda__cell--bloqueado');
    expect(row1[3].className).toContain('view-agenda__cell--disponible');

    const row2 = rows[1].querySelectorAll('td');
    expect(row2[0].textContent).toBe('09:45');
    expect(row2[1].className).toContain('view-agenda__cell--disponible');
    expect(row2[1].dataset.fecha).toBe('2026-06-15');
    expect(row2[1].dataset.horaInicio).toBe('09:45');
    expect(row2[2].className).toContain('view-agenda__cell--disponible');
    expect(row2[3].className).toContain('view-agenda__cell--vacio');
  });

  it('el rango de fechas por defecto es la semana actual (lunes a domingo)', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const lunes = lunesDeSemana(new Date());
    const domingo = sumarDias(lunes, 6);
    expect(apiGet).toHaveBeenCalledWith('leerAgenda', {
      token: 'admin-tok',
      fechaInicio: formatearFecha(lunes),
      fechaFin: formatearFecha(domingo),
    });
  });

  it('muestra el rango de la semana actual en el encabezado', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const lunes = lunesDeSemana(new Date());
    const domingo = sumarDias(lunes, 6);
    expect(container.querySelector('.view-agenda__semana-label').textContent).toBe(
      `Semana del ${ddmm(lunes)} al ${ddmm(domingo)}`
    );
  });

  it('la navegacion recarga leerAgenda con la semana anterior y siguiente', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const lunes = lunesDeSemana(new Date());
    const fechaInicioActual = formatearFecha(lunes);
    const fechaFinActual = formatearFecha(sumarDias(lunes, 6));

    container.querySelector('.view-agenda__prev').click();
    await flush();

    const lunesAnterior = sumarDias(lunes, -7);
    expect(apiGet).toHaveBeenLastCalledWith('leerAgenda', {
      token: 'admin-tok',
      fechaInicio: formatearFecha(lunesAnterior),
      fechaFin: formatearFecha(sumarDias(lunesAnterior, 6)),
    });

    container.querySelector('.view-agenda__next').click();
    await flush();

    expect(apiGet).toHaveBeenLastCalledWith('leerAgenda', {
      token: 'admin-tok',
      fechaInicio: fechaInicioActual,
      fechaFin: fechaFinActual,
    });
  });

  it('el boton Configurar horario abre el panel agenda-horario y Cerrar lo oculta y recarga', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const panel = container.querySelector('.view-agenda__panel');
    expect(panel.hidden).toBe(true);

    container.querySelector('.view-agenda__configurar-horario').click();

    expect(panel.hidden).toBe(false);
    expect(initAgendaHorarioView).toHaveBeenCalledWith(expect.any(HTMLElement), { session: ADMIN_SESSION, forced: false });
    expect(panel.textContent).toContain('agenda-horario-mock');

    const apiGetCallsBefore = apiGet.mock.calls.length;
    container.querySelector('.view-agenda__panel-cerrar').click();
    await flush();

    expect(panel.hidden).toBe(true);
    expect(apiGet.mock.calls.length).toBe(apiGetCallsBefore + 1);
  });

  it('muestra un error inline si leerAgenda devuelve un error', async () => {
    apiGet.mockResolvedValue({ error: 'fechaInicio y fechaFin son requeridos' });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const errorEl = container.querySelector('.view-agenda__error');
    expect(errorEl.textContent).toBe('fechaInicio y fechaFin son requeridos');
    expect(errorEl.hidden).toBe(false);
  });

  it('redirige al login si leerAgenda devuelve No autorizado', async () => {
    apiGet.mockResolvedValue({ error: 'No autorizado' });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });

  it('al hacer click en una celda disponible se abre el formulario Nueva cita', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--disponible[data-fecha="2026-06-15"][data-hora-inicio="09:45"]');
    cell.click();
    await flush();

    expect(apiGet).toHaveBeenCalledWith('listarPacientes', { token: 'admin-tok' });

    const panel = container.querySelector('.view-agenda__cita-panel');
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('2026-06-15');
    expect(panel.textContent).toContain('09:45 a 10:30');
  });

  it('el formulario Nueva cita filtra pacientes por nombre mientras se escribe', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--disponible[data-fecha="2026-06-15"][data-hora-inicio="09:45"]');
    cell.click();
    await flush();

    const input = container.querySelector('.view-agenda__paciente-input');
    input.value = 'gar';
    input.dispatchEvent(new Event('input'));

    const resultados = container.querySelectorAll('.view-agenda__paciente-resultados li');
    expect(resultados.length).toBe(1);
    expect(resultados[0].textContent).toBe('Maria Garcia');
  });

  it('Guardar llama a crearCita con fecha, horaInicio y pacienteCodigo, y recarga la cuadricula', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      cita: { id: 'c2', fecha: '2026-06-15', horaInicio: '09:45', horaFin: '10:30', pacienteCodigo: 'P001', pacienteNombre: 'Maria Garcia', estado: 'Programada' },
    });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--disponible[data-fecha="2026-06-15"][data-hora-inicio="09:45"]');
    cell.click();
    await flush();

    const input = container.querySelector('.view-agenda__paciente-input');
    input.value = 'gar';
    input.dispatchEvent(new Event('input'));
    container.querySelector('.view-agenda__paciente-resultados li').click();

    const apiGetCallsBefore = apiGet.mock.calls.length;
    container.querySelector('.view-agenda__guardar-cita').click();
    await flush();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'crearCita',
      token: 'admin-tok',
      fecha: '2026-06-15',
      horaInicio: '09:45',
      pacienteCodigo: 'P001',
    });
    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(true);
    expect(apiGet.mock.calls.length).toBe(apiGetCallsBefore + 1);
  });

  it('muestra un error inline si crearCita falla', async () => {
    apiPost.mockResolvedValue({ error: 'Slot no disponible' });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--disponible[data-fecha="2026-06-15"][data-hora-inicio="09:45"]');
    cell.click();
    await flush();

    const input = container.querySelector('.view-agenda__paciente-input');
    input.value = 'gar';
    input.dispatchEvent(new Event('input'));
    container.querySelector('.view-agenda__paciente-resultados li').click();

    container.querySelector('.view-agenda__guardar-cita').click();
    await flush();

    const errorEl = container.querySelector('.view-agenda__cita-error');
    expect(errorEl.textContent).toBe('Slot no disponible');
    expect(errorEl.hidden).toBe(false);
  });

  it('muestra un error inline si se intenta Guardar sin seleccionar un paciente', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--disponible[data-fecha="2026-06-15"][data-hora-inicio="09:45"]');
    cell.click();
    await flush();

    container.querySelector('.view-agenda__guardar-cita').click();
    await flush();

    const errorEl = container.querySelector('.view-agenda__cita-error');
    expect(errorEl.textContent).toBe('Selecciona un paciente de la lista');
    expect(errorEl.hidden).toBe(false);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('Cancelar cierra el formulario Nueva cita sin llamar a crearCita', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--disponible[data-fecha="2026-06-15"][data-hora-inicio="09:45"]');
    cell.click();
    await flush();

    container.querySelector('.view-agenda__cancelar-cita').click();

    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(true);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('redirige al login si listarPacientes devuelve No autorizado', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'leerAgenda') return Promise.resolve(AGENDA_RESPONSE);
      if (accion === 'listarPacientes') return Promise.resolve({ error: 'No autorizado' });
      return Promise.resolve({ error: 'Accion no reconocida' });
    });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--disponible[data-fecha="2026-06-15"][data-hora-inicio="09:45"]');
    cell.click();
    await flush();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });

  it('al hacer click en una celda ocupada se abre el panel Detalle de cita con botones de accion', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();

    const panel = container.querySelector('.view-agenda__cita-panel');
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('M. Garcia');
    expect(panel.textContent).toContain('2026-06-15');
    expect(panel.textContent).toContain('09:00 a 09:45');
    expect(panel.textContent).toContain('Programada');
    expect(container.querySelector('.view-agenda__marcar-completada')).not.toBeNull();
    expect(container.querySelector('.view-agenda__cancelar-cita-existente')).not.toBeNull();
  });

  it('Marcar completada llama a cambiarEstadoCita con estado Completada y recarga la cuadricula', async () => {
    apiPost.mockResolvedValue({ ok: true });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();

    const apiGetCallsBefore = apiGet.mock.calls.length;
    container.querySelector('.view-agenda__marcar-completada').click();
    await flush();

    expect(apiPost).toHaveBeenCalledWith({ accion: 'cambiarEstadoCita', token: 'admin-tok', citaId: 'c1', estado: 'Completada' });
    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(true);
    expect(apiGet.mock.calls.length).toBe(apiGetCallsBefore + 1);
  });

  it('el boton Cancelar del detalle llama a cambiarEstadoCita con estado Cancelada', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    apiPost.mockResolvedValue({ ok: true });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();

    container.querySelector('.view-agenda__cancelar-cita-existente').click();
    await flush();

    expect(apiPost).toHaveBeenCalledWith({ accion: 'cambiarEstadoCita', token: 'admin-tok', citaId: 'c1', estado: 'Cancelada' });
  });

  it('el boton Cancelar del detalle no llama a cambiarEstadoCita si se cancela la confirmacion', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();

    container.querySelector('.view-agenda__cancelar-cita-existente').click();
    await flush();

    expect(apiPost).not.toHaveBeenCalled();
    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(false);
  });

  it('muestra un error inline si cambiarEstadoCita falla', async () => {
    apiPost.mockResolvedValue({ error: 'Solo se puede cambiar el estado de una cita Programada' });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();

    container.querySelector('.view-agenda__marcar-completada').click();
    await flush();

    const errorEl = container.querySelector('.view-agenda__detalle-error');
    expect(errorEl.textContent).toBe('Solo se puede cambiar el estado de una cita Programada');
    expect(errorEl.hidden).toBe(false);
  });

  it('una cita en estado Completada o Cancelada se muestra de solo lectura sin botones de accion', async () => {
    const response = {
      ...AGENDA_RESPONSE,
      slots: AGENDA_RESPONSE.slots.map((s) =>
        s.citaId === 'c1' ? { ...s, estadoCita: 'Completada' } : s
      ),
    };
    apiGet.mockImplementation((accion) => {
      if (accion === 'leerAgenda') return Promise.resolve(response);
      if (accion === 'listarPacientes') return Promise.resolve(PACIENTES_RESPONSE);
      return Promise.resolve({ error: 'Accion no reconocida' });
    });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();

    const panel = container.querySelector('.view-agenda__cita-panel');
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('Completada');
    expect(container.querySelector('.view-agenda__marcar-completada')).toBeNull();
    expect(container.querySelector('.view-agenda__cancelar-cita-existente')).toBeNull();
  });

  it('Cerrar cierra el panel Detalle de cita sin llamar a cambiarEstadoCita', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();

    container.querySelector('.view-agenda__cerrar-detalle').click();

    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(true);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('navegar a la semana anterior cierra el panel de cita si esta abierto', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();
    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(false);

    container.querySelector('.view-agenda__prev').click();
    await flush();

    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(true);
  });

  it('navegar a la semana siguiente cierra el panel de cita si esta abierto', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();
    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(false);

    container.querySelector('.view-agenda__next').click();
    await flush();

    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(true);
  });

  it('el boton Configurar horario cierra el panel de cita si esta abierto', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();
    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(false);

    container.querySelector('.view-agenda__configurar-horario').click();

    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(true);
  });
});
