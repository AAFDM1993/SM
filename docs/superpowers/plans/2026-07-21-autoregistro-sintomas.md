# Auto-registro de Síntomas (Part C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow patients to self-report symptoms (type + intensity 1–5 + optional note) at any time, visible to both patient and psychiatrist.

**Architecture:** New `sintomas.js` backend module with 3 exported functions; new `_sintomas` sheet; 3 router routes; patient form in `mis-actividades.js`; read-only table in `historia-clinica.js`. Follows the same patterns as `prescripciones.js` and `tareas.js`.

**Tech Stack:** Google Apps Script (GAS) backend via Vitest-tested ES modules; vanilla JS frontend tested with Vitest + JSDOM.

## Global Constraints

- `TIPOS_VALIDOS = ['Ánimo', 'Ansiedad', 'Sueño', 'Energía', 'Irritabilidad']` — exact strings with tildes
- `intensidad` stored and returned as a **number** (not string), valid range `[1, 5]` integers only
- `nota` stored as `''` when absent — never `null` or `undefined`
- Log action: `'sintoma_registrado'`
- `registrarSintoma` → role `['usuario']` only
- `listarMisSintomas` → role `['usuario']` only
- `listarSintomasPaciente` → role `['psiquiatra']` only
- Fecha/Hora display: `fechaHora.slice(0, 16).replace('T', ' ')`
- Sheet `_sintomas` header: `['id', 'pacienteCodigo', 'tipo', 'intensidad', 'nota', 'fechaHora', 'registradoPor']`
- Sheet `_sintomas` inserted before `_log` in `setupSheets()`
- `sintomas.js` inserted before `auth.js` in `FILES` in `build.js`
- Error strings: `'tipo es requerido'`, `'Tipo de síntoma inválido'`, `'intensidad es requerida'`, `'Intensidad debe ser un número entre 1 y 5'`

---

### Task 1: Backend `sintomas.js` + unit tests (TDD)

**Files:**
- Create: `backend/src/sintomas.js`
- Create: `backend/tests/sintomas.test.js`

**Interfaces:**
- Consumes: `registrarLog` from `./log.js`; `services.SpreadsheetApp`, `services.Utilities.getUuid()`
- Produces:
  - `registrarSintoma(b, user, services)` → `{ ok, sintoma: { id, tipo, intensidad, nota, fechaHora } }` or `{ error }`
  - `listarMisSintomas(user, services)` → `{ ok, sintomas: [{id, tipo, intensidad, nota, fechaHora}] }` or `{ error }`
  - `listarSintomasPaciente(codigo, services)` → `{ ok, sintomas: [{id, tipo, intensidad, nota, fechaHora}] }` or `{ error }`

- [ ] **Step 1: Write 14 failing tests in `backend/tests/sintomas.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { registrarSintoma, listarMisSintomas, listarSintomasPaciente } from '../src/sintomas.js';

const SINTOMAS_HEADER = ['id', 'pacienteCodigo', 'tipo', 'intensidad', 'nota', 'fechaHora', 'registradoPor'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];

const PACIENTE = { codigo: 'PAC001', rol: 'usuario', nombre: 'Maria' };
const PACIENTE2 = { codigo: 'PAC002', rol: 'usuario', nombre: 'Juan' };

function buildServices({ sintomas = [] } = {}) {
  return createMockServices({
    sheets: {
      _sintomas: [SINTOMAS_HEADER, ...sintomas],
      _log: [LOG_HEADER],
    },
  });
}

describe('registrarSintoma', () => {
  it('retorna error si falta tipo', () => {
    const services = buildServices();
    expect(registrarSintoma({}, PACIENTE, services)).toEqual({ error: 'tipo es requerido' });
  });

  it('retorna error si tipo no está en TIPOS_VALIDOS', () => {
    const services = buildServices();
    expect(registrarSintoma({ tipo: 'Migraña', intensidad: 3 }, PACIENTE, services))
      .toEqual({ error: 'Tipo de síntoma inválido' });
  });

  it('retorna error si falta intensidad', () => {
    const services = buildServices();
    expect(registrarSintoma({ tipo: 'Ánimo' }, PACIENTE, services))
      .toEqual({ error: 'intensidad es requerida' });
  });

  it('retorna error si intensidad es 0', () => {
    const services = buildServices();
    expect(registrarSintoma({ tipo: 'Ánimo', intensidad: 0 }, PACIENTE, services))
      .toEqual({ error: 'Intensidad debe ser un número entre 1 y 5' });
  });

  it('retorna error si intensidad es 6', () => {
    const services = buildServices();
    expect(registrarSintoma({ tipo: 'Ánimo', intensidad: 6 }, PACIENTE, services))
      .toEqual({ error: 'Intensidad debe ser un número entre 1 y 5' });
  });

  it('guarda fila correcta, registra log y retorna sintoma', () => {
    const services = buildServices();
    const result = registrarSintoma({ tipo: 'Ánimo', intensidad: 3, nota: 'bien' }, PACIENTE, services);
    expect(result.ok).toBe(true);
    expect(result.sintoma.tipo).toBe('Ánimo');
    expect(result.sintoma.intensidad).toBe(3);
    expect(result.sintoma.nota).toBe('bien');
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_sintomas');
    const row = sheet.getRange(2, 1, 1, 7).getValues()[0];
    expect(row[1]).toBe('PAC001');
    expect(row[2]).toBe('Ánimo');
    expect(row[3]).toBe(3);
    expect(row[4]).toBe('bien');
    const logSheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_log');
    const logRows = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 5).getValues();
    expect(logRows.some((r) => r[3] === 'sintoma_registrado')).toBe(true);
  });

  it('guarda nota vacía si no se provee', () => {
    const services = buildServices();
    const result = registrarSintoma({ tipo: 'Ansiedad', intensidad: 2 }, PACIENTE, services);
    expect(result.sintoma.nota).toBe('');
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_sintomas');
    const row = sheet.getRange(2, 1, 1, 7).getValues()[0];
    expect(row[4]).toBe('');
  });
});

describe('listarMisSintomas', () => {
  it('retorna lista vacía si no hay registros', () => {
    const services = buildServices();
    expect(listarMisSintomas(PACIENTE, services)).toEqual({ ok: true, sintomas: [] });
  });

  it('no retorna síntomas de otro paciente', () => {
    const services = buildServices();
    registrarSintoma({ tipo: 'Ánimo', intensidad: 3 }, PACIENTE2, services);
    const result = listarMisSintomas(PACIENTE, services);
    expect(result.sintomas).toEqual([]);
  });

  it('retorna síntomas del paciente ordenados desc por fechaHora', () => {
    const services = buildServices();
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_sintomas');
    sheet.appendRow(['s1', 'PAC001', 'Ánimo', 2, '', '2026-07-20T10:00:00.000Z', 'PAC001']);
    sheet.appendRow(['s2', 'PAC001', 'Ansiedad', 4, '', '2026-07-21T09:00:00.000Z', 'PAC001']);
    const result = listarMisSintomas(PACIENTE, services);
    expect(result.sintomas.length).toBe(2);
    expect(result.sintomas[0].fechaHora).toBe('2026-07-21T09:00:00.000Z');
    expect(result.sintomas[1].fechaHora).toBe('2026-07-20T10:00:00.000Z');
  });

  it('intensidad retornada es número', () => {
    const services = buildServices();
    registrarSintoma({ tipo: 'Sueño', intensidad: 5 }, PACIENTE, services);
    const result = listarMisSintomas(PACIENTE, services);
    expect(typeof result.sintomas[0].intensidad).toBe('number');
  });
});

describe('listarSintomasPaciente', () => {
  it('retorna lista vacía si no hay registros', () => {
    const services = buildServices();
    expect(listarSintomasPaciente('PAC001', services)).toEqual({ ok: true, sintomas: [] });
  });

  it('retorna solo síntomas del paciente solicitado', () => {
    const services = buildServices();
    registrarSintoma({ tipo: 'Energía', intensidad: 1 }, PACIENTE, services);
    registrarSintoma({ tipo: 'Ánimo', intensidad: 3 }, PACIENTE2, services);
    const result = listarSintomasPaciente('PAC001', services);
    expect(result.sintomas.length).toBe(1);
    expect(result.sintomas[0].tipo).toBe('Energía');
  });

  it('ordena desc por fechaHora', () => {
    const services = buildServices();
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_sintomas');
    sheet.appendRow(['s1', 'PAC001', 'Ánimo', 2, '', '2026-07-20T10:00:00.000Z', 'PAC001']);
    sheet.appendRow(['s2', 'PAC001', 'Ansiedad', 4, '', '2026-07-21T09:00:00.000Z', 'PAC001']);
    const result = listarSintomasPaciente('PAC001', services);
    expect(result.sintomas[0].fechaHora).toBe('2026-07-21T09:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run tests to verify 14 fail**

```
npx vitest run backend/tests/sintomas.test.js
```
Expected: 14 FAIL with "Cannot find module" or similar import error.

- [ ] **Step 3: Create `backend/src/sintomas.js`**

```js
import { registrarLog } from './log.js';

const TIPOS_VALIDOS = ['Ánimo', 'Ansiedad', 'Sueño', 'Energía', 'Irritabilidad'];
const SHEET_SINTOMAS = '_sintomas';

export function registrarSintoma(b, user, services) {
  const tipo = String(b.tipo || '').trim();
  if (!tipo) return { error: 'tipo es requerido' };
  if (!TIPOS_VALIDOS.includes(tipo)) return { error: 'Tipo de síntoma inválido' };

  const intensidadRaw = b.intensidad;
  if (intensidadRaw === undefined || intensidadRaw === null || intensidadRaw === '') {
    return { error: 'intensidad es requerida' };
  }
  const intensidad = Number(intensidadRaw);
  if (!Number.isInteger(intensidad) || intensidad < 1 || intensidad > 5) {
    return { error: 'Intensidad debe ser un número entre 1 y 5' };
  }

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SINTOMAS);
  if (!sheet) return { error: 'Hoja de síntomas no encontrada' };

  const id = services.Utilities.getUuid();
  const nota = String(b.nota || '');
  const fechaHora = new Date().toISOString();
  sheet.appendRow([id, user.codigo, tipo, intensidad, nota, fechaHora, user.codigo]);
  registrarLog(services, user.codigo, user.rol, 'sintoma_registrado', tipo);
  return { ok: true, sintoma: { id, tipo, intensidad, nota, fechaHora } };
}

export function listarMisSintomas(user, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SINTOMAS);
  if (!sheet) return { error: 'Hoja de síntomas no encontrada' };
  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 7).getValues();
  const needle = user.codigo.toLowerCase();
  const sintomas = rows
    .filter((row) => String(row[1]).trim().toLowerCase() === needle)
    .map((row) => ({
      id: String(row[0]),
      tipo: String(row[2]),
      intensidad: Number(row[3]),
      nota: String(row[4]),
      fechaHora: String(row[5]),
    }))
    .sort((a, b) => b.fechaHora.localeCompare(a.fechaHora));
  return { ok: true, sintomas };
}

export function listarSintomasPaciente(codigo, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SINTOMAS);
  if (!sheet) return { error: 'Hoja de síntomas no encontrada' };
  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 7).getValues();
  const needle = String(codigo).trim().toLowerCase();
  const sintomas = rows
    .filter((row) => String(row[1]).trim().toLowerCase() === needle)
    .map((row) => ({
      id: String(row[0]),
      tipo: String(row[2]),
      intensidad: Number(row[3]),
      nota: String(row[4]),
      fechaHora: String(row[5]),
    }))
    .sort((a, b) => b.fechaHora.localeCompare(a.fechaHora));
  return { ok: true, sintomas };
}
```

- [ ] **Step 4: Run tests to verify all 14 pass**

```
npx vitest run backend/tests/sintomas.test.js
```
Expected: 14 PASS.

- [ ] **Step 5: Commit**

```
git add backend/src/sintomas.js backend/tests/sintomas.test.js
git commit -m "feat: add sintomas.js backend module with unit tests"
```

---

### Task 2: Router + setupSheets + build + router tests

**Files:**
- Modify: `backend/src/router.js`
- Modify: `backend/src/index.js`
- Modify: `backend/build.js`
- Modify: `backend/tests/router.test.js`

**Interfaces:**
- Consumes: `registrarSintoma`, `listarMisSintomas`, `listarSintomasPaciente` from Task 1
- Produces: 3 new router routes active in the GAS bundle

- [ ] **Step 1: Add `SINTOMAS_HEADER_R` constant and 6 failing tests to `backend/tests/router.test.js`**

Add immediately after the `const TOMAS_HEADER_R = [...]` line (which currently reads):
```js
const TOMAS_HEADER_R = ['id', 'prescripcionId', 'fechaHora', 'nota', 'completadoPor'];
```

Add after it:
```js
const SINTOMAS_HEADER_R = ['id', 'pacienteCodigo', 'tipo', 'intensidad', 'nota', 'fechaHora', 'registradoPor'];
```

Then in `describe('handleGet', ...)`, add after the last `listarMisPrescripciones` test:
```js
  it('listarMisSintomas permite usuario', () => {
    const services = buildServicesWithUser({
      codigo: 'USR001', password: 'clave123', rol: 'usuario', nombre: 'Paciente',
      extraSheets: { _sintomas: [SINTOMAS_HEADER_R] },
    });
    const token = loginToken(services, 'USR001', 'clave123');
    const result = handleGet({ parameter: { accion: 'listarMisSintomas', token } }, services);
    expect(bodyOf(result).ok).toBe(true);
    expect(bodyOf(result).sintomas).toEqual([]);
  });

  it('listarMisSintomas rechaza psiquiatra', () => {
    const services = buildServicesWithUser({ codigo: 'PSI001', password: 'clave123', rol: 'psiquiatra', nombre: 'Dra. Petra' });
    const token = loginToken(services, 'PSI001', 'clave123');
    const result = handleGet({ parameter: { accion: 'listarMisSintomas', token } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('listarSintomasPaciente permite psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'PSI001', password: 'clave123', rol: 'psiquiatra', nombre: 'Dra. Petra',
      extraSheets: { _sintomas: [SINTOMAS_HEADER_R] },
    });
    const token = loginToken(services, 'PSI001', 'clave123');
    const result = handleGet({ parameter: { accion: 'listarSintomasPaciente', token, codigo: 'PAC001' } }, services);
    expect(bodyOf(result).ok).toBe(true);
    expect(bodyOf(result).sintomas).toEqual([]);
  });

  it('listarSintomasPaciente rechaza usuario', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'clave123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'clave123');
    const result = handleGet({ parameter: { accion: 'listarSintomasPaciente', token, codigo: 'USR001' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });
```

Then in `describe('handlePost', ...)`, add after the last `registrarToma` test:
```js
  it('registrarSintoma permite usuario', () => {
    const services = buildServicesWithUser({
      codigo: 'USR001', password: 'clave123', rol: 'usuario', nombre: 'Paciente',
      extraSheets: { _sintomas: [SINTOMAS_HEADER_R] },
    });
    const token = loginToken(services, 'USR001', 'clave123');
    const result = handlePost({
      postData: { contents: JSON.stringify({ accion: 'registrarSintoma', token, tipo: 'Ánimo', intensidad: 3 }) },
    }, services);
    expect(bodyOf(result).ok).toBe(true);
  });

  it('registrarSintoma rechaza psiquiatra', () => {
    const services = buildServicesWithUser({ codigo: 'PSI001', password: 'clave123', rol: 'psiquiatra', nombre: 'Dra. Petra' });
    const token = loginToken(services, 'PSI001', 'clave123');
    const result = handlePost({
      postData: { contents: JSON.stringify({ accion: 'registrarSintoma', token, tipo: 'Ánimo', intensidad: 3 }) },
    }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });
```

- [ ] **Step 2: Run to verify 6 new tests fail**

```
npx vitest run backend/tests/router.test.js
```
Expected: 6 new tests FAIL with "Accion no reconocida". All existing tests PASS.

- [ ] **Step 3: Extend import in `backend/src/router.js`**

Replace the current sintomas import (which doesn't exist yet) by adding it as a new import line after the tareas import line (which currently reads):
```js
import { asignarTarea, listarTareasPaciente, listarMisActividades, completarOcurrencia } from './tareas.js';
```

Add after it:
```js
import { registrarSintoma, listarMisSintomas, listarSintomasPaciente } from './sintomas.js';
```

- [ ] **Step 4: Add 2 GET cases in `backend/src/router.js`**

In `handleGet`, add after the `case 'listarMisPrescripciones':` block (before the `default:`):
```js
    case 'listarMisSintomas':
      return json_(
        requireAuth(p, ['usuario'], (user) => listarMisSintomas(user, services), services),
        services
      );

    case 'listarSintomasPaciente':
      return json_(
        requireAuth(p, ['psiquiatra'], () => listarSintomasPaciente(p.codigo, services), services),
        services
      );
```

- [ ] **Step 5: Add 1 POST case in `backend/src/router.js`**

In `handlePost`, add after the `case 'registrarToma':` block (before the `default:`):
```js
    case 'registrarSintoma':
      return json_(
        requireAuthBody(b.token, ['usuario'], (user) => registrarSintoma(b, user, services), services),
        services
      );
```

- [ ] **Step 6: Add `_sintomas` sheet to `backend/src/index.js`**

In the `SHEETS` array inside `setupSheets()`, add before the `_log` entry:
```js
    { name: '_sintomas', header: ['id', 'pacienteCodigo', 'tipo', 'intensidad', 'nota', 'fechaHora', 'registradoPor'] },
    { name: '_log',             header: ['timestamp', 'codigo', 'rol', 'accion', 'detalle'] },
```
(Replace the existing `_log` line with both lines above.)

- [ ] **Step 7: Add `sintomas.js` to `backend/build.js`**

In the `FILES` array, add `'sintomas.js'` before `'auth.js'`:
```js
  'sintomas.js',
  'auth.js',
```
(Replace the existing `'auth.js',` line with both lines above.)

- [ ] **Step 8: Run full backend tests**

```
npx vitest run backend/tests/router.test.js backend/tests/sintomas.test.js
```
Expected: all tests PASS (6 new router tests now green).

- [ ] **Step 9: Verify build**

```
node backend/build.js
```
Expected: `Build OK -> backend/dist/gas-smpdjm.txt (18 archivos)`

- [ ] **Step 10: Commit**

```
git add backend/src/router.js backend/src/index.js backend/build.js backend/tests/router.test.js
git commit -m "feat: wire sintomas routes, add _sintomas to setupSheets and build"
```

---

### Task 3: Frontend paciente — extend `mis-actividades.js` + update tests

**Files:**
- Modify: `src/portal/views/mis-actividades.js`
- Modify: `tests/portal/views/mis-actividades.test.js`

**Interfaces:**
- Consumes: `apiGet('listarMisSintomas', { token })` → `{ ok, sintomas }`; `apiPost({ accion: 'registrarSintoma', token, tipo, intensidad, nota })` → `{ ok, sintoma }`
- Produces: Patient can register symptoms and see their history in "Mis actividades"

- [ ] **Step 1: Write 6 failing tests — add to end of `tests/portal/views/mis-actividades.test.js`**

First, update the `beforeEach` to add `listarMisSintomas` handling. Replace the current `beforeEach` block (which ends at `apiPost.mockReset();`) with:

```js
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      if (accion === 'listarMisSintomas') return Promise.resolve({ ok: true, sintomas: [] });
      return Promise.resolve({ ok: true });
    });
    apiPost.mockReset();
  });
```

Then update each of the 10 existing tests that override `apiGet.mockImplementation` to add the `listarMisSintomas` branch. Each override currently has this pattern:
```js
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ... });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      return Promise.resolve({ ok: true });
    });
```

Add `if (accion === 'listarMisSintomas') return Promise.resolve({ ok: true, sintomas: [] });` before `return Promise.resolve({ ok: true });` in each of these 10 overrides.

The 10 tests to update (find each by their test name string):
1. `'muestra ocurrencias pendientes con botón Marcar cumplida'`
2. `'Marcar cumplida expande el formulario inline'`
3. `'confirmar llama completarOcurrencia con tareaId y fechaOcurrencia correctos'`
4. `'confirmar exitoso mueve la ocurrencia a la tabla de completadas'`
5. `'muestra tabla de completadas con tareas ya completadas'`
6. `'muestra prescripción activa con medicamento, dosis y frecuencia'`
7. `'no muestra prescripción vencida en la sección de activas'`
8. `'btn-toma expande el formulario inline'`
9. `'confirmar toma llama registrarToma con prescripcionId y nota'`
10. `'confirmar exitoso agrega toma al historial y colapsa el form'`

After updating all 10 overrides, add these 6 new tests at the end of the `describe` block:

```js
  it('llama listarMisSintomas con el token de sesión', async () => {
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    expect(apiGet).toHaveBeenCalledWith('listarMisSintomas', { token: 'usr-tok' });
  });

  it('muestra historial de síntomas con Fecha/Hora, Tipo e Intensidad', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      if (accion === 'listarMisSintomas') return Promise.resolve({
        ok: true,
        sintomas: [{ id: 's1', tipo: 'Ánimo', intensidad: 3, nota: 'bien', fechaHora: '2026-07-21T10:00:00.000Z' }],
      });
      return Promise.resolve({ ok: true });
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const filas = container.querySelectorAll('.view-mis-actividades__sintomas-tabla tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Ánimo');
    expect(filas[0].textContent).toContain('3');
    expect(filas[0].textContent).toContain('2026-07-21 10:00');
  });

  it('Registrar síntoma llama apiPost con accion, tipo, intensidad y nota', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      sintoma: { id: 's2', tipo: 'Ansiedad', intensidad: 4, nota: 'test', fechaHora: '2026-07-21T11:00:00.000Z' },
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelector('.view-mis-actividades__sintoma-nota').value = 'test';
    container.querySelector('.view-mis-actividades__btn-registrar-sintoma').click();
    await flush();
    expect(apiPost).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'registrarSintoma',
      token: 'usr-tok',
      nota: 'test',
    }));
  });

  it('error de API se muestra en el div de error del formulario', async () => {
    apiPost.mockResolvedValue({ error: 'Tipo de síntoma inválido' });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelector('.view-mis-actividades__btn-registrar-sintoma').click();
    await flush();
    const errorEl = container.querySelector('.view-mis-actividades__sintoma-form-error');
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toBe('Tipo de síntoma inválido');
  });

  it('éxito prepend síntoma al historial y limpia el formulario', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      sintoma: { id: 's3', tipo: 'Sueño', intensidad: 2, nota: '', fechaHora: '2026-07-21T12:00:00.000Z' },
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelector('.view-mis-actividades__sintoma-nota').value = 'algo';
    container.querySelector('.view-mis-actividades__btn-registrar-sintoma').click();
    await flush();
    const filas = container.querySelectorAll('.view-mis-actividades__sintomas-tabla tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Sueño');
    expect(container.querySelector('.view-mis-actividades__sintoma-nota').value).toBe('');
  });

  it('muestra historial vacío si sintomas: []', async () => {
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const tbody = container.querySelector('.view-mis-actividades__sintomas-tabla tbody');
    expect(tbody.querySelectorAll('tr').length).toBe(0);
  });
```

- [ ] **Step 2: Run tests to verify 6 new tests fail + existing 13 still pass**

```
npx vitest run tests/portal/views/mis-actividades.test.js
```
Expected: 6 new tests FAIL; 13 existing tests PASS (because `beforeEach` now handles `listarMisSintomas`).

Note: if any existing test starts failing after the `beforeEach` change, that test had a `mockImplementation` override that didn't yet include `listarMisSintomas` — verify you updated all 10 overrides in Step 1.

- [ ] **Step 3: Add síntomas DOM sections to `src/portal/views/mis-actividades.js`**

After `wrapper.appendChild(tomasHistorialSection);` (the line that appends the tomas historial section) and before `container.appendChild(wrapper);`, add:

```js
  const sintomasSection = document.createElement('section');
  sintomasSection.className = 'view-mis-actividades__sintomas';
  const sintomasTitulo = document.createElement('h3');
  sintomasTitulo.textContent = 'Mis síntomas';
  sintomasSection.appendChild(sintomasTitulo);

  const sintomasTipo = document.createElement('select');
  sintomasTipo.className = 'view-mis-actividades__sintoma-tipo';
  ['Ánimo', 'Ansiedad', 'Sueño', 'Energía', 'Irritabilidad'].forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    sintomasTipo.appendChild(opt);
  });
  sintomasSection.appendChild(sintomasTipo);

  const sintomasIntensidad = document.createElement('select');
  sintomasIntensidad.className = 'view-mis-actividades__sintoma-intensidad';
  [1, 2, 3, 4, 5].forEach((n) => {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = String(n);
    sintomasIntensidad.appendChild(opt);
  });
  sintomasSection.appendChild(sintomasIntensidad);

  const sintomasNota = document.createElement('textarea');
  sintomasNota.className = 'view-mis-actividades__sintoma-nota';
  sintomasNota.placeholder = 'Nota opcional...';
  sintomasSection.appendChild(sintomasNota);

  const sintomasFormError = document.createElement('div');
  sintomasFormError.className = 'view-mis-actividades__sintoma-form-error';
  sintomasFormError.hidden = true;
  sintomasSection.appendChild(sintomasFormError);

  const sintomasBtn = document.createElement('button');
  sintomasBtn.type = 'button';
  sintomasBtn.className = 'button button--primary view-mis-actividades__btn-registrar-sintoma';
  sintomasBtn.textContent = 'Registrar síntoma';
  sintomasSection.appendChild(sintomasBtn);
  wrapper.appendChild(sintomasSection);

  const sintomasHistorialSection = document.createElement('section');
  sintomasHistorialSection.className = 'view-mis-actividades__sintomas-historial';
  const sintomasHistorialTitulo = document.createElement('h3');
  sintomasHistorialTitulo.textContent = 'Historial de síntomas';
  sintomasHistorialSection.appendChild(sintomasHistorialTitulo);
  const sintomasTabla = document.createElement('table');
  sintomasTabla.className = 'view-mis-actividades__sintomas-tabla';
  sintomasHistorialSection.appendChild(sintomasTabla);
  wrapper.appendChild(sintomasHistorialSection);
```

- [ ] **Step 4: Add `let sintomas = [];` state variable**

After `let prescripciones = [];`, add:
```js
  let sintomas = [];
```

- [ ] **Step 5: Add `renderSintomasHistorial` function and button event listener**

After the closing `}` of `renderTomasHistorial()`, add:

```js
  function renderSintomasHistorial() {
    sintomasTabla.innerHTML = '';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Fecha/Hora</th><th>Tipo</th><th>Intensidad</th><th>Nota</th></tr>';
    sintomasTabla.appendChild(thead);
    const tbody = document.createElement('tbody');
    sintomas.forEach((s) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${s.fechaHora.slice(0, 16).replace('T', ' ')}</td><td>${s.tipo}</td><td>${s.intensidad}</td><td>${s.nota || '—'}</td>`;
      tbody.appendChild(tr);
    });
    sintomasTabla.appendChild(tbody);
  }

  sintomasBtn.addEventListener('click', async () => {
    sintomasFormError.hidden = true;
    const result = await apiPost({
      accion: 'registrarSintoma',
      token: ctx.session.token,
      tipo: sintomasTipo.value,
      intensidad: Number(sintomasIntensidad.value),
      nota: sintomasNota.value.trim(),
    });
    if (result.error) {
      if (handleAuthError(result)) return;
      sintomasFormError.textContent = result.error;
      sintomasFormError.hidden = false;
      return;
    }
    sintomas.unshift(result.sintoma);
    renderSintomasHistorial();
    sintomasTipo.selectedIndex = 0;
    sintomasIntensidad.selectedIndex = 0;
    sintomasNota.value = '';
  });
```

- [ ] **Step 6: Replace `loadActividades` to use 3-way `Promise.all`**

Replace the entire `loadActividades` function with:

```js
  async function loadActividades() {
    const [actividadesResult, prescripcionesResult, sintomasResult] = await Promise.all([
      apiGet('listarMisActividades', { token: ctx.session.token }),
      apiGet('listarMisPrescripciones', { token: ctx.session.token }),
      apiGet('listarMisSintomas', { token: ctx.session.token }),
    ]);
    if (actividadesResult.error) {
      if (handleAuthError(actividadesResult)) return;
      errorEl.textContent = actividadesResult.error;
      errorEl.hidden = false;
      return;
    }
    if (prescripcionesResult.error) {
      if (handleAuthError(prescripcionesResult)) return;
      errorEl.textContent = prescripcionesResult.error;
      errorEl.hidden = false;
      return;
    }
    if (sintomasResult.error) {
      if (handleAuthError(sintomasResult)) return;
      errorEl.textContent = sintomasResult.error;
      errorEl.hidden = false;
      return;
    }
    tareas = actividadesResult.tareas;
    prescripciones = prescripcionesResult.prescripciones;
    sintomas = sintomasResult.sintomas;
    renderPendientes();
    renderCompletadas();
    renderPrescripcionesActivas();
    renderTomasHistorial();
    renderSintomasHistorial();
  }
```

- [ ] **Step 7: Run full test suite to verify all 19 tests pass**

```
npx vitest run tests/portal/views/mis-actividades.test.js
```
Expected: 19 PASS (13 existing + 6 new).

- [ ] **Step 8: Commit**

```
git add src/portal/views/mis-actividades.js tests/portal/views/mis-actividades.test.js
git commit -m "feat: add auto-registro de síntomas to mis-actividades view"
```

---

### Task 4: Frontend psiquiatra — extend `historia-clinica.js` + update tests

**Files:**
- Modify: `src/portal/views/historia-clinica.js`
- Modify: `tests/portal/views/historia-clinica.test.js`

**Interfaces:**
- Consumes: `apiGet('listarSintomasPaciente', { token, codigo })` → `{ ok, sintomas }`
- Produces: Read-only síntomas table in patient chart (historia clínica)

- [ ] **Step 1: Write 4 failing tests — add to `tests/portal/views/historia-clinica.test.js`**

Update the `beforeEach` `apiGet.mockImplementation` block to add `listarSintomasPaciente`. Replace:
```js
      if (accion === 'listarTareasPaciente') return Promise.resolve({ ok: true, tareas: [] });
      return Promise.resolve({ error: 'Accion no reconocida' });
```
With:
```js
      if (accion === 'listarTareasPaciente') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarSintomasPaciente') return Promise.resolve({ ok: true, sintomas: [] });
      return Promise.resolve({ error: 'Accion no reconocida' });
```

Also update the `'muestra tareas existentes con cumplimiento N/M en la tabla'` test's `mockImplementation` override, which currently ends with:
```js
      if (accion === 'listarTareasPaciente') return Promise.resolve({
        ok: true,
        tareas: [{ ... }],
      });
      return Promise.resolve({ error: 'Accion no reconocida' });
```
Change to:
```js
      if (accion === 'listarTareasPaciente') return Promise.resolve({
        ok: true,
        tareas: [{
          id: 't1', titulo: 'Meditar', tipo: 'única', frecuencia: '',
          fechaInicio: '2024-01-10', fechaFin: '2024-01-10',
          registros: [{ fechaOcurrencia: '2024-01-10' }],
        }],
      });
      if (accion === 'listarSintomasPaciente') return Promise.resolve({ ok: true, sintomas: [] });
      return Promise.resolve({ error: 'Accion no reconocida' });
```

Then add these 4 new tests at the end of the `describe` block:

```js
  it('renderiza sección Síntomas al abrir ficha del paciente', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelectorAll('tbody tr')[0].click();
    await flush();
    expect(apiGet).toHaveBeenCalledWith('listarSintomasPaciente', { token: 'psi-tok', codigo: '45678912' });
    expect(container.querySelector('.view-historia-clinica__sintomas')).not.toBeNull();
  });

  it('muestra "Sin registros de síntomas." cuando no hay registros', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelectorAll('tbody tr')[0].click();
    await flush();
    expect(container.querySelector('.view-historia-clinica__sintomas').textContent)
      .toContain('Sin registros de síntomas.');
  });

  it('muestra tabla de síntomas cuando hay registros', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarFichasPacientes') return Promise.resolve({ ok: true, pacientes: PACIENTES });
      if (accion === 'leerAntecedentes') return Promise.resolve({ ok: true, antecedentes: ANTECEDENTES_MARIA });
      if (accion === 'listarNotasEvolucion') return Promise.resolve({ ok: true, notas: [] });
      if (accion === 'listarPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      if (accion === 'listarEscalasPaciente') return Promise.resolve({ ok: true, escalas: [] });
      if (accion === 'listarTareasPaciente') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarSintomasPaciente') return Promise.resolve({
        ok: true,
        sintomas: [{ id: 's1', tipo: 'Ánimo', intensidad: 3, nota: 'test', fechaHora: '2026-07-21T10:00:00.000Z' }],
      });
      return Promise.resolve({ error: 'Accion no reconocida' });
    });
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelectorAll('tbody tr')[0].click();
    await flush();
    const filas = container.querySelectorAll('.view-historia-clinica__sintomas tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Ánimo');
    expect(filas[0].textContent).toContain('3');
  });

  it('error en listarSintomasPaciente muestra error y no renderiza sección síntomas', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarFichasPacientes') return Promise.resolve({ ok: true, pacientes: PACIENTES });
      if (accion === 'leerAntecedentes') return Promise.resolve({ ok: true, antecedentes: ANTECEDENTES_MARIA });
      if (accion === 'listarNotasEvolucion') return Promise.resolve({ ok: true, notas: [] });
      if (accion === 'listarPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      if (accion === 'listarEscalasPaciente') return Promise.resolve({ ok: true, escalas: [] });
      if (accion === 'listarTareasPaciente') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarSintomasPaciente') return Promise.resolve({ error: 'Error de servidor' });
      return Promise.resolve({ error: 'Accion no reconocida' });
    });
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelectorAll('tbody tr')[0].click();
    await flush();
    expect(container.querySelector('.view-historia-clinica__error').hidden).toBe(false);
    expect(container.querySelector('.view-historia-clinica__sintomas')).toBeNull();
  });
```

- [ ] **Step 2: Run to verify 4 new tests fail + existing tests still pass**

```
npx vitest run tests/portal/views/historia-clinica.test.js
```
Expected: 4 new tests FAIL; all existing tests PASS (because `beforeEach` now handles `listarSintomasPaciente`).

- [ ] **Step 3: Add síntomas fetch in `abrirFicha` in `src/portal/views/historia-clinica.js`**

After `renderTareas(paciente, tareasResult.tareas);` (the last render call in `abrirFicha`), add:

```js
    const sintomasResult = await apiGet('listarSintomasPaciente', {
      token: ctx.session.token, codigo: paciente.codigo,
    });
    if (sintomasResult.error) {
      if (handleAuthError(sintomasResult)) return;
      showError(sintomasResult.error);
      return;
    }
    renderSintomas(sintomasResult.sintomas);
```

- [ ] **Step 4: Add `renderSintomas` function to `src/portal/views/historia-clinica.js`**

Before `loadPacientes()` (the last function call at the bottom of `initHistoriaClinicaView`, just before the closing `}`), add:

```js
  function renderSintomas(sintomas) {
    const section = document.createElement('section');
    section.className = 'view-historia-clinica__sintomas';
    const titulo = document.createElement('h4');
    titulo.textContent = 'Síntomas auto-registrados';
    section.appendChild(titulo);
    if (sintomas.length === 0) {
      const vacio = document.createElement('p');
      vacio.textContent = 'Sin registros de síntomas.';
      section.appendChild(vacio);
    } else {
      const tabla = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Fecha/Hora</th><th>Tipo</th><th>Intensidad</th><th>Nota</th></tr>';
      tabla.appendChild(thead);
      const tbody = document.createElement('tbody');
      sintomas.forEach((s) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${s.fechaHora.slice(0, 16).replace('T', ' ')}</td><td>${s.tipo}</td><td>${s.intensidad}</td><td>${s.nota || '—'}</td>`;
        tbody.appendChild(tr);
      });
      tabla.appendChild(tbody);
      section.appendChild(tabla);
    }
    fichaContainer.appendChild(section);
  }
```

- [ ] **Step 5: Run full historia-clinica test suite**

```
npx vitest run tests/portal/views/historia-clinica.test.js
```
Expected: all tests PASS (4 new + all existing).

- [ ] **Step 6: Run full test suite**

```
npx vitest run
```
Expected: all tests PASS across all 32+ test files.

- [ ] **Step 7: Commit**

```
git add src/portal/views/historia-clinica.js tests/portal/views/historia-clinica.test.js
git commit -m "feat: add síntomas auto-registrados section to historia-clinica view"
```
