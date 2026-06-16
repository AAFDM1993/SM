import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initHistoriaClinicaView } from '../../../src/portal/views/historia-clinica.js';
import { setSession, getSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const SESSION = { token: 'psi-tok', codigo: 'PSI001', rol: 'psiquiatra', nombre: 'Dra. Petra', debeCambiarPassword: false };

const PACIENTES = [
  { codigo: '45678912', nombre: 'Maria Lopez', telefono: '987654321', email: 'maria@example.com' },
  { codigo: '78945612', nombre: 'Carlos Ruiz', telefono: '912345678', email: '' },
];

const ANTECEDENTES_MARIA = {
  codigo: '45678912',
  antecedentesPersonales: 'Hipertension',
  antecedentesPsiquiatricos: 'Trastorno de ansiedad',
  antecedentesFamiliares: 'Madre con depresion',
  alergias: 'Penicilina',
  medicacionActual: 'Sertralina 50mg',
  fechaActualizacion: '2026-06-01T10:00:00.000Z',
};

const NOTAS_MARIA = [
  { id: 'n2', fecha: '2026-06-10', motivoConsulta: 'Control', notas: 'Segunda nota', diagnostico: 'Estable', creadoPor: 'PSI001', fechaCreacion: new Date('2026-06-10T10:00:00Z') },
  { id: 'n1', fecha: '2026-06-01', motivoConsulta: 'Primera consulta', notas: 'Primera nota', diagnostico: '', creadoPor: 'PSI001', fechaCreacion: new Date('2026-06-01T10:00:00Z') },
];

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initHistoriaClinicaView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarFichasPacientes') return Promise.resolve({ ok: true, pacientes: PACIENTES });
      if (accion === 'leerAntecedentes') return Promise.resolve({ ok: true, antecedentes: ANTECEDENTES_MARIA });
      if (accion === 'listarNotasEvolucion') return Promise.resolve({ ok: true, notas: NOTAS_MARIA });
      if (accion === 'listarPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      return Promise.resolve({ error: 'Accion no reconocida' });
    });
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('carga y muestra la lista de pacientes', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    expect(apiGet).toHaveBeenCalledWith('listarFichasPacientes', { token: 'psi-tok' });
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('45678912');
    expect(rows[0].textContent).toContain('Maria Lopez');
  });

  it('filtra la lista por nombre o DNI', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    const buscarInput = container.querySelector('.view-historia-clinica__buscar');
    buscarInput.value = 'carlos';
    buscarInput.dispatchEvent(new Event('input'));

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Carlos Ruiz');
  });

  it('abre la ficha de un paciente al hacer click en una fila', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    const rows = container.querySelectorAll('tbody tr');
    rows[0].click();
    await flush();

    expect(apiGet).toHaveBeenCalledWith('leerAntecedentes', { token: 'psi-tok', codigo: '45678912' });
    expect(apiGet).toHaveBeenCalledWith('listarNotasEvolucion', { token: 'psi-tok', codigo: '45678912' });

    expect(container.querySelector('.view-historia-clinica__lista').hidden).toBe(true);
    expect(container.querySelector('.view-historia-clinica__ficha').hidden).toBe(false);
    expect(container.querySelector('.view-historia-clinica__ficha h3').textContent).toContain('Maria Lopez');
  });

  it('precarga el formulario de antecedentes con los datos existentes', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    expect(container.querySelector('.view-historia-clinica__campo-antecedentesPersonales').value).toBe('Hipertension');
    expect(container.querySelector('.view-historia-clinica__campo-alergias').value).toBe('Penicilina');
  });

  it('guarda los antecedentes y muestra mensaje de exito', async () => {
    apiPost.mockResolvedValue({ ok: true });

    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const textarea = container.querySelector('.view-historia-clinica__campo-antecedentesPersonales');
    textarea.value = 'Hipertension controlada';

    const form = container.querySelector('.view-historia-clinica__antecedentes-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'actualizarAntecedentes',
      token: 'psi-tok',
      codigo: '45678912',
      antecedentesPersonales: 'Hipertension controlada',
      antecedentesPsiquiatricos: 'Trastorno de ansiedad',
      antecedentesFamiliares: 'Madre con depresion',
      alergias: 'Penicilina',
      medicacionActual: 'Sertralina 50mg',
    });

    const success = container.querySelector('.view-historia-clinica__antecedentes-success');
    expect(success.hidden).toBe(false);
  });

  it('muestra el error del backend si falla guardar antecedentes', async () => {
    apiPost.mockResolvedValue({ error: 'Hoja de antecedentes no encontrada' });

    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const form = container.querySelector('.view-historia-clinica__antecedentes-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    const formError = container.querySelector('.view-historia-clinica__antecedentes-error');
    expect(formError.textContent).toBe('Hoja de antecedentes no encontrada');
    expect(formError.hidden).toBe(false);
  });

  it('muestra las notas de evolucion ordenadas, la mas reciente primero', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const items = container.querySelectorAll('.view-historia-clinica__nota');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Segunda nota');
    expect(items[0].textContent).toContain('Control');
    expect(items[1].textContent).toContain('Primera nota');
  });

  it('crea una nueva nota de evolucion y la antepone a la lista', async () => {
    const nuevaNota = { id: 'n3', pacienteCodigo: '45678912', fecha: '2026-06-15', motivoConsulta: 'Seguimiento', notas: 'Tercera nota', diagnostico: 'Mejoria', creadoPor: 'PSI001', fechaCreacion: new Date('2026-06-15T10:00:00Z') };
    apiPost.mockResolvedValue({ ok: true, nota: nuevaNota });

    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const form = container.querySelector('.view-historia-clinica__nota-form');
    form.querySelector('.view-historia-clinica__nota-motivo-input').value = 'Seguimiento';
    form.querySelector('.view-historia-clinica__nota-notas-input').value = 'Tercera nota';
    form.querySelector('.view-historia-clinica__nota-diagnostico-input').value = 'Mejoria';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(apiPost).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'crearNotaEvolucion',
      token: 'psi-tok',
      codigo: '45678912',
      motivoConsulta: 'Seguimiento',
      notas: 'Tercera nota',
      diagnostico: 'Mejoria',
    }));

    const items = container.querySelectorAll('.view-historia-clinica__nota');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('Tercera nota');

    expect(form.querySelector('.view-historia-clinica__nota-notas-input').value).toBe('');
  });

  it('valida que notas no este vacio antes de enviar', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const form = container.querySelector('.view-historia-clinica__nota-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    const formError = container.querySelector('.view-historia-clinica__nota-form-error');
    expect(formError.textContent).toBe('notas es requerido');
    expect(formError.hidden).toBe(false);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('vuelve a la lista al hacer click en Volver a la lista', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    container.querySelector('.view-historia-clinica__volver').click();

    expect(container.querySelector('.view-historia-clinica__lista').hidden).toBe(false);
    expect(container.querySelector('.view-historia-clinica__ficha').hidden).toBe(true);
  });

  it('redirige al login si listarFichasPacientes devuelve No autorizado', async () => {
    apiGet.mockResolvedValue({ error: 'No autorizado' });

    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });

  it('carga y muestra prescripciones al abrir ficha', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    expect(apiGet).toHaveBeenCalledWith('listarPrescripciones', { token: 'psi-tok', codigo: '45678912' });
    expect(container.querySelector('.view-historia-clinica__prescripciones')).not.toBeNull();
  });

  it('crea una nueva prescripcion y la antepone a la lista', async () => {
    const nuevaPrescripcion = { id: 'p1', pacienteCodigo: '45678912', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-15', fechaFin: '', creadoPor: 'PSI001', fechaCreacion: new Date() };
    apiPost.mockResolvedValue({ ok: true, prescripcion: nuevaPrescripcion });

    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const form = container.querySelector('.view-historia-clinica__prescripcion-form');
    form.querySelector('.view-historia-clinica__prescripcion-medicamento-input').value = 'Sertralina';
    form.querySelector('.view-historia-clinica__prescripcion-dosis-input').value = '50mg';
    form.querySelector('.view-historia-clinica__prescripcion-frecuencia-input').value = 'diario';
    form.querySelector('.view-historia-clinica__prescripcion-fechainicio-input').value = '2026-06-15';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(apiPost).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'crearPrescripcion',
      token: 'psi-tok',
      codigo: '45678912',
      medicamento: 'Sertralina',
    }));
    const items = container.querySelectorAll('.view-historia-clinica__prescripcion');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Sertralina');
  });

  it('valida campos requeridos antes de enviar prescripcion', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const form = container.querySelector('.view-historia-clinica__prescripcion-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    const formError = container.querySelector('.view-historia-clinica__prescripcion-form-error');
    expect(formError.hidden).toBe(false);
    expect(formError.textContent).toBe('medicamento, dosis, frecuencia y fechaInicio son requeridos');
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('limpia el formulario de prescripcion despues de crear', async () => {
    const nuevaPrescripcion = { id: 'p1', pacienteCodigo: '45678912', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-15', fechaFin: '', creadoPor: 'PSI001', fechaCreacion: new Date() };
    apiPost.mockResolvedValue({ ok: true, prescripcion: nuevaPrescripcion });

    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const form = container.querySelector('.view-historia-clinica__prescripcion-form');
    form.querySelector('.view-historia-clinica__prescripcion-medicamento-input').value = 'Sertralina';
    form.querySelector('.view-historia-clinica__prescripcion-dosis-input').value = '50mg';
    form.querySelector('.view-historia-clinica__prescripcion-frecuencia-input').value = 'diario';
    form.querySelector('.view-historia-clinica__prescripcion-fechainicio-input').value = '2026-06-15';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(form.querySelector('.view-historia-clinica__prescripcion-medicamento-input').value).toBe('');
    expect(form.querySelector('.view-historia-clinica__prescripcion-dosis-input').value).toBe('');
    expect(form.querySelector('.view-historia-clinica__prescripcion-frecuencia-input').value).toBe('');
    expect(form.querySelector('.view-historia-clinica__prescripcion-fechainicio-input').value).toBe(new Date().toISOString().slice(0, 10));
  });
});
