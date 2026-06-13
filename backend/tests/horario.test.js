import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { leerHorarioConfig, leerBloqueos } from '../src/horario.js';

const HORARIO_HEADER = ['diaSemana', 'activo', 'horaInicio', 'horaFin', 'duracionSlotMin'];
const BLOQUEOS_HEADER = ['id', 'fechaInicio', 'fechaFin', 'motivo', 'creadoPor', 'fechaCreacion'];

const HORARIO_LABORAL = [
  ['Lunes', true, '09:00', '18:00', 45],
  ['Martes', true, '09:00', '18:00', 45],
  ['Miercoles', true, '09:00', '18:00', 45],
  ['Jueves', true, '09:00', '18:00', 45],
  ['Viernes', true, '09:00', '18:00', 45],
  ['Sabado', false, '09:00', '13:00', 45],
  ['Domingo', false, '09:00', '13:00', 45],
];

function buildServices({ horario = [], bloqueos = [] } = {}) {
  return createMockServices({
    sheets: {
      _horario_config: [HORARIO_HEADER, ...horario],
      _bloqueos: [BLOQUEOS_HEADER, ...bloqueos],
    },
  });
}

describe('leerHorarioConfig', () => {
  it('lee las 7 filas de horario', () => {
    const services = buildServices({ horario: HORARIO_LABORAL });
    expect(leerHorarioConfig(services)).toEqual({
      ok: true,
      horario: [
        { diaSemana: 'Lunes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Martes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Miercoles', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Jueves', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Viernes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Sabado', activo: false, horaInicio: '09:00', horaFin: '13:00', duracionSlotMin: 45 },
        { diaSemana: 'Domingo', activo: false, horaInicio: '09:00', horaFin: '13:00', duracionSlotMin: 45 },
      ],
    });
  });

  it('devuelve lista vacia si la hoja no tiene filas de datos', () => {
    const services = buildServices();
    expect(leerHorarioConfig(services)).toEqual({ ok: true, horario: [] });
  });
});

describe('leerBloqueos', () => {
  it('lee los bloqueos ordenados por fechaInicio', () => {
    const services = buildServices({
      bloqueos: [
        ['b2', '2026-08-01', '2026-08-10', 'Curso', 'ADM001', new Date()],
        ['b1', '2026-07-01', '2026-07-15', 'Vacaciones', 'ADM001', new Date()],
      ],
    });
    expect(leerBloqueos(services)).toEqual({
      ok: true,
      bloqueos: [
        { id: 'b1', fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' },
        { id: 'b2', fechaInicio: '2026-08-01', fechaFin: '2026-08-10', motivo: 'Curso' },
      ],
    });
  });

  it('devuelve lista vacia si no hay bloqueos', () => {
    const services = buildServices();
    expect(leerBloqueos(services)).toEqual({ ok: true, bloqueos: [] });
  });
});
