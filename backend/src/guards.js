import { verifyToken } from './auth.js';
import { generarHashSHA256 } from './hash.js';
import { guardarUsuario } from './usuarios.js';
import { registrarLog } from './log.js';

const PASSWORD_MIN_LENGTH = 6;

export function requireAuth(p, roles, fn, services) {
  const user = verifyToken(p && p.token, services);
  if (!user) return { error: 'No autorizado' };
  if (roles.length > 0 && roles.indexOf(user.rol) === -1) return { error: 'Permiso denegado' };
  return fn(user);
}

export function requireAuthBody(token, roles, fn, services) {
  const user = verifyToken(token, services);
  if (!user) return { error: 'No autorizado' };
  if (roles.length > 0 && roles.indexOf(user.rol) === -1) return { error: 'Permiso denegado' };
  return fn(user);
}

export function cambiarPassword(b, usuarioAutenticado, services) {
  const passwordActual = b && b.passwordActual;
  const passwordNueva = b && b.passwordNueva;

  if (!passwordActual || !passwordNueva) {
    return { error: 'Contrasena actual y nueva son requeridas' };
  }
  if (String(passwordNueva).length < PASSWORD_MIN_LENGTH) {
    return { error: `La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres` };
  }

  const hashActual = generarHashSHA256(String(passwordActual) + usuarioAutenticado.salt, services);
  if (String(usuarioAutenticado.password) !== hashActual) {
    return { error: 'La contraseña actual es incorrecta' };
  }

  guardarUsuario(
    {
      codigo: usuarioAutenticado.codigo,
      rol: usuarioAutenticado.rol,
      nombre: usuarioAutenticado.nombre,
      password: passwordNueva,
    },
    services
  );

  registrarLog(services, usuarioAutenticado.codigo, usuarioAutenticado.rol, 'cambio_password', '');
  return { ok: true };
}
