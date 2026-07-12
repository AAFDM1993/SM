import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initMisEscalasView } from '../../../src/portal/views/mis-escalas.js';
import { setSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const SESSION = { token: 'pac-tok', codigo: 'PAC001', rol: 'usuario', nombre: 'Maria', debeCambiarPassword: false };

const PENDIENTE = {
  id: 'app-1', pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1',
  modo: 'autoaplicada', estado: 'pendiente',
  puntajeTotal: null, partAPositivo: null,
  creadoPor: 'PSI001', fechaCreacion: '2026-07-12T10:00:00.000Z',
  completadoPor: '', fechaCompletada: '',
};

const COMPLETADA = {
  id: 'app-2', pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1',
  modo: 'manual', estado: 'completada',
  puntajeTotal: 35, partAPositivo: true,
  creadoPor: 'PSI001', fechaCreacion: '2026-07-10T10:00:00.000Z',
  completadoPor: 'PSI001', fechaCompletada: '2026-07-10T10:00:00.000Z',
};

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initMisEscalasView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockResolvedValue({ ok: true, escalas: [PENDIENTE, COMPLETADA] });
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('llama listarMisEscalas con el token de sesion', async () => {
    initMisEscalasView(container, { session: SESSION });
    await flush();
    expect(apiGet).toHaveBeenCalledWith('listarMisEscalas', { token: SESSION.token });
  });

  it('muestra boton Completar para escalas pendientes', async () => {
    initMisEscalasView(container, { session: SESSION });
    await flush();
    expect(container.querySelector('.view-mis-escalas__btn-completar')).not.toBeNull();
  });

  it('muestra escalas completadas en tabla con puntaje y Part A', async () => {
    initMisEscalasView(container, { session: SESSION });
    await flush();
    const tbody = container.querySelector('.view-mis-escalas__completadas-tabla tbody');
    expect(tbody).not.toBeNull();
    expect(tbody.textContent).toContain('35');
    expect(tbody.textContent).toContain('Positivo');
    expect(tbody.textContent).toContain('Aplicada por psiquiatra');
  });

  it('boton Completar muestra preguntas inline', async () => {
    initMisEscalasView(container, { session: SESSION });
    await flush();
    const btn = container.querySelector('.view-mis-escalas__btn-completar');
    btn.click();
    expect(container.querySelector('.view-mis-escalas__form-completar')).not.toBeNull();
    expect(container.querySelectorAll('input[type="radio"]').length).toBeGreaterThan(0);
  });

  it('completar escala llama completarEscala con aplicacionId correcto', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      aplicacion: { id: 'app-1', escalaTipo: 'asrs-v1.1', puntajeTotal: 36, partAPositivo: true, fechaCompletada: '2026-07-12T12:00:00.000Z' },
    });
    initMisEscalasView(container, { session: SESSION });
    await flush();
    container.querySelector('.view-mis-escalas__btn-completar').click();
    for (let i = 1; i <= 18; i++) {
      const radio = container.querySelector(`input[name="completar-app-1-q${i}"][value="2"]`);
      if (radio) radio.checked = true;
    }
    container.querySelector('.view-mis-escalas__completar-form').dispatchEvent(new Event('submit'));
    await flush();
    expect(apiPost).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'completarEscala',
      aplicacionId: 'app-1',
      token: SESSION.token,
    }));
  });

  it('validacion: error si no se responden todas las preguntas', async () => {
    initMisEscalasView(container, { session: SESSION });
    await flush();
    container.querySelector('.view-mis-escalas__btn-completar').click();
    // No seleccionamos radios
    container.querySelector('.view-mis-escalas__completar-form').dispatchEvent(new Event('submit'));
    await flush();
    expect(apiPost).not.toHaveBeenCalled();
    expect(container.querySelector('.view-mis-escalas__completar-error').hidden).toBe(false);
  });
});
