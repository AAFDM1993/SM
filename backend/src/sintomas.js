import { registrarLog } from './log.js';

const TIPOS_VALIDOS = ['Ánimo', 'Ansiedad', 'Sueño', 'Energía', 'Irritabilidad'];
const SHEET_SINTOMAS = '_sintomas';

export function registrarSintoma(b, user, services) {
  const tipo = String(b.tipo || '').trim();
  if (!tipo) return { error: 'tipo es requerido' };
  if (!TIPOS_VALIDOS.includes(tipo)) return { error: 'Tipo de síntoma inválido' };

  const intensidadRaw = b.intensidad;
  if (intensidadRaw === undefined || intensidadRaw === null || intensidadRaw === '') {
    return { error: 'intensidad es requerida' };
  }
  const intensidad = Number(intensidadRaw);
  if (!Number.isInteger(intensidad) || intensidad < 1 || intensidad > 5) {
    return { error: 'Intensidad debe ser un número entre 1 y 5' };
  }

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SINTOMAS);
  if (!sheet) return { error: 'Hoja de síntomas no encontrada' };

  const id = services.Utilities.getUuid();
  const nota = String(b.nota || '');
  const fechaHora = new Date().toISOString();
  sheet.appendRow([id, user.codigo, tipo, intensidad, nota, fechaHora, user.codigo]);
  registrarLog(services, user.codigo, user.rol, 'sintoma_registrado', tipo);
  return { ok: true, sintoma: { id, tipo, intensidad, nota, fechaHora } };
}

export function listarMisSintomas(user, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SINTOMAS);
  if (!sheet) return { error: 'Hoja de síntomas no encontrada' };
  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 7).getValues();
  const needle = user.codigo.toLowerCase();
  const sintomas = rows
    .filter((row) => String(row[1]).trim().toLowerCase() === needle)
    .map((row) => ({
      id: String(row[0]),
      tipo: String(row[2]),
      intensidad: Number(row[3]),
      nota: String(row[4]),
      fechaHora: String(row[5]),
    }))
    .sort((a, b) => b.fechaHora.localeCompare(a.fechaHora));
  return { ok: true, sintomas };
}

export function listarSintomasPaciente(codigo, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SINTOMAS);
  if (!sheet) return { error: 'Hoja de síntomas no encontrada' };
  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 7).getValues();
  const needle = String(codigo).trim().toLowerCase();
  const sintomas = rows
    .filter((row) => String(row[1]).trim().toLowerCase() === needle)
    .map((row) => ({
      id: String(row[0]),
      tipo: String(row[2]),
      intensidad: Number(row[3]),
      nota: String(row[4]),
      fechaHora: String(row[5]),
    }))
    .sort((a, b) => b.fechaHora.localeCompare(a.fechaHora));
  return { ok: true, sintomas };
}
