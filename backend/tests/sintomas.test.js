import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { registrarSintoma, listarMisSintomas, listarSintomasPaciente } from '../src/sintomas.js';

const SINTOMAS_HEADER = ['id', 'pacienteCodigo', 'tipo', 'intensidad', 'nota', 'fechaHora', 'registradoPor'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];

const PACIENTE = { codigo: 'PAC001', rol: 'usuario', nombre: 'Maria' };
const PACIENTE2 = { codigo: 'PAC002', rol: 'usuario', nombre: 'Juan' };

function buildServices({ sintomas = [] } = {}) {
  return createMockServices({
    sheets: {
      _sintomas: [SINTOMAS_HEADER, ...sintomas],
      _log: [LOG_HEADER],
    },
  });
}

describe('registrarSintoma', () => {
  it('retorna error si falta tipo', () => {
    const services = buildServices();
    expect(registrarSintoma({}, PACIENTE, services)).toEqual({ error: 'tipo es requerido' });
  });

  it('retorna error si tipo no está en TIPOS_VALIDOS', () => {
    const services = buildServices();
    expect(registrarSintoma({ tipo: 'Migraña', intensidad: 3 }, PACIENTE, services))
      .toEqual({ error: 'Tipo de síntoma inválido' });
  });

  it('retorna error si falta intensidad', () => {
    const services = buildServices();
    expect(registrarSintoma({ tipo: 'Ánimo' }, PACIENTE, services))
      .toEqual({ error: 'intensidad es requerida' });
  });

  it('retorna error si intensidad es 0', () => {
    const services = buildServices();
    expect(registrarSintoma({ tipo: 'Ánimo', intensidad: 0 }, PACIENTE, services))
      .toEqual({ error: 'Intensidad debe ser un número entre 1 y 5' });
  });

  it('retorna error si intensidad es 6', () => {
    const services = buildServices();
    expect(registrarSintoma({ tipo: 'Ánimo', intensidad: 6 }, PACIENTE, services))
      .toEqual({ error: 'Intensidad debe ser un número entre 1 y 5' });
  });

  it('guarda fila correcta, registra log y retorna sintoma', () => {
    const services = buildServices();
    const result = registrarSintoma({ tipo: 'Ánimo', intensidad: 3, nota: 'bien' }, PACIENTE, services);
    expect(result.ok).toBe(true);
    expect(result.sintoma.tipo).toBe('Ánimo');
    expect(result.sintoma.intensidad).toBe(3);
    expect(result.sintoma.nota).toBe('bien');
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_sintomas');
    const row = sheet.getRange(2, 1, 1, 7).getValues()[0];
    expect(row[1]).toBe('PAC001');
    expect(row[2]).toBe('Ánimo');
    expect(row[3]).toBe(3);
    expect(row[4]).toBe('bien');
    const logSheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_log');
    const logRows = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 5).getValues();
    expect(logRows.some((r) => r[3] === 'sintoma_registrado')).toBe(true);
  });

  it('guarda nota vacía si no se provee', () => {
    const services = buildServices();
    const result = registrarSintoma({ tipo: 'Ansiedad', intensidad: 2 }, PACIENTE, services);
    expect(result.sintoma.nota).toBe('');
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_sintomas');
    const row = sheet.getRange(2, 1, 1, 7).getValues()[0];
    expect(row[4]).toBe('');
  });
});

describe('listarMisSintomas', () => {
  it('retorna lista vacía si no hay registros', () => {
    const services = buildServices();
    expect(listarMisSintomas(PACIENTE, services)).toEqual({ ok: true, sintomas: [] });
  });

  it('no retorna síntomas de otro paciente', () => {
    const services = buildServices();
    registrarSintoma({ tipo: 'Ánimo', intensidad: 3 }, PACIENTE2, services);
    const result = listarMisSintomas(PACIENTE, services);
    expect(result.sintomas).toEqual([]);
  });

  it('retorna síntomas del paciente ordenados desc por fechaHora', () => {
    const services = buildServices();
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_sintomas');
    sheet.appendRow(['s1', 'PAC001', 'Ánimo', 2, '', '2026-07-20T10:00:00.000Z', 'PAC001']);
    sheet.appendRow(['s2', 'PAC001', 'Ansiedad', 4, '', '2026-07-21T09:00:00.000Z', 'PAC001']);
    const result = listarMisSintomas(PACIENTE, services);
    expect(result.sintomas.length).toBe(2);
    expect(result.sintomas[0].fechaHora).toBe('2026-07-21T09:00:00.000Z');
    expect(result.sintomas[1].fechaHora).toBe('2026-07-20T10:00:00.000Z');
  });

  it('intensidad retornada es número', () => {
    const services = buildServices();
    registrarSintoma({ tipo: 'Sueño', intensidad: 5 }, PACIENTE, services);
    const result = listarMisSintomas(PACIENTE, services);
    expect(typeof result.sintomas[0].intensidad).toBe('number');
  });
});

describe('listarSintomasPaciente', () => {
  it('retorna lista vacía si no hay registros', () => {
    const services = buildServices();
    expect(listarSintomasPaciente('PAC001', services)).toEqual({ ok: true, sintomas: [] });
  });

  it('retorna solo síntomas del paciente solicitado', () => {
    const services = buildServices();
    registrarSintoma({ tipo: 'Energía', intensidad: 1 }, PACIENTE, services);
    registrarSintoma({ tipo: 'Ánimo', intensidad: 3 }, PACIENTE2, services);
    const result = listarSintomasPaciente('PAC001', services);
    expect(result.sintomas.length).toBe(1);
    expect(result.sintomas[0].tipo).toBe('Energía');
  });

  it('ordena desc por fechaHora', () => {
    const services = buildServices();
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_sintomas');
    sheet.appendRow(['s1', 'PAC001', 'Ánimo', 2, '', '2026-07-20T10:00:00.000Z', 'PAC001']);
    sheet.appendRow(['s2', 'PAC001', 'Ansiedad', 4, '', '2026-07-21T09:00:00.000Z', 'PAC001']);
    const result = listarSintomasPaciente('PAC001', services);
    expect(result.sintomas[0].fechaHora).toBe('2026-07-21T09:00:00.000Z');
  });
});
