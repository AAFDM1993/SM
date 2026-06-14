import { leerHorarioConfig, leerBloqueos } from './horario.js';
import { findUser } from './usuarios.js';
import { crearEventoCita, eliminarEventoCita } from './calendario.js';
import { registrarLog } from './log.js';

const SHEET_CITAS = '_citas';
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
const ESTADOS_CAMBIO_VALIDOS = ['Cancelada', 'Completada'];

function diaSemanaDeFecha(fecha) {
  const date = new Date(`${fecha}T00:00:00`);
  const indice = (date.getDay() + 6) % 7; // 0=lunes .. 6=domingo
  return DIAS_SEMANA[indice];
}

function rangoFechas(fechaInicio, fechaFin) {
  const fechas = [];
  let actual = new Date(`${fechaInicio}T00:00:00`);
  const fin = new Date(`${fechaFin}T00:00:00`);
  while (actual <= fin) {
    fechas.push(formatearFecha(actual));
    actual = new Date(actual.getTime() + 24 * 60 * 60 * 1000);
  }
  return fechas;
}

function formatearFecha(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function horaAMinutos(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function minutosAHora(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function generarSlots(horaInicio, horaFin, duracionSlotMin) {
  const slots = [];
  let actual = horaAMinutos(horaInicio);
  const fin = horaAMinutos(horaFin);
  while (actual + duracionSlotMin <= fin) {
    slots.push({ horaInicio: minutosAHora(actual), horaFin: minutosAHora(actual + duracionSlotMin) });
    actual += duracionSlotMin;
  }
  return slots;
}

function leerCitasRaw(services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CITAS);
  if (!sheet) return [];
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 10).getValues()
    .filter((r) => String(r[0]).trim() !== '')
    .map((r, i) => ({
      id: String(r[0]),
      fecha: String(r[1]),
      horaInicio: String(r[2]),
      horaFin: String(r[3]),
      pacienteCodigo: String(r[4]),
      estado: String(r[5]),
      creadoPor: String(r[6]),
      fechaCreacion: r[7],
      fechaActualizacion: r[8],
      calendarEventId: String(r[9] || ''),
      _fila: i + 2,
    }));
}

function nombrePaciente(codigo, services) {
  const user = findUser(codigo, services);
  return user ? user.nombre : codigo;
}

export function leerAgenda(fechaInicio, fechaFin, services) {
  if (!fechaInicio || !fechaFin) {
    return { error: 'fechaInicio y fechaFin son requeridos' };
  }

  const horarioConfig = leerHorarioConfig(services).horario;
  const bloqueos = leerBloqueos(services).bloqueos
    .filter((bq) => bq.fechaInicio <= fechaFin && bq.fechaFin >= fechaInicio);
  const citas = leerCitasRaw(services).filter((c) => c.fecha >= fechaInicio && c.fecha <= fechaFin);

  const slots = [];

  for (const fecha of rangoFechas(fechaInicio, fechaFin)) {
    const diaSemana = diaSemanaDeFecha(fecha);
    const config = horarioConfig.find((c) => c.diaSemana === diaSemana);
    if (!config || !config.activo) continue;

    const estaBloqueada = bloqueos.some((bq) => bq.fechaInicio <= fecha && fecha <= bq.fechaFin);

    for (const slot of generarSlots(config.horaInicio, config.horaFin, config.duracionSlotMin)) {
      const cita = citas.find((c) => c.fecha === fecha && c.horaInicio === slot.horaInicio && c.estado !== 'Cancelada');
      if (cita) {
        slots.push({
          fecha, horaInicio: slot.horaInicio, horaFin: slot.horaFin,
          estado: 'ocupado', citaId: cita.id, pacienteNombre: nombrePaciente(cita.pacienteCodigo, services), estadoCita: cita.estado,
        });
      } else if (estaBloqueada) {
        slots.push({ fecha, horaInicio: slot.horaInicio, horaFin: slot.horaFin, estado: 'bloqueado' });
      } else {
        slots.push({ fecha, horaInicio: slot.horaInicio, horaFin: slot.horaFin, estado: 'disponible' });
      }
    }
  }

  for (const cita of citas) {
    if (cita.estado === 'Cancelada') continue;
    const yaIncluida = slots.some((s) => s.fecha === cita.fecha && s.horaInicio === cita.horaInicio && s.citaId === cita.id);
    if (!yaIncluida) {
      slots.push({
        fecha: cita.fecha, horaInicio: cita.horaInicio, horaFin: cita.horaFin,
        estado: 'ocupado', citaId: cita.id, pacienteNombre: nombrePaciente(cita.pacienteCodigo, services), estadoCita: cita.estado,
      });
    }
  }

  return { ok: true, horarioConfig, bloqueos, slots };
}

export function crearCita(b, user, services) {
  const fecha = String(b.fecha || '');
  const horaInicio = String(b.horaInicio || '');
  const pacienteCodigo = String(b.pacienteCodigo || '');

  const horarioConfig = leerHorarioConfig(services).horario;
  const config = horarioConfig.find((c) => c.diaSemana === diaSemanaDeFecha(fecha));
  const slotValido = config && config.activo &&
    generarSlots(config.horaInicio, config.horaFin, config.duracionSlotMin).some((s) => s.horaInicio === horaInicio);
  if (!slotValido) {
    return { error: 'fecha y horaInicio fuera del horario configurado' };
  }

  const bloqueos = leerBloqueos(services).bloqueos;
  const estaBloqueada = bloqueos.some((bq) => bq.fechaInicio <= fecha && fecha <= bq.fechaFin);
  const citas = leerCitasRaw(services);
  const ocupado = citas.some((c) => c.fecha === fecha && c.horaInicio === horaInicio && c.estado !== 'Cancelada');
  if (estaBloqueada || ocupado) {
    return { error: 'Slot no disponible' };
  }

  const paciente = findUser(pacienteCodigo, services);
  if (!paciente || paciente.rol !== 'usuario') {
    return { error: 'Paciente no encontrado' };
  }

  const horaFin = minutosAHora(horaAMinutos(horaInicio) + config.duracionSlotMin);
  const id = services.Utilities.getUuid();
  const ahora = new Date();

  let calendarEventId = '';
  try {
    calendarEventId = crearEventoCita(
      { fecha, horaInicio, horaFin, pacienteNombre: paciente.nombre },
      services,
    );
  } catch (e) {
    registrarLog(services, user.codigo, user.rol, 'calendario_error', `crearCita ${id}: ${e.message}`);
  }

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CITAS);
  sheet.appendRow([id, fecha, horaInicio, horaFin, pacienteCodigo, 'Programada', user.codigo, ahora, ahora, calendarEventId]);

  return {
    ok: true,
    cita: { id, fecha, horaInicio, horaFin, pacienteCodigo, pacienteNombre: paciente.nombre, estado: 'Programada' },
  };
}

export function cambiarEstadoCita(b, user, services) {
  const citaId = String(b.citaId || '');
  const estado = String(b.estado || '');
  if (!ESTADOS_CAMBIO_VALIDOS.includes(estado)) {
    return { error: 'Estado invalido' };
  }
  const citas = leerCitasRaw(services);
  const cita = citas.find((c) => c.id === citaId);
  if (!cita) {
    return { error: 'Cita no encontrada' };
  }
  if (cita.estado !== 'Programada') {
    return { error: 'Solo se puede cambiar el estado de una cita Programada' };
  }
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CITAS);
  sheet.getRange(cita._fila, 6, 1, 1).setValue(estado);
  sheet.getRange(cita._fila, 9, 1, 1).setValue(new Date());

  if (estado === 'Cancelada') {
    try {
      eliminarEventoCita(cita.calendarEventId, services);
    } catch (e) {
      registrarLog(services, user.codigo, user.rol, 'calendario_error', `cambiarEstadoCita ${citaId}: ${e.message}`);
    }
    sheet.getRange(cita._fila, 10, 1, 1).setValue('');
  }

  return { ok: true };
}

function mapearCitaSimple(cita) {
  return { id: cita.id, fecha: cita.fecha, horaInicio: cita.horaInicio, horaFin: cita.horaFin, estado: cita.estado };
}

export function leerMiAgenda(user, services) {
  const hoy = formatearFecha(new Date());
  const citas = leerCitasRaw(services).filter((c) => c.pacienteCodigo === user.codigo);
  const proximas = citas
    .filter((c) => c.estado === 'Programada' && c.fecha >= hoy)
    .sort((a, b) => {
      const ca = a.fecha + a.horaInicio;
      const cb = b.fecha + b.horaInicio;
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    })
    .map(mapearCitaSimple);
  const historial = citas
    .filter((c) => c.estado !== 'Programada' || c.fecha < hoy)
    .sort((a, b) => {
      const ca = a.fecha + a.horaInicio;
      const cb = b.fecha + b.horaInicio;
      return ca < cb ? 1 : ca > cb ? -1 : 0;
    })
    .map(mapearCitaSimple);
  return { ok: true, proximas, historial };
}

export function cancelarMiCita(b, user, services) {
  const citaId = String(b.citaId || '');
  const citas = leerCitasRaw(services);
  const cita = citas.find((c) => c.id === citaId);
  if (!cita) {
    return { error: 'Cita no encontrada' };
  }
  if (cita.pacienteCodigo !== user.codigo) {
    return { error: 'No tienes permiso sobre esta cita' };
  }
  if (cita.estado !== 'Programada') {
    return { error: 'Solo se pueden cancelar citas Programadas' };
  }
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CITAS);
  sheet.getRange(cita._fila, 6, 1, 1).setValue('Cancelada');
  sheet.getRange(cita._fila, 9, 1, 1).setValue(new Date());

  try {
    eliminarEventoCita(cita.calendarEventId, services);
  } catch (e) {
    registrarLog(services, user.codigo, user.rol, 'calendario_error', `cancelarMiCita ${citaId}: ${e.message}`);
  }
  sheet.getRange(cita._fila, 10, 1, 1).setValue('');

  return { ok: true };
}
