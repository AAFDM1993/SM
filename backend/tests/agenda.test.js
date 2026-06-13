import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { leerAgenda } from '../src/agenda.js';

const HORARIO_HEADER = ['diaSemana', 'activo', 'horaInicio', 'horaFin', 'duracionSlotMin'];
const BLOQUEOS_HEADER = ['id', 'fechaInicio', 'fechaFin', 'motivo', 'creadoPor', 'fechaCreacion'];
const CITAS_HEADER = ['id', 'fecha', 'horaInicio', 'horaFin', 'pacienteCodigo', 'estado', 'creadoPor', 'fechaCreacion', 'fechaActualizacion'];
const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];

const HORARIO_LABORAL = [
  ['Lunes', true, '09:00', '18:00', 45],
  ['Martes', true, '09:00', '18:00', 45],
  ['Miercoles', true, '09:00', '18:00', 45],
  ['Jueves', true, '09:00', '18:00', 45],
  ['Viernes', true, '09:00', '18:00', 45],
  ['Sabado', false, '09:00', '13:00', 45],
  ['Domingo', false, '09:00', '13:00', 45],
];

function buildServices({ horario = HORARIO_LABORAL, bloqueos = [], citas = [], usuarios = [] } = {}) {
  return createMockServices({
    sheets: {
      _horario_config: [HORARIO_HEADER, ...horario],
      _bloqueos: [BLOQUEOS_HEADER, ...bloqueos],
      _citas: [CITAS_HEADER, ...citas],
      _usuarios: [USUARIOS_HEADER, ...usuarios],
    },
  });
}

describe('leerAgenda', () => {
  it('requiere fechaInicio y fechaFin', () => {
    const services = buildServices();
    expect(leerAgenda(undefined, undefined, services)).toEqual({ error: 'fechaInicio y fechaFin son requeridos' });
    expect(leerAgenda('2026-06-15', undefined, services)).toEqual({ error: 'fechaInicio y fechaFin son requeridos' });
  });

  it('genera 12 slots disponibles para un lunes (09:00-18:00, 45 min)', () => {
    const services = buildServices();
    const result = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(result.ok).toBe(true);
    expect(result.slots).toHaveLength(12);
    expect(result.slots[0]).toEqual({ fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', estado: 'disponible' });
    expect(result.slots[11]).toEqual({ fecha: '2026-06-15', horaInicio: '17:15', horaFin: '18:00', estado: 'disponible' });
    expect(result.horarioConfig).toHaveLength(7);
    expect(result.bloqueos).toEqual([]);
  });

  it('no genera slots para un dia inactivo (sabado)', () => {
    const services = buildServices();
    const result = leerAgenda('2026-06-20', '2026-06-20', services);
    expect(result.ok).toBe(true);
    expect(result.slots).toEqual([]);
  });

  it('marca un slot como ocupado cuando hay una cita Programada', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(result.slots[0]).toEqual({
      fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45',
      estado: 'ocupado', citaId: 'c1', pacienteNombre: 'M. Garcia', estadoCita: 'Programada',
    });
  });

  it('ignora citas Canceladas (el slot vuelve a disponible)', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Cancelada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(result.slots[0]).toEqual({ fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', estado: 'disponible' });
  });

  it('marca como bloqueado un slot sin cita en una fecha bloqueada', () => {
    const services = buildServices({
      bloqueos: [['b1', '2026-06-15', '2026-06-15', 'Feriado', 'ADM001', new Date()]],
    });
    const result = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(result.bloqueos).toEqual([{ id: 'b1', fechaInicio: '2026-06-15', fechaFin: '2026-06-15', motivo: 'Feriado' }]);
    expect(result.slots[0]).toEqual({ fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', estado: 'bloqueado' });
  });

  it('una cita Programada se muestra ocupada aunque la fecha este bloqueada', () => {
    const services = buildServices({
      bloqueos: [['b1', '2026-06-15', '2026-06-15', 'Feriado', 'ADM001', new Date()]],
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(result.slots[0].estado).toBe('ocupado');
    expect(result.slots[1]).toEqual({ fecha: '2026-06-15', horaInicio: '09:45', horaFin: '10:30', estado: 'bloqueado' });
  });

  it('incluye citas Programada fuera del horario activo generado', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '20:00', '20:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = leerAgenda('2026-06-15', '2026-06-15', services);
    const extra = result.slots.find((s) => s.horaInicio === '20:00');
    expect(extra).toEqual({
      fecha: '2026-06-15', horaInicio: '20:00', horaFin: '20:45',
      estado: 'ocupado', citaId: 'c1', pacienteNombre: 'M. Garcia', estadoCita: 'Programada',
    });
    expect(result.slots).toHaveLength(13); // 12 generados + 1 extra
  });

  it('filtra bloqueos que no solapan el rango solicitado', () => {
    const services = buildServices({
      bloqueos: [['b1', '2026-07-01', '2026-07-15', 'Vacaciones', 'ADM001', new Date()]],
    });
    const result = leerAgenda('2026-06-15', '2026-06-19', services);
    expect(result.bloqueos).toEqual([]);
  });
});
