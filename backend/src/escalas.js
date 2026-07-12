import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const SHEET_ESCALAS = '_escalas_aplicaciones';
const SHEET_PACIENTES = '_pacientes';

const ESCALAS = {
  'asrs-v1.1': {
    nombre: 'ASRS v1.1 - Escala de autoevaluación de TDHA en adultos',
    numPreguntas: 18,
    calcularScore(respuestas) {
      let puntajeTotal = 0;
      for (let i = 1; i <= 18; i++) puntajeTotal += Number(respuestas[`q${i}`]);
      let positivos = 0;
      if (Number(respuestas.q1) >= 2) positivos++;
      if (Number(respuestas.q2) >= 2) positivos++;
      if (Number(respuestas.q3) >= 2) positivos++;
      if (Number(respuestas.q4) >= 3) positivos++;
      if (Number(respuestas.q5) >= 3) positivos++;
      if (Number(respuestas.q6) >= 3) positivos++;
      return { puntajeTotal, partAPositivo: positivos >= 4 };
    },
  },
};

function validarRespuestas(respuestas, numPreguntas) {
  for (let i = 1; i <= numPreguntas; i++) {
    const val = Number(respuestas[`q${i}`]);
    if (!Number.isInteger(val) || val < 0 || val > 4) return false;
  }
  return true;
}

function getEmailPaciente(codigo, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PACIENTES);
  if (!sheet) return null;
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const rows = sheet.getRange(2, 1, last - 1, 5).getValues();
  const needle = String(codigo).trim().toLowerCase();
  for (const row of rows) {
    if (String(row[0]).trim().toLowerCase() === needle) {
      return String(row[4]).trim() || null;
    }
  }
  return null;
}

function parseAplicacion(row) {
  return {
    id: String(row[0]),
    pacienteCodigo: String(row[1]),
    escalaTipo: String(row[2]),
    modo: String(row[3]),
    estado: String(row[4]),
    puntajeTotal: row[6] !== '' ? Number(row[6]) : null,
    partAPositivo: row[7] !== '' ? row[7] === 'true' : null,
    creadoPor: String(row[8]),
    fechaCreacion: String(row[9]),
    completadoPor: String(row[10]),
    fechaCompletada: String(row[11]),
  };
}

export function aplicarEscala(b, user, services) {
  const pacienteCodigo = String(b.pacienteCodigo || '').trim();
  const escalaTipo = String(b.escalaTipo || '').trim();
  if (!pacienteCodigo || !escalaTipo) return { error: 'pacienteCodigo y escalaTipo son requeridos' };
  const escala = ESCALAS[escalaTipo];
  if (!escala) return { error: 'Tipo de escala no reconocido' };
  const paciente = findUser(pacienteCodigo, services);
  if (!paciente || paciente.rol !== 'usuario') return { error: 'Paciente no encontrado' };
  const respuestas = b.respuestas || {};
  if (!validarRespuestas(respuestas, escala.numPreguntas)) return { error: 'Respuestas inválidas o incompletas' };
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ESCALAS);
  if (!sheet) return { error: 'Hoja de escalas no encontrada' };
  const { puntajeTotal, partAPositivo } = escala.calcularScore(respuestas);
  const id = services.Utilities.getUuid();
  const fechaCreacion = new Date().toISOString();
  sheet.appendRow([
    id, pacienteCodigo, escalaTipo, 'manual', 'completada',
    JSON.stringify(respuestas), String(puntajeTotal), String(partAPositivo),
    user.codigo, fechaCreacion, user.codigo, fechaCreacion,
  ]);
  registrarLog(services, user.codigo, user.rol, 'escala_aplicada', `${id} paciente=${pacienteCodigo} tipo=${escalaTipo}`);
  return { ok: true, aplicacion: { id, pacienteCodigo, escalaTipo, modo: 'manual', estado: 'completada', puntajeTotal, partAPositivo, fechaCompletada: fechaCreacion } };
}

export function asignarEscala(b, user, services) {
  const pacienteCodigo = String(b.pacienteCodigo || '').trim();
  const escalaTipo = String(b.escalaTipo || '').trim();
  if (!pacienteCodigo || !escalaTipo) return { error: 'pacienteCodigo y escalaTipo son requeridos' };
  const escala = ESCALAS[escalaTipo];
  if (!escala) return { error: 'Tipo de escala no reconocido' };
  const paciente = findUser(pacienteCodigo, services);
  if (!paciente || paciente.rol !== 'usuario') return { error: 'Paciente no encontrado' };
  const email = getEmailPaciente(pacienteCodigo, services);
  if (!email) return { error: 'El paciente no tiene email registrado' };
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ESCALAS);
  if (!sheet) return { error: 'Hoja de escalas no encontrada' };
  const id = services.Utilities.getUuid();
  const fechaCreacion = new Date().toISOString();
  sheet.appendRow([
    id, pacienteCodigo, escalaTipo, 'autoaplicada', 'pendiente',
    '', '', '', user.codigo, fechaCreacion, '', '',
  ]);
  services.MailApp.sendEmail(
    email,
    `Escala de evaluación asignada: ${escala.nombre}`,
    `Estimado/a ${paciente.nombre},\n\nSe le ha asignado una escala de evaluación "${escala.nombre}".\n\nPor favor ingrese a su portal para completarla.\n\nSaludos,\nConsultorio Dra. Petra Diana Jara M.`
  );
  registrarLog(services, user.codigo, user.rol, 'escala_asignada', `${id} paciente=${pacienteCodigo} tipo=${escalaTipo}`);
  return { ok: true, aplicacionId: id };
}

export function completarEscala(b, user, services) {
  const aplicacionId = String(b.aplicacionId || '').trim();
  if (!aplicacionId) return { error: 'aplicacionId es requerido' };
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ESCALAS);
  if (!sheet) return { error: 'Hoja de escalas no encontrada' };
  const last = sheet.getLastRow();
  if (last < 2) return { error: 'Aplicación no encontrada' };
  const rows = sheet.getRange(2, 1, last - 1, 12).getValues();
  let filaIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === aplicacionId) { filaIdx = i; break; }
  }
  if (filaIdx === -1) return { error: 'Aplicación no encontrada' };
  const row = rows[filaIdx];
  if (String(row[1]).trim().toLowerCase() !== user.codigo.toLowerCase()) return { error: 'No autorizado' };
  if (String(row[4]) !== 'pendiente') return { error: 'Esta escala ya fue completada' };
  const escalaTipo = String(row[2]);
  const escala = ESCALAS[escalaTipo];
  if (!escala) return { error: 'Tipo de escala no reconocido' };
  const respuestas = b.respuestas || {};
  if (!validarRespuestas(respuestas, escala.numPreguntas)) return { error: 'Respuestas inválidas o incompletas' };
  const { puntajeTotal, partAPositivo } = escala.calcularScore(respuestas);
  const fechaCompletada = new Date().toISOString();
  const filaNum = filaIdx + 2;
  sheet.getRange(filaNum, 5, 1, 4).setValues([['completada', JSON.stringify(respuestas), String(puntajeTotal), String(partAPositivo)]]);
  sheet.getRange(filaNum, 11, 1, 2).setValues([[user.codigo, fechaCompletada]]);
  registrarLog(services, user.codigo, user.rol, 'escala_completada', aplicacionId);
  return { ok: true, aplicacion: { id: aplicacionId, escalaTipo, puntajeTotal, partAPositivo, fechaCompletada } };
}

export function listarEscalasPaciente(codigo, services) {
  const paciente = findUser(codigo, services);
  if (!paciente || paciente.rol !== 'usuario') return { error: 'Paciente no encontrado' };
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ESCALAS);
  if (!sheet) return { error: 'Hoja de escalas no encontrada' };
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true, escalas: [] };
  const rows = sheet.getRange(2, 1, last - 1, 12).getValues();
  const needle = codigo.toLowerCase();
  const escalas = rows
    .filter((r) => String(r[1]).trim().toLowerCase() === needle)
    .map(parseAplicacion)
    .sort((a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime());
  return { ok: true, escalas };
}

export function listarMisEscalas(user, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ESCALAS);
  if (!sheet) return { error: 'Hoja de escalas no encontrada' };
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true, escalas: [] };
  const rows = sheet.getRange(2, 1, last - 1, 12).getValues();
  const needle = user.codigo.toLowerCase();
  const escalas = rows
    .filter((r) => String(r[1]).trim().toLowerCase() === needle)
    .map((row) => {
      const base = parseAplicacion(row);
      if (base.estado === 'completada') {
        try { base.respuestas = JSON.parse(String(row[5])); } catch { base.respuestas = {}; }
      }
      return base;
    })
    .sort((a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime());
  return { ok: true, escalas };
}
