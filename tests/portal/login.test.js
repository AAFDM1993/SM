import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiPost } from '../../src/portal/api.js';
import { initLogin } from '../../src/portal/login.js';
import { getSession, setSession } from '../../src/portal/session.js';

vi.mock('../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

function renderLoginPage() {
  document.body.innerHTML = `
    <div id="login-banner" hidden></div>
    <form id="login-form">
      <input type="text" id="codigo" />
      <input type="password" id="password" />
      <div id="login-error" hidden></div>
      <button type="submit">Ingresar</button>
    </form>
  `;
}

describe('initLogin', () => {
  beforeEach(() => {
    localStorage.clear();
    renderLoginPage();
    vi.stubGlobal('location', { href: '', search: '' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('redirige al dashboard si ya hay sesion', () => {
    setSession({ token: 'tok', codigo: '1', rol: 'administrador', nombre: 'Ana', debeCambiarPassword: false });

    initLogin();

    expect(window.location.href).toBe('/portal/dashboard.html');
  });

  it('muestra error si los campos estan vacios', async () => {
    initLogin();

    document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(apiPost).not.toHaveBeenCalled();
    expect(document.getElementById('login-error').textContent).toBe('Código y contraseña son requeridos');
    expect(document.getElementById('login-error').hidden).toBe(false);
  });

  it('muestra el error del backend si las credenciales son incorrectas', async () => {
    apiPost.mockResolvedValue({ error: 'Usuario o contraseña incorrectos' });

    initLogin();
    document.getElementById('codigo').value = '0102030405';
    document.getElementById('password').value = 'incorrecta';
    document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(apiPost).toHaveBeenCalledWith({ accion: 'login', codigo: '0102030405', password: 'incorrecta' });
    expect(document.getElementById('login-error').textContent).toBe('Usuario o contraseña incorrectos');
    expect(document.getElementById('login-error').hidden).toBe(false);
    expect(getSession()).toBeNull();
  });

  it('muestra el mensaje de bloqueo tras demasiados intentos', async () => {
    apiPost.mockResolvedValue({ error: 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.' });

    initLogin();
    document.getElementById('codigo').value = '0102030405';
    document.getElementById('password').value = 'incorrecta';
    document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById('login-error').textContent).toBe(
      'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.'
    );
  });

  it('guarda la sesion y redirige al dashboard tras un login exitoso', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      token: 'tok123',
      rol: 'administrador',
      nombre: 'Ana',
      codigo: '0102030405',
    });

    initLogin();
    document.getElementById('codigo').value = '0102030405';
    document.getElementById('password').value = 'correcta';
    document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getSession()).toEqual({
      token: 'tok123',
      codigo: '0102030405',
      rol: 'administrador',
      nombre: 'Ana',
      debeCambiarPassword: false,
    });
    expect(window.location.href).toBe('/portal/dashboard.html');
  });

  it('propaga debeCambiarPassword en la sesion cuando el backend lo indica', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      token: 'tok123',
      rol: 'usuario',
      nombre: 'Paciente',
      codigo: '0102030405',
      debeCambiarPassword: true,
    });

    initLogin();
    document.getElementById('codigo').value = '0102030405';
    document.getElementById('password').value = '0102030405';
    document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getSession().debeCambiarPassword).toBe(true);
    expect(window.location.href).toBe('/portal/dashboard.html');
  });

  it('muestra el banner de sesion expirada si ?expired=1', () => {
    vi.stubGlobal('location', { href: '', search: '?expired=1' });

    initLogin();

    const banner = document.getElementById('login-banner');
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toBe('Tu sesión expiró. Por favor inicia sesión nuevamente.');
  });

  it('muestra el banner de contrasena actualizada si ?passwordChanged=1', () => {
    vi.stubGlobal('location', { href: '', search: '?passwordChanged=1' });

    initLogin();

    const banner = document.getElementById('login-banner');
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toBe('Contraseña actualizada. Inicia sesión con tu nueva contraseña.');
  });
});
