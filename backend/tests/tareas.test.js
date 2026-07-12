import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { asignarTarea, listarTareasPaciente, listarMisActividades, completarOcurrencia } from '../src/tareas.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const TAREAS_HEADER = ['id', 'pacienteCodigo', 'titulo', 'descripcion', 'tipo', 'frecuencia', 'fechaInicio', 'fechaFin', 'creadoPor', 'fechaCreacion'];
const REGISTROS_HEADER = ['id', 'tareaId', 'fechaOcurrencia', 'nota', 'completadoPor', 'fechaCompletacion'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];

const PSIQUIATRA = { codigo: 'PSI001', rol: 'psiquiatra', nombre: 'Dra. Petra' };
const PACIENTE_USER = { codigo: 'PAC001', rol: 'usuario', nombre: 'Maria' };
const USUARIO_ROW = ['PAC001', 'x', 'x', 'usuario', 'Maria'];

function buildServices({ usuarios = [], tareas = [], registros = [] } = {}) {
  return createMockServices({
    sheets: {
      _usuarios: [USUARIOS_HEADER, ...usuarios],
      _tareas: [TAREAS_HEADER, ...tareas],
      _tareas_registros: [REGISTROS_HEADER, ...registros],
      _log: [LOG_HEADER],
    },
  });
}

const TAREA_UNICA_ROW = ['t1', 'PAC001', 'Meditar', 'Descripcion', 'única', '', '2026-07-10', '2026-07-10', 'PSI001', '2026-07-10T10:00:00.000Z'];
const TAREA_RECURRENTE_ROW = ['t2', 'PAC001', 'Caminar', '', 'recurrente', 'diaria', '2026-07-10', '2026-07-14', 'PSI001', '2026-07-10T09:00:00.000Z'];

describe('asignarTarea', () => {
  it('guarda tarea única con campos correctos', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    const result = asignarTarea(
      { pacienteCodigo: 'PAC001', titulo: 'Meditar', tipo: 'única', fechaInicio: '2026-07-15', fechaFin: '2026-07-15' },
      PSIQUIATRA, services
    );
    expect(result.ok).toBe(true);
    expect(result.tarea.titulo).toBe('Meditar');
    expect(result.tarea.tipo).toBe('única');
    expect(result.tarea.frecuencia).toBe('');
    expect(result.tarea.id).toBeDefined();
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_tareas');
    const row = sheet.getRange(2, 1, 1, 10).getValues()[0];
    expect(row[2]).toBe('Meditar');
    expect(row[4]).toBe('única');
    expect(row[5]).toBe('');
  });

  it('guarda tarea recurrente con frecuencia', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    const result = asignarTarea(
      { pacienteCodigo: 'PAC001', titulo: 'Caminar', tipo: 'recurrente', frecuencia: 'diaria', fechaInicio: '2026-07-15', fechaFin: '2026-07-21' },
      PSIQUIATRA, services
    );
    expect(result.ok).toBe(true);
    expect(result.tarea.frecuencia).toBe('diaria');
    const row = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_tareas').getRange(2, 1, 1, 10).getValues()[0];
    expect(row[5]).toBe('diaria');
  });

  it('guarda descripcion vacía cuando no se pasa', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    const result = asignarTarea(
      { pacienteCodigo: 'PAC001', titulo: 'Tarea sin desc', tipo: 'única', fechaInicio: '2026-07-15', fechaFin: '2026-07-15' },
      PSIQUIATRA, services
    );
    expect(result.tarea.descripcion).toBe('');
  });

  it('rechaza paciente no encontrado', () => {
    const services = buildServices();
    expect(asignarTarea(
      { pacienteCodigo: 'NOEXISTE', titulo: 'X', tipo: 'única', fechaInicio: '2026-07-15', fechaFin: '2026-07-15' },
      PSIQUIATRA, services
    )).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza tipo inválido', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    expect(asignarTarea(
      { pacienteCodigo: 'PAC001', titulo: 'X', tipo: 'mensual', fechaInicio: '2026-07-15', fechaFin: '2026-07-15' },
      PSIQUIATRA, services
    )).toEqual({ error: 'tipo debe ser única o recurrente' });
  });

  it('rechaza fechaFin < fechaInicio', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    expect(asignarTarea(
      { pacienteCodigo: 'PAC001', titulo: 'X', tipo: 'única', fechaInicio: '2026-07-20', fechaFin: '2026-07-15' },
      PSIQUIATRA, services
    )).toEqual({ error: 'fechaFin debe ser mayor o igual a fechaInicio' });
  });

  it('rechaza recurrente sin frecuencia', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    expect(asignarTarea(
      { pacienteCodigo: 'PAC001', titulo: 'X', tipo: 'recurrente', fechaInicio: '2026-07-15', fechaFin: '2026-07-21' },
      PSIQUIATRA, services
    )).toEqual({ error: 'frecuencia debe ser diaria o semanal para tareas recurrentes' });
  });

  it('registra log tarea_asignada', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    asignarTarea(
      { pacienteCodigo: 'PAC001', titulo: 'X', tipo: 'única', fechaInicio: '2026-07-15', fechaFin: '2026-07-15' },
      PSIQUIATRA, services
    );
    const log = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_log');
    expect(log.getRange(2, 1, 1, 5).getValues()[0][3]).toBe('tarea_asignada');
  });
});

describe('listarTareasPaciente', () => {
  it('retorna tareas con registros incluidos', () => {
    const services = buildServices({
      usuarios: [USUARIO_ROW],
      tareas: [TAREA_UNICA_ROW],
      registros: [['r1', 't1', '2026-07-10', 'bien', 'PAC001', '2026-07-10T20:00:00.000Z']],
    });
    const result = listarTareasPaciente('PAC001', services);
    expect(result.ok).toBe(true);
    expect(result.tareas.length).toBe(1);
    expect(result.tareas[0].titulo).toBe('Meditar');
    expect(result.tareas[0].registros.length).toBe(1);
    expect(result.tareas[0].registros[0].fechaOcurrencia).toBe('2026-07-10');
  });

  it('retorna [] si no hay tareas', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    expect(listarTareasPaciente('PAC001', services)).toEqual({ ok: true, tareas: [] });
  });

  it('rechaza paciente no encontrado', () => {
    const services = buildServices();
    expect(listarTareasPaciente('NOEXISTE', services)).toEqual({ error: 'Paciente no encontrado' });
  });
});

describe('listarMisActividades', () => {
  it('retorna solo las tareas del paciente autenticado', () => {
    const services = buildServices({
      usuarios: [USUARIO_ROW, ['PAC002', 'x', 'x', 'usuario', 'Carlos']],
      tareas: [
        TAREA_UNICA_ROW,
        ['t3', 'PAC002', 'Otra tarea', '', 'única', '', '2026-07-10', '2026-07-10', 'PSI001', '2026-07-10T08:00:00.000Z'],
      ],
    });
    const result = listarMisActividades(PACIENTE_USER, services);
    expect(result.ok).toBe(true);
    expect(result.tareas.length).toBe(1);
    expect(result.tareas[0].pacienteCodigo).toBe('PAC001');
  });

  it('incluye registros de cada tarea', () => {
    const services = buildServices({
      usuarios: [USUARIO_ROW],
      tareas: [TAREA_UNICA_ROW],
      registros: [['r1', 't1', '2026-07-10', '', 'PAC001', '2026-07-10T20:00:00.000Z']],
    });
    const result = listarMisActividades(PACIENTE_USER, services);
    expect(result.tareas[0].registros.length).toBe(1);
  });
});

describe('completarOcurrencia', () => {
  it('guarda registro con campos correctos', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], tareas: [TAREA_UNICA_ROW] });
    const result = completarOcurrencia(
      { tareaId: 't1', fechaOcurrencia: '2026-07-10', nota: 'Lo hice' },
      PACIENTE_USER, services
    );
    expect(result.ok).toBe(true);
    expect(result.registro.tareaId).toBe('t1');
    expect(result.registro.fechaOcurrencia).toBe('2026-07-10');
    expect(result.registro.nota).toBe('Lo hice');
    expect(result.registro.id).toBeDefined();
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_tareas_registros');
    const row = sheet.getRange(2, 1, 1, 6).getValues()[0];
    expect(row[1]).toBe('t1');
    expect(row[2]).toBe('2026-07-10');
  });

  it('guarda nota vacía cuando no se pasa', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], tareas: [TAREA_UNICA_ROW] });
    const result = completarOcurrencia({ tareaId: 't1', fechaOcurrencia: '2026-07-10' }, PACIENTE_USER, services);
    expect(result.ok).toBe(true);
    expect(result.registro.nota).toBe('');
  });

  it('rechaza si la tarea no pertenece al usuario', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], tareas: [TAREA_UNICA_ROW] });
    expect(completarOcurrencia(
      { tareaId: 't1', fechaOcurrencia: '2026-07-10' },
      { codigo: 'PAC002', rol: 'usuario' }, services
    )).toEqual({ error: 'No autorizado' });
  });

  it('rechaza fecha fuera del rango de la tarea', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], tareas: [TAREA_UNICA_ROW] });
    expect(completarOcurrencia(
      { tareaId: 't1', fechaOcurrencia: '2026-07-11' },
      PACIENTE_USER, services
    )).toEqual({ error: 'Fecha fuera del rango de la tarea' });
  });

  it('rechaza ocurrencia ya registrada', () => {
    const services = buildServices({
      usuarios: [USUARIO_ROW],
      tareas: [TAREA_UNICA_ROW],
      registros: [['r1', 't1', '2026-07-10', '', 'PAC001', '2026-07-10T20:00:00.000Z']],
    });
    expect(completarOcurrencia(
      { tareaId: 't1', fechaOcurrencia: '2026-07-10' },
      PACIENTE_USER, services
    )).toEqual({ error: 'Esta ocurrencia ya fue registrada' });
  });

  it('registra log tarea_completada', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], tareas: [TAREA_UNICA_ROW] });
    completarOcurrencia({ tareaId: 't1', fechaOcurrencia: '2026-07-10' }, PACIENTE_USER, services);
    const log = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_log');
    expect(log.getRange(2, 1, 1, 5).getValues()[0][3]).toBe('tarea_completada');
  });
});
