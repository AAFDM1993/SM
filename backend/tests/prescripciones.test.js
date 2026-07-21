import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { encrypt_, decrypt_ } from '../src/aes.js';
import { crearPrescripcion, listarPrescripciones, listarMisPrescripciones, registrarToma } from '../src/prescripciones.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre', 'telefono', 'email'];
const PRESCRIPCIONES_HEADER = ['id', 'pacienteCodigo', 'medicamento', 'dosis', 'frecuencia', 'fechaInicio', 'fechaFin', 'creadoPor', 'fechaCreacion'];
const TOMAS_HEADER = ['id', 'prescripcionId', 'fechaHora', 'nota', 'completadoPor'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];
const AES_KEY = '000102030405060708090a0b0c0d0e0f';

const PSIQUIATRA = { codigo: 'PSI001', rol: 'psiquiatra', nombre: 'Dra. Petra' };
const PACIENTE = { codigo: 'PAC001', rol: 'usuario', nombre: 'Maria' };

function buildServices({ usuarios = [], prescripciones = [], tomas = [] } = {}) {
  return createMockServices({
    sheets: {
      _usuarios: [USUARIOS_HEADER, ...usuarios],
      _prescripciones: [PRESCRIPCIONES_HEADER, ...prescripciones],
      _prescripciones_tomas: [TOMAS_HEADER, ...tomas],
      _log: [LOG_HEADER],
    },
    properties: { AES_KEY },
  });
}

describe('crearPrescripcion', () => {
  it('retorna error si faltan campos requeridos', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const result = crearPrescripcion({ codigo: 'PAC001', medicamento: '', dosis: '10mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'codigo, medicamento, dosis, frecuencia y fechaInicio son requeridos' });
  });

  it('retorna error si paciente no existe', () => {
    const services = buildServices();
    const result = crearPrescripcion({ codigo: 'NOEXISTE', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'Paciente no encontrado' });
  });

  it('retorna error si la hoja no existe', () => {
    const services = createMockServices({
      sheets: {
        _usuarios: [USUARIOS_HEADER, ['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']],
        _log: [LOG_HEADER],
      },
      properties: { AES_KEY },
    });
    const result = crearPrescripcion({ codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'Hoja de prescripciones no encontrada' });
  });

  it('crea la prescripcion, cifra campos y registra log', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const result = crearPrescripcion({ codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    expect(result.ok).toBe(true);
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_prescripciones');
    const rows = sheet.getRange(2, 1, 1, 9).getValues();
    const row = rows[0];
    expect(decrypt_(row[2], services)).toBe('Sertralina');
    expect(decrypt_(row[3], services)).toBe('50mg');
    expect(decrypt_(row[4], services)).toBe('diario');
    expect(row[5]).toBe('2026-06-01');
    const log = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_log');
    const logRows = log.getRange(2, 1, 1, 5).getValues();
    expect(logRows[0][3]).toBe('prescripcion_creada');
  });

  it('retorna prescripcion en texto plano', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const result = crearPrescripcion({ codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01', fechaFin: '2026-12-01' }, PSIQUIATRA, services);
    expect(result.prescripcion.medicamento).toBe('Sertralina');
    expect(result.prescripcion.dosis).toBe('50mg');
    expect(result.prescripcion.frecuencia).toBe('diario');
    expect(result.prescripcion.fechaFin).toBe('2026-12-01');
    expect(result.prescripcion.creadoPor).toBe('PSI001');
  });

  it('fechaFin vacio si no se provee', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const result = crearPrescripcion({ codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    expect(result.prescripcion.fechaFin).toBe('');
  });
});

describe('listarPrescripciones', () => {
  it('retorna error si el paciente no existe', () => {
    const services = buildServices();
    expect(listarPrescripciones('NOEXISTE', services)).toEqual({ error: 'Paciente no encontrado' });
  });

  it('retorna prescripciones vacias si no hay filas', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const result = listarPrescripciones('PAC001', services);
    expect(result).toEqual({ ok: true, prescripciones: [] });
  });

  it('descifra correctamente los campos cifrados', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    crearPrescripcion({ codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    const result = listarPrescripciones('PAC001', services);
    expect(result.prescripciones[0].medicamento).toBe('Sertralina');
    expect(result.prescripciones[0].dosis).toBe('50mg');
    expect(result.prescripciones[0].frecuencia).toBe('diario');
  });

  it('filtra solo las prescripciones del paciente solicitado', () => {
    const services = buildServices({
      usuarios: [
        ['PAC001', 'x', 'x', 'usuario', 'Maria', '', ''],
        ['PAC002', 'x', 'x', 'usuario', 'Carlos', '', ''],
      ],
    });
    crearPrescripcion({ codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    crearPrescripcion({ codigo: 'PAC002', medicamento: 'Fluoxetina', dosis: '20mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    const result = listarPrescripciones('PAC001', services);
    expect(result.prescripciones.length).toBe(1);
    expect(result.prescripciones[0].medicamento).toBe('Sertralina');
  });

  it('ordena por fechaInicio descendente', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    crearPrescripcion({ codigo: 'PAC001', medicamento: 'Vieja', dosis: '10mg', frecuencia: 'diario', fechaInicio: '2026-01-01' }, PSIQUIATRA, services);
    crearPrescripcion({ codigo: 'PAC001', medicamento: 'Nueva', dosis: '20mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    const result = listarPrescripciones('PAC001', services);
    expect(result.prescripciones[0].medicamento).toBe('Nueva');
    expect(result.prescripciones[1].medicamento).toBe('Vieja');
  });

  it('usa fechaCreacion como tiebreaker cuando fechaInicio es igual', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    crearPrescripcion({ codigo: 'PAC001', medicamento: 'Primera', dosis: '10mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    crearPrescripcion({ codigo: 'PAC001', medicamento: 'Segunda', dosis: '20mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    const result = listarPrescripciones('PAC001', services);
    expect(result.prescripciones[0].medicamento).toBe('Segunda');
  });
});

describe('listarMisPrescripciones', () => {
  it('retorna lista vacía si no hay prescripciones', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const result = listarMisPrescripciones(PACIENTE, services);
    expect(result).toEqual({ ok: true, prescripciones: [] });
  });

  it('descifra medicamento, dosis y frecuencia correctamente', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    crearPrescripcion({ codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-07-01' }, PSIQUIATRA, services);
    const result = listarMisPrescripciones(PACIENTE, services);
    expect(result.prescripciones[0].medicamento).toBe('Sertralina');
    expect(result.prescripciones[0].dosis).toBe('50mg');
    expect(result.prescripciones[0].frecuencia).toBe('diario');
  });

  it('no retorna prescripciones de otro paciente', () => {
    const services = buildServices({
      usuarios: [
        ['PAC001', 'x', 'x', 'usuario', 'Maria', '', ''],
        ['PAC002', 'x', 'x', 'usuario', 'Juan', '', ''],
      ],
    });
    crearPrescripcion({ codigo: 'PAC002', medicamento: 'Fluoxetina', dosis: '20mg', frecuencia: 'diario', fechaInicio: '2026-07-01' }, PSIQUIATRA, services);
    const result = listarMisPrescripciones(PACIENTE, services);
    expect(result.prescripciones).toEqual([]);
  });

  it('incluye tomas de la prescripcion ordenadas por fechaHora desc', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const { prescripcion } = crearPrescripcion(
      { codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-07-01' },
      PSIQUIATRA, services
    );
    const tomasSheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_prescripciones_tomas');
    tomasSheet.appendRow(['tom1', prescripcion.id, '2026-07-20T10:00:00.000Z', 'primera', 'PAC001']);
    tomasSheet.appendRow(['tom2', prescripcion.id, '2026-07-21T09:00:00.000Z', 'segunda', 'PAC001']);
    const result = listarMisPrescripciones(PACIENTE, services);
    expect(result.prescripciones[0].tomas.length).toBe(2);
    expect(result.prescripciones[0].tomas[0].fechaHora).toBe('2026-07-21T09:00:00.000Z');
    expect(result.prescripciones[0].tomas[1].fechaHora).toBe('2026-07-20T10:00:00.000Z');
  });
});

describe('registrarToma', () => {
  it('rechaza si falta prescripcionId', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    expect(registrarToma({}, PACIENTE, services)).toEqual({ error: 'prescripcionId es requerido' });
  });

  it('rechaza si la prescripción no existe', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    expect(registrarToma({ prescripcionId: 'noexiste' }, PACIENTE, services)).toEqual({ error: 'Prescripción no encontrada' });
  });

  it('rechaza si la prescripción pertenece a otro paciente', () => {
    const services = buildServices({
      usuarios: [
        ['PAC001', 'x', 'x', 'usuario', 'Maria', '', ''],
        ['PAC002', 'x', 'x', 'usuario', 'Juan', '', ''],
      ],
    });
    const { prescripcion } = crearPrescripcion(
      { codigo: 'PAC002', medicamento: 'Fluoxetina', dosis: '20mg', frecuencia: 'diario', fechaInicio: '2026-07-01' },
      PSIQUIATRA, services
    );
    expect(registrarToma({ prescripcionId: prescripcion.id }, PACIENTE, services)).toEqual({ error: 'Permiso denegado' });
  });

  it('guarda toma con campos correctos, registra log y retorna toma', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const { prescripcion } = crearPrescripcion(
      { codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-07-01' },
      PSIQUIATRA, services
    );
    const result = registrarToma({ prescripcionId: prescripcion.id, nota: 'con desayuno' }, PACIENTE, services);
    expect(result.ok).toBe(true);
    expect(result.toma.prescripcionId).toBe(prescripcion.id);
    expect(result.toma.nota).toBe('con desayuno');
    expect(result.toma.completadoPor).toBe('PAC001');
    const tomasSheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_prescripciones_tomas');
    const row = tomasSheet.getRange(2, 1, 1, 5).getValues()[0];
    expect(row[1]).toBe(prescripcion.id);
    expect(row[3]).toBe('con desayuno');
    const logSheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_log');
    const logRows = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 5).getValues();
    expect(logRows.some((r) => r[3] === 'toma_registrada')).toBe(true);
  });

  it('guarda nota vacía si no se provee', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const { prescripcion } = crearPrescripcion(
      { codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-07-01' },
      PSIQUIATRA, services
    );
    const result = registrarToma({ prescripcionId: prescripcion.id }, PACIENTE, services);
    expect(result.toma.nota).toBe('');
  });
});
