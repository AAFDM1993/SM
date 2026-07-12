import { handleGet, handlePost } from './router.js';

const gasServices = {
  Utilities,
  SpreadsheetApp,
  CacheService,
  PropertiesService,
  ContentService,
  CalendarApp,
};

function doGet(e) {
  return handleGet(e, gasServices);
}

function doPost(e) {
  return handlePost(e, gasServices);
}

// Ejecutar manualmente desde el editor de Apps Script para inicializar el Spreadsheet.
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const SHEETS = [
    { name: '_usuarios',        header: ['codigo', 'password', 'salt', 'rol', 'nombre'] },
    { name: '_pacientes',       header: ['codigo', 'fechaNacimiento', 'sexo', 'telefono', 'email', 'contactoEmergenciaNombre', 'contactoEmergenciaTelefono', 'fechaCreacion', 'creadoPor'] },
    { name: '_citas',           header: ['id', 'fecha', 'horaInicio', 'horaFin', 'pacienteCodigo', 'estado', 'creadoPor', 'fechaCreacion', 'fechaActualizacion', 'calendarEventId'] },
    { name: '_horario_config',  header: ['diaSemana', 'activo', 'horaInicio', 'horaFin', 'duracionSlotMin'] },
    { name: '_bloqueos',        header: ['id', 'fechaInicio', 'fechaFin', 'motivo', 'creadoPor', 'fechaCreacion'] },
    { name: '_antecedentes',    header: ['codigo', 'antecedentesPersonales', 'antecedentesPsiquiatricos', 'antecedentesFamiliares', 'alergias', 'medicacionActual', 'fechaActualizacion', 'actualizadoPor'] },
    { name: '_notas_evolucion', header: ['id', 'pacienteCodigo', 'fecha', 'motivoConsulta', 'notas', 'diagnostico', 'creadoPor', 'fechaCreacion'] },
    { name: '_prescripciones',  header: ['id', 'pacienteCodigo', 'medicamento', 'dosis', 'frecuencia', 'fechaInicio', 'fechaFin', 'creadoPor', 'fechaCreacion'] },
    { name: '_escalas_aplicaciones', header: ['id', 'pacienteCodigo', 'escalaTipo', 'modo', 'estado', 'respuestas', 'puntajeTotal', 'partAPositivo', 'creadoPor', 'fechaCreacion', 'completadoPor', 'fechaCompletada'] },
    { name: '_log',             header: ['timestamp', 'codigo', 'rol', 'accion', 'detalle'] },
  ];

  SHEETS.forEach(({ name, header }) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(header);
      Logger.log('Creada: ' + name);
    } else {
      Logger.log('Ya existe: ' + name);
    }
  });

  Logger.log('Setup completo.');
}
