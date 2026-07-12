import { json_ } from './http.js';
import { login } from './auth.js';
import { listarUsuarios, guardarUsuario, eliminarUsuario, listarPacientes } from './usuarios.js';
import { requireAuth, requireAuthBody, cambiarPassword } from './guards.js';
import { leerAgenda, crearCita, cambiarEstadoCita, leerMiAgenda, cancelarMiCita } from './agenda.js';
import { leerHorarioConfig, leerBloqueos, actualizarHorarioConfig, crearBloqueo, eliminarBloqueo } from './horario.js';
import { crearPaciente, actualizarPaciente, leerFichaPaciente, listarFichasPacientes } from './pacientes.js';
import { leerAntecedentes, actualizarAntecedentes, crearNotaEvolucion, listarNotasEvolucion } from './historia-clinica.js';
import { crearPrescripcion, listarPrescripciones } from './prescripciones.js';
import { aplicarEscala, asignarEscala, completarEscala, listarEscalasPaciente, listarMisEscalas } from './escalas.js';
import { asignarTarea, listarTareasPaciente, listarMisActividades, completarOcurrencia } from './tareas.js';

const ROLES_AGENDA = ['administrador', 'psiquiatra', 'recepcion'];
const ROLES_HORARIO = ['administrador', 'psiquiatra'];
const ROLES_PACIENTES = ['administrador', 'psiquiatra', 'recepcion'];
const ROLES_HISTORIA_CLINICA = ['psiquiatra'];
const ROLES_PRESCRIPCIONES = ['psiquiatra'];
const ROLES_ESCALAS = ['psiquiatra'];
const ROLES_TAREAS = ['psiquiatra'];

export function handleGet(e, services) {
  const p = (e && e.parameter) || {};

  switch (p.accion) {
    case 'ping':
      return json_({ ok: true }, services);

    case 'listarUsuarios':
      return json_(requireAuth(p, ['administrador'], () => listarUsuarios(services), services), services);

    case 'leerAgenda':
      return json_(
        requireAuth(p, ROLES_AGENDA, () => leerAgenda(p.fechaInicio, p.fechaFin, services), services),
        services
      );

    case 'leerMiAgenda':
      return json_(
        requireAuth(p, ['usuario'], (user) => leerMiAgenda(user, services), services),
        services
      );

    case 'leerHorarioConfig':
      return json_(requireAuth(p, ROLES_AGENDA, () => leerHorarioConfig(services), services), services);

    case 'leerBloqueos':
      return json_(requireAuth(p, ROLES_AGENDA, () => leerBloqueos(services), services), services);

    case 'listarPacientes':
      return json_(requireAuth(p, ROLES_AGENDA, () => listarPacientes(services), services), services);

    case 'leerFichaPaciente':
      return json_(
        requireAuth(p, ROLES_PACIENTES, () => leerFichaPaciente(p.codigo, services), services),
        services
      );

    case 'listarFichasPacientes':
      return json_(requireAuth(p, ROLES_PACIENTES, () => listarFichasPacientes(services), services), services);

    case 'leerAntecedentes':
      return json_(
        requireAuth(p, ROLES_HISTORIA_CLINICA, () => leerAntecedentes(p.codigo, services), services),
        services
      );

    case 'listarNotasEvolucion':
      return json_(
        requireAuth(p, ROLES_HISTORIA_CLINICA, () => listarNotasEvolucion(p.codigo, services), services),
        services
      );

    case 'listarPrescripciones':
      return json_(
        requireAuth(p, ROLES_PRESCRIPCIONES, () => listarPrescripciones(p.codigo, services), services),
        services
      );

    case 'listarEscalasPaciente':
      return json_(
        requireAuth(p, ROLES_ESCALAS, () => listarEscalasPaciente(p.codigo, services), services),
        services
      );

    case 'listarMisEscalas':
      return json_(
        requireAuth(p, ['usuario'], (user) => listarMisEscalas(user, services), services),
        services
      );

    case 'listarTareasPaciente':
      return json_(
        requireAuth(p, ROLES_TAREAS, () => listarTareasPaciente(p.codigo, services), services),
        services
      );

    case 'listarMisActividades':
      return json_(
        requireAuth(p, ['usuario'], (user) => listarMisActividades(user, services), services),
        services
      );

    default:
      return json_({ error: 'Accion no reconocida' }, services);
  }
}

export function handlePost(e, services) {
  let b = {};
  try {
    b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ error: 'JSON invalido' }, services);
  }

  switch (b.accion) {
    case 'login':
      return json_(login(b.codigo, b.password, services), services);

    case 'guardarUsuario':
      return json_(
        requireAuthBody(b.token, ['administrador'], () => guardarUsuario(b, services), services),
        services
      );

    case 'eliminarUsuario':
      return json_(
        requireAuthBody(b.token, ['administrador'], () => eliminarUsuario(b.codigo, services), services),
        services
      );

    case 'cambiarPassword':
      return json_(
        requireAuthBody(b.token, [], (user) => cambiarPassword(b, user, services), services),
        services
      );

    case 'crearCita':
      return json_(
        requireAuthBody(b.token, ROLES_AGENDA, (user) => crearCita(b, user, services), services),
        services
      );

    case 'cambiarEstadoCita':
      return json_(
        requireAuthBody(b.token, ROLES_AGENDA, (user) => cambiarEstadoCita(b, user, services), services),
        services
      );

    case 'cancelarMiCita':
      return json_(
        requireAuthBody(b.token, ['usuario'], (user) => cancelarMiCita(b, user, services), services),
        services
      );

    case 'actualizarHorarioConfig':
      return json_(
        requireAuthBody(b.token, ROLES_HORARIO, (user) => actualizarHorarioConfig(b, user, services), services),
        services
      );

    case 'crearBloqueo':
      return json_(
        requireAuthBody(b.token, ROLES_HORARIO, (user) => crearBloqueo(b, user, services), services),
        services
      );

    case 'eliminarBloqueo':
      return json_(
        requireAuthBody(b.token, ROLES_HORARIO, (user) => eliminarBloqueo(b, user, services), services),
        services
      );

    case 'crearPaciente':
      return json_(
        requireAuthBody(b.token, ROLES_PACIENTES, (user) => crearPaciente(b, user, services), services),
        services
      );

    case 'actualizarPaciente':
      return json_(
        requireAuthBody(b.token, ROLES_PACIENTES, (user) => actualizarPaciente(b, user, services), services),
        services
      );

    case 'actualizarAntecedentes':
      return json_(
        requireAuthBody(b.token, ROLES_HISTORIA_CLINICA, (user) => actualizarAntecedentes(b, user, services), services),
        services
      );

    case 'crearNotaEvolucion':
      return json_(
        requireAuthBody(b.token, ROLES_HISTORIA_CLINICA, (user) => crearNotaEvolucion(b, user, services), services),
        services
      );

    case 'crearPrescripcion':
      return json_(
        requireAuthBody(b.token, ROLES_PRESCRIPCIONES, (user) => crearPrescripcion(b, user, services), services),
        services
      );

    case 'aplicarEscala':
      return json_(
        requireAuthBody(b.token, ROLES_ESCALAS, (user) => aplicarEscala(b, user, services), services),
        services
      );

    case 'asignarEscala':
      return json_(
        requireAuthBody(b.token, ROLES_ESCALAS, (user) => asignarEscala(b, user, services), services),
        services
      );

    case 'completarEscala':
      return json_(
        requireAuthBody(b.token, ['usuario'], (user) => completarEscala(b, user, services), services),
        services
      );

    case 'asignarTarea':
      return json_(
        requireAuthBody(b.token, ROLES_TAREAS, (user) => asignarTarea(b, user, services), services),
        services
      );

    case 'completarOcurrencia':
      return json_(
        requireAuthBody(b.token, ['usuario'], (user) => completarOcurrencia(b, user, services), services),
        services
      );

    default:
      return json_({ error: 'Accion no reconocida' }, services);
  }
}
