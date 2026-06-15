import { encrypt_, decrypt_ } from './aes.js';
import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const SHEET_ANTECEDENTES = '_antecedentes';
const SHEET_NOTAS = '_notas_evolucion';

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

export function crearNotaEvolucion(b, user, services) {
  const codigo = String(b.codigo || '').trim();
  const fecha = String(b.fecha || '').trim();
  const notas = String(b.notas || '').trim();
  if (!codigo || !fecha || !notas) return { error: 'codigo, fecha y notas son requeridos' };

  const usuario = validarPaciente(codigo, services);
  if (!usuario) return { error: 'Paciente no encontrado' };

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTAS);
  if (!sheet) return { error: 'Hoja de notas de evolución no encontrada' };

  const motivoConsulta = String(b.motivoConsulta || '').trim();
  const diagnostico = String(b.diagnostico || '').trim();

  const id = services.Utilities.getUuid();
  const fechaCreacion = new Date();

  sheet.appendRow([
    id,
    usuario.codigo,
    fecha,
    encrypt_(motivoConsulta, services),
    encrypt_(notas, services),
    encrypt_(diagnostico, services),
    user.codigo,
    fechaCreacion,
  ]);

  registrarLog(services, user.codigo, user.rol, 'nota_evolucion_creada', `${id} paciente=${usuario.codigo} ${fecha}`);

  return {
    ok: true,
    nota: { id, pacienteCodigo: usuario.codigo, fecha, motivoConsulta, notas, diagnostico, creadoPor: user.codigo, fechaCreacion },
  };
}

export function listarNotasEvolucion(codigo, services) {
  const usuario = validarPaciente(codigo, services);
  if (!usuario) return { error: 'Paciente no encontrado' };

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTAS);
  if (!sheet) return { error: 'Hoja de notas de evolución no encontrada' };

  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 8).getValues();

  const notas = rows
    .filter((row) => String(row[1]).trim().toLowerCase() === usuario.codigo.toLowerCase())
    .map((row) => ({
      id: String(row[0]),
      fecha: String(row[2]),
      motivoConsulta: decrypt_(row[3], services),
      notas: decrypt_(row[4], services),
      diagnostico: decrypt_(row[5], services),
      creadoPor: String(row[6]),
      fechaCreacion: row[7],
    }))
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
      return new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime();
    });

  return { ok: true, notas };
}
