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

// Ejecutar manualmente desde el editor de Apps Script para inicializar el sistema.
function setup() {
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
    { name: '_tareas', header: ['id', 'pacienteCodigo', 'titulo', 'descripcion', 'tipo', 'frecuencia', 'fechaInicio', 'fechaFin', 'creadoPor', 'fechaCreacion'] },
    { name: '_tareas_registros', header: ['id', 'tareaId', 'fechaOcurrencia', 'nota', 'completadoPor', 'fechaCompletacion'] },
    { name: '_prescripciones_tomas', header: ['id', 'prescripcionId', 'fechaHora', 'nota', 'completadoPor'] },
    { name: '_sintomas', header: ['id', 'pacienteCodigo', 'tipo', 'intensidad', 'nota', 'fechaHora', 'registradoPor'] },
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

  const props = PropertiesService.getScriptProperties();
  const aesKey = props.getProperty('AES_KEY');
  if (aesKey) {
    Logger.log('AES_KEY: ya configurada');
  } else {
    const newKey = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('AES_KEY', newKey);
    Logger.log('AES_KEY generada: ' + newKey + ' — copia esta clave y guárdala en un lugar seguro');
  }

  try {
    const cal = obtenerCalendarioConsultas(gasServices);
    Logger.log('Calendario "Consultas SMPDJM": ' + cal.getId());
  } catch (e) {
    Logger.log('ADVERTENCIA calendario: ' + e.message);
  }

  Logger.log('Setup completo.');
}
