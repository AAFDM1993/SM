import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { encrypt_, decrypt_ } from '../src/aes.js';
import { crearPrescripcion, listarPrescripciones } from '../src/prescripciones.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre', 'telefono', 'email'];
const PRESCRIPCIONES_HEADER = ['id', 'pacienteCodigo', 'medicamento', 'dosis', 'frecuencia', 'fechaInicio', 'fechaFin', 'creadoPor', 'fechaCreacion'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];
const AES_KEY = '000102030405060708090a0b0c0d0e0f';

const PSIQUIATRA = { codigo: 'PSI001', rol: 'psiquiatra', nombre: 'Dra. Petra' };

function buildServices({ usuarios = [], prescripciones = [] } = {}) {
  return createMockServices({
    sheets: {
      _usuarios: [USUARIOS_HEADER, ...usuarios],
      _prescripciones: [PRESCRIPCIONES_HEADER, ...prescripciones],
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
