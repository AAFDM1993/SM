import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { leerHorarioConfig, leerBloqueos, actualizarHorarioConfig, crearBloqueo, eliminarBloqueo } from '../src/horario.js';

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

function buildServices({ horario = [], bloqueos = [], citas = [], usuarios = [] } = {}) {
  return createMockServices({
    sheets: {
      _horario_config: [HORARIO_HEADER, ...horario],
      _bloqueos: [BLOQUEOS_HEADER, ...bloqueos],
      _citas: [CITAS_HEADER, ...citas],
      _usuarios: [USUARIOS_HEADER, ...usuarios],
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

describe('actualizarHorarioConfig', () => {
  function horarioValido() {
    return HORARIO_LABORAL.map(([diaSemana, activo, horaInicio, horaFin, duracionSlotMin]) => ({
      diaSemana, activo, horaInicio, horaFin, duracionSlotMin,
    }));
  }

  it('guarda las 7 filas y leerHorarioConfig las refleja', () => {
    const services = buildServices({ horario: HORARIO_LABORAL });
    const horario = horarioValido();
    horario[0] = { ...horario[0], horaInicio: '10:00' };

    expect(actualizarHorarioConfig({ horario }, services)).toEqual({ ok: true });
    expect(leerHorarioConfig(services).horario[0]).toEqual({
      diaSemana: 'Lunes', activo: true, horaInicio: '10:00', horaFin: '18:00', duracionSlotMin: 45,
    });
  });

  it('rechaza si no se envian las 7 filas', () => {
    const services = buildServices({ horario: HORARIO_LABORAL });
    const horario = horarioValido().slice(0, 6);
    expect(actualizarHorarioConfig({ horario }, services)).toEqual({ error: 'Se requieren las 7 filas de horario' });
  });

  it('rechaza si horaInicio >= horaFin en un dia activo', () => {
    const services = buildServices({ horario: HORARIO_LABORAL });
    const horario = horarioValido();
    horario[0] = { ...horario[0], horaInicio: '18:00', horaFin: '09:00' };
    expect(actualizarHorarioConfig({ horario }, services)).toEqual({ error: 'horaInicio debe ser menor que horaFin (Lunes)' });
  });

  it('rechaza si duracionSlotMin no es mayor que 0 en un dia activo', () => {
    const services = buildServices({ horario: HORARIO_LABORAL });
    const horario = horarioValido();
    horario[1] = { ...horario[1], duracionSlotMin: 0 };
    expect(actualizarHorarioConfig({ horario }, services)).toEqual({ error: 'duracionSlotMin debe ser mayor que 0 (Martes)' });
  });

  it('no valida horas ni duracion de un dia inactivo', () => {
    const services = buildServices({ horario: HORARIO_LABORAL });
    const horario = horarioValido();
    horario[5] = { ...horario[5], horaInicio: '18:00', horaFin: '09:00', duracionSlotMin: 0 };
    expect(actualizarHorarioConfig({ horario }, services)).toEqual({ ok: true });
  });
});

const ADMIN = { codigo: 'ADM001', rol: 'administrador' };

describe('crearBloqueo', () => {
  it('crea un bloqueo cuando no hay citas afectadas', () => {
    const services = buildServices({});
    const result = crearBloqueo({ fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' }, ADMIN, services);
    expect(result.ok).toBe(true);
    expect(result.bloqueo).toMatchObject({ fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' });
    expect(typeof result.bloqueo.id).toBe('string');
    expect(leerBloqueos(services).bloqueos).toHaveLength(1);
  });

  it('rechaza si fechaInicio es posterior a fechaFin', () => {
    const services = buildServices({});
    const result = crearBloqueo({ fechaInicio: '2026-07-15', fechaFin: '2026-07-01', motivo: '' }, ADMIN, services);
    expect(result).toEqual({ error: 'fechaInicio debe ser anterior o igual a fechaFin' });
  });

  it('pide confirmacion si hay citas Programada en el rango', () => {
    const services = buildServices({
      citas: [['c1', '2026-07-05', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = crearBloqueo({ fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' }, ADMIN, services);
    expect(result).toEqual({
      ok: false,
      requiereConfirmacion: true,
      citasAfectadas: [{ id: 'c1', fecha: '2026-07-05', horaInicio: '09:00', pacienteNombre: 'M. Garcia' }],
    });
    expect(leerBloqueos(services).bloqueos).toHaveLength(0);
  });

  it('crea el bloqueo si confirmar:true aunque haya citas afectadas', () => {
    const services = buildServices({
      citas: [['c1', '2026-07-05', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = crearBloqueo({ fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones', confirmar: true }, ADMIN, services);
    expect(result.ok).toBe(true);
    expect(leerBloqueos(services).bloqueos).toHaveLength(1);
  });

  it('ignora citas Canceladas al calcular citasAfectadas', () => {
    const services = buildServices({
      citas: [['c1', '2026-07-05', '09:00', '09:45', 'PAC001', 'Cancelada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = crearBloqueo({ fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' }, ADMIN, services);
    expect(result.ok).toBe(true);
  });
});

describe('eliminarBloqueo', () => {
  it('elimina un bloqueo existente', () => {
    const services = buildServices({
      bloqueos: [['b1', '2026-07-01', '2026-07-15', 'Vacaciones', 'ADM001', new Date()]],
    });
    expect(eliminarBloqueo({ bloqueoId: 'b1' }, services)).toEqual({ ok: true });
    expect(leerBloqueos(services).bloqueos).toHaveLength(0);
  });

  it('devuelve error si el bloqueo no existe', () => {
    const services = buildServices({});
    expect(eliminarBloqueo({ bloqueoId: 'inexistente' }, services)).toEqual({ error: 'Bloqueo no encontrado' });
  });
});
