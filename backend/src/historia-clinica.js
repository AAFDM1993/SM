import { encrypt_, decrypt_ } from './aes.js';
import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const SHEET_ANTECEDENTES = '_antecedentes';

function findAntecedentesRow(codigo, sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const rows = sheet.getRange(2, 1, last - 1, 8).getValues();
  const needle = String(codigo).trim().toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === needle) {
      return { fila: i + 2, row: rows[i] };
    }
  }
  return null;
}

function validarPaciente(codigo, services) {
  const usuario = findUser(codigo, services);
  if (!usuario || usuario.rol !== 'usuario') return null;
  return usuario;
}

export function leerAntecedentes(codigo, services) {
  const usuario = validarPaciente(codigo, services);
  if (!usuario) return { error: 'Paciente no encontrado' };

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ANTECEDENTES);
  if (!sheet) return { error: 'Hoja de antecedentes no encontrada' };

  const antecedentesRow = findAntecedentesRow(usuario.codigo, sheet);
  if (!antecedentesRow) {
    return {
      ok: true,
      antecedentes: {
        codigo: usuario.codigo,
        antecedentesPersonales: '',
        antecedentesPsiquiatricos: '',
        antecedentesFamiliares: '',
        alergias: '',
        medicacionActual: '',
        fechaActualizacion: '',
      },
    };
  }

  const row = antecedentesRow.row;
  return {
    ok: true,
    antecedentes: {
      codigo: usuario.codigo,
      antecedentesPersonales: decrypt_(row[1], services),
      antecedentesPsiquiatricos: decrypt_(row[2], services),
      antecedentesFamiliares: decrypt_(row[3], services),
      alergias: decrypt_(row[4], services),
      medicacionActual: decrypt_(row[5], services),
      fechaActualizacion: String(row[6]),
    },
  };
}

export function actualizarAntecedentes(b, user, services) {
  const codigo = String(b.codigo || '').trim();
  const usuario = validarPaciente(codigo, services);
  if (!usuario) return { error: 'Paciente no encontrado' };

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ANTECEDENTES);
  if (!sheet) return { error: 'Hoja de antecedentes no encontrada' };

  const antecedentesPersonales = encrypt_(String(b.antecedentesPersonales || ''), services);
  const antecedentesPsiquiatricos = encrypt_(String(b.antecedentesPsiquiatricos || ''), services);
  const antecedentesFamiliares = encrypt_(String(b.antecedentesFamiliares || ''), services);
  const alergias = encrypt_(String(b.alergias || ''), services);
  const medicacionActual = encrypt_(String(b.medicacionActual || ''), services);
  const valores = [antecedentesPersonales, antecedentesPsiquiatricos, antecedentesFamiliares, alergias, medicacionActual, new Date(), user.codigo];

  const antecedentesRow = findAntecedentesRow(usuario.codigo, sheet);
  if (antecedentesRow) {
    sheet.getRange(antecedentesRow.fila, 2, 1, 7).setValues([valores]);
  } else {
    sheet.appendRow([usuario.codigo, ...valores]);
  }

  registrarLog(services, user.codigo, user.rol, 'antecedentes_actualizados', usuario.codigo);

  return { ok: true };
}
