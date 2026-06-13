const SHEET_HORARIO_CONFIG = '_horario_config';
const SHEET_BLOQUEOS = '_bloqueos';

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

export function actualizarHorarioConfig(b, services) {
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
  return { ok: true };
}
