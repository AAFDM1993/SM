import { describe, it, expect, vi } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { generarHashSHA256, generarSalt } from '../src/hash.js';
import { login, verifyToken } from '../src/auth.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];

function buildServicesWithUser({ codigo, password, rol, nombre }) {
  const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER] } });
  const salt = generarSalt(services);
  const passwordHash = generarHashSHA256(password + salt, services);
  services.SpreadsheetApp._sheets['_usuarios'].push([codigo, passwordHash, salt, rol, nombre]);
  return services;
}

describe('login', () => {
  it('devuelve token y datos de usuario con credenciales correctas', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const result = login('ADM001', 'secreta123', services);
    expect(result.ok).toBe(true);
    expect(result.rol).toBe('administrador');
    expect(result.nombre).toBe('Admin');
    expect(result.codigo).toBe('ADM001');
    expect(typeof result.token).toBe('string');
    expect(result.debeCambiarPassword).toBeUndefined();
  });

  it('registra login_exitoso en _log', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    login('ADM001', 'secreta123', services);
    const logRows = services.SpreadsheetApp._sheets['_log'];
    expect(logRows[1]).toEqual([expect.any(Date), 'ADM001', 'administrador', 'login_exitoso', '']);
  });

  it('rechaza contrasena incorrecta', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    expect(login('ADM001', 'incorrecta', services)).toEqual({ error: 'Usuario o contraseña incorrectos' });
  });

  it('registra login_fallido si la contrasena es incorrecta', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    login('ADM001', 'incorrecta', services);
    const logRows = services.SpreadsheetApp._sheets['_log'];
    expect(logRows[1][3]).toBe('login_fallido');
  });

  it('rechaza un codigo que no existe', () => {
    const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER] } });
    expect(login('NOEXISTE', 'cualquier', services)).toEqual({ error: 'Usuario o contraseña incorrectos' });
  });

  it('marca debeCambiarPassword cuando rol=usuario y password=codigo (DNI)', () => {
    const services = buildServicesWithUser({ codigo: '12345678', password: '12345678', rol: 'usuario', nombre: 'Paciente' });
    const result = login('12345678', '12345678', services);
    expect(result.ok).toBe(true);
    expect(result.debeCambiarPassword).toBe(true);
  });

  it('no marca debeCambiarPassword si el paciente ya cambio su password', () => {
    const services = buildServicesWithUser({ codigo: '12345678', password: 'otraClave1', rol: 'usuario', nombre: 'Paciente' });
    const result = login('12345678', 'otraClave1', services);
    expect(result.debeCambiarPassword).toBeUndefined();
  });

  it('requiere codigo y password', () => {
    const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER] } });
    expect(login('', '', services)).toEqual({ error: 'Codigo y contrasena requeridos' });
  });
});

describe('verifyToken', () => {
  it('devuelve el usuario para un token valido', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const { token } = login('ADM001', 'secreta123', services);
    const user = verifyToken(token, services);
    expect(user.codigo).toBe('ADM001');
    expect(user.rol).toBe('administrador');
  });

  it('devuelve null para un token vacio o invalido', () => {
    const services = createMockServices();
    expect(verifyToken('', services)).toBeNull();
    expect(verifyToken('no-es-base64-valido!!', services)).toBeNull();
  });

  it('devuelve null si el token expiro (mas de 8 horas)', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const { token } = login('ADM001', 'secreta123', services);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 60 * 60 * 1000 + 1000);
    expect(verifyToken(token, services)).toBeNull();
    vi.useRealTimers();
  });

  it('devuelve null si la contrasena del usuario cambio despues de emitir el token', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const { token } = login('ADM001', 'secreta123', services);

    services.SpreadsheetApp._sheets['_usuarios'][1][1] = 'otroHashDistinto';

    expect(verifyToken(token, services)).toBeNull();
  });
});
