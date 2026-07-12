import { describe, it, expect, vi } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { aplicarEscala, asignarEscala, completarEscala, listarEscalasPaciente, listarMisEscalas } from '../src/escalas.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const PACIENTES_HEADER = ['codigo', 'fechaNacimiento', 'sexo', 'telefono', 'email', 'contactoEmergenciaNombre', 'contactoEmergenciaTelefono', 'fechaAlta', 'creadoPor'];
const ESCALAS_HEADER = ['id', 'pacienteCodigo', 'escalaTipo', 'modo', 'estado', 'respuestas', 'puntajeTotal', 'partAPositivo', 'creadoPor', 'fechaCreacion', 'completadoPor', 'fechaCompletada'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];

const PSIQUIATRA = { codigo: 'PSI001', rol: 'psiquiatra', nombre: 'Dra. Petra' };
const PACIENTE_USER = { codigo: 'PAC001', rol: 'usuario', nombre: 'Maria' };
const USUARIO_ROW = ['PAC001', 'x', 'x', 'usuario', 'Maria'];
const PACIENTE_ROW = ['PAC001', '', '', '', 'maria@example.com', '', '', '', ''];
const PACIENTE_SIN_EMAIL = ['PAC001', '', '', '', '', '', '', '', ''];

function respuestasCompletas(valor = 2) {
  const r = {};
  for (let i = 1; i <= 18; i++) r[`q${i}`] = valor;
  return r;
}

function buildServices({ usuarios = [], pacientes = [], escalas = [] } = {}) {
  return createMockServices({
    sheets: {
      _usuarios: [USUARIOS_HEADER, ...usuarios],
      _pacientes: [PACIENTES_HEADER, ...pacientes],
      _escalas_aplicaciones: [ESCALAS_HEADER, ...escalas],
      _log: [LOG_HEADER],
    },
  });
}

describe('aplicarEscala', () => {
  it('guarda con modo=manual y estado=completada', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    const result = aplicarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1', respuestas: respuestasCompletas() }, PSIQUIATRA, services);
    expect(result.ok).toBe(true);
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_escalas_aplicaciones');
    const row = sheet.getRange(2, 1, 1, 12).getValues()[0];
    expect(row[3]).toBe('manual');
    expect(row[4]).toBe('completada');
  });

  it('calcula puntaje total correcto (todos 2 -> 36)', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    const result = aplicarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1', respuestas: respuestasCompletas(2) }, PSIQUIATRA, services);
    expect(result.aplicacion.puntajeTotal).toBe(36);
  });

  it('partAPositivo true cuando >= 4 sintomas (Q1=2,Q2=2,Q3=2,Q4=3,Q5=3 = 5 positivos)', () => {
    const r = respuestasCompletas(0);
    r.q1 = 2; r.q2 = 2; r.q3 = 2; r.q4 = 3; r.q5 = 3;
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    const result = aplicarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1', respuestas: r }, PSIQUIATRA, services);
    expect(result.aplicacion.partAPositivo).toBe(true);
  });

  it('partAPositivo false cuando < 4 sintomas (Q1=2,Q4=3 = 2 positivos)', () => {
    const r = respuestasCompletas(0);
    r.q1 = 2; r.q4 = 3;
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    const result = aplicarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1', respuestas: r }, PSIQUIATRA, services);
    expect(result.aplicacion.partAPositivo).toBe(false);
  });

  it('rechaza paciente no encontrado', () => {
    const services = buildServices();
    expect(aplicarEscala({ pacienteCodigo: 'NOEXISTE', escalaTipo: 'asrs-v1.1', respuestas: respuestasCompletas() }, PSIQUIATRA, services))
      .toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza escalaTipo desconocido', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    expect(aplicarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'unknown', respuestas: respuestasCompletas() }, PSIQUIATRA, services))
      .toEqual({ error: 'Tipo de escala no reconocido' });
  });

  it('rechaza respuestas incompletas (falta q18)', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    const r = respuestasCompletas();
    delete r.q18;
    expect(aplicarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1', respuestas: r }, PSIQUIATRA, services))
      .toEqual({ error: 'Respuestas inválidas o incompletas' });
  });

  it('rechaza respuesta fuera de rango (q1=5)', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    const r = respuestasCompletas();
    r.q1 = 5;
    expect(aplicarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1', respuestas: r }, PSIQUIATRA, services))
      .toEqual({ error: 'Respuestas inválidas o incompletas' });
  });

  it('registra log escala_aplicada', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    aplicarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1', respuestas: respuestasCompletas() }, PSIQUIATRA, services);
    const log = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_log');
    expect(log.getRange(2, 1, 1, 5).getValues()[0][3]).toBe('escala_aplicada');
  });
});

describe('asignarEscala', () => {
  it('guarda con modo=autoaplicada y estado=pendiente', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], pacientes: [PACIENTE_ROW] });
    const result = asignarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1' }, PSIQUIATRA, services);
    expect(result.ok).toBe(true);
    expect(result.aplicacionId).toBeDefined();
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_escalas_aplicaciones');
    const row = sheet.getRange(2, 1, 1, 12).getValues()[0];
    expect(row[3]).toBe('autoaplicada');
    expect(row[4]).toBe('pendiente');
  });

  it('llama MailApp.sendEmail con el email del paciente', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], pacientes: [PACIENTE_ROW] });
    const spy = vi.fn();
    services.MailApp.sendEmail = spy;
    asignarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1' }, PSIQUIATRA, services);
    expect(spy).toHaveBeenCalledWith('maria@example.com', expect.any(String), expect.any(String));
  });

  it('rechaza paciente sin email', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], pacientes: [PACIENTE_SIN_EMAIL] });
    expect(asignarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1' }, PSIQUIATRA, services))
      .toEqual({ error: 'El paciente no tiene email registrado' });
  });

  it('registra log escala_asignada', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], pacientes: [PACIENTE_ROW] });
    asignarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1' }, PSIQUIATRA, services);
    const log = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_log');
    expect(log.getRange(2, 1, 1, 5).getValues()[0][3]).toBe('escala_asignada');
  });
});

describe('completarEscala', () => {
  it('actualiza fila a completada con puntaje correcto', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], pacientes: [PACIENTE_ROW] });
    const { aplicacionId } = asignarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1' }, PSIQUIATRA, services);
    const result = completarEscala({ aplicacionId, respuestas: respuestasCompletas(2) }, PACIENTE_USER, services);
    expect(result.ok).toBe(true);
    expect(result.aplicacion.puntajeTotal).toBe(36);
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_escalas_aplicaciones');
    const row = sheet.getRange(2, 1, 1, 12).getValues()[0];
    expect(row[4]).toBe('completada');
  });

  it('rechaza si aplicacionId no pertenece al usuario', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], pacientes: [PACIENTE_ROW] });
    const { aplicacionId } = asignarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1' }, PSIQUIATRA, services);
    expect(completarEscala({ aplicacionId, respuestas: respuestasCompletas() }, { codigo: 'PAC002', rol: 'usuario' }, services))
      .toEqual({ error: 'No autorizado' });
  });

  it('rechaza si ya estaba completada', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], pacientes: [PACIENTE_ROW] });
    const { aplicacionId } = asignarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1' }, PSIQUIATRA, services);
    completarEscala({ aplicacionId, respuestas: respuestasCompletas() }, PACIENTE_USER, services);
    expect(completarEscala({ aplicacionId, respuestas: respuestasCompletas() }, PACIENTE_USER, services))
      .toEqual({ error: 'Esta escala ya fue completada' });
  });

  it('registra log escala_completada', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], pacientes: [PACIENTE_ROW] });
    const { aplicacionId } = asignarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1' }, PSIQUIATRA, services);
    completarEscala({ aplicacionId, respuestas: respuestasCompletas() }, PACIENTE_USER, services);
    const log = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_log');
    const rows = log.getRange(2, 1, 2, 5).getValues();
    expect(rows.map((r) => r[3])).toContain('escala_completada');
  });
});

describe('listarEscalasPaciente', () => {
  it('retorna escalas del paciente ordenadas por fecha', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    aplicarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1', respuestas: respuestasCompletas() }, PSIQUIATRA, services);
    const result = listarEscalasPaciente('PAC001', services);
    expect(result.ok).toBe(true);
    expect(result.escalas.length).toBe(1);
    expect(result.escalas[0].escalaTipo).toBe('asrs-v1.1');
  });

  it('retorna [] si no hay escalas', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    expect(listarEscalasPaciente('PAC001', services)).toEqual({ ok: true, escalas: [] });
  });

  it('rechaza paciente no encontrado', () => {
    const services = buildServices();
    expect(listarEscalasPaciente('NOEXISTE', services)).toEqual({ error: 'Paciente no encontrado' });
  });
});

describe('listarMisEscalas', () => {
  it('retorna solo las escalas del usuario autenticado', () => {
    const services = buildServices({
      usuarios: [USUARIO_ROW, ['PAC002', 'x', 'x', 'usuario', 'Carlos']],
    });
    aplicarEscala({ pacienteCodigo: 'PAC001', escalaTipo: 'asrs-v1.1', respuestas: respuestasCompletas() }, PSIQUIATRA, services);
    aplicarEscala({ pacienteCodigo: 'PAC002', escalaTipo: 'asrs-v1.1', respuestas: respuestasCompletas() }, PSIQUIATRA, services);
    const result = listarMisEscalas(PACIENTE_USER, services);
    expect(result.ok).toBe(true);
    expect(result.escalas.length).toBe(1);
    expect(result.escalas[0].pacienteCodigo).toBe('PAC001');
  });
});
