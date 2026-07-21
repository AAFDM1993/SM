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

function getPrescripcionActiva() {
  return {
    id: 'p1',
    medicamento: 'Sertralina',
    dosis: '50mg',
    frecuencia: 'diario',
    fechaInicio: '2020-01-01',
    fechaFin: '',
    tomas: [],
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
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      if (accion === 'listarMisSintomas') return Promise.resolve({ ok: true, sintomas: [] });
      return Promise.resolve({ ok: true });
    });
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
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    expect(container.querySelector('.view-mis-actividades__pendientes-lista').textContent)
      .toContain('No hay actividades pendientes');
  });

  it('muestra ocurrencias pendientes con botón Marcar cumplida', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [getTareaUnica()] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      if (accion === 'listarMisSintomas') return Promise.resolve({ ok: true, sintomas: [] });
      return Promise.resolve({ ok: true });
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const btns = container.querySelectorAll('.view-mis-actividades__btn-cumplir');
    expect(btns.length).toBe(1);
    expect(btns[0].dataset.tareaId).toBe('t1');
    expect(btns[0].dataset.fecha).toBe('2020-01-10');
  });

  it('Marcar cumplida expande el formulario inline', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [getTareaUnica()] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      if (accion === 'listarMisSintomas') return Promise.resolve({ ok: true, sintomas: [] });
      return Promise.resolve({ ok: true });
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const btn = container.querySelector('.view-mis-actividades__btn-cumplir');
    const form = container.querySelector('.view-mis-actividades__form-cumplir');
    expect(form.hidden).toBe(true);
    btn.click();
    expect(form.hidden).toBe(false);
  });

  it('confirmar llama completarOcurrencia con tareaId y fechaOcurrencia correctos', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [getTareaUnica()] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      if (accion === 'listarMisSintomas') return Promise.resolve({ ok: true, sintomas: [] });
      return Promise.resolve({ ok: true });
    });
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
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [getTareaUnica()] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      if (accion === 'listarMisSintomas') return Promise.resolve({ ok: true, sintomas: [] });
      return Promise.resolve({ ok: true });
    });
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
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [getTareaCompletada()] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      if (accion === 'listarMisSintomas') return Promise.resolve({ ok: true, sintomas: [] });
      return Promise.resolve({ ok: true });
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const filas = container.querySelectorAll('.view-mis-actividades__completadas-tabla tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Caminar');
    expect(filas[0].textContent).toContain('2020-01-10');
    expect(filas[0].textContent).toContain('Bien');
  });

  it('llama listarMisPrescripciones con el token de sesión', async () => {
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    expect(apiGet).toHaveBeenCalledWith('listarMisPrescripciones', { token: 'usr-tok' });
  });

  it('muestra prescripción activa con medicamento, dosis y frecuencia', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [getPrescripcionActiva()] });
      if (accion === 'listarMisSintomas') return Promise.resolve({ ok: true, sintomas: [] });
      return Promise.resolve({ ok: true });
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const nombre = container.querySelector('.view-mis-actividades__prescripcion-nombre');
    expect(nombre.textContent).toBe('Sertralina — 50mg (diario)');
  });

  it('no muestra prescripción vencida en la sección de activas', async () => {
    const vencida = { id: 'p2', medicamento: 'Vieja', dosis: '10mg', frecuencia: 'diario', fechaInicio: '2020-01-01', fechaFin: '2020-01-31', tomas: [] };
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [vencida] });
      if (accion === 'listarMisSintomas') return Promise.resolve({ ok: true, sintomas: [] });
      return Promise.resolve({ ok: true });
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    expect(container.querySelector('.view-mis-actividades__prescripcion-item')).toBeNull();
    expect(container.querySelector('.view-mis-actividades__prescripciones-activas').textContent)
      .toContain('No hay prescripciones activas');
  });

  it('btn-toma expande el formulario inline', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [getPrescripcionActiva()] });
      if (accion === 'listarMisSintomas') return Promise.resolve({ ok: true, sintomas: [] });
      return Promise.resolve({ ok: true });
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const btn = container.querySelector('.view-mis-actividades__btn-toma');
    const form = container.querySelector('.view-mis-actividades__form-toma');
    expect(form.hidden).toBe(true);
    btn.click();
    expect(form.hidden).toBe(false);
  });

  it('confirmar toma llama registrarToma con prescripcionId y nota', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [getPrescripcionActiva()] });
      if (accion === 'listarMisSintomas') return Promise.resolve({ ok: true, sintomas: [] });
      return Promise.resolve({ ok: true });
    });
    apiPost.mockResolvedValue({
      ok: true,
      toma: { id: 'tom1', prescripcionId: 'p1', fechaHora: '2026-07-21T10:00:00.000Z', nota: 'test', completadoPor: 'PAC001' },
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelector('.view-mis-actividades__btn-toma').click();
    container.querySelector('.view-mis-actividades__toma-nota').value = 'test';
    container.querySelector('.view-mis-actividades__btn-confirmar-toma').click();
    await flush();
    expect(apiPost).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'registrarToma',
      token: 'usr-tok',
      prescripcionId: 'p1',
      nota: 'test',
    }));
  });

  it('confirmar exitoso agrega toma al historial y colapsa el form', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [getPrescripcionActiva()] });
      if (accion === 'listarMisSintomas') return Promise.resolve({ ok: true, sintomas: [] });
      return Promise.resolve({ ok: true });
    });
    apiPost.mockResolvedValue({
      ok: true,
      toma: { id: 'tom1', prescripcionId: 'p1', fechaHora: '2026-07-21T10:00:00.000Z', nota: '', completadoPor: 'PAC001' },
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelector('.view-mis-actividades__btn-toma').click();
    container.querySelector('.view-mis-actividades__btn-confirmar-toma').click();
    await flush();
    const filas = container.querySelectorAll('.view-mis-actividades__tomas-tabla tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Sertralina');
    expect(container.querySelector('.view-mis-actividades__form-toma').hidden).toBe(true);
  });

  it('llama listarMisSintomas con el token de sesión', async () => {
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    expect(apiGet).toHaveBeenCalledWith('listarMisSintomas', { token: 'usr-tok' });
  });

  it('muestra historial de síntomas con Fecha/Hora, Tipo e Intensidad', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      if (accion === 'listarMisSintomas') return Promise.resolve({
        ok: true,
        sintomas: [{ id: 's1', tipo: 'Ánimo', intensidad: 3, nota: 'bien', fechaHora: '2026-07-21T10:00:00.000Z' }],
      });
      return Promise.resolve({ ok: true });
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const filas = container.querySelectorAll('.view-mis-actividades__sintomas-tabla tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Ánimo');
    expect(filas[0].textContent).toContain('3');
    expect(filas[0].textContent).toContain('2026-07-21 10:00');
  });

  it('Registrar síntoma llama apiPost con accion, tipo, intensidad y nota', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      sintoma: { id: 's2', tipo: 'Ansiedad', intensidad: 4, nota: 'test', fechaHora: '2026-07-21T11:00:00.000Z' },
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelector('.view-mis-actividades__sintoma-nota').value = 'test';
    container.querySelector('.view-mis-actividades__btn-registrar-sintoma').click();
    await flush();
    expect(apiPost).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'registrarSintoma',
      token: 'usr-tok',
      nota: 'test',
    }));
  });

  it('error de API se muestra en el div de error del formulario', async () => {
    apiPost.mockResolvedValue({ error: 'Tipo de síntoma inválido' });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelector('.view-mis-actividades__btn-registrar-sintoma').click();
    await flush();
    const errorEl = container.querySelector('.view-mis-actividades__sintoma-form-error');
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toBe('Tipo de síntoma inválido');
  });

  it('éxito prepend síntoma al historial y limpia el formulario', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      sintoma: { id: 's3', tipo: 'Sueño', intensidad: 2, nota: '', fechaHora: '2026-07-21T12:00:00.000Z' },
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelector('.view-mis-actividades__sintoma-nota').value = 'algo';
    container.querySelector('.view-mis-actividades__btn-registrar-sintoma').click();
    await flush();
    const filas = container.querySelectorAll('.view-mis-actividades__sintomas-tabla tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Sueño');
    expect(container.querySelector('.view-mis-actividades__sintoma-nota').value).toBe('');
  });

  it('muestra historial vacío si sintomas: []', async () => {
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const tbody = container.querySelector('.view-mis-actividades__sintomas-tabla tbody');
    expect(tbody.querySelectorAll('tr').length).toBe(0);
  });
});
