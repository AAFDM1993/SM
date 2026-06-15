import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { encrypt_, decrypt_ } from '../src/aes.js';
import { leerAntecedentes, actualizarAntecedentes } from '../src/historia-clinica.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const ANTECEDENTES_HEADER = ['codigo', 'antecedentesPersonales', 'antecedentesPsiquiatricos', 'antecedentesFamiliares', 'alergias', 'medicacionActual', 'fechaActualizacion', 'actualizadoPor'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];
const AES_KEY = '000102030405060708090a0b0c0d0e0f';

const PSIQUIATRA = { codigo: 'PSI001', rol: 'psiquiatra' };

function buildServices({ usuarios = [], antecedentes = [] } = {}) {
  return createMockServices({
    sheets: {
      _usuarios: [USUARIOS_HEADER, ...usuarios],
      _antecedentes: [ANTECEDENTES_HEADER, ...antecedentes],
      _log: [LOG_HEADER],
    },
    properties: { AES_KEY },
  });
}

describe('leerAntecedentes', () => {
  it('devuelve los antecedentes descifrados para un paciente con fila existente', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    services.SpreadsheetApp._sheets['_antecedentes'].push([
      '45678912',
      encrypt_('Hipertension', services),
      encrypt_('Trastorno de ansiedad', services),
      encrypt_('Madre con depresion', services),
      encrypt_('Penicilina', services),
      encrypt_('Sertralina 50mg', services),
      '2026-06-01T10:00:00.000Z',
      'PSI001',
    ]);

    const result = leerAntecedentes('45678912', services);

    expect(result).toEqual({
      ok: true,
      antecedentes: {
        codigo: '45678912',
        antecedentesPersonales: 'Hipertension',
        antecedentesPsiquiatricos: 'Trastorno de ansiedad',
        antecedentesFamiliares: 'Madre con depresion',
        alergias: 'Penicilina',
        medicacionActual: 'Sertralina 50mg',
        fechaActualizacion: '2026-06-01T10:00:00.000Z',
      },
    });
  });

  it('devuelve campos vacios si el paciente no tiene fila en _antecedentes', () => {
    const services = buildServices({ usuarios: [['78945612', 'h', 's', 'usuario', 'Carlos Ruiz']] });

    const result = leerAntecedentes('78945612', services);

    expect(result).toEqual({
      ok: true,
      antecedentes: {
        codigo: '78945612',
        antecedentesPersonales: '',
        antecedentesPsiquiatricos: '',
        antecedentesFamiliares: '',
        alergias: '',
        medicacionActual: '',
        fechaActualizacion: '',
      },
    });
  });

  it('devuelve error si el codigo no existe como paciente', () => {
    const services = buildServices();
    expect(leerAntecedentes('NOPE', services)).toEqual({ error: 'Paciente no encontrado' });
  });

  it('devuelve error si el codigo existe pero no tiene rol usuario', () => {
    const services = buildServices({ usuarios: [['PSI002', 'h', 's', 'psiquiatra', 'Otro Psiquiatra']] });
    expect(leerAntecedentes('PSI002', services)).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza si falta la hoja _antecedentes', () => {
    const services = createMockServices({
      sheets: {
        _usuarios: [USUARIOS_HEADER, ['45678912', 'h', 's', 'usuario', 'Maria Lopez']],
        _log: [LOG_HEADER],
      },
      properties: { AES_KEY },
    });
    expect(leerAntecedentes('45678912', services)).toEqual({ error: 'Hoja de antecedentes no encontrada' });
  });
});

describe('actualizarAntecedentes', () => {
  it('crea una fila nueva en _antecedentes cifrando los campos', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });

    const result = actualizarAntecedentes({
      codigo: '45678912',
      antecedentesPersonales: 'Hipertension',
      antecedentesPsiquiatricos: 'Trastorno de ansiedad',
      antecedentesFamiliares: 'Madre con depresion',
      alergias: 'Penicilina',
      medicacionActual: 'Sertralina 50mg',
    }, PSIQUIATRA, services);

    expect(result).toEqual({ ok: true });

    const row = services.SpreadsheetApp._sheets['_antecedentes'][1];
    expect(row[0]).toBe('45678912');
    expect(decrypt_(row[1], services)).toBe('Hipertension');
    expect(decrypt_(row[2], services)).toBe('Trastorno de ansiedad');
    expect(decrypt_(row[3], services)).toBe('Madre con depresion');
    expect(decrypt_(row[4], services)).toBe('Penicilina');
    expect(decrypt_(row[5], services)).toBe('Sertralina 50mg');
    expect(row[6]).toBeInstanceOf(Date);
    expect(row[7]).toBe('PSI001');
  });

  it('hace upsert sobre una fila existente sin duplicarla', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    services.SpreadsheetApp._sheets['_antecedentes'].push([
      '45678912',
      encrypt_('Antiguo', services),
      encrypt_('Antiguo', services),
      encrypt_('Antiguo', services),
      encrypt_('Antiguo', services),
      encrypt_('Antiguo', services),
      '2026-01-01T00:00:00.000Z',
      'PSI002',
    ]);

    const result = actualizarAntecedentes({
      codigo: '45678912',
      antecedentesPersonales: 'Hipertension',
      antecedentesPsiquiatricos: '',
      antecedentesFamiliares: '',
      alergias: '',
      medicacionActual: '',
    }, PSIQUIATRA, services);

    expect(result).toEqual({ ok: true });
    expect(services.SpreadsheetApp._sheets['_antecedentes']).toHaveLength(2); // header + 1 fila
    const row = services.SpreadsheetApp._sheets['_antecedentes'][1];
    expect(decrypt_(row[1], services)).toBe('Hipertension');
    expect(row[7]).toBe('PSI001');
  });

  it('cifra los campos aunque vengan vacios', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });

    actualizarAntecedentes({
      codigo: '45678912',
      antecedentesPersonales: '',
      antecedentesPsiquiatricos: '',
      antecedentesFamiliares: '',
      alergias: '',
      medicacionActual: '',
    }, PSIQUIATRA, services);

    const row = services.SpreadsheetApp._sheets['_antecedentes'][1];
    expect(row[1]).not.toBe('');
    expect(decrypt_(row[1], services)).toBe('');
  });

  it('devuelve error si el codigo no existe como paciente', () => {
    const services = buildServices();
    const result = actualizarAntecedentes({ codigo: 'NOPE' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza si falta la hoja _antecedentes', () => {
    const services = createMockServices({
      sheets: {
        _usuarios: [USUARIOS_HEADER, ['45678912', 'h', 's', 'usuario', 'Maria Lopez']],
        _log: [LOG_HEADER],
      },
      properties: { AES_KEY },
    });
    const result = actualizarAntecedentes({ codigo: '45678912' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'Hoja de antecedentes no encontrada' });
  });

  it('registra antecedentes_actualizados en _log', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });

    actualizarAntecedentes({ codigo: '45678912' }, PSIQUIATRA, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'antecedentes_actualizados');
    expect(logEntry).toBeDefined();
    expect(logEntry[1]).toBe('PSI001');
    expect(logEntry[2]).toBe('psiquiatra');
    expect(logEntry[4]).toBe('45678912');
  });
});
