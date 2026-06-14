import { json_ } from './http.js';
import { login } from './auth.js';
import { listarUsuarios, guardarUsuario, eliminarUsuario, listarPacientes } from './usuarios.js';
import { requireAuth, requireAuthBody, cambiarPassword } from './guards.js';
import { leerAgenda, crearCita, cambiarEstadoCita, leerMiAgenda, cancelarMiCita } from './agenda.js';
import { leerHorarioConfig, leerBloqueos, actualizarHorarioConfig, crearBloqueo, eliminarBloqueo } from './horario.js';

const ROLES_AGENDA = ['administrador', 'psiquiatra', 'recepcion'];
const ROLES_HORARIO = ['administrador', 'psiquiatra'];

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
        requireAuthBody(b.token, ROLES_HORARIO, () => actualizarHorarioConfig(b, services), services),
        services
      );

    case 'crearBloqueo':
      return json_(
        requireAuthBody(b.token, ROLES_HORARIO, (user) => crearBloqueo(b, user, services), services),
        services
      );

    case 'eliminarBloqueo':
      return json_(
        requireAuthBody(b.token, ROLES_HORARIO, () => eliminarBloqueo(b, services), services),
        services
      );

    default:
      return json_({ error: 'Accion no reconocida' }, services);
  }
}
