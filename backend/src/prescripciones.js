import { encrypt_, decrypt_ } from './aes.js';
import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const SHEET_PRESCRIPCIONES = '_prescripciones';

function validarPaciente(codigo, services) {
  const usuario = findUser(codigo, services);
  if (!usuario || usuario.rol !== 'usuario') return null;
  return usuario;
}

export function crearPrescripcion(b, user, services) {
  const codigo = String(b.codigo || '').trim();
  const medicamento = String(b.medicamento || '').trim();
  const dosis = String(b.dosis || '').trim();
  const frecuencia = String(b.frecuencia || '').trim();
  const fechaInicio = String(b.fechaInicio || '').trim();
  if (!codigo || !medicamento || !dosis || !frecuencia || !fechaInicio) {
    return { error: 'codigo, medicamento, dosis, frecuencia y fechaInicio son requeridos' };
  }
  const usuario = validarPaciente(codigo, services);
  if (!usuario) return { error: 'Paciente no encontrado' };
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PRESCRIPCIONES);
  if (!sheet) return { error: 'Hoja de prescripciones no encontrada' };
  const fechaFin = String(b.fechaFin || '');
  const id = services.Utilities.getUuid();
  const fechaCreacion = new Date().toISOString();
  sheet.appendRow([
    id, usuario.codigo,
    encrypt_(medicamento, services), encrypt_(dosis, services), encrypt_(frecuencia, services),
    fechaInicio, fechaFin, user.codigo, fechaCreacion,
  ]);
  registrarLog(services, user.codigo, user.rol, 'prescripcion_creada', `${id} paciente=${usuario.codigo} ${fechaInicio}`);
  return { ok: true, prescripcion: { id, pacienteCodigo: usuario.codigo, medicamento, dosis, frecuencia, fechaInicio, fechaFin, creadoPor: user.codigo, fechaCreacion } };
}

const SHEET_TOMAS = '_prescripciones_tomas';

export function listarPrescripciones(codigo, services) {
  const usuario = validarPaciente(codigo, services);
  if (!usuario) return { error: 'Paciente no encontrado' };
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PRESCRIPCIONES);
  if (!sheet) return { error: 'Hoja de prescripciones no encontrada' };
  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 9).getValues();
  const prescripciones = rows
    .filter((row) => String(row[1]).trim().toLowerCase() === usuario.codigo.toLowerCase())
    .map((row, index) => {
      function safeDecrypt(val) {
        try { return decrypt_(val, services); } catch { return '[cifrado inválido]'; }
      }
      return {
        id: String(row[0]), pacienteCodigo: String(row[1]),
        medicamento: safeDecrypt(row[2]), dosis: safeDecrypt(row[3]), frecuencia: safeDecrypt(row[4]),
        fechaInicio: String(row[5]), fechaFin: String(row[6]), creadoPor: String(row[7]), fechaCreacion: String(row[8]),
        _index: index,
      };
    })
    .sort((a, b) => {
      if (a.fechaInicio !== b.fechaInicio) return a.fechaInicio < b.fechaInicio ? 1 : -1;
      const timeDiff = new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b._index - a._index;
    })
    .map(({ _index, ...rest }) => rest);
  return { ok: true, prescripciones };
}

export function listarMisPrescripciones(user, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PRESCRIPCIONES);
  if (!sheet) return { error: 'Hoja de prescripciones no encontrada' };
  const tomasSheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TOMAS);
  if (!tomasSheet) return { error: 'Hoja de tomas no encontrada' };

  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 9).getValues();

  const lastTomas = tomasSheet.getLastRow();
  const tomasRows = lastTomas < 2 ? [] : tomasSheet.getRange(2, 1, lastTomas - 1, 5).getValues();

  function safeDecrypt(val) {
    try { return decrypt_(val, services); } catch { return '[cifrado inválido]'; }
  }

  const prescripciones = rows
    .filter((row) => String(row[1]).trim().toLowerCase() === user.codigo.toLowerCase())
    .map((row) => {
      const id = String(row[0]);
      const tomas = tomasRows
        .filter((t) => String(t[1]) === id)
        .map((t) => ({ id: String(t[0]), fechaHora: String(t[2]), nota: String(t[3]) }))
        .sort((a, b) => b.fechaHora.localeCompare(a.fechaHora));
      return {
        id,
        medicamento: safeDecrypt(row[2]),
        dosis: safeDecrypt(row[3]),
        frecuencia: safeDecrypt(row[4]),
        fechaInicio: String(row[5]),
        fechaFin: String(row[6]),
        tomas,
      };
    });

  return { ok: true, prescripciones };
}

export function registrarToma(b, user, services) {
  const prescripcionId = String(b.prescripcionId || '').trim();
  if (!prescripcionId) return { error: 'prescripcionId es requerido' };

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PRESCRIPCIONES);
  if (!sheet) return { error: 'Hoja de prescripciones no encontrada' };

  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 9).getValues();
  const prescripcionRow = rows.find((row) => String(row[0]) === prescripcionId);
  if (!prescripcionRow) return { error: 'Prescripción no encontrada' };
  if (String(prescripcionRow[1]).trim() !== user.codigo) return { error: 'Permiso denegado' };

  const tomasSheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TOMAS);
  if (!tomasSheet) return { error: 'Hoja de tomas no encontrada' };

  const id = services.Utilities.getUuid();
  const fechaHora = new Date().toISOString();
  const nota = String(b.nota || '');
  tomasSheet.appendRow([id, prescripcionId, fechaHora, nota, user.codigo]);
  registrarLog(services, user.codigo, user.rol, 'toma_registrada', prescripcionId);
  return { ok: true, toma: { id, prescripcionId, fechaHora, nota, completadoPor: user.codigo } };
}
