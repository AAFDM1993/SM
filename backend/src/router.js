import { json_ } from './http.js';
import { login } from './auth.js';
import { listarUsuarios, guardarUsuario, eliminarUsuario } from './usuarios.js';
import { requireAuth, requireAuthBody, cambiarPassword } from './guards.js';

export function handleGet(e, services) {
  const p = (e && e.parameter) || {};

  switch (p.accion) {
    case 'ping':
      return json_({ ok: true }, services);

    case 'listarUsuarios':
      return json_(requireAuth(p, ['administrador'], () => listarUsuarios(services), services), services);

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

    default:
      return json_({ error: 'Accion no reconocida' }, services);
  }
}
