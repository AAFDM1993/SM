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

const BLOQUEOS = [
  { id: 'b1', fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' },
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
    apiGet.mockImplementation((accion) => {
      if (accion === 'leerHorarioConfig') return Promise.resolve({ ok: true, horario: HORARIO });
      if (accion === 'leerBloqueos') return Promise.resolve({ ok: true, bloqueos: BLOQUEOS });
      return Promise.resolve({ error: 'Accion no reconocida' });
    });
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
    expect(apiGet).toHaveBeenCalledTimes(3);
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

  describe('bloqueos', () => {
    it('renderiza la lista de bloqueos existentes y el boton Eliminar para administrador', async () => {
      initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
      await flush();

      expect(apiGet).toHaveBeenCalledWith('leerBloqueos', { token: 'admin-tok' });
      const items = container.querySelectorAll('.view-agenda-horario__bloqueo-item');
      expect(items.length).toBe(1);
      expect(items[0].textContent).toContain('2026-07-01 – 2026-07-15: Vacaciones');
      expect(items[0].querySelector('.view-agenda-horario__bloqueo-eliminar')).not.toBeNull();
    });

    it('permite eliminar un bloqueo para administrador', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      apiPost.mockResolvedValue({ ok: true });

      initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
      await flush();

      container.querySelector('.view-agenda-horario__bloqueo-eliminar').click();
      await flush();

      expect(apiPost).toHaveBeenCalledWith({ accion: 'eliminarBloqueo', token: 'admin-tok', bloqueoId: 'b1' });
      const bloqueosCalls = apiGet.mock.calls.filter(([accion]) => accion === 'leerBloqueos');
      expect(bloqueosCalls.length).toBe(2);
    });

    it('no elimina un bloqueo si se cancela la confirmacion', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
      await flush();

      container.querySelector('.view-agenda-horario__bloqueo-eliminar').click();
      await flush();

      expect(apiPost).not.toHaveBeenCalled();
    });

    it('permite agregar un bloqueo sin citas afectadas para administrador', async () => {
      apiPost.mockResolvedValue({ ok: true, bloqueo: { id: 'b2', fechaInicio: '2026-08-01', fechaFin: '2026-08-10', motivo: 'Curso' } });

      initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
      await flush();

      container.querySelector('.view-agenda-horario__bloqueo-fecha-inicio').value = '2026-08-01';
      container.querySelector('.view-agenda-horario__bloqueo-fecha-fin').value = '2026-08-10';
      container.querySelector('.view-agenda-horario__bloqueo-motivo').value = 'Curso';
      container.querySelector('.view-agenda-horario__bloqueo-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flush();

      expect(apiPost).toHaveBeenCalledWith({
        accion: 'crearBloqueo',
        token: 'admin-tok',
        fechaInicio: '2026-08-01',
        fechaFin: '2026-08-10',
        motivo: 'Curso',
        confirmar: false,
      });
      const bloqueosCalls = apiGet.mock.calls.filter(([accion]) => accion === 'leerBloqueos');
      expect(bloqueosCalls.length).toBe(2);
      expect(container.querySelector('.view-agenda-horario__bloqueo-fecha-inicio').value).toBe('');
    });

    it('muestra confirmacion si hay citas afectadas y permite confirmar la creacion', async () => {
      apiPost
        .mockResolvedValueOnce({
          ok: false,
          requiereConfirmacion: true,
          citasAfectadas: [{ id: 'c1', fecha: '2026-07-05', horaInicio: '09:00', pacienteNombre: 'M. Garcia' }],
        })
        .mockResolvedValueOnce({ ok: true, bloqueo: { id: 'b2', fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' } });

      initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
      await flush();

      container.querySelector('.view-agenda-horario__bloqueo-fecha-inicio').value = '2026-07-01';
      container.querySelector('.view-agenda-horario__bloqueo-fecha-fin').value = '2026-07-15';
      container.querySelector('.view-agenda-horario__bloqueo-motivo').value = 'Vacaciones';
      container.querySelector('.view-agenda-horario__bloqueo-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flush();

      const confirmBox = container.querySelector('.view-agenda-horario__bloqueo-confirm');
      expect(confirmBox.hidden).toBe(false);
      const citasAfectadas = confirmBox.querySelectorAll('.view-agenda-horario__citas-afectadas li');
      expect(citasAfectadas.length).toBe(1);
      expect(citasAfectadas[0].textContent).toBe('2026-07-05 09:00 - M. Garcia');

      container.querySelector('.view-agenda-horario__bloqueo-confirmar').click();
      await flush();

      expect(apiPost).toHaveBeenLastCalledWith({
        accion: 'crearBloqueo',
        token: 'admin-tok',
        fechaInicio: '2026-07-01',
        fechaFin: '2026-07-15',
        motivo: 'Vacaciones',
        confirmar: true,
      });
      expect(confirmBox.hidden).toBe(true);
    });

    it('muestra un error inline si crearBloqueo falla', async () => {
      apiPost.mockResolvedValue({ error: 'fechaInicio debe ser anterior o igual a fechaFin' });

      initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
      await flush();

      container.querySelector('.view-agenda-horario__bloqueo-fecha-inicio').value = '2026-07-15';
      container.querySelector('.view-agenda-horario__bloqueo-fecha-fin').value = '2026-07-01';
      container.querySelector('.view-agenda-horario__bloqueo-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flush();

      const bloqueosError = container.querySelector('.view-agenda-horario__bloqueos-error');
      expect(bloqueosError.textContent).toBe('fechaInicio debe ser anterior o igual a fechaFin');
      expect(bloqueosError.hidden).toBe(false);
    });

    it('oculta el formulario de bloqueos y el boton Eliminar para recepcion', async () => {
      initAgendaHorarioView(container, { session: RECEPCION_SESSION, forced: false });
      await flush();

      expect(container.querySelector('.view-agenda-horario__bloqueo-form')).toBeNull();
      expect(container.querySelector('.view-agenda-horario__bloqueo-eliminar')).toBeNull();
      const items = container.querySelectorAll('.view-agenda-horario__bloqueo-item');
      expect(items.length).toBe(1);
      expect(items[0].textContent).toContain('2026-07-01 – 2026-07-15: Vacaciones');
    });
  });
});
