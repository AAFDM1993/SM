const PROP_CALENDAR_ID = 'CALENDAR_ID_CONSULTAS';
const NOMBRE_CALENDARIO = 'Consultas SMPDJM';

export function obtenerCalendarioConsultas(services) {
  const props = services.PropertiesService.getScriptProperties();
  const idGuardado = props.getProperty(PROP_CALENDAR_ID);
  if (idGuardado) {
    const cal = services.CalendarApp.getCalendarById(idGuardado);
    if (cal) return cal;
  }

  const existentes = services.CalendarApp.getCalendarsByName(NOMBRE_CALENDARIO);
  const calendario = existentes.length > 0
    ? existentes[0]
    : services.CalendarApp.createCalendar(NOMBRE_CALENDARIO);

  props.setProperty(PROP_CALENDAR_ID, calendario.getId());
  return calendario;
}
