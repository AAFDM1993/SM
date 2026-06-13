import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSession,
  setSession,
  clearSession,
  isAuthenticated,
  isAuthError,
  handleAuthError,
  getQueryParam,
  redirectTo,
} from '../../src/portal/session.js';

const SAMPLE_SESSION = {
  token: 'abc',
  codigo: '123',
  rol: 'administrador',
  nombre: 'Ana',
  debeCambiarPassword: false,
};

describe('session storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getSession devuelve null si no hay sesion guardada', () => {
    expect(getSession()).toBeNull();
  });

  it('setSession guarda y getSession recupera los mismos datos', () => {
    setSession(SAMPLE_SESSION);
    expect(getSession()).toEqual(SAMPLE_SESSION);
  });

  it('clearSession elimina la sesion guardada', () => {
    setSession(SAMPLE_SESSION);
    clearSession();
    expect(getSession()).toBeNull();
  });

  it('isAuthenticated refleja si hay sesion guardada', () => {
    expect(isAuthenticated()).toBe(false);
    setSession(SAMPLE_SESSION);
    expect(isAuthenticated()).toBe(true);
  });
});

describe('isAuthError', () => {
  it('detecta errores de autorizacion', () => {
    expect(isAuthError({ error: 'No autorizado' })).toBe(true);
    expect(isAuthError({ error: 'Permiso denegado' })).toBe(true);
    expect(isAuthError({ error: 'No encontrado' })).toBe(false);
    expect(isAuthError({ ok: true })).toBe(false);
  });
});

describe('handleAuthError', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('location', { href: '', search: '' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('limpia la sesion y redirige si hay error de autorizacion', () => {
    setSession(SAMPLE_SESSION);

    const handled = handleAuthError({ error: 'No autorizado' });

    expect(handled).toBe(true);
    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });

  it('no hace nada si la respuesta no es un error de autorizacion', () => {
    setSession(SAMPLE_SESSION);

    const handled = handleAuthError({ error: 'No encontrado' });

    expect(handled).toBe(false);
    expect(getSession()).toEqual(SAMPLE_SESSION);
    expect(window.location.href).toBe('');
  });
});

describe('getQueryParam', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devuelve el valor del parametro si existe', () => {
    vi.stubGlobal('location', { search: '?expired=1&foo=bar' });
    expect(getQueryParam('expired')).toBe('1');
    expect(getQueryParam('foo')).toBe('bar');
  });

  it('devuelve null si el parametro no existe', () => {
    vi.stubGlobal('location', { search: '' });
    expect(getQueryParam('missing')).toBeNull();
  });
});

describe('redirectTo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asigna window.location.href', () => {
    vi.stubGlobal('location', { href: '' });
    redirectTo('/portal/');
    expect(window.location.href).toBe('/portal/');
  });
});
