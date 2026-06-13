// backend/src/auth.js
import { generarHashSHA256 } from './hash.js';
import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const TOKEN_DURATION_MS = 8 * 60 * 60 * 1000; // 8 horas
const MAX_INTENTOS = 5;
const BLOQUEO_SEGUNDOS = 15 * 60; // 15 minutos

function throttleKey(codigo) {
  return 'login_fail_' + String(codigo).toLowerCase();
}

function estaBloqueado(codigo, services) {
  const cache = services.CacheService.getScriptCache();
  const value = cache.get(throttleKey(codigo));
  return value !== null && Number(value) >= MAX_INTENTOS;
}

function registrarIntentoFallido(codigo, services) {
  const cache = services.CacheService.getScriptCache();
  const key = throttleKey(codigo);
  const actual = Number(cache.get(key) || '0');
  cache.put(key, String(actual + 1), BLOQUEO_SEGUNDOS);
}

function limpiarIntentosFallidos(codigo, services) {
  services.CacheService.getScriptCache().remove(throttleKey(codigo));
}

export function login(codigo, password, services) {
  if (!codigo || !password) return { error: 'Codigo y contrasena requeridos' };

  if (estaBloqueado(codigo, services)) {
    registrarLog(services, codigo, '-', 'login_bloqueado', 'Demasiados intentos fallidos');
    return { error: 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.' };
  }

  const user = findUser(codigo, services);
  if (!user) {
    registrarIntentoFallido(codigo, services);
    registrarLog(services, codigo, '-', 'login_fallido', 'Usuario no encontrado');
    return { error: 'Usuario o contraseña incorrectos' };
  }

  const hashIngresado = generarHashSHA256(String(password) + user.salt, services);
  if (String(user.password) !== hashIngresado) {
    registrarIntentoFallido(user.codigo, services);
    registrarLog(services, user.codigo, user.rol, 'login_fallido', 'Contraseña incorrecta');
    return { error: 'Usuario o contraseña incorrectos' };
  }

  limpiarIntentosFallidos(user.codigo, services);

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
