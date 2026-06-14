import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initAgendaHorarioView } from '../../../src/portal/views/agenda-horario.js';
import { setSession, getSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const ADMIN_SESSION = { token: 'admin-tok', codigo: 'ADM001', rol: 'administrador', nombre: 'Admin', debeCambiarPassword: false };
const RECEPCION_SESSION = { token: 'rec-tok', codigo: 'REC001', rol: 'recepcion', nombre: 'Recepcion', debeCambiarPassword: false };

const HORARIO = [
  { diaSemana: 'Lunes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
  { diaSemana: 'Martes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
  { diaSemana: 'Miercoles', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
  { diaSemana: 'Jueves', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
  { diaSemana: 'Viernes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
  { diaSemana: 'Sabado', activo: false, horaInicio: '09:00', horaFin: '13:00', duracionSlotMin: 45 },
  { diaSemana: 'Domingo', activo: false, horaInicio: '09:00', horaFin: '13:00', duracionSlotMin: 45 },
];

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initAgendaHorarioView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(ADMIN_SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockResolvedValue({ ok: true, horario: HORARIO });
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renderiza las 7 filas del horario en orden Lunes a Domingo', async () => {
    initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    expect(apiGet).toHaveBeenCalledWith('leerHorarioConfig', { token: 'admin-tok' });
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(7);
    expect(rows[0].dataset.dia).toBe('Lunes');
    expect(rows[6].dataset.dia).toBe('Domingo');
    expect(rows[0].querySelector('.view-agenda-horario__activo').checked).toBe(true);
    expect(rows[5].querySelector('.view-agenda-horario__activo').checked).toBe(false);
    expect(rows[0].querySelector('.view-agenda-horario__hora-inicio').value).toBe('09:00');
    expect(rows[0].querySelector('.view-agenda-horario__duracion').value).toBe('45');
  });

  it('permite editar y guardar el horario para administrador', async () => {
    apiPost.mockResolvedValue({ ok: true });

    initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const rows = container.querySelectorAll('tbody tr');
    expect(rows[0].querySelector('.view-agenda-horario__activo').disabled).toBe(false);

    rows[0].querySelector('.view-agenda-horario__duracion').value = '30';

    const guardarButton = container.querySelector('.view-agenda-horario__guardar-horario');
    expect(guardarButton).not.toBeNull();
    guardarButton.click();
    await flush();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'actualizarHorarioConfig',
      token: 'admin-tok',
      horario: [
        { diaSemana: 'Lunes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 30 },
        { diaSemana: 'Martes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Miercoles', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Jueves', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Viernes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Sabado', activo: false, horaInicio: '09:00', horaFin: '13:00', duracionSlotMin: 45 },
        { diaSemana: 'Domingo', activo: false, horaInicio: '09:00', horaFin: '13:00', duracionSlotMin: 45 },
      ],
    });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('deshabilita los controles y oculta el boton Guardar horario para recepcion', async () => {
    initAgendaHorarioView(container, { session: RECEPCION_SESSION, forced: false });
    await flush();

    const rows = container.querySelectorAll('tbody tr');
    rows.forEach((row) => {
      row.querySelectorAll('input').forEach((input) => {
        expect(input.disabled).toBe(true);
      });
    });
    expect(container.querySelector('.view-agenda-horario__guardar-horario')).toBeNull();
  });

  it('muestra un error inline si actualizarHorarioConfig falla', async () => {
    apiPost.mockResolvedValue({ error: 'horaInicio debe ser menor que horaFin (Lunes)' });

    initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    container.querySelector('.view-agenda-horario__guardar-horario').click();
    await flush();

    const horarioError = container.querySelector('.view-agenda-horario__horario-error');
    expect(horarioError.textContent).toBe('horaInicio debe ser menor que horaFin (Lunes)');
    expect(horarioError.hidden).toBe(false);
  });

  it('redirige al login si leerHorarioConfig devuelve No autorizado', async () => {
    apiGet.mockResolvedValue({ error: 'No autorizado' });

    initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });
});
