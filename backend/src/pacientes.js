import { generarSalt, generarHashSHA256 } from './hash.js';
import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const SHEET_USUARIOS = '_usuarios';
const SHEET_PACIENTES = '_pacientes';

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
