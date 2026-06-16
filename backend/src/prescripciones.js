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
  const fechaCreacion = new Date();
  sheet.appendRow([
    id, usuario.codigo,
    encrypt_(medicamento, services), encrypt_(dosis, services), encrypt_(frecuencia, services),
    fechaInicio, fechaFin, user.codigo, fechaCreacion,
  ]);
  registrarLog(services, user.codigo, user.rol, 'prescripcion_creada', `${id} paciente=${usuario.codigo} ${fechaInicio}`);
  return { ok: true, prescripcion: { id, pacienteCodigo: usuario.codigo, medicamento, dosis, frecuencia, fechaInicio, fechaFin, creadoPor: user.codigo, fechaCreacion } };
}

export function listarPrescripciones(codigo, services) {
  const usuario = validarPaciente(codigo, services);
  if (!usuario) return { error: 'Paciente no encontrado' };
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PRESCRIPCIONES);
  if (!sheet) return { error: 'Hoja de prescripciones no encontrada' };
  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 9).getValues();
  const prescripciones = rows
    .filter((row) => String(row[1]).trim().toLowerCase() === usuario.codigo.toLowerCase())
    .map((row, index) => ({
      id: String(row[0]), pacienteCodigo: String(row[1]),
      medicamento: decrypt_(row[2], services), dosis: decrypt_(row[3], services), frecuencia: decrypt_(row[4], services),
      fechaInicio: String(row[5]), fechaFin: String(row[6]), creadoPor: String(row[7]), fechaCreacion: row[8],
      _index: index,
    }))
    .sort((a, b) => {
      if (a.fechaInicio !== b.fechaInicio) return a.fechaInicio < b.fechaInicio ? 1 : -1;
      const timeDiff = new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b._index - a._index;
    })
    .map(({ _index, ...rest }) => rest);
  return { ok: true, prescripciones };
}
