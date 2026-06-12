import { generarHashSHA256 } from './hash.js';
import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const TOKEN_DURATION_MS = 8 * 60 * 60 * 1000; // 8 horas

export function login(codigo, password, services) {
  if (!codigo || !password) return { error: 'Codigo y contrasena requeridos' };

  const user = findUser(codigo, services);
  if (!user) {
    registrarLog(services, codigo, '-', 'login_fallido', 'Usuario no encontrado');
    return { error: 'Usuario o contraseña incorrectos' };
  }

  const hashIngresado = generarHashSHA256(String(password) + user.salt, services);
  if (String(user.password) !== hashIngresado) {
    registrarLog(services, user.codigo, user.rol, 'login_fallido', 'Contraseña incorrecta');
    return { error: 'Usuario o contraseña incorrectos' };
  }

  const expiresAt = Date.now() + TOKEN_DURATION_MS;
  const token = services.Utilities.base64Encode(`${user.codigo}:${user.rol}:${user.password}:${expiresAt}`);

  const result = { ok: true, token, rol: user.rol, nombre: user.nombre, codigo: user.codigo };
  if (user.rol === 'usuario' && String(password) === user.codigo) {
    result.debeCambiarPassword = true;
  }

  registrarLog(services, user.codigo, user.rol, 'login_exitoso', '');
  return result;
}

export function verifyToken(token, services) {
  if (!token) return null;
  try {
    const bytes = services.Utilities.base64Decode(token);
    const decoded = services.Utilities.newBlob(bytes).getDataAsString();
    const parts = decoded.split(':');
    if (parts.length < 4) return null;

    const [codigo, , passwordHash, expiresAtStr] = parts;
    const expiresAt = Number(expiresAtStr);
    if (!expiresAt || Date.now() > expiresAt) return null;

    const user = findUser(codigo, services);
    if (!user) return null;
    if (String(user.password) !== String(passwordHash)) return null;
    return user;
  } catch (e) {
    return null;
  }
}
