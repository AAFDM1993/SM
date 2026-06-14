import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { obtenerCalendarioConsultas, crearEventoCita, eliminarEventoCita } from '../src/calendario.js';

describe('obtenerCalendarioConsultas', () => {
  it('crea el calendario "Consultas SMPDJM" si no existe ninguno', () => {
    const services = createMockServices();
    const calendario = obtenerCalendarioConsultas(services);
    expect(calendario.getName()).toBe('Consultas SMPDJM');
    expect(services.CalendarApp.getCalendarsByName('Consultas SMPDJM')).toHaveLength(1);
  });

  it('en llamadas posteriores reutiliza el mismo calendario (cacheado en PropertiesService)', () => {
    const services = createMockServices();
    const primero = obtenerCalendarioConsultas(services);
    const segundo = obtenerCalendarioConsultas(services);
    expect(segundo.getId()).toBe(primero.getId());
    expect(services.CalendarApp.getCalendarsByName('Consultas SMPDJM')).toHaveLength(1);
  });

  it('si la propiedad no esta guardada, reutiliza un calendario existente por nombre', () => {
    const services = createMockServices();
    const creado = services.CalendarApp.createCalendar('Consultas SMPDJM');
    const encontrado = obtenerCalendarioConsultas(services);
    expect(encontrado.getId()).toBe(creado.getId());
    expect(services.CalendarApp.getCalendarsByName('Consultas SMPDJM')).toHaveLength(1);
  });
});

describe('crearEventoCita', () => {
  it('crea un evento "Consulta: <nombre>" con el horario indicado y devuelve su id', () => {
    const services = createMockServices();
    const eventId = crearEventoCita(
      { fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', pacienteNombre: 'M. Garcia' },
      services,
    );
    expect(typeof eventId).toBe('string');
    expect(eventId).not.toBe('');

    const calendario = obtenerCalendarioConsultas(services);
    const evento = calendario.getEventById(eventId);
    expect(evento.getTitle()).toBe('Consulta: M. Garcia');
  });
});

describe('eliminarEventoCita', () => {
  it('elimina un evento existente', () => {
    const services = createMockServices();
    const eventId = crearEventoCita(
      { fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', pacienteNombre: 'M. Garcia' },
      services,
    );
    eliminarEventoCita(eventId, services);
    const calendario = obtenerCalendarioConsultas(services);
    expect(calendario.getEventById(eventId)).toBeNull();
  });

  it('no hace nada si el eventId esta vacio', () => {
    const services = createMockServices();
    expect(() => eliminarEventoCita('', services)).not.toThrow();
  });

  it('no hace nada si el evento ya no existe', () => {
    const services = createMockServices();
    expect(() => eliminarEventoCita('event-inexistente', services)).not.toThrow();
  });
});
