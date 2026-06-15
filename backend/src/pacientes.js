import { generarSalt, generarHashSHA256 } from './hash.js';
import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const SHEET_USUARIOS = '_usuarios';
const SHEET_PACIENTES = '_pacientes';

function findUsuarioRow(codigo, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  if (!sheet) return null;
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const rows = sheet.getRange(2, 1, last - 1, 5).getValues();
  const needle = String(codigo).trim().toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === needle) {
      return { fila: i + 2, row: rows[i] };
    }
  }
  return null;
}

function findPacienteRow(codigo, sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const rows = sheet.getRange(2, 1, last - 1, 9).getValues();
  const needle = String(codigo).trim().toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === needle) {
      return { fila: i + 2, row: rows[i] };
    }
  }
  return null;
}

export function crearPaciente(b, user, services) {
  const codigo = String(b.codigo || '').trim();
  const nombre = String(b.nombre || '').trim();
  if (!codigo || !nombre) return { error: 'codigo y nombre son requeridos' };

  const sheetPacientes = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PACIENTES);
  if (!sheetPacientes) return { error: 'Hoja de pacientes no encontrada' };

  if (findUser(codigo, services)) return { error: 'Ya existe un usuario con ese código' };

  const fechaNacimiento = String(b.fechaNacimiento || '');
  const sexo = String(b.sexo || '');
  const telefono = String(b.telefono || '');
  const email = String(b.email || '');
  const contactoEmergenciaNombre = String(b.contactoEmergenciaNombre || '');
  const contactoEmergenciaTelefono = String(b.contactoEmergenciaTelefono || '');

  const salt = generarSalt(services);
  const passwordHash = generarHashSHA256(codigo + salt, services);
  const sheetUsuarios = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  sheetUsuarios.appendRow([codigo, passwordHash, salt, 'usuario', nombre]);

  sheetPacientes.appendRow([
    codigo, fechaNacimiento, sexo, telefono, email,
    contactoEmergenciaNombre, contactoEmergenciaTelefono, new Date(), user.codigo,
  ]);

  registrarLog(services, user.codigo, user.rol, 'paciente_creado', `${codigo} ${nombre}`);

  return {
    ok: true,
    paciente: {
      codigo, nombre, fechaNacimiento, sexo, telefono, email,
      contactoEmergenciaNombre, contactoEmergenciaTelefono,
    },
  };
}

export function actualizarPaciente(b, user, services) {
  const codigo = String(b.codigo || '').trim();
  const nombre = String(b.nombre || '').trim();
  if (!codigo || !nombre) return { error: 'codigo y nombre son requeridos' };

  const usuarioRow = findUsuarioRow(codigo, services);
  if (!usuarioRow || String(usuarioRow.row[3]).trim().toLowerCase() !== 'usuario') {
    return { error: 'Paciente no encontrado' };
  }

  const sheetPacientes = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PACIENTES);
  if (!sheetPacientes) return { error: 'Hoja de pacientes no encontrada' };

  if (String(usuarioRow.row[4]) !== nombre) {
    const sheetUsuarios = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
    sheetUsuarios.getRange(usuarioRow.fila, 5, 1, 1).setValue(nombre);
  }

  const fechaNacimiento = String(b.fechaNacimiento || '');
  const sexo = String(b.sexo || '');
  const telefono = String(b.telefono || '');
  const email = String(b.email || '');
  const contactoEmergenciaNombre = String(b.contactoEmergenciaNombre || '');
  const contactoEmergenciaTelefono = String(b.contactoEmergenciaTelefono || '');
  const valores = [fechaNacimiento, sexo, telefono, email, contactoEmergenciaNombre, contactoEmergenciaTelefono];

  const pacienteRow = findPacienteRow(codigo, sheetPacientes);
  if (pacienteRow) {
    sheetPacientes.getRange(pacienteRow.fila, 2, 1, 6).setValues([valores]);
  } else {
    sheetPacientes.appendRow([codigo, ...valores, new Date(), user.codigo]);
  }

  registrarLog(services, user.codigo, user.rol, 'paciente_actualizado', codigo);

  return { ok: true };
}

export function leerFichaPaciente(codigo, services) {
  const usuarioRow = findUsuarioRow(codigo, services);
  if (!usuarioRow || String(usuarioRow.row[3]).trim().toLowerCase() !== 'usuario') {
    return { error: 'Paciente no encontrado' };
  }

  const sheetPacientes = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PACIENTES);
  if (!sheetPacientes) return { error: 'Hoja de pacientes no encontrada' };

  const codigoNormalizado = String(usuarioRow.row[0]).trim();
  const nombre = String(usuarioRow.row[4]);
  const pacienteRow = findPacienteRow(codigoNormalizado, sheetPacientes);
  const ficha = pacienteRow ? pacienteRow.row : ['', '', '', '', '', '', '', '', ''];

  return {
    ok: true,
    paciente: {
      codigo: codigoNormalizado,
      nombre,
      fechaNacimiento: String(ficha[1]),
      sexo: String(ficha[2]),
      telefono: String(ficha[3]),
      email: String(ficha[4]),
      contactoEmergenciaNombre: String(ficha[5]),
      contactoEmergenciaTelefono: String(ficha[6]),
    },
  };
}

export function listarFichasPacientes(services) {
  const sheetPacientes = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PACIENTES);
  if (!sheetPacientes) return { error: 'Hoja de pacientes no encontrada' };

  const sheetUsuarios = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  const last = sheetUsuarios.getLastRow();
  const usuarios = last < 2 ? [] : sheetUsuarios.getRange(2, 1, last - 1, 5).getValues();

  const pacientes = usuarios
    .filter((r) => String(r[0]).trim() !== '' && String(r[3]).trim().toLowerCase() === 'usuario')
    .map((r) => {
      const codigo = String(r[0]).trim();
      const pacienteRow = findPacienteRow(codigo, sheetPacientes);
      return {
        codigo,
        nombre: String(r[4]),
        telefono: pacienteRow ? String(pacienteRow.row[3]) : '',
        email: pacienteRow ? String(pacienteRow.row[4]) : '',
      };
    });

  return { ok: true, pacientes };
}
