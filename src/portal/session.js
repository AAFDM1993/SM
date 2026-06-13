const KEY = 'smpdjm_session';
const AUTH_ERROR_TYPES = ['No autorizado', 'Permiso denegado'];

export function getSession() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

export function isAuthenticated() {
  return getSession() !== null;
}

// true si la respuesta de la API indica sesion invalida/expirada
export function isAuthError(response) {
  return AUTH_ERROR_TYPES.includes(response?.error);
}

// limpia la sesion y redirige al login si la respuesta indica error de autorizacion
export function handleAuthError(response) {
  if (isAuthError(response)) {
    clearSession();
    redirectTo('/portal/?expired=1');
    return true;
  }
  return false;
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function redirectTo(path) {
  window.location.href = path;
}
