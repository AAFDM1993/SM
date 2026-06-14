# Plan 3: Portal Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the internal portal (`portal/`) with a login screen and a role-based dashboard shell, covering admin user management and the (forced) change-password flow, per `docs/superpowers/specs/2026-06-12-fase-0-portal-frontend-design.md`.

**Architecture:** Two static entry pages (`portal/index.html` login, `portal/dashboard.html` shell) backed by small vanilla-JS modules under `src/portal/`. Session state (`token`, `codigo`, `rol`, `nombre`, `debeCambiarPassword`) lives in `localStorage` via `session.js`. The dashboard renders a per-role nav from a `MENUS` config and swaps a registry of view modules (`views/inicio.js`, `views/usuarios.js`, `views/cambiar-password.js`) into `<main>` without page reloads. All backend communication goes through `api.js` against the GAS Web App implemented in Plan 2 (`backend/`).

**Tech Stack:** Vite (multi-page build), vanilla JS (ES modules), vitest + jsdom for tests, CSS using `src/shared/theme.css` variables.

---

### Task 1: Shared API client (`src/shared/config.js` + `src/portal/api.js`)

**Files:**
- Create: `src/shared/config.js`
- Create: `src/portal/api.js`
- Test: `tests/portal/api.test.js`

- [ ] **Step 1: Create the API URL config file**

Create `src/shared/config.js`:

```js
export const API_URL = 'PENDIENTE_DESPLEGAR';
```

This is a placeholder. When the GAS Web App from `backend/` is deployed, replace the value with the real deployment URL.

- [ ] **Step 2: Write the failing tests for `apiGet`/`apiPost`**

Create `tests/portal/api.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../src/portal/api.js';
import { API_URL } from '../../src/shared/config.js';

describe('apiGet', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('hace GET con accion y params como query string', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ ok: true, usuarios: [] }),
    });

    const result = await apiGet('listarUsuarios', { token: 'abc' });

    expect(global.fetch).toHaveBeenCalledWith(`${API_URL}?accion=listarUsuarios&token=abc`);
    expect(result).toEqual({ ok: true, usuarios: [] });
  });

  it('hace GET sin params adicionales', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ ok: true }),
    });

    const result = await apiGet('ping');

    expect(global.fetch).toHaveBeenCalledWith(`${API_URL}?accion=ping`);
    expect(result).toEqual({ ok: true });
  });

  it('devuelve un error de conexion si fetch falla', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));

    const result = await apiGet('ping');

    expect(result).toEqual({ error: 'Error de conexión. Intenta nuevamente.' });
  });
});

describe('apiPost', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('hace POST con body JSON y content-type text/plain', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ ok: true }),
    });

    const body = { accion: 'login', codigo: '123', password: 'abc' };
    const result = await apiPost(body);

    expect(global.fetch).toHaveBeenCalledWith(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });
    expect(result).toEqual({ ok: true });
  });

  it('devuelve un error de conexion si fetch falla', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));

    const result = await apiPost({ accion: 'ping' });

    expect(result).toEqual({ error: 'Error de conexión. Intenta nuevamente.' });
  });
});
```

- [ ] **Step 2b: Run tests to verify they fail**

Run: `npm test -- tests/portal/api.test.js`
Expected: FAIL — `Cannot find module '../../src/portal/api.js'` (or similar "module not found").

- [ ] **Step 3: Implement `src/portal/api.js`**

Create `src/portal/api.js`:

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/portal/api.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/config.js src/portal/api.js tests/portal/api.test.js
git commit -m "feat(portal): add API client (apiGet/apiPost) and backend URL config"
```

---

### Task 2: Session module (`src/portal/session.js`)

**Files:**
- Create: `src/portal/session.js`
- Test: `tests/portal/session.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/portal/session.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSession,
  setSession,
  clearSession,
  isAuthenticated,
  isAuthError,
  handleAuthError,
  getQueryParam,
  redirectTo,
} from '../../src/portal/session.js';

const SAMPLE_SESSION = {
  token: 'abc',
  codigo: '123',
  rol: 'administrador',
  nombre: 'Ana',
  debeCambiarPassword: false,
};

describe('session storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getSession devuelve null si no hay sesion guardada', () => {
    expect(getSession()).toBeNull();
  });

  it('setSession guarda y getSession recupera los mismos datos', () => {
    setSession(SAMPLE_SESSION);
    expect(getSession()).toEqual(SAMPLE_SESSION);
  });

  it('clearSession elimina la sesion guardada', () => {
    setSession(SAMPLE_SESSION);
    clearSession();
    expect(getSession()).toBeNull();
  });

  it('isAuthenticated refleja si hay sesion guardada', () => {
    expect(isAuthenticated()).toBe(false);
    setSession(SAMPLE_SESSION);
    expect(isAuthenticated()).toBe(true);
  });
});

describe('isAuthError', () => {
  it('detecta errores de autorizacion', () => {
    expect(isAuthError({ error: 'No autorizado' })).toBe(true);
    expect(isAuthError({ error: 'Permiso denegado' })).toBe(true);
    expect(isAuthError({ error: 'No encontrado' })).toBe(false);
    expect(isAuthError({ ok: true })).toBe(false);
  });
});

describe('handleAuthError', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('location', { href: '', search: '' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('limpia la sesion y redirige si hay error de autorizacion', () => {
    setSession(SAMPLE_SESSION);

    const handled = handleAuthError({ error: 'No autorizado' });

    expect(handled).toBe(true);
    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });

  it('no hace nada si la respuesta no es un error de autorizacion', () => {
    setSession(SAMPLE_SESSION);

    const handled = handleAuthError({ error: 'No encontrado' });

    expect(handled).toBe(false);
    expect(getSession()).toEqual(SAMPLE_SESSION);
    expect(window.location.href).toBe('');
  });
});

describe('getQueryParam', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devuelve el valor del parametro si existe', () => {
    vi.stubGlobal('location', { search: '?expired=1&foo=bar' });
    expect(getQueryParam('expired')).toBe('1');
    expect(getQueryParam('foo')).toBe('bar');
  });

  it('devuelve null si el parametro no existe', () => {
    vi.stubGlobal('location', { search: '' });
    expect(getQueryParam('missing')).toBeNull();
  });
});

describe('redirectTo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asigna window.location.href', () => {
    vi.stubGlobal('location', { href: '' });
    redirectTo('/portal/');
    expect(window.location.href).toBe('/portal/');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/portal/session.test.js`
Expected: FAIL — `Cannot find module '../../src/portal/session.js'`.

- [ ] **Step 3: Implement `src/portal/session.js`**

Create `src/portal/session.js`:

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

// true si la respuesta de la API indica sesion invalida/expirada
export function isAuthError(response) {
  return response?.error === 'No autorizado' || response?.error === 'Permiso denegado';
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/portal/session.test.js`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/portal/session.js tests/portal/session.test.js
git commit -m "feat(portal): add session storage and auth-error handling helpers"
```

---

### Task 3: Mobile nav toggle (`src/portal/nav.js`)

**Files:**
- Create: `src/portal/nav.js`
- Test: `tests/portal/nav.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/portal/nav.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { initMobileMenu } from '../../src/portal/nav.js';

describe('initMobileMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="nav-toggle" aria-expanded="false">Menu</button>
      <nav id="nav-menu">
        <button data-view="inicio">Inicio</button>
        <button data-view="usuarios">Usuarios</button>
      </nav>
    `;
  });

  it('abre el menu al hacer click en el boton toggle', () => {
    initMobileMenu();
    const toggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('nav-menu');

    toggle.click();

    expect(nav.classList.contains('is-open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('cierra el menu si se hace click de nuevo en el boton toggle', () => {
    initMobileMenu();
    const toggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('nav-menu');

    toggle.click();
    toggle.click();

    expect(nav.classList.contains('is-open')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('cierra el menu al hacer click en un item de navegacion', () => {
    initMobileMenu();
    const toggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('nav-menu');
    const item = nav.querySelector('button');

    toggle.click();
    expect(nav.classList.contains('is-open')).toBe(true);

    item.click();

    expect(nav.classList.contains('is-open')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/portal/nav.test.js`
Expected: FAIL — `Cannot find module '../../src/portal/nav.js'`.

- [ ] **Step 3: Implement `src/portal/nav.js`**

Adapted from `src/landing/nav.js`: the dashboard nav is made of `<button>` items (they switch views in place, they don't navigate to a new page), so the closer-on-click selector targets `button` instead of `a`.

Create `src/portal/nav.js`:

```js
export function initMobileMenu() {
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('nav-menu');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('button').forEach((item) => {
    item.addEventListener('click', () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/portal/nav.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/portal/nav.js tests/portal/nav.test.js
git commit -m "feat(portal): add mobile nav toggle for dashboard"
```

---

### Task 4: Login page (`portal/index.html`, `src/portal/login.js`, `src/portal/login.css`)

**Files:**
- Create: `portal/index.html`
- Create: `src/portal/login.js`
- Create: `src/portal/login.css`
- Test: `tests/portal/login.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/portal/login.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiPost } from '../../src/portal/api.js';
import { initLogin } from '../../src/portal/login.js';
import { getSession, setSession } from '../../src/portal/session.js';

vi.mock('../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

function renderLoginPage() {
  document.body.innerHTML = `
    <div id="login-banner" hidden></div>
    <form id="login-form">
      <input type="text" id="codigo" />
      <input type="password" id="password" />
      <div id="login-error" hidden></div>
      <button type="submit">Ingresar</button>
    </form>
  `;
}

describe('initLogin', () => {
  beforeEach(() => {
    localStorage.clear();
    renderLoginPage();
    vi.stubGlobal('location', { href: '', search: '' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('redirige al dashboard si ya hay sesion', () => {
    setSession({ token: 'tok', codigo: '1', rol: 'administrador', nombre: 'Ana', debeCambiarPassword: false });

    initLogin();

    expect(window.location.href).toBe('/portal/dashboard.html');
  });

  it('muestra error si los campos estan vacios', async () => {
    initLogin();

    document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(apiPost).not.toHaveBeenCalled();
    expect(document.getElementById('login-error').textContent).toBe('Código y contraseña son requeridos');
    expect(document.getElementById('login-error').hidden).toBe(false);
  });

  it('muestra el error del backend si las credenciales son incorrectas', async () => {
    apiPost.mockResolvedValue({ error: 'Usuario o contraseña incorrectos' });

    initLogin();
    document.getElementById('codigo').value = '0102030405';
    document.getElementById('password').value = 'incorrecta';
    document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(apiPost).toHaveBeenCalledWith({ accion: 'login', codigo: '0102030405', password: 'incorrecta' });
    expect(document.getElementById('login-error').textContent).toBe('Usuario o contraseña incorrectos');
    expect(document.getElementById('login-error').hidden).toBe(false);
    expect(getSession()).toBeNull();
  });

  it('muestra el mensaje de bloqueo tras demasiados intentos', async () => {
    apiPost.mockResolvedValue({ error: 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.' });

    initLogin();
    document.getElementById('codigo').value = '0102030405';
    document.getElementById('password').value = 'incorrecta';
    document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById('login-error').textContent).toBe(
      'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.'
    );
  });

  it('guarda la sesion y redirige al dashboard tras un login exitoso', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      token: 'tok123',
      rol: 'administrador',
      nombre: 'Ana',
      codigo: '0102030405',
    });

    initLogin();
    document.getElementById('codigo').value = '0102030405';
    document.getElementById('password').value = 'correcta';
    document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getSession()).toEqual({
      token: 'tok123',
      codigo: '0102030405',
      rol: 'administrador',
      nombre: 'Ana',
      debeCambiarPassword: false,
    });
    expect(window.location.href).toBe('/portal/dashboard.html');
  });

  it('propaga debeCambiarPassword en la sesion cuando el backend lo indica', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      token: 'tok123',
      rol: 'usuario',
      nombre: 'Paciente',
      codigo: '0102030405',
      debeCambiarPassword: true,
    });

    initLogin();
    document.getElementById('codigo').value = '0102030405';
    document.getElementById('password').value = '0102030405';
    document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getSession().debeCambiarPassword).toBe(true);
    expect(window.location.href).toBe('/portal/dashboard.html');
  });

  it('muestra el banner de sesion expirada si ?expired=1', () => {
    vi.stubGlobal('location', { href: '', search: '?expired=1' });

    initLogin();

    const banner = document.getElementById('login-banner');
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toBe('Tu sesión expiró. Por favor inicia sesión nuevamente.');
  });

  it('muestra el banner de contrasena actualizada si ?passwordChanged=1', () => {
    vi.stubGlobal('location', { href: '', search: '?passwordChanged=1' });

    initLogin();

    const banner = document.getElementById('login-banner');
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toBe('Contraseña actualizada. Inicia sesión con tu nueva contraseña.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/portal/login.test.js`
Expected: FAIL — `Cannot find module '../../src/portal/login.js'`.

- [ ] **Step 3: Implement `src/portal/login.css`**

Create `src/portal/login.css`:

```css
@import '../shared/theme.css';

.login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-bg);
  padding: var(--spacing-md);
}

.login__card {
  background-color: var(--color-text-light);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(25, 25, 53, 0.1);
  padding: var(--spacing-xl) var(--spacing-lg);
  width: 100%;
  max-width: 360px;
  text-align: center;
}

.login__logo {
  height: 64px;
  margin: 0 auto var(--spacing-md);
  display: block;
}

.login__title {
  color: var(--color-navy);
  margin-bottom: var(--spacing-lg);
}

.login__banner {
  background-color: var(--color-lavanda);
  color: var(--color-navy);
  border-radius: 8px;
  padding: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
  font-size: 0.9rem;
}

.login__form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  text-align: left;
}

.login__form label {
  font-weight: 600;
  color: var(--color-navy);
  font-size: 0.9rem;
}

.login__form input {
  width: 100%;
  padding: var(--spacing-sm);
  border: 1px solid var(--color-lavanda);
  border-radius: 8px;
  font-family: var(--font-base);
  font-size: 1rem;
  margin-bottom: var(--spacing-sm);
}

.login__error {
  color: #c0392b;
  font-size: 0.9rem;
  text-align: left;
}

.button {
  display: inline-block;
  padding: var(--spacing-sm) var(--spacing-lg);
  border: none;
  border-radius: 999px;
  font-family: var(--font-base);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
}

.button--primary {
  background-color: var(--color-turquesa);
  color: var(--color-navy);
}

.button--primary:hover {
  background-color: var(--color-lavanda);
}

.login__form .button {
  margin-top: var(--spacing-sm);
  width: 100%;
}
```

- [ ] **Step 4: Implement `src/portal/login.js`**

Create `src/portal/login.js`:

```js
import './login.css';
import { apiPost } from './api.js';
import { isAuthenticated, setSession, redirectTo, getQueryParam } from './session.js';

export function initLogin() {
  if (isAuthenticated()) {
    redirectTo('/portal/dashboard.html');
    return;
  }

  showBanner();

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    const codigo = document.getElementById('codigo').value.trim();
    const password = document.getElementById('password').value;

    if (!codigo || !password) {
      errorEl.textContent = 'Código y contraseña son requeridos';
      errorEl.hidden = false;
      return;
    }

    const result = await apiPost({ accion: 'login', codigo, password });

    if (result.error) {
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }

    setSession({
      token: result.token,
      codigo: result.codigo,
      rol: result.rol,
      nombre: result.nombre,
      debeCambiarPassword: !!result.debeCambiarPassword,
    });
    redirectTo('/portal/dashboard.html');
  });
}

function showBanner() {
  const banner = document.getElementById('login-banner');

  if (getQueryParam('expired') === '1') {
    banner.textContent = 'Tu sesión expiró. Por favor inicia sesión nuevamente.';
    banner.hidden = false;
  } else if (getQueryParam('passwordChanged') === '1') {
    banner.textContent = 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.';
    banner.hidden = false;
  }
}
```

- [ ] **Step 5: Create `portal/index.html`**

Create `portal/index.html`:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Portal - Petra Diana Jara M.</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <main class="login">
      <div class="login__card">
        <img
          src="/assets/logo-diana.jpg"
          alt="Logo Petra Diana Jara M. - Médico Psiquiatra"
          class="login__logo"
        />
        <h1 class="login__title">Portal</h1>

        <div id="login-banner" class="login__banner" hidden></div>

        <form id="login-form" class="login__form">
          <label for="codigo">Código</label>
          <input type="text" id="codigo" name="codigo" autocomplete="username" />

          <label for="password">Contraseña</label>
          <input type="password" id="password" name="password" autocomplete="current-password" />

          <div id="login-error" class="login__error" hidden></div>

          <button type="submit" class="button button--primary">Ingresar</button>
        </form>
      </div>
    </main>

    <script type="module">
      import { initLogin } from '/src/portal/login.js';
      initLogin();
    </script>
  </body>
</html>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/portal/login.test.js`
Expected: PASS (8 tests).

- [ ] **Step 7: Commit**

```bash
git add portal/index.html src/portal/login.js src/portal/login.css tests/portal/login.test.js
git commit -m "feat(portal): add login page"
```

---

### Task 5: Vista "Inicio" (`src/portal/views/inicio.js`)

**Files:**
- Create: `src/portal/views/inicio.js`
- Test: `tests/portal/views/inicio.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/portal/views/inicio.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { initInicioView } from '../../../src/portal/views/inicio.js';

describe('initInicioView', () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
  });

  it('muestra el nombre y el rol del usuario en sesion', () => {
    const ctx = {
      session: { token: 'tok', codigo: '1', rol: 'administrador', nombre: 'Ana', debeCambiarPassword: false },
      forced: false,
    };

    initInicioView(container, ctx);

    expect(container.querySelector('h2').textContent).toBe('Bienvenido/a, Ana');
    expect(container.querySelector('p').textContent).toBe('Rol: administrador');
  });

  it('escapa el nombre del usuario para evitar XSS', () => {
    const ctx = {
      session: {
        token: 'tok',
        codigo: '1',
        rol: 'usuario',
        nombre: '<script>alert(1)</script>',
        debeCambiarPassword: false,
      },
      forced: false,
    };

    initInicioView(container, ctx);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('h2').textContent).toBe('Bienvenido/a, <script>alert(1)</script>');
  });

  it('reemplaza el contenido anterior al volver a renderizar', () => {
    const ctx = {
      session: { token: 'tok', codigo: '1', rol: 'administrador', nombre: 'Ana', debeCambiarPassword: false },
      forced: false,
    };

    initInicioView(container, ctx);
    initInicioView(container, ctx);

    expect(container.querySelectorAll('h2').length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/portal/views/inicio.test.js`
Expected: FAIL — `Cannot find module '../../../src/portal/views/inicio.js'`.

- [ ] **Step 3: Implement `src/portal/views/inicio.js`**

`nombre` and `rol` come from the stored session, which is set from data the backend (and ultimately an administrator via "Gestión de usuarios") controls. Use `textContent`, not `innerHTML`, so a malicious `nombre` can never be rendered as markup.

Create `src/portal/views/inicio.js`:

```js
export function initInicioView(container, ctx) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'view-inicio';

  const heading = document.createElement('h2');
  heading.textContent = `Bienvenido/a, ${ctx.session.nombre}`;
  wrapper.appendChild(heading);

  const rolText = document.createElement('p');
  rolText.textContent = `Rol: ${ctx.session.rol}`;
  wrapper.appendChild(rolText);

  container.appendChild(wrapper);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/portal/views/inicio.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/portal/views/inicio.js tests/portal/views/inicio.test.js
git commit -m "feat(portal): add inicio view"
```

---

### Task 6: Vista "Cambiar contraseña" (`src/portal/views/cambiar-password.js`)

**Files:**
- Create: `src/portal/views/cambiar-password.js`
- Test: `tests/portal/views/cambiar-password.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/portal/views/cambiar-password.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiPost } from '../../../src/portal/api.js';
import { initCambiarPasswordView } from '../../../src/portal/views/cambiar-password.js';
import { setSession, getSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const SESSION = { token: 'tok', codigo: '1', rol: 'usuario', nombre: 'Paciente', debeCambiarPassword: true };

describe('initCambiarPasswordView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function fillForm({ actual, nueva, confirmar }) {
    container.querySelector('#password-actual').value = actual;
    container.querySelector('#password-nueva').value = nueva;
    container.querySelector('#password-confirmar').value = confirmar;
  }

  function submitForm() {
    container.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('muestra el aviso de cambio obligatorio cuando ctx.forced es true', () => {
    initCambiarPasswordView(container, { session: SESSION, forced: true });

    expect(container.querySelector('.view-cambiar-password__notice').textContent).toBe(
      'Debes cambiar tu contraseña antes de continuar.'
    );
  });

  it('no muestra el aviso cuando ctx.forced es false', () => {
    initCambiarPasswordView(container, { session: SESSION, forced: false });

    expect(container.querySelector('.view-cambiar-password__notice')).toBeNull();
  });

  it('valida que todos los campos sean requeridos', async () => {
    initCambiarPasswordView(container, { session: SESSION, forced: false });

    fillForm({ actual: '', nueva: '', confirmar: '' });
    await submitForm();

    expect(apiPost).not.toHaveBeenCalled();
    const errorEl = container.querySelector('.view-cambiar-password__error');
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toBe('Todos los campos son requeridos');
  });

  it('valida la longitud minima de la nueva contrasena', async () => {
    initCambiarPasswordView(container, { session: SESSION, forced: false });

    fillForm({ actual: 'actual123', nueva: 'abc', confirmar: 'abc' });
    await submitForm();

    expect(apiPost).not.toHaveBeenCalled();
    const errorEl = container.querySelector('.view-cambiar-password__error');
    expect(errorEl.textContent).toBe('La nueva contraseña debe tener al menos 6 caracteres');
  });

  it('valida que la nueva contrasena y su confirmacion coincidan', async () => {
    initCambiarPasswordView(container, { session: SESSION, forced: false });

    fillForm({ actual: 'actual123', nueva: 'nueva123', confirmar: 'otra123' });
    await submitForm();

    expect(apiPost).not.toHaveBeenCalled();
    const errorEl = container.querySelector('.view-cambiar-password__error');
    expect(errorEl.textContent).toBe('Las contraseñas no coinciden');
  });

  it('limpia la sesion y redirige al login tras un cambio exitoso', async () => {
    apiPost.mockResolvedValue({ ok: true });

    initCambiarPasswordView(container, { session: SESSION, forced: true });

    fillForm({ actual: 'actual123', nueva: 'nueva123', confirmar: 'nueva123' });
    await submitForm();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'cambiarPassword',
      token: 'tok',
      passwordActual: 'actual123',
      passwordNueva: 'nueva123',
    });
    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?passwordChanged=1');
  });

  it('muestra el error del backend si la contrasena actual es incorrecta', async () => {
    apiPost.mockResolvedValue({ error: 'La contraseña actual es incorrecta' });

    initCambiarPasswordView(container, { session: SESSION, forced: false });

    fillForm({ actual: 'incorrecta', nueva: 'nueva123', confirmar: 'nueva123' });
    await submitForm();

    const errorEl = container.querySelector('.view-cambiar-password__error');
    expect(errorEl.textContent).toBe('La contraseña actual es incorrecta');
    expect(errorEl.hidden).toBe(false);
    expect(getSession()).toEqual(SESSION);
  });

  it('limpia la sesion y redirige al login si el token expiro', async () => {
    apiPost.mockResolvedValue({ error: 'No autorizado' });

    initCambiarPasswordView(container, { session: SESSION, forced: false });

    fillForm({ actual: 'actual123', nueva: 'nueva123', confirmar: 'nueva123' });
    await submitForm();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/portal/views/cambiar-password.test.js`
Expected: FAIL — `Cannot find module '../../../src/portal/views/cambiar-password.js'`.

- [ ] **Step 3: Implement `src/portal/views/cambiar-password.js`**

The min-length message (`'La nueva contraseña debe tener al menos 6 caracteres'`) and the backend's own validation error (`'La contraseña actual es incorrecta'`, `backend/src/guards.js:30,35`) must match exactly — client-side validation is a UX nicety, the backend remains the source of truth.

Create `src/portal/views/cambiar-password.js`:

```js
import { apiPost } from '../api.js';
import { clearSession, redirectTo, handleAuthError } from '../session.js';

export function initCambiarPasswordView(container, ctx) {
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'view-cambiar-password';

  const heading = document.createElement('h2');
  heading.textContent = 'Cambiar contraseña';
  wrapper.appendChild(heading);

  if (ctx.forced) {
    const notice = document.createElement('p');
    notice.className = 'view-cambiar-password__notice';
    notice.textContent = 'Debes cambiar tu contraseña antes de continuar.';
    wrapper.appendChild(notice);
  }

  const form = document.createElement('form');
  form.className = 'view-cambiar-password__form';
  form.innerHTML = `
    <label for="password-actual">Contraseña actual</label>
    <input type="password" id="password-actual" autocomplete="current-password" />

    <label for="password-nueva">Contraseña nueva</label>
    <input type="password" id="password-nueva" autocomplete="new-password" />

    <label for="password-confirmar">Confirmar contraseña nueva</label>
    <input type="password" id="password-confirmar" autocomplete="new-password" />

    <button type="submit" class="button button--primary">Guardar</button>
  `;

  const errorEl = document.createElement('div');
  errorEl.className = 'view-cambiar-password__error';
  errorEl.hidden = true;
  form.appendChild(errorEl);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    const passwordActual = form.querySelector('#password-actual').value;
    const passwordNueva = form.querySelector('#password-nueva').value;
    const passwordConfirmar = form.querySelector('#password-confirmar').value;

    if (!passwordActual || !passwordNueva || !passwordConfirmar) {
      errorEl.textContent = 'Todos los campos son requeridos';
      errorEl.hidden = false;
      return;
    }

    if (passwordNueva.length < 6) {
      errorEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres';
      errorEl.hidden = false;
      return;
    }

    if (passwordNueva !== passwordConfirmar) {
      errorEl.textContent = 'Las contraseñas no coinciden';
      errorEl.hidden = false;
      return;
    }

    const result = await apiPost({
      accion: 'cambiarPassword',
      token: ctx.session.token,
      passwordActual,
      passwordNueva,
    });

    if (result.error) {
      if (handleAuthError(result)) return;
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }

    clearSession();
    redirectTo('/portal/?passwordChanged=1');
  });

  wrapper.appendChild(form);
  container.appendChild(wrapper);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/portal/views/cambiar-password.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/portal/views/cambiar-password.js tests/portal/views/cambiar-password.test.js
git commit -m "feat(portal): add cambiar contrasena view"
```

---

### Task 7: Vista "Gestión de usuarios" (`src/portal/views/usuarios.js`)

**Files:**
- Create: `src/portal/views/usuarios.js`
- Test: `tests/portal/views/usuarios.test.js`

This view is only reachable by `administrador` (enforced by the dashboard's `MENUS` config in Task 8), but the backend re-checks the role on every `listarUsuarios` / `guardarUsuario` / `eliminarUsuario` call (`backend/src/router.js`), so `handleAuthError` must still be wired up here.

- [ ] **Step 1: Write the failing tests**

Create `tests/portal/views/usuarios.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initUsuariosView } from '../../../src/portal/views/usuarios.js';
import { setSession, getSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const SESSION = { token: 'admin-tok', codigo: 'admin', rol: 'administrador', nombre: 'Admin', debeCambiarPassword: false };

const USUARIOS = [
  { codigo: 'admin', rol: 'administrador', nombre: 'Admin' },
  { codigo: '0102030405', rol: 'usuario', nombre: 'Paciente Uno' },
];

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initUsuariosView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockResolvedValue({ ok: true, usuarios: USUARIOS });
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('carga y muestra la tabla de usuarios', async () => {
    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    expect(apiGet).toHaveBeenCalledWith('listarUsuarios', { token: 'admin-tok' });
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[1].textContent).toContain('0102030405');
    expect(rows[1].textContent).toContain('Paciente Uno');
    expect(rows[1].textContent).toContain('usuario');
  });

  it('redirige al login si listarUsuarios devuelve No autorizado', async () => {
    apiGet.mockResolvedValue({ error: 'No autorizado' });

    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });

  it('crea un usuario nuevo con los datos del formulario', async () => {
    apiPost.mockResolvedValue({ ok: true, accion: 'creado' });

    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelector('.view-usuarios > button').click();

    const form = container.querySelector('.view-usuarios__form');
    const inputs = form.querySelectorAll('input');
    inputs[0].value = '0607080910';
    inputs[1].value = 'Paciente Dos';
    inputs[2].value = 'clave123';
    form.querySelector('select').value = 'usuario';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'guardarUsuario',
      token: 'admin-tok',
      codigo: '0607080910',
      nombre: 'Paciente Dos',
      rol: 'usuario',
      password: 'clave123',
    });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('edita un usuario existente sin enviar password si se deja en blanco', async () => {
    apiPost.mockResolvedValue({ ok: true, accion: 'actualizado' });

    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    const editButtons = container.querySelectorAll('tbody tr button');
    editButtons[0].click(); // primer boton "Editar", fila de "admin"

    const form = container.querySelector('.view-usuarios__form');
    form.querySelectorAll('input')[1].value = 'Admin Editado';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'guardarUsuario',
      token: 'admin-tok',
      codigo: 'admin',
      nombre: 'Admin Editado',
      rol: 'administrador',
    });
  });

  it('muestra el error del backend si faltan campos requeridos', async () => {
    apiPost.mockResolvedValue({ error: 'codigo, rol y nombre son requeridos' });

    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelector('.view-usuarios > button').click();
    const form = container.querySelector('.view-usuarios__form');
    form.querySelectorAll('input')[2].value = 'clave123';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    const formError = container.querySelector('.view-usuarios__form-error');
    expect(formError.textContent).toBe('codigo, rol y nombre son requeridos');
    expect(formError.hidden).toBe(false);
  });

  it('elimina un usuario tras confirmar', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    apiPost.mockResolvedValue({ ok: true });

    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    const firstRowButtons = container.querySelectorAll('tbody tr')[0].querySelectorAll('button');
    firstRowButtons[1].click(); // boton "Eliminar" de la primera fila
    await flush();

    expect(apiPost).toHaveBeenCalledWith({ accion: 'eliminarUsuario', token: 'admin-tok', codigo: 'admin' });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('no elimina si se cancela la confirmacion', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    const firstRowButtons = container.querySelectorAll('tbody tr')[0].querySelectorAll('button');
    firstRowButtons[1].click();
    await flush();

    expect(apiPost).not.toHaveBeenCalled();
  });

  it('muestra un error inline si eliminar devuelve No encontrado', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    apiPost.mockResolvedValue({ error: 'No encontrado' });

    initUsuariosView(container, { session: SESSION, forced: false });
    await flush();

    const firstRowButtons = container.querySelectorAll('tbody tr')[0].querySelectorAll('button');
    firstRowButtons[1].click();
    await flush();

    const errorEl = container.querySelector('.view-usuarios__error');
    expect(errorEl.textContent).toBe('No encontrado');
    expect(errorEl.hidden).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/portal/views/usuarios.test.js`
Expected: FAIL — `Cannot find module '../../../src/portal/views/usuarios.js'`.

- [ ] **Step 3: Implement `src/portal/views/usuarios.js`**

Role values must match `ROLES_VALIDOS` in `backend/src/usuarios.js` exactly (`administrador`, `psiquiatra`, `recepcion`, `usuario`), and the success/error shapes for `guardarUsuario` (`{ok:true, accion:'creado'|'actualizado'}` / `{error:'codigo, rol y nombre son requeridos'}` / `{error:'Rol invalido'}` / `{error:'password requerido para usuarios nuevos'}`) and `eliminarUsuario` (`{ok:true}` / `{error:'No encontrado'}`) come straight from `backend/src/usuarios.js`.

Create `src/portal/views/usuarios.js`:

```js
import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';

const ROLES = ['administrador', 'psiquiatra', 'recepcion', 'usuario'];

export function initUsuariosView(container, ctx) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'view-usuarios';

  const heading = document.createElement('h2');
  heading.textContent = 'Gestión de usuarios';
  wrapper.appendChild(heading);

  const errorEl = document.createElement('div');
  errorEl.className = 'view-usuarios__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.className = 'button button--primary';
  createButton.textContent = 'Crear usuario';
  createButton.addEventListener('click', () => showForm(null));
  wrapper.appendChild(createButton);

  const formContainer = document.createElement('div');
  formContainer.className = 'view-usuarios__form-container';
  wrapper.appendChild(formContainer);

  const table = document.createElement('table');
  table.className = 'view-usuarios__table';
  wrapper.appendChild(table);

  container.appendChild(wrapper);

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.hidden = true;
  }

  async function loadUsuarios() {
    const result = await apiGet('listarUsuarios', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    clearError();
    renderTable(result.usuarios);
  }

  function renderTable(usuarios) {
    table.innerHTML = '';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Código</th><th>Nombre</th><th>Rol</th><th>Acciones</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    usuarios.forEach((usuario) => {
      const tr = document.createElement('tr');

      const tdCodigo = document.createElement('td');
      tdCodigo.textContent = usuario.codigo;
      tr.appendChild(tdCodigo);

      const tdNombre = document.createElement('td');
      tdNombre.textContent = usuario.nombre;
      tr.appendChild(tdNombre);

      const tdRol = document.createElement('td');
      tdRol.textContent = usuario.rol;
      tr.appendChild(tdRol);

      const tdAcciones = document.createElement('td');

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.textContent = 'Editar';
      editButton.addEventListener('click', () => showForm(usuario));
      tdAcciones.appendChild(editButton);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.textContent = 'Eliminar';
      deleteButton.addEventListener('click', () => handleDelete(usuario.codigo));
      tdAcciones.appendChild(deleteButton);

      tr.appendChild(tdAcciones);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function showForm(usuario) {
    formContainer.innerHTML = '';

    const form = document.createElement('form');
    form.className = 'view-usuarios__form';

    const codigoLabel = document.createElement('label');
    codigoLabel.textContent = 'Código';
    const codigoInput = document.createElement('input');
    codigoInput.type = 'text';
    codigoInput.value = usuario ? usuario.codigo : '';
    codigoInput.disabled = !!usuario;
    codigoLabel.appendChild(codigoInput);
    form.appendChild(codigoLabel);

    const nombreLabel = document.createElement('label');
    nombreLabel.textContent = 'Nombre';
    const nombreInput = document.createElement('input');
    nombreInput.type = 'text';
    nombreInput.value = usuario ? usuario.nombre : '';
    nombreLabel.appendChild(nombreInput);
    form.appendChild(nombreLabel);

    const rolLabel = document.createElement('label');
    rolLabel.textContent = 'Rol';
    const rolSelect = document.createElement('select');
    ROLES.forEach((rol) => {
      const option = document.createElement('option');
      option.value = rol;
      option.textContent = rol;
      if (usuario && usuario.rol === rol) option.selected = true;
      rolSelect.appendChild(option);
    });
    rolLabel.appendChild(rolSelect);
    form.appendChild(rolLabel);

    const passwordLabel = document.createElement('label');
    passwordLabel.textContent = usuario
      ? 'Nueva contraseña (dejar en blanco para no cambiarla)'
      : 'Contraseña inicial';
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordLabel.appendChild(passwordInput);
    form.appendChild(passwordLabel);

    const formError = document.createElement('div');
    formError.className = 'view-usuarios__form-error';
    formError.hidden = true;
    form.appendChild(formError);

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'button button--primary';
    saveButton.textContent = 'Guardar';
    form.appendChild(saveButton);

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancelar';
    cancelButton.addEventListener('click', () => {
      formContainer.innerHTML = '';
    });
    form.appendChild(cancelButton);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      formError.hidden = true;

      const body = {
        accion: 'guardarUsuario',
        token: ctx.session.token,
        codigo: codigoInput.value.trim(),
        nombre: nombreInput.value.trim(),
        rol: rolSelect.value,
      };
      if (passwordInput.value) {
        body.password = passwordInput.value;
      }

      const result = await apiPost(body);
      if (result.error) {
        if (handleAuthError(result)) return;
        formError.textContent = result.error;
        formError.hidden = false;
        return;
      }

      formContainer.innerHTML = '';
      await loadUsuarios();
    });

    formContainer.appendChild(form);
  }

  async function handleDelete(codigo) {
    if (!window.confirm(`¿Eliminar el usuario ${codigo}?`)) return;

    const result = await apiPost({ accion: 'eliminarUsuario', token: ctx.session.token, codigo });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    clearError();
    await loadUsuarios();
  }

  loadUsuarios();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/portal/views/usuarios.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/portal/views/usuarios.js tests/portal/views/usuarios.test.js
git commit -m "feat(portal): add gestion de usuarios view"
```

---

### Task 8: Dashboard shell (`portal/dashboard.html`, `src/portal/dashboard.js`, `src/portal/dashboard.css`)

**Files:**
- Create: `portal/dashboard.html`
- Create: `src/portal/dashboard.js`
- Create: `src/portal/dashboard.css`
- Test: `tests/portal/dashboard.test.js`

Note on `ctx`: the spec's draft `ctx` shape (`{session, api, handleAuthError, navigate, forced}`) is simplified here to `{session, forced}`. Each view (Tasks 5-7) already imports `apiGet`/`apiPost`/`handleAuthError`/`clearSession`/`redirectTo` directly from `../api.js`/`../session.js`, so `dashboard.js` doesn't need to thread them through `ctx`, and no Fase-0 view needs cross-view `navigate`.

- [ ] **Step 1: Write the failing tests**

Create `tests/portal/dashboard.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDashboard, MENUS } from '../../src/portal/dashboard.js';
import { setSession, getSession } from '../../src/portal/session.js';
import { initInicioView } from '../../src/portal/views/inicio.js';
import { initUsuariosView } from '../../src/portal/views/usuarios.js';
import { initCambiarPasswordView } from '../../src/portal/views/cambiar-password.js';

vi.mock('../../src/portal/views/inicio.js', () => ({ initInicioView: vi.fn() }));
vi.mock('../../src/portal/views/usuarios.js', () => ({ initUsuariosView: vi.fn() }));
vi.mock('../../src/portal/views/cambiar-password.js', () => ({ initCambiarPasswordView: vi.fn() }));

function renderDashboardPage() {
  document.body.innerHTML = `
    <header>
      <span id="user-nombre"></span>
      <span id="user-rol"></span>
      <button id="nav-toggle" aria-expanded="false"></button>
      <button id="logout-button"></button>
    </header>
    <nav id="nav-menu"></nav>
    <main id="dashboard-main"></main>
  `;
}

const ADMIN_SESSION = {
  token: 'tok',
  codigo: 'admin',
  rol: 'administrador',
  nombre: 'Admin',
  debeCambiarPassword: false,
};

describe('initDashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    renderDashboardPage();
    vi.stubGlobal('location', { href: '', search: '' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('redirige al login si no hay sesion', () => {
    initDashboard();

    expect(window.location.href).toBe('/portal/');
  });

  it('renderiza el nombre y rol del usuario en el header', () => {
    setSession(ADMIN_SESSION);

    initDashboard();

    expect(document.getElementById('user-nombre').textContent).toBe('Admin');
    expect(document.getElementById('user-rol').textContent).toBe('administrador');
  });

  it('cierra sesion y redirige al login al hacer click en Cerrar sesion', () => {
    setSession(ADMIN_SESSION);

    initDashboard();
    document.getElementById('logout-button').click();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/');
  });

  it('muestra la vista inicio por defecto', () => {
    setSession(ADMIN_SESSION);

    initDashboard();

    expect(initInicioView).toHaveBeenCalledWith(document.getElementById('dashboard-main'), {
      session: ADMIN_SESSION,
      forced: false,
    });
  });

  describe('menu por rol', () => {
    Object.entries(MENUS).forEach(([rol, items]) => {
      it(`renderiza los items correctos para el rol ${rol}`, () => {
        setSession({ token: 'tok', codigo: '1', rol, nombre: 'Test', debeCambiarPassword: false });

        initDashboard();

        const rendered = document.querySelectorAll('#nav-menu .dashboard-nav__item');
        expect(rendered.length).toBe(items.length);

        items.forEach((item, index) => {
          const button = rendered[index];
          expect(button.dataset.view).toBe(item.id);
          expect(button.disabled).toBe(!item.enabled);
          expect(button.textContent).toBe(item.enabled ? item.label : `${item.label} (Próximamente)`);
        });
      });
    });
  });

  it('cambia de vista al hacer click en un item habilitado', () => {
    setSession(ADMIN_SESSION);

    initDashboard();
    document.querySelector('#nav-menu .dashboard-nav__item[data-view="usuarios"]').click();

    expect(initUsuariosView).toHaveBeenCalledWith(document.getElementById('dashboard-main'), {
      session: ADMIN_SESSION,
      forced: false,
    });
  });

  it('fuerza la vista de cambiar contrasena y deshabilita el resto del menu si debeCambiarPassword es true', () => {
    const session = { ...ADMIN_SESSION, debeCambiarPassword: true };
    setSession(session);

    initDashboard();

    expect(initCambiarPasswordView).toHaveBeenCalledWith(document.getElementById('dashboard-main'), {
      session,
      forced: true,
    });
    expect(initInicioView).not.toHaveBeenCalled();

    const items = document.querySelectorAll('#nav-menu .dashboard-nav__item');
    items.forEach((item) => {
      if (item.dataset.view === 'cambiar-password') {
        expect(item.disabled).toBe(false);
      } else {
        expect(item.disabled).toBe(true);
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/portal/dashboard.test.js`
Expected: FAIL — `Cannot find module '../../src/portal/dashboard.js'`.

- [ ] **Step 3: Implement `src/portal/dashboard.css`**

Create `src/portal/dashboard.css`:

```css
@import '../shared/theme.css';

.dashboard-header {
  background-color: var(--color-navy);
  color: var(--color-text-light);
}

.dashboard-header__inner {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
}

.dashboard-header__logo {
  height: 40px;
  display: block;
}

.dashboard-header__user {
  display: flex;
  flex-direction: column;
  flex: 1;
  margin-left: var(--spacing-md);
}

.dashboard-header__nombre {
  font-weight: 600;
}

.dashboard-header__rol {
  font-size: 0.8rem;
  color: var(--color-lavanda);
  text-transform: capitalize;
}

.dashboard-header__logout {
  background-color: transparent;
  color: var(--color-text-light);
  border: 1px solid var(--color-turquesa);
  border-radius: 999px;
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  font-family: var(--font-base);
  font-size: 0.85rem;
}

.nav-toggle {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.nav-toggle__bar {
  display: block;
  height: 2px;
  width: 100%;
  background-color: var(--color-text-light);
}

.dashboard {
  display: flex;
  flex-direction: column;
}

.dashboard-nav {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  background-color: var(--color-navy);
  padding: var(--spacing-md);
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.dashboard-nav.is-open {
  max-height: 400px;
}

.dashboard-nav__item {
  background: none;
  border: none;
  color: var(--color-text-light);
  text-align: left;
  padding: var(--spacing-sm);
  font-family: var(--font-base);
  font-size: 1rem;
  cursor: pointer;
  border-radius: 4px;
}

.dashboard-nav__item:hover:not(:disabled) {
  background-color: var(--color-turquesa);
  color: var(--color-navy);
}

.dashboard-nav__item--disabled {
  color: var(--color-lavanda);
  cursor: not-allowed;
}

.dashboard-main {
  padding: var(--spacing-lg) var(--spacing-md);
}

.button {
  display: inline-block;
  padding: var(--spacing-sm) var(--spacing-lg);
  border: none;
  border-radius: 999px;
  font-family: var(--font-base);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
}

.button--primary {
  background-color: var(--color-turquesa);
  color: var(--color-navy);
}

.button--primary:hover {
  background-color: var(--color-lavanda);
}

@media (min-width: 768px) {
  .nav-toggle {
    display: none;
  }

  .dashboard {
    flex-direction: row;
  }

  .dashboard-nav {
    max-height: none;
    overflow: visible;
    width: 220px;
    flex-shrink: 0;
  }

  .dashboard-main {
    flex: 1;
  }
}
```

- [ ] **Step 4: Implement `src/portal/dashboard.js`**

The `MENUS`/`VIEWS` config matches `docs/superpowers/specs/2026-06-12-fase-0-portal-frontend-design.md` exactly. Disabled (`enabled: false`) items render with a "(Próximamente)" suffix and never call into `VIEWS`. In forced mode (`session.debeCambiarPassword === true`), every item except `cambiar-password` itself is disabled, and the initial view is `cambiar-password` instead of `inicio`.

Create `src/portal/dashboard.js`:

```js
import './dashboard.css';
import { getSession, isAuthenticated, clearSession, redirectTo } from './session.js';
import { initMobileMenu } from './nav.js';
import { initInicioView } from './views/inicio.js';
import { initUsuariosView } from './views/usuarios.js';
import { initCambiarPasswordView } from './views/cambiar-password.js';

export const MENUS = {
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

export const VIEWS = {
  inicio: initInicioView,
  usuarios: initUsuariosView,
  'cambiar-password': initCambiarPasswordView,
};

export function initDashboard() {
  if (!isAuthenticated()) {
    redirectTo('/portal/');
    return;
  }

  const session = getSession();
  const ctx = { session, forced: session.debeCambiarPassword === true };

  renderHeader(session);
  renderNav(session.rol, ctx);
  initMobileMenu();

  const main = document.getElementById('dashboard-main');
  if (ctx.forced) {
    initCambiarPasswordView(main, ctx);
  } else {
    initInicioView(main, ctx);
  }
}

function renderHeader(session) {
  document.getElementById('user-nombre').textContent = session.nombre;
  document.getElementById('user-rol').textContent = session.rol;

  document.getElementById('logout-button').addEventListener('click', () => {
    clearSession();
    redirectTo('/portal/');
  });
}

function renderNav(rol, ctx) {
  const nav = document.getElementById('nav-menu');
  nav.innerHTML = '';

  const items = MENUS[rol] || [];
  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.view = item.id;
    button.className = 'dashboard-nav__item';

    const disabled = !item.enabled || (ctx.forced && item.id !== 'cambiar-password');

    if (disabled) {
      button.disabled = true;
      button.classList.add('dashboard-nav__item--disabled');
      button.textContent = item.enabled ? item.label : `${item.label} (Próximamente)`;
    } else {
      button.textContent = item.label;
      button.addEventListener('click', () => {
        const main = document.getElementById('dashboard-main');
        VIEWS[item.id](main, ctx);
      });
    }

    nav.appendChild(button);
  });
}
```

- [ ] **Step 5: Create `portal/dashboard.html`**

Create `portal/dashboard.html`:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Panel - Petra Diana Jara M.</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <header class="dashboard-header">
      <div class="dashboard-header__inner">
        <img
          src="/assets/logo-diana.jpg"
          alt="Logo Petra Diana Jara M. - Médico Psiquiatra"
          class="dashboard-header__logo"
        />
        <div class="dashboard-header__user">
          <span id="user-nombre" class="dashboard-header__nombre"></span>
          <span id="user-rol" class="dashboard-header__rol"></span>
        </div>
        <button
          id="nav-toggle"
          class="nav-toggle"
          aria-expanded="false"
          aria-controls="nav-menu"
          aria-label="Abrir menú"
        >
          <span class="nav-toggle__bar"></span>
          <span class="nav-toggle__bar"></span>
          <span class="nav-toggle__bar"></span>
        </button>
        <button id="logout-button" class="dashboard-header__logout">Cerrar sesión</button>
      </div>
    </header>

    <div class="dashboard">
      <nav id="nav-menu" class="dashboard-nav"></nav>
      <main id="dashboard-main" class="dashboard-main"></main>
    </div>

    <script type="module">
      import { initDashboard } from '/src/portal/dashboard.js';
      initDashboard();
    </script>
  </body>
</html>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/portal/dashboard.test.js`
Expected: PASS (8 tests — 1 per role from `MENUS` plus the others).

- [ ] **Step 7: Commit**

```bash
git add portal/dashboard.html src/portal/dashboard.js src/portal/dashboard.css tests/portal/dashboard.test.js
git commit -m "feat(portal): add dashboard shell with role-based nav"
```

---

### Task 9: Multi-page Vite build config

**Files:**
- Modify: `vite.config.js`

- [ ] **Step 1: Update `vite.config.js` with the multi-page build entries**

The current `vite.config.js`:

```js
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
```

Replace it with:

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

`vite dev` needs no changes — it serves any `.html` file under the project root automatically. This only affects `vite build`, so the three pages (landing, login, dashboard) all get emitted under `dist/`.

- [ ] **Step 2: Run the production build to verify all three pages are emitted**

Run: `npm run build`
Expected: build succeeds and produces:
- `dist/index.html`
- `dist/portal/index.html`
- `dist/portal/dashboard.html`
- `dist/assets/...` (bundled JS/CSS for all three entries)

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all test files under `tests/landing/` and `tests/portal/` pass (api, session, nav, login, inicio, cambiar-password, usuarios, dashboard).

- [ ] **Step 4: Commit**

```bash
git add vite.config.js
git commit -m "build(portal): add multi-page build entries for login and dashboard"
```

---
