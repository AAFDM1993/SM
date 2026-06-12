const SHEET_LOG = '_log';

export function registrarLog(services, codigo, rol, accion, detalle) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LOG);
  if (!sheet) return;
  sheet.appendRow([new Date(), codigo, rol, accion, detalle || '']);
}
