import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initMiAgendaView } from '../../../src/portal/views/mi-agenda.js';
import { setSession, getSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const USER_SESSION = { token: 'user-tok', codigo: 'PAC001', rol: 'usuario', nombre: 'Paciente Test', debeCambiarPassword: false };

const MI_AGENDA_RESPONSE = {
  ok: true,
  proximas: [
    { id: 'c6', fecha: '2026-06-17', horaInicio: '09:00', horaFin: '09:45', estado: 'Programada' },
    { id: 'c2', fecha: '2026-06-18', horaInicio: '10:30', horaFin: '11:15', estado: 'Programada' },
  ],
  historial: [
    { id: 'c4', fecha: '2026-06-19', horaInicio: '09:00', horaFin: '09:45', estado: 'Completada' },
    { id: 'c3', fecha: '2026-06-16', horaInicio: '09:00', horaFin: '09:45', estado: 'Cancelada' },
  ],
};

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initMiAgendaView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(USER_SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockResolvedValue(MI_AGENDA_RESPONSE);
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renderiza las proximas citas con boton Cancelar para citas Programadas', async () => {
    initMiAgendaView(container, { session: USER_SESSION, forced: false });
    await flush();

    expect(apiGet).toHaveBeenCalledWith('leerMiAgenda', { token: 'user-tok' });

    const items = container.querySelectorAll('.view-mi-agenda__proximas li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('2026-06-17 09:00 - 09:45 (Programada)');
    expect(items[0].querySelector('.view-mi-agenda__cancelar')).not.toBeNull();
    expect(items[1].textContent).toContain('2026-06-18 10:30 - 11:15 (Programada)');
  });

  it('renderiza el historial de solo lectura sin botones', async () => {
    initMiAgendaView(container, { session: USER_SESSION, forced: false });
    await flush();

    const items = container.querySelectorAll('.view-mi-agenda__historial li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('2026-06-19 09:00 - 09:45 (Completada)');
    expect(items[0].querySelector('button')).toBeNull();
    expect(items[1].textContent).toContain('2026-06-16 09:00 - 09:45 (Cancelada)');
  });

  it('muestra el estado vacio para proximas e historial cuando no hay citas', async () => {
    apiGet.mockResolvedValue({ ok: true, proximas: [], historial: [] });

    initMiAgendaView(container, { session: USER_SESSION, forced: false });
    await flush();

    expect(container.querySelector('.view-mi-agenda__proximas').textContent).toContain('No tienes citas próximas.');
    expect(container.querySelector('.view-mi-agenda__historial').textContent).toContain('No tienes citas en tu historial.');
  });

  it('permite cancelar una cita propia con confirmacion y recarga ambas listas', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    apiPost.mockResolvedValue({ ok: true });

    initMiAgendaView(container, { session: USER_SESSION, forced: false });
    await flush();

    container.querySelector('.view-mi-agenda__proximas li .view-mi-agenda__cancelar').click();
    await flush();

    expect(apiPost).toHaveBeenCalledWith({ accion: 'cancelarMiCita', token: 'user-tok', citaId: 'c6' });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('no cancela una cita si se cancela la confirmacion', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    initMiAgendaView(container, { session: USER_SESSION, forced: false });
    await flush();

    container.querySelector('.view-mi-agenda__proximas li .view-mi-agenda__cancelar').click();
    await flush();

    expect(apiPost).not.toHaveBeenCalled();
  });

  it('muestra un error inline si cancelarMiCita falla', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    apiPost.mockResolvedValue({ error: 'Solo se pueden cancelar citas Programadas' });

    initMiAgendaView(container, { session: USER_SESSION, forced: false });
    await flush();

    container.querySelector('.view-mi-agenda__proximas li .view-mi-agenda__cancelar').click();
    await flush();

    const errorEl = container.querySelector('.view-mi-agenda__error');
    expect(errorEl.textContent).toBe('Solo se pueden cancelar citas Programadas');
    expect(errorEl.hidden).toBe(false);
  });

  it('redirige al login si leerMiAgenda devuelve No autorizado', async () => {
    apiGet.mockResolvedValue({ error: 'No autorizado' });

    initMiAgendaView(container, { session: USER_SESSION, forced: false });
    await flush();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });
});
