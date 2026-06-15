import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initPacientesView } from '../../../src/portal/views/pacientes.js';
import { setSession, getSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const SESSION = { token: 'rec-tok', codigo: 'REC001', rol: 'recepcion', nombre: 'Recepcion', debeCambiarPassword: false };

const PACIENTES = [
  { codigo: '45678912', nombre: 'Maria Lopez', telefono: '987654321', email: 'maria@example.com' },
  { codigo: '78945612', nombre: 'Carlos Ruiz', telefono: '912345678', email: '' },
];

const FICHA_CARLOS = {
  codigo: '78945612', nombre: 'Carlos Ruiz', fechaNacimiento: '1985-03-14', sexo: 'Masculino',
  telefono: '912345678', email: '', contactoEmergenciaNombre: 'Lucia Ruiz', contactoEmergenciaTelefono: '911223344',
};

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initPacientesView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarFichasPacientes') return Promise.resolve({ ok: true, pacientes: PACIENTES });
      if (accion === 'leerFichaPaciente') return Promise.resolve({ ok: true, paciente: FICHA_CARLOS });
      return Promise.resolve({ error: 'Accion no reconocida' });
    });
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('carga y muestra la lista de pacientes', async () => {
    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    expect(apiGet).toHaveBeenCalledWith('listarFichasPacientes', { token: 'rec-tok' });
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('45678912');
    expect(rows[0].textContent).toContain('Maria Lopez');
    expect(rows[0].textContent).toContain('987654321');
  });

  it('filtra la lista por nombre o DNI', async () => {
    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    const buscarInput = container.querySelector('.view-pacientes__buscar');
    buscarInput.value = 'carlos';
    buscarInput.dispatchEvent(new Event('input'));

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Carlos Ruiz');
  });

  it('crea un paciente nuevo con los datos del formulario', async () => {
    apiPost.mockResolvedValue({ ok: true, paciente: { codigo: '11223344', nombre: 'Nuevo Paciente' } });

    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelector('.view-pacientes__nuevo').click();

    const form = container.querySelector('.view-pacientes__form');
    const inputs = form.querySelectorAll('input');
    inputs[0].value = '11223344';
    inputs[1].value = 'Nuevo Paciente';
    inputs[2].value = '1995-01-20';
    form.querySelector('select').value = 'Masculino';
    inputs[3].value = '900111222';
    inputs[4].value = 'nuevo@example.com';
    inputs[5].value = 'Contacto Emergencia';
    inputs[6].value = '900333444';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'crearPaciente',
      token: 'rec-tok',
      codigo: '11223344',
      nombre: 'Nuevo Paciente',
      fechaNacimiento: '1995-01-20',
      sexo: 'Masculino',
      telefono: '900111222',
      email: 'nuevo@example.com',
      contactoEmergenciaNombre: 'Contacto Emergencia',
      contactoEmergenciaTelefono: '900333444',
    });

    const formSuccess = container.querySelector('.view-pacientes__form-success');
    expect(formSuccess.hidden).toBe(false);
    expect(formSuccess.textContent).toContain('11223344');
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('abre el formulario de edicion precargado al hacer click en una fila', async () => {
    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    const rows = container.querySelectorAll('tbody tr');
    rows[1].click(); // fila de Carlos Ruiz
    await flush();

    expect(apiGet).toHaveBeenCalledWith('leerFichaPaciente', { token: 'rec-tok', codigo: '78945612' });

    const form = container.querySelector('.view-pacientes__form');
    const inputs = form.querySelectorAll('input');
    expect(inputs[0].value).toBe('78945612');
    expect(inputs[0].disabled).toBe(true);
    expect(inputs[1].value).toBe('Carlos Ruiz');
    expect(inputs[2].value).toBe('1985-03-14');
    expect(form.querySelector('select').value).toBe('Masculino');
    expect(inputs[5].value).toBe('Lucia Ruiz');
    expect(inputs[6].value).toBe('911223344');
  });

  it('actualiza un paciente existente', async () => {
    apiPost.mockResolvedValue({ ok: true });

    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    const rows = container.querySelectorAll('tbody tr');
    rows[1].click();
    await flush();

    const form = container.querySelector('.view-pacientes__form');
    form.querySelectorAll('input')[1].value = 'Carlos Ruiz Garcia';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'actualizarPaciente',
      token: 'rec-tok',
      codigo: '78945612',
      nombre: 'Carlos Ruiz Garcia',
      fechaNacimiento: '1985-03-14',
      sexo: 'Masculino',
      telefono: '912345678',
      email: '',
      contactoEmergenciaNombre: 'Lucia Ruiz',
      contactoEmergenciaTelefono: '911223344',
    });
    expect(apiGet).toHaveBeenCalledTimes(3); // listar inicial + leerFicha + listar tras guardar
  });

  it('muestra el error del backend si la creacion falla', async () => {
    apiPost.mockResolvedValue({ error: 'Ya existe un usuario con ese código' });

    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelector('.view-pacientes__nuevo').click();
    const form = container.querySelector('.view-pacientes__form');
    form.querySelectorAll('input')[0].value = '45678912';
    form.querySelectorAll('input')[1].value = 'Alguien';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    const formError = container.querySelector('.view-pacientes__form-error');
    expect(formError.textContent).toBe('Ya existe un usuario con ese código');
    expect(formError.hidden).toBe(false);
  });

  it('valida campos obligatorios en el cliente antes de enviar', async () => {
    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelector('.view-pacientes__nuevo').click();
    const form = container.querySelector('.view-pacientes__form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    const formError = container.querySelector('.view-pacientes__form-error');
    expect(formError.textContent).toBe('codigo y nombre son requeridos');
    expect(formError.hidden).toBe(false);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('redirige al login si listarFichasPacientes devuelve No autorizado', async () => {
    apiGet.mockResolvedValue({ error: 'No autorizado' });

    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });
});
