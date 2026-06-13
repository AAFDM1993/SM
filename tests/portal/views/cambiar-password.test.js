import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiPost } from '../../../src/portal/api.js';
import { initCambiarPasswordView } from '../../../src/portal/views/cambiar-password.js';
import { setSession, getSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const SESSION = { token: 'tok', codigo: '1', rol: 'usuario', nombre: 'Paciente', debeCambiarPassword: true };

describe('initCambiarPasswordView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function fillForm({ actual, nueva, confirmar }) {
    container.querySelector('#password-actual').value = actual;
    container.querySelector('#password-nueva').value = nueva;
    container.querySelector('#password-confirmar').value = confirmar;
  }

  function submitForm() {
    container.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('muestra el aviso de cambio obligatorio cuando ctx.forced es true', () => {
    initCambiarPasswordView(container, { session: SESSION, forced: true });

    expect(container.querySelector('.view-cambiar-password__notice').textContent).toBe(
      'Debes cambiar tu contraseña antes de continuar.'
    );
  });

  it('no muestra el aviso cuando ctx.forced es false', () => {
    initCambiarPasswordView(container, { session: SESSION, forced: false });

    expect(container.querySelector('.view-cambiar-password__notice')).toBeNull();
  });

  it('valida que todos los campos sean requeridos', async () => {
    initCambiarPasswordView(container, { session: SESSION, forced: false });

    fillForm({ actual: '', nueva: '', confirmar: '' });
    await submitForm();

    expect(apiPost).not.toHaveBeenCalled();
    const errorEl = container.querySelector('.view-cambiar-password__error');
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toBe('Todos los campos son requeridos');
  });

  it('valida la longitud minima de la nueva contrasena', async () => {
    initCambiarPasswordView(container, { session: SESSION, forced: false });

    fillForm({ actual: 'actual123', nueva: 'abc', confirmar: 'abc' });
    await submitForm();

    expect(apiPost).not.toHaveBeenCalled();
    const errorEl = container.querySelector('.view-cambiar-password__error');
    expect(errorEl.textContent).toBe('La nueva contraseña debe tener al menos 6 caracteres');
  });

  it('valida que la nueva contrasena y su confirmacion coincidan', async () => {
    initCambiarPasswordView(container, { session: SESSION, forced: false });

    fillForm({ actual: 'actual123', nueva: 'nueva123', confirmar: 'otra123' });
    await submitForm();

    expect(apiPost).not.toHaveBeenCalled();
    const errorEl = container.querySelector('.view-cambiar-password__error');
    expect(errorEl.textContent).toBe('Las contraseñas no coinciden');
  });

  it('limpia la sesion y redirige al login tras un cambio exitoso', async () => {
    apiPost.mockResolvedValue({ ok: true });

    initCambiarPasswordView(container, { session: SESSION, forced: true });

    fillForm({ actual: 'actual123', nueva: 'nueva123', confirmar: 'nueva123' });
    await submitForm();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'cambiarPassword',
      token: 'tok',
      passwordActual: 'actual123',
      passwordNueva: 'nueva123',
    });
    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?passwordChanged=1');
  });

  it('muestra el error del backend si la contrasena actual es incorrecta', async () => {
    apiPost.mockResolvedValue({ error: 'La contraseña actual es incorrecta' });

    initCambiarPasswordView(container, { session: SESSION, forced: false });

    fillForm({ actual: 'incorrecta', nueva: 'nueva123', confirmar: 'nueva123' });
    await submitForm();

    const errorEl = container.querySelector('.view-cambiar-password__error');
    expect(errorEl.textContent).toBe('La contraseña actual es incorrecta');
    expect(errorEl.hidden).toBe(false);
    expect(getSession()).toEqual(SESSION);
  });

  it('limpia la sesion y redirige al login si el token expiro', async () => {
    apiPost.mockResolvedValue({ error: 'No autorizado' });

    initCambiarPasswordView(container, { session: SESSION, forced: false });

    fillForm({ actual: 'actual123', nueva: 'nueva123', confirmar: 'nueva123' });
    await submitForm();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });
});
