import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { encrypt_, decrypt_ } from '../src/aes.js';
import { leerAntecedentes, actualizarAntecedentes, crearNotaEvolucion, listarNotasEvolucion } from '../src/historia-clinica.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const ANTECEDENTES_HEADER = ['codigo', 'antecedentesPersonales', 'antecedentesPsiquiatricos', 'antecedentesFamiliares', 'alergias', 'medicacionActual', 'fechaActualizacion', 'actualizadoPor'];
const NOTAS_HEADER = ['id', 'pacienteCodigo', 'fecha', 'motivoConsulta', 'notas', 'diagnostico', 'creadoPor', 'fechaCreacion'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];
const AES_KEY = '000102030405060708090a0b0c0d0e0f';

const PSIQUIATRA = { codigo: 'PSI001', rol: 'psiquiatra' };

function buildServices({ usuarios = [], antecedentes = [], notas = [] } = {}) {
  return createMockServices({
    sheets: {
      _usuarios: [USUARIOS_HEADER, ...usuarios],
      _antecedentes: [ANTECEDENTES_HEADER, ...antecedentes],
      _notas_evolucion: [NOTAS_HEADER, ...notas],
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

describe('crearNotaEvolucion', () => {
  it('crea una nota de evolucion cifrando motivo, notas y diagnostico', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });

    const result = crearNotaEvolucion({
      codigo: '45678912',
      fecha: '2026-06-15',
      motivoConsulta: 'Control mensual',
      notas: 'Paciente refiere animo estable',
      diagnostico: 'Trastorno depresivo recurrente',
    }, PSIQUIATRA, services);

    expect(result.ok).toBe(true);
    expect(result.nota).toMatchObject({
      pacienteCodigo: '45678912',
      fecha: '2026-06-15',
      motivoConsulta: 'Control mensual',
      notas: 'Paciente refiere animo estable',
      diagnostico: 'Trastorno depresivo recurrente',
      creadoPor: 'PSI001',
    });
    expect(typeof result.nota.id).toBe('string');
    expect(result.nota.fechaCreacion).toBeInstanceOf(Date);

    const row = services.SpreadsheetApp._sheets['_notas_evolucion'][1];
    expect(row[0]).toBe(result.nota.id);
    expect(row[1]).toBe('45678912');
    expect(row[2]).toBe('2026-06-15');
    expect(decrypt_(row[3], services)).toBe('Control mensual');
    expect(decrypt_(row[4], services)).toBe('Paciente refiere animo estable');
    expect(decrypt_(row[5], services)).toBe('Trastorno depresivo recurrente');
    expect(row[6]).toBe('PSI001');
    expect(row[7]).toBeInstanceOf(Date);
  });

  it('permite motivoConsulta y diagnostico vacios', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });

    const result = crearNotaEvolucion({
      codigo: '45678912',
      fecha: '2026-06-15',
      notas: 'Sesion de seguimiento',
    }, PSIQUIATRA, services);

    expect(result.ok).toBe(true);
    expect(result.nota.motivoConsulta).toBe('');
    expect(result.nota.diagnostico).toBe('');

    const row = services.SpreadsheetApp._sheets['_notas_evolucion'][1];
    expect(decrypt_(row[3], services)).toBe('');
    expect(decrypt_(row[5], services)).toBe('');
  });

  it('rechaza si falta codigo', () => {
    const services = buildServices();
    const result = crearNotaEvolucion({ fecha: '2026-06-15', notas: 'texto' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'codigo, fecha y notas son requeridos' });
  });

  it('rechaza si falta fecha', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    const result = crearNotaEvolucion({ codigo: '45678912', notas: 'texto' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'codigo, fecha y notas son requeridos' });
  });

  it('rechaza si falta notas', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    const result = crearNotaEvolucion({ codigo: '45678912', fecha: '2026-06-15', notas: '  ' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'codigo, fecha y notas son requeridos' });
  });

  it('devuelve error si el codigo no existe como paciente', () => {
    const services = buildServices();
    const result = crearNotaEvolucion({ codigo: 'NOPE', fecha: '2026-06-15', notas: 'texto' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza si falta la hoja _notas_evolucion', () => {
    const services = createMockServices({
      sheets: {
        _usuarios: [USUARIOS_HEADER, ['45678912', 'h', 's', 'usuario', 'Maria Lopez']],
        _log: [LOG_HEADER],
      },
      properties: { AES_KEY },
    });
    const result = crearNotaEvolucion({ codigo: '45678912', fecha: '2026-06-15', notas: 'texto' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'Hoja de notas de evolución no encontrada' });
  });

  it('registra nota_evolucion_creada en _log', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });

    const result = crearNotaEvolucion({ codigo: '45678912', fecha: '2026-06-15', notas: 'texto' }, PSIQUIATRA, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'nota_evolucion_creada');
    expect(logEntry).toBeDefined();
    expect(logEntry[1]).toBe('PSI001');
    expect(logEntry[2]).toBe('psiquiatra');
    expect(logEntry[4]).toBe(`${result.nota.id} paciente=45678912 2026-06-15`);
  });
});

describe('listarNotasEvolucion', () => {
  it('devuelve las notas ordenadas por fecha descendente', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    const notasSheet = services.SpreadsheetApp._sheets['_notas_evolucion'];
    notasSheet.push(['n1', '45678912', '2026-06-01', encrypt_('Motivo 1', services), encrypt_('Primera', services), encrypt_('Diagnostico 1', services), 'PSI001', new Date('2026-06-01T10:00:00Z')]);
    notasSheet.push(['n2', '45678912', '2026-06-10', encrypt_('Motivo 2', services), encrypt_('Segunda', services), encrypt_('Diagnostico 2', services), 'PSI001', new Date('2026-06-10T10:00:00Z')]);

    const result = listarNotasEvolucion('45678912', services);

    expect(result.ok).toBe(true);
    expect(result.notas).toEqual([
      { id: 'n2', fecha: '2026-06-10', motivoConsulta: 'Motivo 2', notas: 'Segunda', diagnostico: 'Diagnostico 2', creadoPor: 'PSI001', fechaCreacion: new Date('2026-06-10T10:00:00Z') },
      { id: 'n1', fecha: '2026-06-01', motivoConsulta: 'Motivo 1', notas: 'Primera', diagnostico: 'Diagnostico 1', creadoPor: 'PSI001', fechaCreacion: new Date('2026-06-01T10:00:00Z') },
    ]);
  });

  it('usa fechaCreacion como criterio de desempate cuando la fecha es igual', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    const notasSheet = services.SpreadsheetApp._sheets['_notas_evolucion'];
    notasSheet.push(['n1', '45678912', '2026-06-01', encrypt_('', services), encrypt_('Primera', services), encrypt_('', services), 'PSI001', new Date('2026-06-01T08:00:00Z')]);
    notasSheet.push(['n2', '45678912', '2026-06-01', encrypt_('', services), encrypt_('Segunda', services), encrypt_('', services), 'PSI001', new Date('2026-06-01T10:00:00Z')]);

    const result = listarNotasEvolucion('45678912', services);

    expect(result.notas.map((n) => n.notas)).toEqual(['Segunda', 'Primera']);
  });

  it('devuelve notas vacio si el paciente no tiene notas', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    expect(listarNotasEvolucion('45678912', services)).toEqual({ ok: true, notas: [] });
  });

  it('filtra las notas por paciente', () => {
    const services = buildServices({
      usuarios: [
        ['45678912', 'h', 's', 'usuario', 'Maria Lopez'],
        ['78945612', 'h', 's', 'usuario', 'Carlos Ruiz'],
      ],
    });
    const notasSheet = services.SpreadsheetApp._sheets['_notas_evolucion'];
    notasSheet.push(['n1', '45678912', '2026-06-01', encrypt_('', services), encrypt_('De Maria', services), encrypt_('', services), 'PSI001', new Date()]);
    notasSheet.push(['n2', '78945612', '2026-06-02', encrypt_('', services), encrypt_('De Carlos', services), encrypt_('', services), 'PSI001', new Date()]);

    const result = listarNotasEvolucion('45678912', services);

    expect(result.notas).toHaveLength(1);
    expect(result.notas[0].notas).toBe('De Maria');
  });

  it('devuelve error si el codigo no existe como paciente', () => {
    const services = buildServices();
    expect(listarNotasEvolucion('NOPE', services)).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza si falta la hoja _notas_evolucion', () => {
    const services = createMockServices({
      sheets: {
        _usuarios: [USUARIOS_HEADER, ['45678912', 'h', 's', 'usuario', 'Maria Lopez']],
        _log: [LOG_HEADER],
      },
      properties: { AES_KEY },
    });
    expect(listarNotasEvolucion('45678912', services)).toEqual({ error: 'Hoja de notas de evolución no encontrada' });
  });
});
