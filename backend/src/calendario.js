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

export function crearEventoCita({ fecha, horaInicio, horaFin, pacienteNombre }, services) {
  const calendario = obtenerCalendarioConsultas(services);
  const inicio = new Date(`${fecha}T${horaInicio}:00`);
  const fin = new Date(`${fecha}T${horaFin}:00`);
  const evento = calendario.createEvent(`Consulta: ${pacienteNombre}`, inicio, fin, {
    description: 'Cita agendada en SMPDJM.',
  });
  return evento.getId();
}

export function eliminarEventoCita(eventId, services) {
  if (!eventId) return;
  const calendario = obtenerCalendarioConsultas(services);
  const evento = calendario.getEventById(eventId);
  if (evento) evento.deleteEvent();
}
