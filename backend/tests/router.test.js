import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { generarHashSHA256, generarSalt } from '../src/hash.js';
import { handleGet, handlePost } from '../src/router.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];

function buildServicesWithUser({ codigo, password, rol, nombre }) {
  const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER] } });
  const salt = generarSalt(services);
  const passwordHash = generarHashSHA256(password + salt, services);
  services.SpreadsheetApp._sheets['_usuarios'].push([codigo, passwordHash, salt, rol, nombre]);
  return services;
}

function bodyOf(output) {
  return JSON.parse(output._text);
}

function loginToken(services, codigo, password) {
  const result = handlePost(
    { postData: { contents: JSON.stringify({ accion: 'login', codigo, password }) } },
    services
  );
  return bodyOf(result).token;
}

describe('handleGet', () => {
  it('responde ping con ok:true', () => {
    const services = createMockServices();
    const result = handleGet({ parameter: { accion: 'ping' } }, services);
    expect(bodyOf(result)).toEqual({ ok: true });
    expect(result._mimeType).toBe('application/json');
  });

  it('devuelve error para una accion no reconocida', () => {
    const services = createMockServices();
    const result = handleGet({ parameter: { accion: 'inexistente' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Accion no reconocida' });
  });

  it('listarUsuarios requiere rol administrador', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarUsuarios', token } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('listarUsuarios devuelve la lista de usuarios para un administrador', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarUsuarios', token } }, services);
    expect(bodyOf(result)).toEqual({ ok: true, usuarios: [{ codigo: 'ADM001', rol: 'administrador', nombre: 'Admin' }] });
  });
});

describe('handlePost', () => {
  it('login devuelve un token con credenciales correctas', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'login', codigo: 'ADM001', password: 'secreta123' }) } },
      services
    );
    expect(bodyOf(result).ok).toBe(true);
    expect(typeof bodyOf(result).token).toBe('string');
  });

  it('devuelve error JSON invalido si el body no es JSON', () => {
    const services = createMockServices();
    const result = handlePost({ postData: { contents: 'no-es-json' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'JSON invalido' });
  });

  it('devuelve error para una accion no reconocida', () => {
    const services = createMockServices();
    const result = handlePost({ postData: { contents: JSON.stringify({ accion: 'inexistente' }) } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Accion no reconocida' });
  });

  it('guardarUsuario requiere rol administrador', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      {
        postData: {
          contents: JSON.stringify({ accion: 'guardarUsuario', token, codigo: 'NUE001', rol: 'usuario', nombre: 'Nuevo', password: 'clave123' }),
        },
      },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('guardarUsuario crea un usuario nuevo para un administrador', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handlePost(
      {
        postData: {
          contents: JSON.stringify({ accion: 'guardarUsuario', token, codigo: 'NUE001', rol: 'usuario', nombre: 'Nuevo', password: 'clave123' }),
        },
      },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true, accion: 'creado' });
  });

  it('eliminarUsuario elimina un usuario para un administrador', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    services.SpreadsheetApp._sheets['_usuarios'].push(['NUE001', 'hash', 'salt', 'usuario', 'Nuevo']);
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'eliminarUsuario', token, codigo: 'NUE001' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });

  it('cambiarPassword esta disponible para cualquier rol autenticado', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'claveVieja', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'claveVieja');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'cambiarPassword', token, passwordActual: 'claveVieja', passwordNueva: 'claveNueva123' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });
});
