# Plan 3: Portal Frontend — Diseño técnico

> Este documento complementa la sección **"Portal interno (`src/portal/`)"** de
> `docs/superpowers/specs/2026-06-12-fase-0-base-sistema-design.md` (líneas 150-184),
> que define los requisitos de UX (pantallas, flujos, tabla de menús por rol).
> Aquí se define la **arquitectura técnica de implementación**: estructura de
> archivos, manejo de sesión, contrato con el backend, y estrategia de testing.
>
> El alcance de Plan 3 es exactamente el de esa sección del spec, sin cambios:
> login + dashboard shell por rol con ítems ✅/🔜 + gestión de usuarios (admin)
> + cambiar contraseña (con flujo forzado para `usuario` en primer login).

---

## Backend disponible (Plan 2, ya implementado)

Plan 3 es **solo frontend** — no modifica `backend/`. Resumen del contrato HTTP
expuesto por `backend/src/router.js`:

### `doGet` (query params)

| `accion` | Params | Respuesta éxito | Respuesta error |
|---|---|---|---|
| `ping` | — | `{ok:true}` | — |
| `listarUsuarios` | `token` (rol `administrador`) | `{ok:true, usuarios:[{codigo,rol,nombre}]}` | `{error:'Permiso denegado'}` / `{error:'No autorizado'}` |

### `doPost` (body JSON con campo `accion`)

| `accion` | Body | Respuesta éxito | Respuesta error |
|---|---|---|---|
| `login` | `{codigo, password}` | `{ok:true, token, rol, nombre, codigo, debeCambiarPassword?:true}` | `{error:'Usuario o contraseña incorrectos'}` / `{error:'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.'}` / `{error:'Codigo y contrasena requeridos'}` |
| `guardarUsuario` | `{token, codigo, rol, nombre, password?}` (rol `administrador`) | `{ok:true, accion:'creado'\|'actualizado'}` | `{error:'Permiso denegado'}` / `{error:'No autorizado'}` |
| `eliminarUsuario` | `{token, codigo}` (rol `administrador`) | `{ok:true}` | `{error:'No encontrado'}` |
| `cambiarPassword` | `{token, passwordActual, passwordNueva}` | `{ok:true}` | mensajes de validación / `{error:'No autorizado'}` |

Notas importantes para el frontend:

- **El token tiene validez de 8h** y se invalida inmediatamente si la
  contraseña cambia (el hash embebido en el token deja de coincidir). Esto es
  intencional (Plan 2) — el frontend debe asumir que **tras un cambio de
  contraseña exitoso, el token actual queda inválido**.
- No existe un endpoint genérico de "verificar sesión" para roles no-admin.
  La validación de sesión en el frontend es **perezosa** (ver sección
  "Sesión y autenticación").
- `PASSWORD_MIN_LENGTH = 6` (definido en `backend/src/guards.js`) — el
  frontend debe replicar esta validación en el formulario de cambio de
  contraseña.

---

## Estructura de archivos

```
portal/
  index.html           # Pantalla de login
  dashboard.html        # Shell del dashboard (post-login)

src/portal/
  login.js              # Entry de portal/index.html
  dashboard.js          # Entry de portal/dashboard.html: shell, nav por rol, registro de vistas
  session.js            # getSession/setSession/clearSession/isAuthenticated +
                        # handleAuthError/redirectTo/getQueryParam (localStorage)
  api.js                # apiGet(accion, params) / apiPost(body)
  nav.js                # Toggle de menú colapsable (adaptado de src/landing/nav.js)
  login.css
  dashboard.css
  views/
    inicio.js           # Vista de bienvenida (vista inicial por defecto)
    usuarios.js         # ✅ Gestión de usuarios (solo administrador)
    cambiar-password.js # ✅ Cambiar contraseña

src/shared/
  config.js             # export const API_URL = 'PENDIENTE_DESPLEGAR'

tests/portal/
  session.test.js
  api.test.js
  nav.test.js
  login.test.js
  dashboard.test.js
  views/
    usuarios.test.js
    cambiar-password.test.js
```

---

## Configuración de la API (`src/shared/config.js`)

```js
export const API_URL = 'PENDIENTE_DESPLEGAR';
```

Placeholder editable manualmente cuando se despliegue el Web App de GAS
(`backend/dist/gas-smpdjm.txt`). No se usan variables de entorno.

### `src/portal/api.js`

```js
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
      // text/plain evita el preflight CORS que Google Apps Script
      // no maneja correctamente para Web Apps; el body sigue siendo JSON
      // y el backend lo parsea igual via e.postData.contents.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return { error: 'Error de conexión. Intenta nuevamente.' };
  }
}
```

---

## Sesión y autenticación

### `src/portal/session.js`

Guarda la sesión en `localStorage` bajo la clave `smpdjm_session`:

```js
const KEY = 'smpdjm_session';

export function getSession() {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
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

// true si la respuesta de la API indica sesión inválida/expirada
export function isAuthError(response) {
  return response?.error === 'No autorizado' || response?.error === 'Permiso denegado';
}

// limpia la sesión y redirige al login si la respuesta indica error de autorización
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
```

`data` tiene la forma `{token, codigo, rol, nombre, debeCambiarPassword}`
(`debeCambiarPassword` es `true` solo si el login lo indicó y aún no se ha
completado el cambio de contraseña).

### Flujo de login (`portal/index.html` + `src/portal/login.js`)

1. Si `isAuthenticated()` es `true` al cargar la página, redirigir directo a
   `dashboard.html` (evita mostrar login a quien ya tiene sesión;
   `dashboard.js` se encarga de forzar el cambio de contraseña si
   corresponde — ver siguiente sección).
2. Formulario: código + contraseña. Validación cliente: ambos campos no
   vacíos ("Código y contraseña son requeridos").
3. Submit → `apiPost({accion:'login', codigo, password})`.
4. Si `ok`:
   - `setSession({token, codigo, rol, nombre, debeCambiarPassword:
     !!debeCambiarPassword})`.
   - Redirigir a `dashboard.html` (siempre el mismo destino;
     `debeCambiarPassword` ya quedó guardado en la sesión).
5. Si `error` → mostrar el mensaje devuelto por el backend tal cual (cubre
   credenciales incorrectas y bloqueo por intentos fallidos, incluyendo el
   texto de los 15 minutos de espera).
6. Si `getQueryParam('expired') === '1'` → mostrar banner "Tu sesión expiró,
   inicia sesión nuevamente."
7. Si `getQueryParam('passwordChanged') === '1'` → mostrar banner
   "Contraseña actualizada. Inicia sesión con tu nueva contraseña."

### Validación perezosa de sesión

`dashboard.html` no valida el token contra el backend al cargar — solo
verifica que `isAuthenticated()` sea `true` (si no, redirige a `/portal/`).

Cualquier llamada a `apiGet`/`apiPost` que devuelva
`{error:'No autorizado'}` o `{error:'Permiso denegado'}` debe interpretarse
como sesión inválida/expirada: las vistas, al recibir esa respuesta, llaman
`clearSession()` y redirigen a `/portal/?expired=1`. Esta lógica se centraliza
en un helper `handleAuthError(response)` exportado desde `session.js`, usado
por cada vista tras cada llamada a la API.

### Cerrar sesión

Botón en el header → `clearSession()` + redirección a `/portal/`.

---

## Dashboard shell y navegación por rol (`portal/dashboard.html` + `src/portal/dashboard.js`)

### Estructura visual (según spec base)

- **Header** (navy): logo reducido + `nombre` + `rol` + botón "Cerrar sesión".
- **Menú de navegación**: lateral en desktop/tablet, colapsable en móvil.
- **Área de contenido principal** (`<main>`).

### Configuración de menús por rol

```js
const MENUS = {
  administrador: [
    { id: 'usuarios', label: 'Gestión de usuarios', enabled: true },
    { id: 'agenda', label: 'Agenda', enabled: false },
    { id: 'historia-clinica', label: 'Historia Clínica', enabled: false },
    { id: 'prescripciones', label: 'Prescripciones', enabled: false },
    { id: 'escalas', label: 'Escalas', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
  psiquiatra: [
    { id: 'agenda', label: 'Agenda', enabled: false },
    { id: 'historia-clinica', label: 'Historia Clínica', enabled: false },
    { id: 'prescripciones', label: 'Prescripciones', enabled: false },
    { id: 'escalas', label: 'Escalas', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
  recepcion: [
    { id: 'agenda', label: 'Agenda', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
  usuario: [
    { id: 'mi-agenda', label: 'Mi agenda', enabled: false },
    { id: 'mis-escalas', label: 'Mis escalas', enabled: false },
    { id: 'mis-actividades', label: 'Mis actividades', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
};

const VIEWS = {
  inicio: initInicioView,
  usuarios: initUsuariosView,
  'cambiar-password': initCambiarPasswordView,
};
```

- Ítems con `enabled: false` se renderizan deshabilitados con etiqueta
  "Próximamente" (no llaman a ninguna vista).
- Ítems con `enabled: true` son botones/enlaces que disparan el cambio de
  vista.

### Inicialización (`dashboard.js`)

1. Si `!isAuthenticated()` → redirigir a `/portal/`.
2. Leer sesión (`{token, codigo, rol, nombre, debeCambiarPassword}`) y
   renderizar header.
3. Renderizar menú según `MENUS[rol]`.
4. Determinar vista inicial:
   - Si `session.debeCambiarPassword === true` → vista `cambiar-password`
     en **modo forzado** (`forced: true`): se ocultan/deshabilitan todos los
     demás ítems del menú y no hay opción de cancelar, hasta que el cambio
     sea exitoso.
   - En otro caso → vista `inicio`.
5. Click en ítem habilitado → limpiar `<main>`, llamar
   `VIEWS[id](main, ctx)`. En modo forzado, los ítems deshabilitados no
   disparan navegación.

### `ctx` pasado a cada vista

```js
const ctx = {
  session,                  // {token, codigo, rol, nombre, debeCambiarPassword}
  api: { get: apiGet, post: apiPost },
  handleAuthError,          // de session.js
  navigate: (viewId) => { /* limpia <main> y renderiza VIEWS[viewId] */ },
  forced: session.debeCambiarPassword === true, // true solo para cambiar-password en flujo obligatorio
};
```

### `views/inicio.js`

Vista mínima de bienvenida: `"Bienvenido/a, {nombre} ({rol})"`. Es un
placeholder — no hay contenido funcional adicional en Fase 0.

---

## Gestión de usuarios (`views/usuarios.js`, solo `administrador`)

1. Al renderizar: `apiGet('listarUsuarios', {token})`.
   - Si `error` → `handleAuthError` (puede ser `No autorizado`/`Permiso
     denegado`) o mostrar mensaje inline si es otro error.
   - Si `ok` → renderizar tabla con columnas `codigo`, `nombre`, `rol`, y
     acciones "Editar"/"Eliminar" por fila, más botón "Crear usuario".
2. **Crear usuario**: formulario (código, nombre, rol — select con
   `administrador`/`psiquiatra`/`recepcion`/`usuario`, contraseña inicial).
   Submit → `apiPost({accion:'guardarUsuario', token, codigo, rol, nombre,
   password})`. Tras `ok`, recargar la tabla (paso 1) y cerrar el formulario.
3. **Editar usuario**: formulario prellenado con `codigo` (no editable),
   `nombre`, `rol`, campo de contraseña vacío con texto de ayuda "Dejar en
   blanco para no cambiar la contraseña". Submit → mismo `guardarUsuario`,
   omitiendo `password` del body si el campo está vacío. Recargar tabla tras
   `ok`.
4. **Eliminar usuario**: `confirm()` nativo del navegador → si confirma,
   `apiPost({accion:'eliminarUsuario', token, codigo})`. Recargar tabla tras
   `ok`. Si `{error:'No encontrado'}`, mostrar mensaje inline y recargar tabla
   igualmente (por si ya fue borrado en otra sesión).
5. Cualquier `{error}` no relacionado a autenticación se muestra en un área
   de mensaje inline dentro de la vista.

---

## Cambiar contraseña (`views/cambiar-password.js`)

Formulario: contraseña actual, contraseña nueva, confirmar contraseña nueva.

### Validación cliente (antes de llamar a la API)

- Los tres campos son requeridos.
- `passwordNueva.length >= 6` (igual a `PASSWORD_MIN_LENGTH` del backend) —
  si no, mostrar "La nueva contraseña debe tener al menos 6 caracteres."
- `passwordNueva === confirmarPassword` — si no, mostrar "Las contraseñas no
  coinciden."

### Submit

`apiPost({accion:'cambiarPassword', token, passwordActual, passwordNueva})`.

- `ok` → `clearSession()` + `redirectTo('/portal/?passwordChanged=1')`. Esto
  limpia también la marca `debeCambiarPassword`, ya que se borra toda la
  sesión.
- `error` → mostrar mensaje devuelto por el backend en línea (no se limpia la
  sesión, salvo que sea un error de autorización → `handleAuthError`).

### Modo forzado (`ctx.forced === true`)

- No se muestra ningún botón de "cancelar" / volver al dashboard.
- El resto del menú permanece deshabilitado (ya gestionado por
  `dashboard.js` al montar esta vista en modo forzado, en base a
  `session.debeCambiarPassword`).
- Tras éxito, el flujo es el mismo: `clearSession()` + redirección a login.

---

## Responsive / navegación móvil

- `src/portal/nav.js` exporta `initMobileMenu()`, adaptado del mismo patrón
  de `src/landing/nav.js` (botón hamburguesa con `aria-expanded`, clase
  `.is-open` en el menú, cierre al hacer click en un ítem de navegación).
- Desktop/tablet (≥ breakpoint definido en `theme.css`/`dashboard.css`): menú
  lateral siempre visible.
- Móvil: menú colapsado por defecto, se despliega como overlay/menú inferior
  al activar el botón hamburguesa.
- Estilos basados en las variables de `src/shared/theme.css` (`--color-navy`,
  `--color-turquesa`, `--color-lavanda`, etc.), reutilizando el reset base ya
  definido ahí.

---

## Testing (vitest + jsdom)

Sigue el patrón de `tests/landing/nav.test.js`: setup de `document.body.innerHTML`
en `beforeEach`, aserciones sobre clases/atributos del DOM tras simular
eventos (`.click()`).

| Archivo | Cubre |
|---|---|
| `tests/portal/session.test.js` | `getSession`/`setSession`/`clearSession`/`isAuthenticated` — round-trip con `localStorage`; `localStorage.clear()` en `beforeEach`. |
| `tests/portal/api.test.js` | `apiGet`/`apiPost` con `fetch` global mockeado (`vi.fn()`): URL/query correctos, parseo de `{ok}`/`{error}`, manejo de excepción de red → `{error:'Error de conexión...'}`. |
| `tests/portal/nav.test.js` | Igual que `landing/nav.test.js`, adaptado al markup del dashboard (toggle, `.is-open`, cierre al click en ítem). |
| `tests/portal/login.test.js` | Mock de `api.js` (`vi.mock`). Casos: credenciales incorrectas (mensaje de error mostrado), cuenta bloqueada (mensaje de 15 minutos), login exitoso (sesión guardada con `debeCambiarPassword` según corresponda + redirección a `dashboard.html` en ambos casos), banners `?expired=1`/`?passwordChanged=1`. |
| `tests/portal/dashboard.test.js` | Para cada `rol` en `MENUS`, verificar que los ítems ✅/🔜 correctos se renderizan (habilitados/deshabilitados); click en ítem ✅ cambia el contenido de `<main>`; con `debeCambiarPassword: true` en la sesión almacenada, solo se muestra `cambiar-password` en modo forzado y el resto del menú está deshabilitado; sin sesión → redirección a `/portal/`. |
| `tests/portal/views/usuarios.test.js` | Mock de `api`. Render de tabla desde `listarUsuarios`; crear/editar/eliminar usuario disparan el `apiPost` correcto y recargan la tabla; manejo de `{error:'No encontrado'}`. |
| `tests/portal/views/cambiar-password.test.js` | Validaciones cliente (campos vacíos, longitud, coincidencia); submit exitoso → `clearSession` + redirección; error del backend mostrado en línea; modo forzado oculta navegación/cancelar. |

Para los tests de `login.js`/`dashboard.js`/vistas que redirigen o leen query
params, se usa `vi.mock('../../src/portal/session.js', ...)` (parcial, vía
`vi.importActual`) para espiar/controlar `redirectTo` y `getQueryParam` sin
manipular `window.location` directamente.

---

## Cambios en `vite.config.js`

Se agrega `build.rollupOptions.input` con tres entradas para que `vite build`
genere las tres páginas (landing + portal + dashboard). `vite dev` no
requiere cambios — sirve cualquier `.html` automáticamente.

```js
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        portal: resolve(__dirname, 'portal/index.html'),
        dashboard: resolve(__dirname, 'portal/dashboard.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
```
