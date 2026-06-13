import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { generarHashSHA256, generarSalt } from '../src/hash.js';
import { login } from '../src/auth.js';
import { requireAuth, requireAuthBody, cambiarPassword } from '../src/guards.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];

function buildServicesWithUser({ codigo, password, rol, nombre }) {
  const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER] } });
  const salt = generarSalt(services);
  const passwordHash = generarHashSHA256(password + salt, services);
  services.SpreadsheetApp._sheets['_usuarios'].push([codigo, passwordHash, salt, rol, nombre]);
  return services;
}

function userFromRow(row) {
  return { codigo: row[0], password: row[1], salt: row[2], rol: row[3], nombre: row[4] };
}

describe('requireAuth', () => {
  it('devuelve error No autorizado si el token es invalido', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const result = requireAuth({ token: 'invalido' }, [], () => ({ ok: true }), services);
    expect(result).toEqual({ error: 'No autorizado' });
  });

  it('devuelve error Permiso denegado si el rol no esta autorizado', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const { token } = login('REC001', 'secreta123', services);

    const result = requireAuth({ token }, ['administrador'], () => ({ ok: true }), services);
    expect(result).toEqual({ error: 'Permiso denegado' });
  });

  it('llama a fn con el usuario cuando el token es valido y el rol esta autorizado', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const { token } = login('ADM001', 'secreta123', services);

    const result = requireAuth({ token }, ['administrador'], (user) => ({ ok: true, codigo: user.codigo }), services);
    expect(result).toEqual({ ok: true, codigo: 'ADM001' });
  });

  it('permite cualquier rol autenticado cuando la lista de roles esta vacia', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const { token } = login('REC001', 'secreta123', services);

    const result = requireAuth({ token }, [], (user) => ({ ok: true, rol: user.rol }), services);
    expect(result).toEqual({ ok: true, rol: 'recepcion' });
  });
});

describe('requireAuthBody', () => {
  it('devuelve error No autorizado si el token es invalido', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const result = requireAuthBody('invalido', [], () => ({ ok: true }), services);
    expect(result).toEqual({ error: 'No autorizado' });
  });

  it('llama a fn con el usuario cuando el token es valido', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const { token } = login('ADM001', 'secreta123', services);

    const result = requireAuthBody(token, ['administrador'], (user) => ({ ok: true, codigo: user.codigo }), services);
    expect(result).toEqual({ ok: true, codigo: 'ADM001' });
  });
});

describe('cambiarPassword', () => {
  it('cambia la contrasena cuando la actual es correcta y la nueva es valida', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'claveVieja', rol: 'usuario', nombre: 'Paciente' });
    const user = userFromRow(services.SpreadsheetApp._sheets['_usuarios'][1]);

    const result = cambiarPassword({ passwordActual: 'claveVieja', passwordNueva: 'claveNueva123' }, user, services);
    expect(result).toEqual({ ok: true });

    const loginConNueva = login('USR001', 'claveNueva123', services);
    expect(loginConNueva.ok).toBe(true);
  });

  it('registra cambio_password en _log', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'claveVieja', rol: 'usuario', nombre: 'Paciente' });
    const user = userFromRow(services.SpreadsheetApp._sheets['_usuarios'][1]);

    cambiarPassword({ passwordActual: 'claveVieja', passwordNueva: 'claveNueva123' }, user, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    expect(logRows[logRows.length - 1][3]).toBe('cambio_password');
  });

  it('rechaza si la contrasena actual es incorrecta', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'claveVieja', rol: 'usuario', nombre: 'Paciente' });
    const user = userFromRow(services.SpreadsheetApp._sheets['_usuarios'][1]);

    const result = cambiarPassword({ passwordActual: 'incorrecta', passwordNueva: 'claveNueva123' }, user, services);
    expect(result).toEqual({ error: 'La contraseña actual es incorrecta' });
  });

  it('rechaza una contrasena nueva menor a 6 caracteres', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'claveVieja', rol: 'usuario', nombre: 'Paciente' });
    const user = userFromRow(services.SpreadsheetApp._sheets['_usuarios'][1]);

    const result = cambiarPassword({ passwordActual: 'claveVieja', passwordNueva: 'abc12' }, user, services);
    expect(result).toEqual({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  });

  it('requiere ambas contrasenas', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'claveVieja', rol: 'usuario', nombre: 'Paciente' });
    const user = userFromRow(services.SpreadsheetApp._sheets['_usuarios'][1]);

    expect(cambiarPassword({}, user, services)).toEqual({ error: 'Contrasena actual y nueva son requeridas' });
  });
});
