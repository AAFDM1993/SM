import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { leerAgenda, crearCita, cambiarEstadoCita } from '../src/agenda.js';

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

const USER_RECEPCION = { codigo: 'REC001', rol: 'recepcion' };

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

describe('crearCita', () => {
  it('crea una cita en un slot disponible', () => {
    const services = buildServices({
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC001' }, USER_RECEPCION, services);
    expect(result.ok).toBe(true);
    expect(result.cita).toEqual({
      id: result.cita.id, fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45',
      pacienteCodigo: 'PAC001', pacienteNombre: 'M. Garcia', estado: 'Programada',
    });
    expect(typeof result.cita.id).toBe('string');

    const agenda = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(agenda.slots[0].estado).toBe('ocupado');
    expect(agenda.slots[0].citaId).toBe(result.cita.id);
  });

  it('rechaza un dia inactivo (fuera de horario configurado)', () => {
    const services = buildServices({ usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']] });
    const result = crearCita({ fecha: '2026-06-20', horaInicio: '09:00', pacienteCodigo: 'PAC001' }, USER_RECEPCION, services);
    expect(result).toEqual({ error: 'fecha y horaInicio fuera del horario configurado' });
  });

  it('rechaza una hora que no coincide con ningun slot generado', () => {
    const services = buildServices({ usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']] });
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:10', pacienteCodigo: 'PAC001' }, USER_RECEPCION, services);
    expect(result).toEqual({ error: 'fecha y horaInicio fuera del horario configurado' });
  });

  it('rechaza un slot ya ocupado por otra cita Programada', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia'], ['PAC002', 'h', 's', 'usuario', 'J. Lopez']],
    });
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC002' }, USER_RECEPCION, services);
    expect(result).toEqual({ error: 'Slot no disponible' });
  });

  it('rechaza un slot dentro de un bloqueo', () => {
    const services = buildServices({
      bloqueos: [['b1', '2026-06-15', '2026-06-15', 'Feriado', 'ADM001', new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC001' }, USER_RECEPCION, services);
    expect(result).toEqual({ error: 'Slot no disponible' });
  });

  it('rechaza si el paciente no existe', () => {
    const services = buildServices({});
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'NOEXISTE' }, USER_RECEPCION, services);
    expect(result).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza si el codigo corresponde a un usuario que no es paciente', () => {
    const services = buildServices({
      usuarios: [['ADM002', 'h', 's', 'administrador', 'Otro Admin']],
    });
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'ADM002' }, USER_RECEPCION, services);
    expect(result).toEqual({ error: 'Paciente no encontrado' });
  });

  it('permite reservar un slot cuya cita previa fue Cancelada', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Cancelada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia'], ['PAC002', 'h', 's', 'usuario', 'J. Lopez']],
    });
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC002' }, USER_RECEPCION, services);
    expect(result.ok).toBe(true);
  });
});

describe('cambiarEstadoCita', () => {
  it('marca una cita Programada como Completada', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
    });
    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Completada' }, services);
    expect(result).toEqual({ ok: true });

    const agenda = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(agenda.slots[0].estadoCita).toBe('Completada');
  });

  it('marca una cita Programada como Cancelada', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
    });
    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Cancelada' }, services);
    expect(result).toEqual({ ok: true });

    const agenda = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(agenda.slots[0].estado).toBe('disponible');
  });

  it('rechaza un estado invalido', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
    });
    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Pendiente' }, services);
    expect(result).toEqual({ error: 'Estado invalido' });
  });

  it('rechaza si la cita no existe', () => {
    const services = buildServices({});
    const result = cambiarEstadoCita({ citaId: 'no-existe', estado: 'Completada' }, services);
    expect(result).toEqual({ error: 'Cita no encontrada' });
  });

  it('rechaza si la cita no esta Programada', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Cancelada', 'ADM001', new Date(), new Date()]],
    });
    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Completada' }, services);
    expect(result).toEqual({ error: 'Solo se puede cambiar el estado de una cita Programada' });
  });
});
