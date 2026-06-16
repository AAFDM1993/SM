import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { generarHashSHA256, generarSalt } from '../src/hash.js';
import { handleGet, handlePost } from '../src/router.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];
const HORARIO_HEADER = ['diaSemana', 'activo', 'horaInicio', 'horaFin', 'duracionSlotMin'];
const BLOQUEOS_HEADER = ['id', 'fechaInicio', 'fechaFin', 'motivo', 'creadoPor', 'fechaCreacion'];
const CITAS_HEADER = ['id', 'fecha', 'horaInicio', 'horaFin', 'pacienteCodigo', 'estado', 'creadoPor', 'fechaCreacion', 'fechaActualizacion'];
const PACIENTES_HEADER = ['codigo', 'fechaNacimiento', 'sexo', 'telefono', 'email', 'contactoEmergenciaNombre', 'contactoEmergenciaTelefono', 'fechaAlta', 'creadoPor'];
const ANTECEDENTES_HEADER = ['codigo', 'antecedentesPersonales', 'antecedentesPsiquiatricos', 'antecedentesFamiliares', 'alergias', 'medicacionActual', 'fechaActualizacion', 'actualizadoPor'];
const NOTAS_HEADER = ['id', 'pacienteCodigo', 'fecha', 'motivoConsulta', 'notas', 'diagnostico', 'creadoPor', 'fechaCreacion'];
const PRESCRIPCIONES_HEADER = ['id', 'pacienteCodigo', 'medicamento', 'dosis', 'frecuencia', 'fechaInicio', 'fechaFin', 'creadoPor', 'fechaCreacion'];
const AES_KEY = '000102030405060708090a0b0c0d0e0f';

const HORARIO_LABORAL = [
  ['Lunes', true, '09:00', '18:00', 45],
  ['Martes', true, '09:00', '18:00', 45],
  ['Miercoles', true, '09:00', '18:00', 45],
  ['Jueves', true, '09:00', '18:00', 45],
  ['Viernes', true, '09:00', '18:00', 45],
  ['Sabado', false, '09:00', '13:00', 45],
  ['Domingo', false, '09:00', '13:00', 45],
];

function buildServicesWithUser({ codigo, password, rol, nombre, extraSheets = {} }) {
  const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER], ...extraSheets } });
  const salt = generarSalt(services);
  const passwordHash = generarHashSHA256(password + salt, services);
  services.SpreadsheetApp._sheets['_usuarios'].push([codigo, passwordHash, salt, rol, nombre]);
  return services;
}

function bodyOf(output) {
  return JSON.parse(output._text);
}

function loginToken(services, codigo, password) {
  const result = handlePost(
    { postData: { contents: JSON.stringify({ accion: 'login', codigo, password }) } },
    services
  );
  return bodyOf(result).token;
}

describe('handleGet', () => {
  it('responde ping con ok:true', () => {
    const services = createMockServices();
    const result = handleGet({ parameter: { accion: 'ping' } }, services);
    expect(bodyOf(result)).toEqual({ ok: true });
    expect(result._mimeType).toBe('application/json');
  });

  it('devuelve error para una accion no reconocida', () => {
    const services = createMockServices();
    const result = handleGet({ parameter: { accion: 'inexistente' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Accion no reconocida' });
  });

  it('listarUsuarios requiere rol administrador', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarUsuarios', token } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('listarUsuarios devuelve la lista de usuarios para un administrador', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarUsuarios', token } }, services);
    expect(bodyOf(result)).toEqual({ ok: true, usuarios: [{ codigo: 'ADM001', rol: 'administrador', nombre: 'Admin' }] });
  });

  it('leerAgenda requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerAgenda', token, fechaInicio: '2026-06-15', fechaFin: '2026-06-15' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('leerAgenda devuelve los slots de la semana para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _horario_config: [HORARIO_HEADER, ...HORARIO_LABORAL] },
    });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerAgenda', token, fechaInicio: '2026-06-15', fechaFin: '2026-06-15' } }, services);
    const body = bodyOf(result);
    expect(body.ok).toBe(true);
    expect(body.slots).toHaveLength(12);
    expect(body.horarioConfig).toHaveLength(7);
  });

  it('leerMiAgenda requiere rol usuario', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerMiAgenda', token } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('leerMiAgenda devuelve las citas propias del paciente', () => {
    const services = buildServicesWithUser({
      codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente',
      extraSheets: {
        _citas: [CITAS_HEADER, ['c1', '2099-01-01', '09:00', '09:45', 'USR001', 'Programada', 'ADM001', new Date(), new Date()]],
      },
    });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerMiAgenda', token } }, services);
    const body = bodyOf(result);
    expect(body.ok).toBe(true);
    expect(body.proximas).toEqual([{ id: 'c1', fecha: '2099-01-01', horaInicio: '09:00', horaFin: '09:45', estado: 'Programada' }]);
    expect(body.historial).toEqual([]);
  });

  it('leerHorarioConfig requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerHorarioConfig', token } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('leerHorarioConfig devuelve el horario configurado para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _horario_config: [HORARIO_HEADER, ...HORARIO_LABORAL] },
    });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerHorarioConfig', token } }, services);
    const body = bodyOf(result);
    expect(body.ok).toBe(true);
    expect(body.horario).toHaveLength(7);
  });

  it('leerBloqueos requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerBloqueos', token } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('leerBloqueos devuelve los bloqueos para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _bloqueos: [BLOQUEOS_HEADER, ['b1', '2026-07-01', '2026-07-15', 'Vacaciones', 'ADM001', new Date()]] },
    });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerBloqueos', token } }, services);
    expect(bodyOf(result)).toEqual({ ok: true, bloqueos: [{ id: 'b1', fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' }] });
  });

  it('listarPacientes requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarPacientes', token } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('listarPacientes devuelve los pacientes para recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    services.SpreadsheetApp._sheets['_usuarios'].push(['PAC001', 'hash', 'salt', 'usuario', 'Paciente Uno']);
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarPacientes', token } }, services);
    expect(bodyOf(result)).toEqual({ ok: true, pacientes: [{ codigo: 'PAC001', nombre: 'Paciente Uno' }] });
  });

  it('leerFichaPaciente requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerFichaPaciente', token, codigo: 'USR001' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('leerFichaPaciente devuelve la ficha del paciente para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _pacientes: [PACIENTES_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerFichaPaciente', token, codigo: '45678912' } }, services);
    expect(bodyOf(result)).toEqual({
      ok: true,
      paciente: {
        codigo: '45678912', nombre: 'Maria Lopez', fechaNacimiento: '', sexo: '',
        telefono: '', email: '', contactoEmergenciaNombre: '', contactoEmergenciaTelefono: '',
      },
    });
  });

  it('listarFichasPacientes requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarFichasPacientes', token } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('listarFichasPacientes devuelve la lista de fichas para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _pacientes: [PACIENTES_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarFichasPacientes', token } }, services);
    expect(bodyOf(result)).toEqual({ ok: true, pacientes: [{ codigo: '45678912', nombre: 'Maria Lopez', telefono: '', email: '' }] });
  });

  it('leerAntecedentes requiere rol psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin',
      extraSheets: { _antecedentes: [ANTECEDENTES_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerAntecedentes', token, codigo: '45678912' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('leerAntecedentes devuelve los antecedentes para psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'PSI001', password: 'secreta123', rol: 'psiquiatra', nombre: 'Dra. Petra',
      extraSheets: { _antecedentes: [ANTECEDENTES_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'PSI001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerAntecedentes', token, codigo: '45678912' } }, services);
    expect(bodyOf(result)).toEqual({
      ok: true,
      antecedentes: {
        codigo: '45678912', antecedentesPersonales: '', antecedentesPsiquiatricos: '',
        antecedentesFamiliares: '', alergias: '', medicacionActual: '', fechaActualizacion: '',
      },
    });
  });

  it('listarNotasEvolucion requiere rol psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin',
      extraSheets: { _notas_evolucion: [NOTAS_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarNotasEvolucion', token, codigo: '45678912' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('listarNotasEvolucion devuelve las notas para psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'PSI001', password: 'secreta123', rol: 'psiquiatra', nombre: 'Dra. Petra',
      extraSheets: { _notas_evolucion: [NOTAS_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'PSI001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarNotasEvolucion', token, codigo: '45678912' } }, services);
    expect(bodyOf(result)).toEqual({ ok: true, notas: [] });
  });

  it('listarPrescripciones requiere rol psiquiatra', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin', extraSheets: { _prescripciones: [PRESCRIPCIONES_HEADER] } });
    const token = loginToken(services, 'ADM001', 'secreta123');
    const result = handleGet({ parameter: { accion: 'listarPrescripciones', token, codigo: 'PAC001' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('listarPrescripciones devuelve prescripciones para psiquiatra', () => {
    const services = buildServicesWithUser({ codigo: 'PSI001', password: 'secreta123', rol: 'psiquiatra', nombre: 'Dra. Petra', extraSheets: { _prescripciones: [PRESCRIPCIONES_HEADER] } });
    const token = loginToken(services, 'PSI001', 'secreta123');
    services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_usuarios')
      .appendRow(['PAC001', 'x', 'x', 'usuario', 'Maria']);
    const result = handleGet({ parameter: { accion: 'listarPrescripciones', token, codigo: 'PAC001' } }, services);
    expect(bodyOf(result).ok).toBe(true);
    expect(bodyOf(result).prescripciones).toEqual([]);
  });
});

describe('handlePost', () => {
  it('login devuelve un token con credenciales correctas', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'login', codigo: 'ADM001', password: 'secreta123' }) } },
      services
    );
    expect(bodyOf(result).ok).toBe(true);
    expect(typeof bodyOf(result).token).toBe('string');
  });

  it('devuelve error JSON invalido si el body no es JSON', () => {
    const services = createMockServices();
    const result = handlePost({ postData: { contents: 'no-es-json' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'JSON invalido' });
  });

  it('devuelve error para una accion no reconocida', () => {
    const services = createMockServices();
    const result = handlePost({ postData: { contents: JSON.stringify({ accion: 'inexistente' }) } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Accion no reconocida' });
  });

  it('guardarUsuario requiere rol administrador', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      {
        postData: {
          contents: JSON.stringify({ accion: 'guardarUsuario', token, codigo: 'NUE001', rol: 'usuario', nombre: 'Nuevo', password: 'clave123' }),
        },
      },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('guardarUsuario crea un usuario nuevo para un administrador', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handlePost(
      {
        postData: {
          contents: JSON.stringify({ accion: 'guardarUsuario', token, codigo: 'NUE001', rol: 'usuario', nombre: 'Nuevo', password: 'clave123' }),
        },
      },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true, accion: 'creado' });
  });

  it('eliminarUsuario elimina un usuario para un administrador', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    services.SpreadsheetApp._sheets['_usuarios'].push(['NUE001', 'hash', 'salt', 'usuario', 'Nuevo']);
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'eliminarUsuario', token, codigo: 'NUE001' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });

  it('cambiarPassword esta disponible para cualquier rol autenticado', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'claveVieja', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'claveVieja');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'cambiarPassword', token, passwordActual: 'claveVieja', passwordNueva: 'claveNueva123' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });

  it('crearCita requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearCita', token, fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC001' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('crearCita crea una cita para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _horario_config: [HORARIO_HEADER, ...HORARIO_LABORAL], _citas: [CITAS_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['PAC001', 'hash', 'salt', 'usuario', 'Paciente Uno']);
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearCita', token, fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC001' }) } },
      services
    );
    const body = bodyOf(result);
    expect(body.ok).toBe(true);
    expect(body.cita).toMatchObject({ fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', pacienteCodigo: 'PAC001', pacienteNombre: 'Paciente Uno', estado: 'Programada' });
  });

  it('cambiarEstadoCita requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'cambiarEstadoCita', token, citaId: 'c1', estado: 'Completada' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('cambiarEstadoCita actualiza el estado para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _citas: [CITAS_HEADER, ['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]] },
    });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'cambiarEstadoCita', token, citaId: 'c1', estado: 'Completada' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });

  it('cancelarMiCita requiere rol usuario', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'cancelarMiCita', token, citaId: 'c1' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('cancelarMiCita cancela una cita propia para usuario', () => {
    const services = buildServicesWithUser({
      codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente',
      extraSheets: { _citas: [CITAS_HEADER, ['c1', '2026-06-15', '09:00', '09:45', 'USR001', 'Programada', 'ADM001', new Date(), new Date()]] },
    });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'cancelarMiCita', token, citaId: 'c1' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });

  it('actualizarHorarioConfig requiere rol administrador o psiquiatra', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'actualizarHorarioConfig', token, horario: [] }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('actualizarHorarioConfig guarda el horario para administrador', () => {
    const services = buildServicesWithUser({
      codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin',
      extraSheets: { _horario_config: [HORARIO_HEADER, ...HORARIO_LABORAL] },
    });
    const token = loginToken(services, 'ADM001', 'secreta123');

    const nuevoHorario = HORARIO_LABORAL.map(([diaSemana, activo, horaInicio, horaFin, duracionSlotMin]) => ({
      diaSemana, activo, horaInicio, horaFin, duracionSlotMin,
    }));

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'actualizarHorarioConfig', token, horario: nuevoHorario }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });

  it('crearBloqueo requiere rol administrador o psiquiatra', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearBloqueo', token, fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('crearBloqueo crea un bloqueo para administrador', () => {
    const services = buildServicesWithUser({
      codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin',
      extraSheets: { _bloqueos: [BLOQUEOS_HEADER] },
    });
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearBloqueo', token, fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' }) } },
      services
    );
    const body = bodyOf(result);
    expect(body.ok).toBe(true);
    expect(body.bloqueo).toMatchObject({ fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' });
  });

  it('eliminarBloqueo requiere rol administrador o psiquiatra', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'eliminarBloqueo', token, bloqueoId: 'b1' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('eliminarBloqueo elimina un bloqueo para administrador', () => {
    const services = buildServicesWithUser({
      codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin',
      extraSheets: { _bloqueos: [BLOQUEOS_HEADER, ['b1', '2026-07-01', '2026-07-15', 'Vacaciones', 'ADM001', new Date()]] },
    });
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'eliminarBloqueo', token, bloqueoId: 'b1' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });

  it('crearPaciente requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearPaciente', token, codigo: '45678912', nombre: 'Maria Lopez' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('crearPaciente crea un paciente nuevo para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _pacientes: [PACIENTES_HEADER] },
    });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearPaciente', token, codigo: '45678912', nombre: 'Maria Lopez' }) } },
      services
    );
    const body = bodyOf(result);
    expect(body.ok).toBe(true);
    expect(body.paciente).toMatchObject({ codigo: '45678912', nombre: 'Maria Lopez' });
  });

  it('actualizarPaciente requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'actualizarPaciente', token, codigo: 'USR001', nombre: 'Paciente' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('actualizarPaciente actualiza la ficha de un paciente para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _pacientes: [PACIENTES_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'actualizarPaciente', token, codigo: '45678912', nombre: 'Maria Lopez', telefono: '987654321' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });

  it('actualizarAntecedentes requiere rol psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin',
      extraSheets: { _antecedentes: [ANTECEDENTES_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'actualizarAntecedentes', token, codigo: '45678912' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('actualizarAntecedentes actualiza los antecedentes para psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'PSI001', password: 'secreta123', rol: 'psiquiatra', nombre: 'Dra. Petra',
      extraSheets: { _antecedentes: [ANTECEDENTES_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    services.PropertiesService.getScriptProperties().setProperty('AES_KEY', AES_KEY);
    const token = loginToken(services, 'PSI001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({
        accion: 'actualizarAntecedentes', token, codigo: '45678912',
        antecedentesPersonales: 'Hipertension', alergias: 'Penicilina',
      }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });

  it('crearNotaEvolucion requiere rol psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin',
      extraSheets: { _notas_evolucion: [NOTAS_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearNotaEvolucion', token, codigo: '45678912', fecha: '2026-06-15', notas: 'texto' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('crearNotaEvolucion crea una nota para psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'PSI001', password: 'secreta123', rol: 'psiquiatra', nombre: 'Dra. Petra',
      extraSheets: { _notas_evolucion: [NOTAS_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    services.PropertiesService.getScriptProperties().setProperty('AES_KEY', AES_KEY);
    const token = loginToken(services, 'PSI001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearNotaEvolucion', token, codigo: '45678912', fecha: '2026-06-15', notas: 'Paciente estable' }) } },
      services
    );
    const body = bodyOf(result);
    expect(body.ok).toBe(true);
    expect(body.nota).toMatchObject({ pacienteCodigo: '45678912', fecha: '2026-06-15', notas: 'Paciente estable' });
  });

  it('crearPrescripcion requiere rol psiquiatra', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin', extraSheets: { _prescripciones: [PRESCRIPCIONES_HEADER] } });
    const token = loginToken(services, 'ADM001', 'secreta123');
    const result = handlePost({ postData: { contents: JSON.stringify({ accion: 'crearPrescripcion', token, codigo: 'PAC001', medicamento: 'X', dosis: 'Y', frecuencia: 'Z', fechaInicio: '2026-06-01' }) } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('crearPrescripcion retorna error si faltan campos requeridos', () => {
    const services = buildServicesWithUser({ codigo: 'PSI001', password: 'secreta123', rol: 'psiquiatra', nombre: 'Dra. Petra', extraSheets: { _prescripciones: [PRESCRIPCIONES_HEADER] } });
    const token = loginToken(services, 'PSI001', 'secreta123');
    const result = handlePost({ postData: { contents: JSON.stringify({ accion: 'crearPrescripcion', token, codigo: 'PAC001', medicamento: '', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }) } }, services);
    expect(bodyOf(result)).toEqual({ error: 'codigo, medicamento, dosis, frecuencia y fechaInicio son requeridos' });
  });

  it('crearPrescripcion crea prescripcion para psiquiatra', () => {
    const services = buildServicesWithUser({ codigo: 'PSI001', password: 'secreta123', rol: 'psiquiatra', nombre: 'Dra. Petra', extraSheets: { _prescripciones: [PRESCRIPCIONES_HEADER] } });
    services.PropertiesService.getScriptProperties().setProperty('AES_KEY', AES_KEY);
    const token = loginToken(services, 'PSI001', 'secreta123');
    services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_usuarios')
      .appendRow(['PAC001', 'x', 'x', 'usuario', 'Maria']);
    const result = handlePost({ postData: { contents: JSON.stringify({ accion: 'crearPrescripcion', token, codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }) } }, services);
    expect(bodyOf(result).ok).toBe(true);
    expect(bodyOf(result).prescripcion.medicamento).toBe('Sertralina');
  });

  it('crearPrescripcion retorna error si paciente no encontrado', () => {
    const services = buildServicesWithUser({ codigo: 'PSI001', password: 'secreta123', rol: 'psiquiatra', nombre: 'Dra. Petra', extraSheets: { _prescripciones: [PRESCRIPCIONES_HEADER] } });
    services.PropertiesService.getScriptProperties().setProperty('AES_KEY', AES_KEY);
    const token = loginToken(services, 'PSI001', 'secreta123');
    const result = handlePost({ postData: { contents: JSON.stringify({ accion: 'crearPrescripcion', token, codigo: 'NOEXISTE', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }) } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Paciente no encontrado' });
  });
});
