import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initUsuariosView } from '../../../src/portal/views/usuarios.js';
import { setSession, getSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const SESSION = { token: 'admin-tok', codigo: 'admin', rol: 'administrador', nombre: 'Admin', debeCambiarPassword: false };

const USUARIOS = [
  { codigo: 'admin', rol: 'administrador', nombre: 'Admin' },
  { codigo: '0102030405', rol: 'usuario', nombre: 'Paciente Uno' },
];

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initUsuariosView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockResolvedValue({ ok: true, usuarios: USUARIOS });
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('carga y muestra la tabla de usuarios', async () => {
    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    expect(apiGet).toHaveBeenCalledWith('listarUsuarios', { token: 'admin-tok' });
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[1].textContent).toContain('0102030405');
    expect(rows[1].textContent).toContain('Paciente Uno');
    expect(rows[1].textContent).toContain('usuario');
  });

  it('redirige al login si listarUsuarios devuelve No autorizado', async () => {
    apiGet.mockResolvedValue({ error: 'No autorizado' });

    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });

  it('crea un usuario nuevo con los datos del formulario', async () => {
    apiPost.mockResolvedValue({ ok: true, accion: 'creado' });

    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelector('.view-usuarios > button').click();

    const form = container.querySelector('.view-usuarios__form');
    const inputs = form.querySelectorAll('input');
    inputs[0].value = '0607080910';
    inputs[1].value = 'Paciente Dos';
    inputs[2].value = 'clave123';
    form.querySelector('select').value = 'usuario';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'guardarUsuario',
      token: 'admin-tok',
      codigo: '0607080910',
      nombre: 'Paciente Dos',
      rol: 'usuario',
      password: 'clave123',
    });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('edita un usuario existente sin enviar password si se deja en blanco', async () => {
    apiPost.mockResolvedValue({ ok: true, accion: 'actualizado' });

    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    const editButtons = container.querySelectorAll('tbody tr button');
    editButtons[0].click(); // primer boton "Editar", fila de "admin"

    const form = container.querySelector('.view-usuarios__form');
    form.querySelectorAll('input')[1].value = 'Admin Editado';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'guardarUsuario',
      token: 'admin-tok',
      codigo: 'admin',
      nombre: 'Admin Editado',
      rol: 'administrador',
    });
  });

  it('muestra el error del backend si faltan campos requeridos', async () => {
    apiPost.mockResolvedValue({ error: 'codigo, rol y nombre son requeridos' });

    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelector('.view-usuarios > button').click();
    const form = container.querySelector('.view-usuarios__form');
    form.querySelectorAll('input')[2].value = 'clave123';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    const formError = container.querySelector('.view-usuarios__form-error');
    expect(formError.textContent).toBe('codigo, rol y nombre son requeridos');
    expect(formError.hidden).toBe(false);
  });

  it('elimina un usuario tras confirmar', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    apiPost.mockResolvedValue({ ok: true });

    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    const firstRowButtons = container.querySelectorAll('tbody tr')[0].querySelectorAll('button');
    firstRowButtons[1].click(); // boton "Eliminar" de la primera fila
    await flush();

    expect(apiPost).toHaveBeenCalledWith({ accion: 'eliminarUsuario', token: 'admin-tok', codigo: 'admin' });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('no elimina si se cancela la confirmacion', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    const firstRowButtons = container.querySelectorAll('tbody tr')[0].querySelectorAll('button');
    firstRowButtons[1].click();
    await flush();

    expect(apiPost).not.toHaveBeenCalled();
  });

  it('muestra un error inline si eliminar devuelve No encontrado', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    apiPost.mockResolvedValue({ error: 'No encontrado' });

    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    const firstRowButtons = container.querySelectorAll('tbody tr')[0].querySelectorAll('button');
    firstRowButtons[1].click();
    await flush();

    const errorEl = container.querySelector('.view-usuarios__error');
    expect(errorEl.textContent).toBe('No encontrado');
    expect(errorEl.hidden).toBe(false);
  });
});
