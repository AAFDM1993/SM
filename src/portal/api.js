import { API_URL } from '../shared/config.js';

export async function apiGet(accion, params = {}) {
  const query = new URLSearchParams({ accion, ...params }).toString();
  try {
    const res = await fetch(`${API_URL}?${query}`);
    return await res.json();
  } catch {
    return { error: 'Error de conexión. Intenta nuevamente.' };
  }
}

export async function apiPost(body) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      // text/plain evita el preflight CORS que Google Apps Script no maneja
      // correctamente para Web Apps; el body sigue siendo JSON y el backend
      // lo parsea igual via e.postData.contents.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return { error: 'Error de conexión. Intenta nuevamente.' };
  }
}
