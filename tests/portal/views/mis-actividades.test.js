import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initMisActividadesView } from '../../../src/portal/views/mis-actividades.js';
import { setSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const SESSION = { token: 'usr-tok', codigo: 'PAC001', rol: 'usuario', nombre: 'Maria', debeCambiarPassword: false };

function getTareaUnica() {
  return {
    id: 't1', titulo: 'Meditar', tipo: 'única', frecuencia: '',
    fechaInicio: '2020-01-10', fechaFin: '2020-01-10',
    registros: [],
  };
}

function getTareaCompletada() {
  return {
    id: 't2', titulo: 'Caminar', tipo: 'única', frecuencia: '',
    fechaInicio: '2020-01-10', fechaFin: '2020-01-10',
    registros: [{ id: 'r1', fechaOcurrencia: '2020-01-10', nota: 'Bien', fechaCompletacion: '2020-01-10T20:00:00.000Z' }],
  };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initMisActividadesView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockResolvedValue({ ok: true, tareas: [] });
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('llama listarMisActividades con el token de sesión', async () => {
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    expect(apiGet).toHaveBeenCalledWith('listarMisActividades', { token: 'usr-tok' });
  });

  it('muestra "No hay actividades pendientes" cuando no hay tareas', async () => {
    apiGet.mockResolvedValue({ ok: true, tareas: [] });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    expect(container.querySelector('.view-mis-actividades__pendientes-lista').textContent)
      .toContain('No hay actividades pendientes');
  });

  it('muestra ocurrencias pendientes con botón Marcar cumplida', async () => {
    apiGet.mockResolvedValue({ ok: true, tareas: [getTareaUnica()] });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const btns = container.querySelectorAll('.view-mis-actividades__btn-cumplir');
    expect(btns.length).toBe(1);
    expect(btns[0].dataset.tareaId).toBe('t1');
    expect(btns[0].dataset.fecha).toBe('2020-01-10');
  });

  it('Marcar cumplida expande el formulario inline', async () => {
    apiGet.mockResolvedValue({ ok: true, tareas: [getTareaUnica()] });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const btn = container.querySelector('.view-mis-actividades__btn-cumplir');
    const form = container.querySelector('.view-mis-actividades__form-cumplir');
    expect(form.hidden).toBe(true);
    btn.click();
    expect(form.hidden).toBe(false);
  });

  it('confirmar llama completarOcurrencia con tareaId y fechaOcurrencia correctos', async () => {
    apiGet.mockResolvedValue({ ok: true, tareas: [getTareaUnica()] });
    apiPost.mockResolvedValue({
      ok: true,
      registro: { id: 'r1', tareaId: 't1', fechaOcurrencia: '2020-01-10', nota: '', completadoPor: 'PAC001', fechaCompletacion: new Date().toISOString() },
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelector('.view-mis-actividades__btn-cumplir').click();
    container.querySelector('.view-mis-actividades__btn-confirmar').click();
    await flush();
    expect(apiPost).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'completarOcurrencia',
      token: 'usr-tok',
      tareaId: 't1',
      fechaOcurrencia: '2020-01-10',
    }));
  });

  it('confirmar exitoso mueve la ocurrencia a la tabla de completadas', async () => {
    apiGet.mockResolvedValue({ ok: true, tareas: [getTareaUnica()] });
    apiPost.mockResolvedValue({
      ok: true,
      registro: { id: 'r1', tareaId: 't1', fechaOcurrencia: '2020-01-10', nota: 'Hecha', completadoPor: 'PAC001', fechaCompletacion: '2020-01-10T20:00:00.000Z' },
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelector('.view-mis-actividades__btn-cumplir').click();
    container.querySelector('.view-mis-actividades__btn-confirmar').click();
    await flush();
    expect(container.querySelector('.view-mis-actividades__pendientes-lista').textContent)
      .toContain('No hay actividades pendientes');
    const filas = container.querySelectorAll('.view-mis-actividades__completadas-tabla tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Meditar');
    expect(filas[0].textContent).toContain('2020-01-10');
  });

  it('muestra tabla de completadas con tareas ya completadas', async () => {
    apiGet.mockResolvedValue({ ok: true, tareas: [getTareaCompletada()] });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const filas = container.querySelectorAll('.view-mis-actividades__completadas-tabla tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Caminar');
    expect(filas[0].textContent).toContain('2020-01-10');
    expect(filas[0].textContent).toContain('Bien');
  });
});
