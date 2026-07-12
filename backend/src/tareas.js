import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const SHEET_TAREAS = '_tareas';
const SHEET_REGISTROS = '_tareas_registros';

function esFechaValida(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str + 'T12:00:00Z').getTime());
}

function parseTarea(row) {
  return {
    id: String(row[0]),
    pacienteCodigo: String(row[1]),
    titulo: String(row[2]),
    descripcion: String(row[3]),
    tipo: String(row[4]),
    frecuencia: String(row[5]),
    fechaInicio: String(row[6]),
    fechaFin: String(row[7]),
    creadoPor: String(row[8]),
    fechaCreacion: String(row[9]),
  };
}

function parseRegistro(row) {
  return {
    id: String(row[0]),
    tareaId: String(row[1]),
    fechaOcurrencia: String(row[2]),
    nota: String(row[3]),
    completadoPor: String(row[4]),
    fechaCompletacion: String(row[5]),
  };
}

function getTareasDelPaciente(codigo, sheetTareas, sheetRegistros) {
  const needle = codigo.toLowerCase();
  const lastT = sheetTareas.getLastRow();
  const tareas = lastT < 2 ? [] :
    sheetTareas.getRange(2, 1, lastT - 1, 10).getValues()
      .filter((r) => String(r[1]).trim().toLowerCase() === needle)
      .map(parseTarea)
      .sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

  const lastR = sheetRegistros.getLastRow();
  const allRegistros = lastR < 2 ? [] :
    sheetRegistros.getRange(2, 1, lastR - 1, 6).getValues().map(parseRegistro);

  tareas.forEach((t) => {
    t.registros = allRegistros
      .filter((r) => r.tareaId === t.id)
      .map((r) => ({ id: r.id, fechaOcurrencia: r.fechaOcurrencia, nota: r.nota, fechaCompletacion: r.fechaCompletacion }));
  });

  return tareas;
}

export function asignarTarea(b, user, services) {
  const pacienteCodigo = String(b.pacienteCodigo || '').trim();
  const titulo = String(b.titulo || '').trim();
  const tipo = String(b.tipo || '').trim();
  const fechaInicio = String(b.fechaInicio || '').trim();
  const fechaFin = String(b.fechaFin || '').trim();

  if (!pacienteCodigo || !titulo || !tipo || !fechaInicio || !fechaFin) {
    return { error: 'pacienteCodigo, titulo, tipo, fechaInicio y fechaFin son requeridos' };
  }
  if (tipo !== 'única' && tipo !== 'recurrente') return { error: 'tipo debe ser única o recurrente' };
  if (!esFechaValida(fechaInicio) || !esFechaValida(fechaFin)) return { error: 'Fechas inválidas' };
  if (fechaFin < fechaInicio) return { error: 'fechaFin debe ser mayor o igual a fechaInicio' };

  let frecuencia = '';
  if (tipo === 'recurrente') {
    frecuencia = String(b.frecuencia || '').trim();
    if (frecuencia !== 'diaria' && frecuencia !== 'semanal') {
      return { error: 'frecuencia debe ser diaria o semanal para tareas recurrentes' };
    }
  }

  const paciente = findUser(pacienteCodigo, services);
  if (!paciente || paciente.rol !== 'usuario') return { error: 'Paciente no encontrado' };

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAREAS);
  if (!sheet) return { error: 'Hoja de tareas no encontrada' };

  const id = services.Utilities.getUuid();
  const descripcion = String(b.descripcion || '').trim();
  const fechaCreacion = new Date().toISOString();

  sheet.appendRow([id, pacienteCodigo, titulo, descripcion, tipo, frecuencia, fechaInicio, fechaFin, user.codigo, fechaCreacion]);
  registrarLog(services, user.codigo, user.rol, 'tarea_asignada', `${id} paciente=${pacienteCodigo}`);

  return { ok: true, tarea: { id, pacienteCodigo, titulo, descripcion, tipo, frecuencia, fechaInicio, fechaFin, creadoPor: user.codigo, fechaCreacion } };
}

export function listarTareasPaciente(codigo, services) {
  const paciente = findUser(codigo, services);
  if (!paciente || paciente.rol !== 'usuario') return { error: 'Paciente no encontrado' };

  const sheetTareas = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAREAS);
  if (!sheetTareas) return { error: 'Hoja de tareas no encontrada' };
  const sheetRegistros = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REGISTROS);
  if (!sheetRegistros) return { error: 'Hoja de registros no encontrada' };

  return { ok: true, tareas: getTareasDelPaciente(codigo, sheetTareas, sheetRegistros) };
}

export function listarMisActividades(user, services) {
  const sheetTareas = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAREAS);
  if (!sheetTareas) return { error: 'Hoja de tareas no encontrada' };
  const sheetRegistros = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REGISTROS);
  if (!sheetRegistros) return { error: 'Hoja de registros no encontrada' };

  return { ok: true, tareas: getTareasDelPaciente(user.codigo, sheetTareas, sheetRegistros) };
}

export function completarOcurrencia(b, user, services) {
  const tareaId = String(b.tareaId || '').trim();
  const fechaOcurrencia = String(b.fechaOcurrencia || '').trim();

  if (!tareaId || !fechaOcurrencia) return { error: 'tareaId y fechaOcurrencia son requeridos' };
  if (!esFechaValida(fechaOcurrencia)) return { error: 'Fecha inválida' };

  const sheetTareas = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAREAS);
  if (!sheetTareas) return { error: 'Hoja de tareas no encontrada' };

  const lastT = sheetTareas.getLastRow();
  if (lastT < 2) return { error: 'Tarea no encontrada' };
  const tareaRow = sheetTareas.getRange(2, 1, lastT - 1, 10).getValues().find((r) => String(r[0]) === tareaId);
  if (!tareaRow) return { error: 'Tarea no encontrada' };

  const tarea = parseTarea(tareaRow);
  if (tarea.pacienteCodigo.toLowerCase() !== user.codigo.toLowerCase()) return { error: 'No autorizado' };
  if (fechaOcurrencia < tarea.fechaInicio || fechaOcurrencia > tarea.fechaFin) {
    return { error: 'Fecha fuera del rango de la tarea' };
  }

  const sheetRegistros = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REGISTROS);
  if (!sheetRegistros) return { error: 'Hoja de registros no encontrada' };

  const lastR = sheetRegistros.getLastRow();
  if (lastR >= 2) {
    const yaExiste = sheetRegistros.getRange(2, 1, lastR - 1, 6).getValues()
      .some((r) => String(r[1]) === tareaId && String(r[2]) === fechaOcurrencia);
    if (yaExiste) return { error: 'Esta ocurrencia ya fue registrada' };
  }

  const id = services.Utilities.getUuid();
  const nota = String(b.nota || '').trim();
  const fechaCompletacion = new Date().toISOString();

  sheetRegistros.appendRow([id, tareaId, fechaOcurrencia, nota, user.codigo, fechaCompletacion]);
  registrarLog(services, user.codigo, user.rol, 'tarea_completada', `${tareaId} fecha=${fechaOcurrencia}`);

  return { ok: true, registro: { id, tareaId, fechaOcurrencia, nota, completadoPor: user.codigo, fechaCompletacion } };
}
