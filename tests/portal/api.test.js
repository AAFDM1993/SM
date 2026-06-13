import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../src/portal/api.js';
import { API_URL } from '../../src/shared/config.js';

describe('apiGet', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('hace GET con accion y params como query string', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ ok: true, usuarios: [] }),
    });

    const result = await apiGet('listarUsuarios', { token: 'abc' });

    expect(global.fetch).toHaveBeenCalledWith(`${API_URL}?accion=listarUsuarios&token=abc`);
    expect(result).toEqual({ ok: true, usuarios: [] });
  });

  it('hace GET sin params adicionales', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ ok: true }),
    });

    const result = await apiGet('ping');

    expect(global.fetch).toHaveBeenCalledWith(`${API_URL}?accion=ping`);
    expect(result).toEqual({ ok: true });
  });

  it('devuelve un error de conexion si fetch falla', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));

    const result = await apiGet('ping');

    expect(result).toEqual({ error: 'Error de conexión. Intenta nuevamente.' });
  });
});

describe('apiPost', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('hace POST con body JSON y content-type text/plain', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ ok: true }),
    });

    const body = { accion: 'login', codigo: '123', password: 'abc' };
    const result = await apiPost(body);

    expect(global.fetch).toHaveBeenCalledWith(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });
    expect(result).toEqual({ ok: true });
  });

  it('devuelve un error de conexion si fetch falla', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));

    const result = await apiPost({ accion: 'ping' });

    expect(result).toEqual({ error: 'Error de conexión. Intenta nuevamente.' });
  });
});
