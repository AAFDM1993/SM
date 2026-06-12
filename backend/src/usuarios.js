import { generarHashSHA256, generarSalt } from './hash.js';

const SHEET_USUARIOS = '_usuarios';
const ROLES_VALIDOS = ['administrador', 'psiquiatra', 'recepcion', 'usuario'];

export function findUser(codigo, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  if (!sheet) return null;
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const rows = sheet.getRange(2, 1, last - 1, 5).getValues();
  const needle = String(codigo).trim().toLowerCase();
  for (const row of rows) {
    if (String(row[0]).trim().toLowerCase() === needle) {
      return {
        codigo: String(row[0]).trim(),
        password: String(row[1]),
        salt: String(row[2]),
        rol: String(row[3]).trim().toLowerCase(),
        nombre: String(row[4]),
      };
    }
  }
  return null;
}

export function listarUsuarios(services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  if (!sheet) return { ok: true, usuarios: [] };
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true, usuarios: [] };
  const rows = sheet.getRange(2, 1, last - 1, 5).getValues();
  const usuarios = rows
    .filter((r) => String(r[0]).trim() !== '')
    .map((r) => ({ codigo: String(r[0]).trim(), rol: String(r[3]).trim(), nombre: String(r[4]) }));
  return { ok: true, usuarios };
}

export function guardarUsuario(b, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  if (!sheet) return { error: 'Hoja de usuarios no encontrada' };

  const codigo = String(b.codigo || '').trim();
  const rol = String(b.rol || '').trim().toLowerCase();
  const nombre = String(b.nombre || '').trim();
  if (!codigo || !rol || !nombre) return { error: 'codigo, rol y nombre son requeridos' };
  if (ROLES_VALIDOS.indexOf(rol) === -1) return { error: 'Rol invalido' };

  const last = sheet.getLastRow();
  const needle = codigo.toLowerCase();
  let filaExistente = -1;
  if (last >= 2) {
    const col1 = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < col1.length; i++) {
      if (String(col1[i][0]).trim().toLowerCase() === needle) {
        filaExistente = i + 2;
        break;
      }
    }
  }

  if (filaExistente > 0) {
    if (b.password) {
      const salt = generarSalt(services);
      const passwordHash = generarHashSHA256(String(b.password) + salt, services);
      sheet.getRange(filaExistente, 1, 1, 5).setValues([[codigo, passwordHash, salt, rol, nombre]]);
    } else {
      const filaActual = sheet.getRange(filaExistente, 1, 1, 5).getValues()[0];
      sheet.getRange(filaExistente, 1, 1, 5).setValues([[codigo, filaActual[1], filaActual[2], rol, nombre]]);
    }
    return { ok: true, accion: 'actualizado' };
  }

  if (!b.password) return { error: 'password requerido para usuarios nuevos' };
  const salt = generarSalt(services);
  const passwordHash = generarHashSHA256(String(b.password) + salt, services);
  sheet.appendRow([codigo, passwordHash, salt, rol, nombre]);
  return { ok: true, accion: 'creado' };
}

export function eliminarUsuario(codigo, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  if (!sheet) return { error: 'Hoja de usuarios no encontrada' };
  const last = sheet.getLastRow();
  if (last < 2) return { error: 'No encontrado' };
  const col1 = sheet.getRange(2, 1, last - 1, 1).getValues();
  const needle = String(codigo).trim().toLowerCase();
  for (let i = 0; i < col1.length; i++) {
    if (String(col1[i][0]).trim().toLowerCase() === needle) {
      sheet.deleteRow(i + 2);
      return { ok: true };
    }
  }
  return { error: 'No encontrado' };
}
