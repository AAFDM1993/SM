import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { generarHashSHA256 } from '../src/hash.js';
import { findUser, listarUsuarios, guardarUsuario, eliminarUsuario, listarPacientes } from '../src/usuarios.js';

const HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];

function buildServices(rows = []) {
  return createMockServices({ sheets: { _usuarios: [HEADER, ...rows] } });
}

describe('findUser', () => {
  it('encuentra un usuario por codigo (sin distinguir mayusculas)', () => {
    const services = buildServices([['ABC123', 'hash1', 'salt1', 'administrador', 'Ana']]);
    expect(findUser('abc123', services)).toEqual({
      codigo: 'ABC123', password: 'hash1', salt: 'salt1', rol: 'administrador', nombre: 'Ana',
    });
  });

  it('devuelve null si no existe', () => {
    const services = buildServices([['ABC123', 'hash1', 'salt1', 'administrador', 'Ana']]);
    expect(findUser('zzz999', services)).toBeNull();
  });

  it('devuelve null si la hoja _usuarios no existe', () => {
    const services = createMockServices();
    expect(findUser('ABC123', services)).toBeNull();
  });
});

describe('listarUsuarios', () => {
  it('lista codigo, rol y nombre sin exponer password ni salt', () => {
    const services = buildServices([
      ['ABC123', 'hash1', 'salt1', 'administrador', 'Ana'],
      ['XYZ987', 'hash2', 'salt2', 'usuario', 'Beto'],
    ]);
    expect(listarUsuarios(services)).toEqual({
      ok: true,
      usuarios: [
        { codigo: 'ABC123', rol: 'administrador', nombre: 'Ana' },
        { codigo: 'XYZ987', rol: 'usuario', nombre: 'Beto' },
      ],
    });
  });

  it('devuelve lista vacia si no hay usuarios', () => {
    const services = buildServices([]);
    expect(listarUsuarios(services)).toEqual({ ok: true, usuarios: [] });
  });
});

describe('guardarUsuario', () => {
  it('crea un usuario nuevo con hash y salt consistentes', () => {
    const services = buildServices([]);
    const result = guardarUsuario({ codigo: 'NEW001', password: 'inicial123', rol: 'recepcion', nombre: 'Carla' }, services);
    expect(result).toEqual({ ok: true, accion: 'creado' });

    const user = findUser('NEW001', services);
    expect(user.rol).toBe('recepcion');
    expect(user.nombre).toBe('Carla');
    expect(user.password).toBe(generarHashSHA256('inicial123' + user.salt, services));
  });

  it('rechaza crear un usuario sin password', () => {
    const services = buildServices([]);
    const result = guardarUsuario({ codigo: 'NEW002', rol: 'recepcion', nombre: 'Dani' }, services);
    expect(result).toEqual({ error: 'password requerido para usuarios nuevos' });
  });

  it('rechaza un rol invalido', () => {
    const services = buildServices([]);
    const result = guardarUsuario({ codigo: 'NEW003', password: 'abc123', rol: 'superadmin', nombre: 'Eva' }, services);
    expect(result).toEqual({ error: 'Rol invalido' });
  });

  it('actualiza nombre y rol sin tocar password si no se envia una nueva', () => {
    const services = buildServices([['ABC123', 'hashOriginal', 'saltOriginal', 'recepcion', 'Ana']]);
    const result = guardarUsuario({ codigo: 'ABC123', rol: 'psiquiatra', nombre: 'Ana Maria' }, services);
    expect(result).toEqual({ ok: true, accion: 'actualizado' });

    expect(findUser('ABC123', services)).toEqual({
      codigo: 'ABC123', password: 'hashOriginal', salt: 'saltOriginal', rol: 'psiquiatra', nombre: 'Ana Maria',
    });
  });

  it('actualiza el password (nuevo hash y salt) cuando se envia uno', () => {
    const services = buildServices([['ABC123', 'hashOriginal', 'saltOriginal', 'recepcion', 'Ana']]);
    guardarUsuario({ codigo: 'ABC123', password: 'nuevoPass123', rol: 'recepcion', nombre: 'Ana' }, services);

    const user = findUser('ABC123', services);
    expect(user.password).not.toBe('hashOriginal');
    expect(user.salt).not.toBe('saltOriginal');
    expect(user.password).toBe(generarHashSHA256('nuevoPass123' + user.salt, services));
  });
});

describe('eliminarUsuario', () => {
  it('elimina un usuario existente', () => {
    const services = buildServices([
      ['ABC123', 'hash1', 'salt1', 'administrador', 'Ana'],
      ['XYZ987', 'hash2', 'salt2', 'usuario', 'Beto'],
    ]);
    expect(eliminarUsuario('abc123', services)).toEqual({ ok: true });
    expect(findUser('ABC123', services)).toBeNull();
    expect(findUser('XYZ987', services)).not.toBeNull();
  });

  it('devuelve error si el usuario no existe', () => {
    const services = buildServices([['ABC123', 'hash1', 'salt1', 'administrador', 'Ana']]);
    expect(eliminarUsuario('zzz999', services)).toEqual({ error: 'No encontrado' });
  });
});

describe('listarPacientes', () => {
  it('lista solo codigo y nombre de usuarios con rol usuario', () => {
    const services = buildServices([
      ['ABC123', 'hash1', 'salt1', 'administrador', 'Ana'],
      ['XYZ987', 'hash2', 'salt2', 'usuario', 'Beto'],
      ['DEF456', 'hash3', 'salt3', 'usuario', 'Carla'],
    ]);
    expect(listarPacientes(services)).toEqual({
      ok: true,
      pacientes: [
        { codigo: 'XYZ987', nombre: 'Beto' },
        { codigo: 'DEF456', nombre: 'Carla' },
      ],
    });
  });

  it('devuelve lista vacia si no hay pacientes', () => {
    const services = buildServices([
      ['ABC123', 'hash1', 'salt1', 'administrador', 'Ana'],
    ]);
    expect(listarPacientes(services)).toEqual({ ok: true, pacientes: [] });
  });
});
