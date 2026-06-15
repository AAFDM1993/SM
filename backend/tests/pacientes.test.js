import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { generarHashSHA256 } from '../src/hash.js';
import { findUser } from '../src/usuarios.js';
import { crearPaciente } from '../src/pacientes.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const PACIENTES_HEADER = ['codigo', 'fechaNacimiento', 'sexo', 'telefono', 'email', 'contactoEmergenciaNombre', 'contactoEmergenciaTelefono', 'fechaAlta', 'creadoPor'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];

const ADMIN = { codigo: 'ADM001', rol: 'administrador' };

function buildServices({ usuarios = [], pacientes = [] } = {}) {
  return createMockServices({
    sheets: {
      _usuarios: [USUARIOS_HEADER, ...usuarios],
      _pacientes: [PACIENTES_HEADER, ...pacientes],
      _log: [LOG_HEADER],
    },
  });
}

describe('crearPaciente', () => {
  it('crea filas en _usuarios y _pacientes con los valores correctos', () => {
    const services = buildServices();

    const result = crearPaciente({
      codigo: '45678912',
      nombre: 'Maria Lopez',
      fechaNacimiento: '1990-05-10',
      sexo: 'Femenino',
      telefono: '987654321',
      email: 'maria@example.com',
      contactoEmergenciaNombre: 'Juan Lopez',
      contactoEmergenciaTelefono: '999888777',
    }, ADMIN, services);

    expect(result).toEqual({
      ok: true,
      paciente: {
        codigo: '45678912',
        nombre: 'Maria Lopez',
        fechaNacimiento: '1990-05-10',
        sexo: 'Femenino',
        telefono: '987654321',
        email: 'maria@example.com',
        contactoEmergenciaNombre: 'Juan Lopez',
        contactoEmergenciaTelefono: '999888777',
      },
    });

    const usuario = findUser('45678912', services);
    expect(usuario.rol).toBe('usuario');
    expect(usuario.nombre).toBe('Maria Lopez');
    expect(usuario.password).toBe(generarHashSHA256('45678912' + usuario.salt, services));

    const pacienteRow = services.SpreadsheetApp._sheets['_pacientes'][1];
    expect(pacienteRow[0]).toBe('45678912');
    expect(pacienteRow[1]).toBe('1990-05-10');
    expect(pacienteRow[2]).toBe('Femenino');
    expect(pacienteRow[3]).toBe('987654321');
    expect(pacienteRow[4]).toBe('maria@example.com');
    expect(pacienteRow[5]).toBe('Juan Lopez');
    expect(pacienteRow[6]).toBe('999888777');
    expect(pacienteRow[8]).toBe('ADM001');
  });

  it('rechaza un DNI duplicado sin escribir nada', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'administrador', 'Otro']] });

    const result = crearPaciente({ codigo: '45678912', nombre: 'Maria Lopez' }, ADMIN, services);

    expect(result).toEqual({ error: 'Ya existe un usuario con ese código' });
    expect(services.SpreadsheetApp._sheets['_pacientes']).toHaveLength(1); // solo header
  });

  it('rechaza nombre vacio', () => {
    const services = buildServices();
    const result = crearPaciente({ codigo: '45678912', nombre: '' }, ADMIN, services);
    expect(result).toEqual({ error: 'codigo y nombre son requeridos' });
  });

  it('rechaza si falta la hoja _pacientes', () => {
    const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER] } });
    const result = crearPaciente({ codigo: '45678912', nombre: 'Maria Lopez' }, ADMIN, services);
    expect(result).toEqual({ error: 'Hoja de pacientes no encontrada' });
  });

  it('registra paciente_creado en _log', () => {
    const services = buildServices();

    crearPaciente({ codigo: '45678912', nombre: 'Maria Lopez' }, ADMIN, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'paciente_creado');
    expect(logEntry).toBeDefined();
    expect(logEntry[1]).toBe('ADM001');
    expect(logEntry[2]).toBe('administrador');
    expect(logEntry[4]).toBe('45678912 Maria Lopez');
  });
});
