import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const SHEET_HORARIO_CONFIG = '_horario_config';
const SHEET_BLOQUEOS = '_bloqueos';
const SHEET_CITAS_AGENDA = '_citas';

export function leerHorarioConfig(services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_HORARIO_CONFIG);
  if (!sheet) return { ok: true, horario: [] };
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true, horario: [] };
  const rows = sheet.getRange(2, 1, last - 1, 5).getValues();
  const horario = rows
    .filter((r) => String(r[0]).trim() !== '')
    .map((r) => ({
      diaSemana: String(r[0]).trim(),
      activo: r[1] === true || String(r[1]).toUpperCase() === 'TRUE',
      horaInicio: String(r[2]),
      horaFin: String(r[3]),
      duracionSlotMin: Number(r[4]),
    }));
  return { ok: true, horario };
}

export function leerBloqueos(services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BLOQUEOS);
  if (!sheet) return { ok: true, bloqueos: [] };
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true, bloqueos: [] };
  const rows = sheet.getRange(2, 1, last - 1, 6).getValues();
  const bloqueos = rows
    .filter((r) => String(r[0]).trim() !== '')
    .map((r) => ({
      id: String(r[0]),
      fechaInicio: String(r[1]),
      fechaFin: String(r[2]),
      motivo: String(r[3] || ''),
    }))
    .sort((a, b) => (a.fechaInicio < b.fechaInicio ? -1 : a.fechaInicio > b.fechaInicio ? 1 : 0));
  return { ok: true, bloqueos };
}

export function actualizarHorarioConfig(b, user, services) {
  const horario = b && b.horario;
  if (!Array.isArray(horario) || horario.length !== 7) {
    return { error: 'Se requieren las 7 filas de horario' };
  }

  for (const fila of horario) {
    const activo = fila.activo === true || String(fila.activo).toUpperCase() === 'TRUE';
    if (!activo) continue;
    if (!(String(fila.horaInicio) < String(fila.horaFin))) {
      return { error: `horaInicio debe ser menor que horaFin (${fila.diaSemana})` };
    }
    const duracion = Number(fila.duracionSlotMin);
    if (!(Number.isInteger(duracion) && duracion > 0)) {
      return { error: `duracionSlotMin debe ser mayor que 0 (${fila.diaSemana})` };
    }
  }

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_HORARIO_CONFIG);
  const values = horario.map((fila) => [
    String(fila.diaSemana),
    fila.activo === true || String(fila.activo).toUpperCase() === 'TRUE',
    String(fila.horaInicio),
    String(fila.horaFin),
    Number(fila.duracionSlotMin),
  ]);
  sheet.getRange(2, 1, 7, 5).setValues(values);

  registrarLog(services, user.codigo, user.rol, 'horario_actualizado', '');

  return { ok: true };
}

function leerCitasProgramadas(services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CITAS_AGENDA);
  if (!sheet) return [];
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 6).getValues()
    .filter((r) => String(r[0]).trim() !== '' && String(r[5]) === 'Programada')
    .map((r) => ({ id: String(r[0]), fecha: String(r[1]), horaInicio: String(r[2]), pacienteCodigo: String(r[4]) }));
}

function nombrePaciente(codigo, services) {
  const user = findUser(codigo, services);
  return user ? user.nombre : codigo;
}

export function crearBloqueo(b, user, services) {
  const fechaInicio = String(b.fechaInicio || '');
  const fechaFin = String(b.fechaFin || '');
  const motivo = String(b.motivo || '');

  if (!(fechaInicio <= fechaFin)) {
    return { error: 'fechaInicio debe ser anterior o igual a fechaFin' };
  }

  if (!b.confirmar) {
    const citasAfectadas = leerCitasProgramadas(services)
      .filter((c) => c.fecha >= fechaInicio && c.fecha <= fechaFin)
      .map((c) => ({ id: c.id, fecha: c.fecha, horaInicio: c.horaInicio, pacienteNombre: nombrePaciente(c.pacienteCodigo, services) }));
    if (citasAfectadas.length > 0) {
      return { ok: false, requiereConfirmacion: true, citasAfectadas };
    }
  }

  const id = services.Utilities.getUuid();
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BLOQUEOS);
  sheet.appendRow([id, fechaInicio, fechaFin, motivo, user.codigo, new Date()]);

  registrarLog(services, user.codigo, user.rol, 'bloqueo_creado', `${id} ${fechaInicio} a ${fechaFin}`);

  return { ok: true, bloqueo: { id, fechaInicio, fechaFin, motivo } };
}

export function eliminarBloqueo(b, user, services) {
  const bloqueoId = String(b.bloqueoId || '');
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BLOQUEOS);
  if (!sheet) return { error: 'Bloqueo no encontrado' };
  const last = sheet.getLastRow();
  if (last < 2) return { error: 'Bloqueo no encontrado' };
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === bloqueoId) {
      sheet.deleteRow(i + 2);
      registrarLog(services, user.codigo, user.rol, 'bloqueo_eliminado', bloqueoId);
      return { ok: true };
    }
  }
  return { error: 'Bloqueo no encontrado' };
}
