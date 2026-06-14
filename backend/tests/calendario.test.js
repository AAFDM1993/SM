import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { obtenerCalendarioConsultas } from '../src/calendario.js';

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
