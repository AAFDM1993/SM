# Adherencia a Prescripciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow patients to log medication tomas from their active prescriptions in "Mis actividades", and view a history of all tomas registered.

**Architecture:** Extend the existing `prescripciones.js` backend module with two new functions (`listarMisPrescripciones`, `registrarToma`) backed by a new `_prescripciones_tomas` sheet. Wire the routes in `router.js`, register the sheet in `setupSheets`, then extend the patient-facing `mis-actividades.js` view with a prescriptions section and tomas history. No new backend files are created.

**Tech Stack:** Google Apps Script (GAS) backend via `createMockServices` mock; Vitest + JSDOM for all tests; vanilla JS frontend.

## Global Constraints

- Error string for wrong role: `'Permiso denegado'` (not `'No autorizado'`)
- `listarMisPrescripciones` and `registrarToma`: only role `'usuario'`
- Sheet `_prescripciones_tomas` columns in order: `id, prescripcionId, fechaHora, nota, completadoPor`
- `fechaHora` is stored as `new Date().toISOString()` (full ISO timestamp)
- `nota` stored as `''` when absent, never null or undefined
- IDOR prevention: `registrarToma` must verify `prescripcion.pacienteCodigo === user.codigo`
- No new `.js` file in `backend/src/` — functions go into existing `prescripciones.js`
- `build.js` requires no change (`prescripciones.js` is already in FILES array)
- Log action names: `'toma_registrada'`
- BEM classes: `view-mis-actividades__prescripciones`, `view-mis-actividades__prescripciones-activas`, `view-mis-actividades__prescripcion-item`, `view-mis-actividades__prescripcion-nombre`, `view-mis-actividades__btn-toma`, `view-mis-actividades__form-toma`, `view-mis-actividades__toma-nota`, `view-mis-actividades__toma-error`, `view-mis-actividades__btn-confirmar-toma`, `view-mis-actividades__tomas-historial`, `view-mis-actividades__tomas-tabla`

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `backend/src/prescripciones.js` | Add `SHEET_TOMAS` const + `listarMisPrescripciones` + `registrarToma` exports |
| Modify | `backend/tests/prescripciones.test.js` | Add `TOMAS_HEADER`, update `buildServices` to include `_prescripciones_tomas`, add 7 new tests |
| Modify | `backend/src/router.js` | Extend import + add GET `listarMisPrescripciones` + POST `registrarToma` cases |
| Modify | `backend/src/index.js` | Add `_prescripciones_tomas` entry to `SHEETS` before `_log` |
| Modify | `backend/tests/router.test.js` | Add `TOMAS_HEADER_R` const + 4 new tests |
| Modify | `src/portal/views/mis-actividades.js` | Add prescripciones DOM sections + state + 3 new functions + update `loadActividades` |
| Modify | `tests/portal/views/mis-actividades.test.js` | Update `beforeEach` mock + update 5 existing tests + add 6 new tests |

---

## Task 1: Backend — extend `prescripciones.js` + unit tests

**Files:**
- Modify: `backend/src/prescripciones.js`
- Modify: `backend/tests/prescripciones.test.js`

**Interfaces:**
- Consumes: `encrypt_`, `decrypt_`, `registrarLog` already imported in `prescripciones.js`; `crearPrescripcion`, `listarPrescripciones` already exported (do not modify them)
- Produces:
  - `listarMisPrescripciones(user, services)` → `{ ok: true, prescripciones: [{id, medicamento, dosis, frecuencia, fechaInicio, fechaFin, tomas: [{id, fechaHora, nota}]}] }` | `{ error: string }`
  - `registrarToma(b, user, services)` → `{ ok: true, toma: {id, prescripcionId, fechaHora, nota, completadoPor} }` | `{ error: string }`

- [ ] **Step 1: Add `TOMAS_HEADER` and update `buildServices` in the test file**

Open `backend/tests/prescripciones.test.js`. At line 7, there is already:
```js
const PRESCRIPCIONES_HEADER = ['id', 'pacienteCodigo', 'medicamento', 'dosis', 'frecuencia', 'fechaInicio', 'fechaFin', 'creadoPor', 'fechaCreacion'];
```

Add the following constant immediately after it (line 8):
```js
const TOMAS_HEADER = ['id', 'prescripcionId', 'fechaHora', 'nota', 'completadoPor'];
```

Then update the `buildServices` function (currently at ~line 13) to include `_prescripciones_tomas`. Replace it entirely:
```js
function buildServices({ usuarios = [], prescripciones = [], tomas = [] } = {}) {
  return createMockServices({
    sheets: {
      _usuarios: [USUARIOS_HEADER, ...usuarios],
      _prescripciones: [PRESCRIPCIONES_HEADER, ...prescripciones],
      _prescripciones_tomas: [TOMAS_HEADER, ...tomas],
      _log: [LOG_HEADER],
    },
    properties: { AES_KEY },
  });
}
```

Also add `PACIENTE` constant near `PSIQUIATRA`:
```js
const PACIENTE = { codigo: 'PAC001', rol: 'usuario', nombre: 'Maria' };
```

- [ ] **Step 2: Write the 7 failing tests for the two new functions**

Add these two `describe` blocks at the end of `backend/tests/prescripciones.test.js`, after the existing `describe('listarPrescripciones', ...)` block:

```js
describe('listarMisPrescripciones', () => {
  it('retorna lista vacía si no hay prescripciones', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const result = listarMisPrescripciones(PACIENTE, services);
    expect(result).toEqual({ ok: true, prescripciones: [] });
  });

  it('descifra medicamento, dosis y frecuencia correctamente', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    crearPrescripcion({ codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-07-01' }, PSIQUIATRA, services);
    const result = listarMisPrescripciones(PACIENTE, services);
    expect(result.prescripciones[0].medicamento).toBe('Sertralina');
    expect(result.prescripciones[0].dosis).toBe('50mg');
    expect(result.prescripciones[0].frecuencia).toBe('diario');
  });

  it('no retorna prescripciones de otro paciente', () => {
    const services = buildServices({
      usuarios: [
        ['PAC001', 'x', 'x', 'usuario', 'Maria', '', ''],
        ['PAC002', 'x', 'x', 'usuario', 'Juan', '', ''],
      ],
    });
    crearPrescripcion({ codigo: 'PAC002', medicamento: 'Fluoxetina', dosis: '20mg', frecuencia: 'diario', fechaInicio: '2026-07-01' }, PSIQUIATRA, services);
    const result = listarMisPrescripciones(PACIENTE, services);
    expect(result.prescripciones).toEqual([]);
  });

  it('incluye tomas de la prescripcion ordenadas por fechaHora desc', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const { prescripcion } = crearPrescripcion(
      { codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-07-01' },
      PSIQUIATRA, services
    );
    const tomasSheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_prescripciones_tomas');
    tomasSheet.appendRow(['tom1', prescripcion.id, '2026-07-20T10:00:00.000Z', 'primera', 'PAC001']);
    tomasSheet.appendRow(['tom2', prescripcion.id, '2026-07-21T09:00:00.000Z', 'segunda', 'PAC001']);
    const result = listarMisPrescripciones(PACIENTE, services);
    expect(result.prescripciones[0].tomas.length).toBe(2);
    expect(result.prescripciones[0].tomas[0].fechaHora).toBe('2026-07-21T09:00:00.000Z');
    expect(result.prescripciones[0].tomas[1].fechaHora).toBe('2026-07-20T10:00:00.000Z');
  });
});

describe('registrarToma', () => {
  it('rechaza si falta prescripcionId', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    expect(registrarToma({}, PACIENTE, services)).toEqual({ error: 'prescripcionId es requerido' });
  });

  it('rechaza si la prescripción no existe', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    expect(registrarToma({ prescripcionId: 'noexiste' }, PACIENTE, services)).toEqual({ error: 'Prescripción no encontrada' });
  });

  it('rechaza si la prescripción pertenece a otro paciente', () => {
    const services = buildServices({
      usuarios: [
        ['PAC001', 'x', 'x', 'usuario', 'Maria', '', ''],
        ['PAC002', 'x', 'x', 'usuario', 'Juan', '', ''],
      ],
    });
    const { prescripcion } = crearPrescripcion(
      { codigo: 'PAC002', medicamento: 'Fluoxetina', dosis: '20mg', frecuencia: 'diario', fechaInicio: '2026-07-01' },
      PSIQUIATRA, services
    );
    expect(registrarToma({ prescripcionId: prescripcion.id }, PACIENTE, services)).toEqual({ error: 'Permiso denegado' });
  });

  it('guarda toma con campos correctos, registra log y retorna toma', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const { prescripcion } = crearPrescripcion(
      { codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-07-01' },
      PSIQUIATRA, services
    );
    const result = registrarToma({ prescripcionId: prescripcion.id, nota: 'con desayuno' }, PACIENTE, services);
    expect(result.ok).toBe(true);
    expect(result.toma.prescripcionId).toBe(prescripcion.id);
    expect(result.toma.nota).toBe('con desayuno');
    expect(result.toma.completadoPor).toBe('PAC001');
    const tomasSheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_prescripciones_tomas');
    const row = tomasSheet.getRange(2, 1, 1, 5).getValues()[0];
    expect(row[1]).toBe(prescripcion.id);
    expect(row[3]).toBe('con desayuno');
    const logSheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_log');
    const logRows = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 5).getValues();
    expect(logRows.some((r) => r[3] === 'toma_registrada')).toBe(true);
  });

  it('guarda nota vacía si no se provee', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const { prescripcion } = crearPrescripcion(
      { codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-07-01' },
      PSIQUIATRA, services
    );
    const result = registrarToma({ prescripcionId: prescripcion.id }, PACIENTE, services);
    expect(result.toma.nota).toBe('');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run backend/tests/prescripciones.test.js
```

Expected: 7 new tests FAIL with `listarMisPrescripciones is not a function` and `registrarToma is not a function`. Existing 11 tests still PASS.

- [ ] **Step 4: Update the import line in the test file**

At the top of `backend/tests/prescripciones.test.js`, find:
```js
import { crearPrescripcion, listarPrescripciones } from '../src/prescripciones.js';
```

Replace with:
```js
import { crearPrescripcion, listarPrescripciones, listarMisPrescripciones, registrarToma } from '../src/prescripciones.js';
```

- [ ] **Step 5: Implement `listarMisPrescripciones` and `registrarToma` in `backend/src/prescripciones.js`**

Add the constant and two functions at the end of the file (after the closing of `listarPrescripciones`):

```js
const SHEET_TOMAS = '_prescripciones_tomas';

export function listarMisPrescripciones(user, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PRESCRIPCIONES);
  if (!sheet) return { error: 'Hoja de prescripciones no encontrada' };
  const tomasSheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TOMAS);
  if (!tomasSheet) return { error: 'Hoja de tomas no encontrada' };

  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 9).getValues();

  const lastTomas = tomasSheet.getLastRow();
  const tomasRows = lastTomas < 2 ? [] : tomasSheet.getRange(2, 1, lastTomas - 1, 5).getValues();

  function safeDecrypt(val) {
    try { return decrypt_(val, services); } catch { return '[cifrado inválido]'; }
  }

  const prescripciones = rows
    .filter((row) => String(row[1]).trim().toLowerCase() === user.codigo.toLowerCase())
    .map((row) => {
      const id = String(row[0]);
      const tomas = tomasRows
        .filter((t) => String(t[1]) === id)
        .map((t) => ({ id: String(t[0]), fechaHora: String(t[2]), nota: String(t[3]) }))
        .sort((a, b) => b.fechaHora.localeCompare(a.fechaHora));
      return {
        id,
        medicamento: safeDecrypt(row[2]),
        dosis: safeDecrypt(row[3]),
        frecuencia: safeDecrypt(row[4]),
        fechaInicio: String(row[5]),
        fechaFin: String(row[6]),
        tomas,
      };
    });

  return { ok: true, prescripciones };
}

export function registrarToma(b, user, services) {
  const prescripcionId = String(b.prescripcionId || '').trim();
  if (!prescripcionId) return { error: 'prescripcionId es requerido' };

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PRESCRIPCIONES);
  if (!sheet) return { error: 'Hoja de prescripciones no encontrada' };

  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 9).getValues();
  const prescripcionRow = rows.find((row) => String(row[0]) === prescripcionId);
  if (!prescripcionRow) return { error: 'Prescripción no encontrada' };
  if (String(prescripcionRow[1]).trim() !== user.codigo) return { error: 'Permiso denegado' };

  const tomasSheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TOMAS);
  if (!tomasSheet) return { error: 'Hoja de tomas no encontrada' };

  const id = services.Utilities.getUuid();
  const fechaHora = new Date().toISOString();
  const nota = String(b.nota || '');
  tomasSheet.appendRow([id, prescripcionId, fechaHora, nota, user.codigo]);
  registrarLog(services, user.codigo, user.rol, 'toma_registrada', prescripcionId);
  return { ok: true, toma: { id, prescripcionId, fechaHora, nota, completadoPor: user.codigo } };
}
```

- [ ] **Step 6: Run tests to verify all pass**

```bash
npx vitest run backend/tests/prescripciones.test.js
```

Expected: **18 tests PASS** (11 existing + 7 new).

- [ ] **Step 7: Commit**

```bash
git add backend/src/prescripciones.js backend/tests/prescripciones.test.js
git commit -m "feat: add listarMisPrescripciones and registrarToma to prescripciones.js"
```

---

## Task 2: Router + setupSheets + router tests

**Files:**
- Modify: `backend/src/router.js`
- Modify: `backend/src/index.js`
- Modify: `backend/tests/router.test.js`

**Interfaces:**
- Consumes: `listarMisPrescripciones(user, services)` and `registrarToma(b, user, services)` from Task 1
- Produces: GET `listarMisPrescripciones` (role: `['usuario']`), POST `registrarToma` (role: `['usuario']`) wired in the router

- [ ] **Step 1: Add `TOMAS_HEADER_R` constant and 4 failing tests to `router.test.js`**

At line 18 in `backend/tests/router.test.js`, add after `REGISTROS_HEADER_R`:
```js
const TOMAS_HEADER_R = ['id', 'prescripcionId', 'fechaHora', 'nota', 'completadoPor'];
```

Inside `describe('handleGet', ...)`, add after the last `listarMisActividades` test:
```js
it('listarMisPrescripciones permite usuario', () => {
  const services = buildServicesWithUser({
    codigo: 'USR001', password: 'clave123', rol: 'usuario', nombre: 'Paciente',
    extraSheets: {
      _prescripciones: [PRESCRIPCIONES_HEADER],
      _prescripciones_tomas: [TOMAS_HEADER_R],
    },
  });
  const token = loginToken(services, 'USR001', 'clave123');
  const result = handleGet({ parameter: { accion: 'listarMisPrescripciones', token } }, services);
  expect(bodyOf(result).ok).toBe(true);
  expect(bodyOf(result).prescripciones).toEqual([]);
});

it('listarMisPrescripciones rechaza psiquiatra', () => {
  const services = buildServicesWithUser({ codigo: 'PSI001', password: 'clave123', rol: 'psiquiatra', nombre: 'Dra. Petra' });
  const token = loginToken(services, 'PSI001', 'clave123');
  const result = handleGet({ parameter: { accion: 'listarMisPrescripciones', token } }, services);
  expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
});
```

Inside `describe('handlePost', ...)`, add after the last `completarOcurrencia` test:
```js
it('registrarToma permite usuario', () => {
  const PRESC_ROW = ['p1', 'USR001', 'enc-med', 'enc-dos', 'enc-frec', '2026-07-01', '', 'PSI001', '2026-07-01T00:00:00.000Z'];
  const services = buildServicesWithUser({
    codigo: 'USR001', password: 'clave123', rol: 'usuario', nombre: 'Paciente',
    extraSheets: {
      _prescripciones: [PRESCRIPCIONES_HEADER, PRESC_ROW],
      _prescripciones_tomas: [TOMAS_HEADER_R],
    },
  });
  const token = loginToken(services, 'USR001', 'clave123');
  const result = handlePost({
    postData: { contents: JSON.stringify({ accion: 'registrarToma', token, prescripcionId: 'p1' }) },
  }, services);
  expect(bodyOf(result).ok).toBe(true);
});

it('registrarToma rechaza psiquiatra', () => {
  const services = buildServicesWithUser({ codigo: 'PSI001', password: 'clave123', rol: 'psiquiatra', nombre: 'Dra. Petra' });
  const token = loginToken(services, 'PSI001', 'clave123');
  const result = handlePost({
    postData: { contents: JSON.stringify({ accion: 'registrarToma', token, prescripcionId: 'p1' }) },
  }, services);
  expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
});
```

- [ ] **Step 2: Run router tests to verify 4 new tests fail**

```bash
npx vitest run backend/tests/router.test.js
```

Expected: 4 new tests FAIL with `Accion no reconocida`. All existing tests still PASS.

- [ ] **Step 3: Extend the import in `backend/src/router.js`**

Find (line ~9):
```js
import { crearPrescripcion, listarPrescripciones } from './prescripciones.js';
```

Replace with:
```js
import { crearPrescripcion, listarPrescripciones, listarMisPrescripciones, registrarToma } from './prescripciones.js';
```

- [ ] **Step 4: Add GET case to `router.js`**

In `handleGet`, find the last case before `default:` (currently `listarMisActividades`). Add after it:

```js
    case 'listarMisPrescripciones':
      return json_(
        requireAuth(p, ['usuario'], (user) => listarMisPrescripciones(user, services), services),
        services
      );
```

- [ ] **Step 5: Add POST case to `router.js`**

In `handlePost`, find the last case before `default:` (currently `completarOcurrencia`). Add after it:

```js
    case 'registrarToma':
      return json_(
        requireAuthBody(b.token, ['usuario'], (user) => registrarToma(b, user, services), services),
        services
      );
```

- [ ] **Step 6: Add `_prescripciones_tomas` to `backend/src/index.js`**

Find in the `SHEETS` array the `_log` entry, which is currently the last one:
```js
    { name: '_log',             header: ['timestamp', 'codigo', 'rol', 'accion', 'detalle'] },
```

Insert immediately before it:
```js
    { name: '_prescripciones_tomas', header: ['id', 'prescripcionId', 'fechaHora', 'nota', 'completadoPor'] },
```

- [ ] **Step 7: Run full backend test suite**

```bash
npx vitest run backend/tests/router.test.js backend/tests/prescripciones.test.js
```

Expected: all tests PASS (existing + 4 new router tests).

- [ ] **Step 8: Verify build**

```bash
node backend/build.js
```

Expected output contains: `Build OK -> backend/dist/gas-smpdjm.txt` with same file count as before (no new file added, `prescripciones.js` was already there).

- [ ] **Step 9: Commit**

```bash
git add backend/src/router.js backend/src/index.js backend/tests/router.test.js
git commit -m "feat: wire listarMisPrescripciones and registrarToma routes, add _prescripciones_tomas to setupSheets"
```

---

## Task 3: Frontend — extend `mis-actividades.js` + update tests

**Files:**
- Modify: `src/portal/views/mis-actividades.js`
- Modify: `tests/portal/views/mis-actividades.test.js`

**Interfaces:**
- Consumes:
  - `apiGet('listarMisPrescripciones', { token })` → `{ ok: true, prescripciones: [{id, medicamento, dosis, frecuencia, fechaInicio, fechaFin, tomas: [{id, fechaHora, nota}]}] }`
  - `apiPost({ accion: 'registrarToma', token, prescripcionId, nota })` → `{ ok: true, toma: {id, prescripcionId, fechaHora, nota, completadoPor} }`
- Produces: extended `mis-actividades` view with prescriptions section visible to users

- [ ] **Step 1: Update `beforeEach` mock and add factory function in test file**

In `tests/portal/views/mis-actividades.test.js`, in `beforeEach`, find:
```js
    apiGet.mockResolvedValue({ ok: true, tareas: [] });
```

Replace with:
```js
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      return Promise.resolve({ ok: true });
    });
```

Also add the `getPrescripcionActiva` factory function after `getTareaCompletada`:
```js
function getPrescripcionActiva() {
  return {
    id: 'p1',
    medicamento: 'Sertralina',
    dosis: '50mg',
    frecuencia: 'diario',
    fechaInicio: '2020-01-01',
    fechaFin: '',
    tomas: [],
  };
}
```

- [ ] **Step 2: Update the 5 existing tests that override `apiGet.mockResolvedValue`**

Find and replace each occurrence of `apiGet.mockResolvedValue({ ok: true, tareas: [...] })` inside individual tests. There are 5 such lines:

**Test "muestra 'No hay actividades pendientes'"** — remove the override entirely (the beforeEach mock already returns empty tareas).

**Tests that set `tareas: [getTareaUnica()]`** (4 occurrences) — change each one from:
```js
    apiGet.mockResolvedValue({ ok: true, tareas: [getTareaUnica()] });
```
to:
```js
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [getTareaUnica()] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      return Promise.resolve({ ok: true });
    });
```

**Test "muestra tabla de completadas"** — change from:
```js
    apiGet.mockResolvedValue({ ok: true, tareas: [getTareaCompletada()] });
```
to:
```js
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [getTareaCompletada()] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
      return Promise.resolve({ ok: true });
    });
```

- [ ] **Step 3: Run existing tests to verify they still pass**

```bash
npx vitest run tests/portal/views/mis-actividades.test.js
```

Expected: **7 tests PASS** (no failures — the mock update is correct, nothing else changed yet).

- [ ] **Step 4: Write 6 new failing tests for the prescriptions section**

Add these tests inside `describe('initMisActividadesView', ...)` at the end of the file:

```js
  it('llama listarMisPrescripciones con el token de sesión', async () => {
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    expect(apiGet).toHaveBeenCalledWith('listarMisPrescripciones', { token: 'usr-tok' });
  });

  it('muestra prescripción activa con medicamento, dosis y frecuencia', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [getPrescripcionActiva()] });
      return Promise.resolve({ ok: true });
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const nombre = container.querySelector('.view-mis-actividades__prescripcion-nombre');
    expect(nombre.textContent).toBe('Sertralina — 50mg (diario)');
  });

  it('no muestra prescripción vencida en la sección de activas', async () => {
    const vencida = { id: 'p2', medicamento: 'Vieja', dosis: '10mg', frecuencia: 'diario', fechaInicio: '2020-01-01', fechaFin: '2020-01-31', tomas: [] };
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [vencida] });
      return Promise.resolve({ ok: true });
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    expect(container.querySelector('.view-mis-actividades__prescripcion-item')).toBeNull();
    expect(container.querySelector('.view-mis-actividades__prescripciones-activas').textContent)
      .toContain('No hay prescripciones activas');
  });

  it('btn-toma expande el formulario inline', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [getPrescripcionActiva()] });
      return Promise.resolve({ ok: true });
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const btn = container.querySelector('.view-mis-actividades__btn-toma');
    const form = container.querySelector('.view-mis-actividades__form-toma');
    expect(form.hidden).toBe(true);
    btn.click();
    expect(form.hidden).toBe(false);
  });

  it('confirmar toma llama registrarToma con prescripcionId y nota', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [getPrescripcionActiva()] });
      return Promise.resolve({ ok: true });
    });
    apiPost.mockResolvedValue({
      ok: true,
      toma: { id: 'tom1', prescripcionId: 'p1', fechaHora: '2026-07-21T10:00:00.000Z', nota: 'test', completadoPor: 'PAC001' },
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelector('.view-mis-actividades__btn-toma').click();
    container.querySelector('.view-mis-actividades__toma-nota').value = 'test';
    container.querySelector('.view-mis-actividades__btn-confirmar-toma').click();
    await flush();
    expect(apiPost).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'registrarToma',
      token: 'usr-tok',
      prescripcionId: 'p1',
      nota: 'test',
    }));
  });

  it('confirmar exitoso agrega toma al historial y colapsa el form', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarMisActividades') return Promise.resolve({ ok: true, tareas: [] });
      if (accion === 'listarMisPrescripciones') return Promise.resolve({ ok: true, prescripciones: [getPrescripcionActiva()] });
      return Promise.resolve({ ok: true });
    });
    apiPost.mockResolvedValue({
      ok: true,
      toma: { id: 'tom1', prescripcionId: 'p1', fechaHora: '2026-07-21T10:00:00.000Z', nota: '', completadoPor: 'PAC001' },
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelector('.view-mis-actividades__btn-toma').click();
    container.querySelector('.view-mis-actividades__btn-confirmar-toma').click();
    await flush();
    const filas = container.querySelectorAll('.view-mis-actividades__tomas-tabla tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Sertralina');
    expect(container.querySelector('.view-mis-actividades__form-toma').hidden).toBe(true);
  });
```

- [ ] **Step 5: Run tests to confirm 6 new tests fail**

```bash
npx vitest run tests/portal/views/mis-actividades.test.js
```

Expected: 7 existing tests PASS, 6 new tests FAIL.

- [ ] **Step 6: Add prescripciones DOM sections to `mis-actividades.js`**

In `src/portal/views/mis-actividades.js`, after `wrapper.appendChild(completadasSection)` and before `container.appendChild(wrapper)`, add:

```js
  const prescripcionesSection = document.createElement('section');
  prescripcionesSection.className = 'view-mis-actividades__prescripciones';
  const prescripcionesTitulo = document.createElement('h3');
  prescripcionesTitulo.textContent = 'Mis prescripciones';
  prescripcionesSection.appendChild(prescripcionesTitulo);
  const prescripcionesActivasList = document.createElement('div');
  prescripcionesActivasList.className = 'view-mis-actividades__prescripciones-activas';
  prescripcionesSection.appendChild(prescripcionesActivasList);
  wrapper.appendChild(prescripcionesSection);

  const tomasHistorialSection = document.createElement('section');
  tomasHistorialSection.className = 'view-mis-actividades__tomas-historial';
  const tomasHistorialTitulo = document.createElement('h3');
  tomasHistorialTitulo.textContent = 'Historial de tomas';
  tomasHistorialSection.appendChild(tomasHistorialTitulo);
  const tomasTabla = document.createElement('table');
  tomasTabla.className = 'view-mis-actividades__tomas-tabla';
  tomasHistorialSection.appendChild(tomasTabla);
  wrapper.appendChild(tomasHistorialSection);
```

- [ ] **Step 7: Add `prescripciones` state and helper functions to `mis-actividades.js`**

After `let tareas = [];`, add:
```js
  let prescripciones = [];
```

After the `renderCompletadas` function definition and before `loadActividades`, add:

```js
  function esActiva(p) {
    const hoy = new Date().toISOString().slice(0, 10);
    return p.fechaInicio <= hoy && (p.fechaFin === '' || p.fechaFin >= hoy);
  }

  function renderPrescripcionesActivas() {
    prescripcionesActivasList.innerHTML = '';
    const activas = prescripciones.filter(esActiva);
    if (activas.length === 0) {
      prescripcionesActivasList.textContent = 'No hay prescripciones activas.';
      return;
    }
    activas.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'view-mis-actividades__prescripcion-item';

      const nombre = document.createElement('div');
      nombre.className = 'view-mis-actividades__prescripcion-nombre';
      nombre.textContent = `${p.medicamento} — ${p.dosis} (${p.frecuencia})`;
      item.appendChild(nombre);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'button button--primary view-mis-actividades__btn-toma';
      btn.textContent = 'Tomé ahora';
      item.appendChild(btn);

      const formContainer = document.createElement('div');
      formContainer.className = 'view-mis-actividades__form-toma';
      formContainer.hidden = true;

      const notaInput = document.createElement('textarea');
      notaInput.className = 'view-mis-actividades__toma-nota';
      notaInput.placeholder = 'Nota opcional...';
      formContainer.appendChild(notaInput);

      const formError = document.createElement('div');
      formError.className = 'view-mis-actividades__toma-error';
      formError.hidden = true;
      formContainer.appendChild(formError);

      const confirmarBtn = document.createElement('button');
      confirmarBtn.type = 'button';
      confirmarBtn.className = 'button button--primary view-mis-actividades__btn-confirmar-toma';
      confirmarBtn.textContent = 'Confirmar toma';
      formContainer.appendChild(confirmarBtn);

      btn.addEventListener('click', () => { formContainer.hidden = !formContainer.hidden; });

      confirmarBtn.addEventListener('click', async () => {
        formError.hidden = true;
        const result = await apiPost({
          accion: 'registrarToma',
          token: ctx.session.token,
          prescripcionId: p.id,
          nota: notaInput.value.trim(),
        });
        if (result.error) {
          if (handleAuthError(result)) return;
          formError.textContent = result.error;
          formError.hidden = false;
          return;
        }
        const idx = prescripciones.findIndex((pr) => pr.id === p.id);
        if (idx !== -1) prescripciones[idx].tomas.unshift(result.toma);
        renderTomasHistorial();
        formContainer.hidden = true;
        notaInput.value = '';
      });

      item.appendChild(formContainer);
      prescripcionesActivasList.appendChild(item);
    });
  }

  function renderTomasHistorial() {
    tomasTabla.innerHTML = '';
    const todasTomas = [];
    prescripciones.forEach((p) => {
      p.tomas.forEach((t) => todasTomas.push({ medicamento: p.medicamento, ...t }));
    });
    todasTomas.sort((a, b) => b.fechaHora.localeCompare(a.fechaHora));

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Medicamento</th><th>Fecha/Hora</th><th>Nota</th></tr>';
    tomasTabla.appendChild(thead);
    const tbody = document.createElement('tbody');
    todasTomas.forEach((t) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${t.medicamento}</td><td>${t.fechaHora.slice(0, 16).replace('T', ' ')}</td><td>${t.nota || '—'}</td>`;
      tbody.appendChild(tr);
    });
    tomasTabla.appendChild(tbody);
  }
```

- [ ] **Step 8: Replace `loadActividades` in `mis-actividades.js`**

Find the existing `loadActividades` function:
```js
  async function loadActividades() {
    const result = await apiGet('listarMisActividades', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }
    tareas = result.tareas;
    renderPendientes();
    renderCompletadas();
  }
```

Replace entirely with:
```js
  async function loadActividades() {
    const [actividadesResult, prescripcionesResult] = await Promise.all([
      apiGet('listarMisActividades', { token: ctx.session.token }),
      apiGet('listarMisPrescripciones', { token: ctx.session.token }),
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
    tareas = actividadesResult.tareas;
    prescripciones = prescripcionesResult.prescripciones;
    renderPendientes();
    renderCompletadas();
    renderPrescripcionesActivas();
    renderTomasHistorial();
  }
```

- [ ] **Step 9: Run full test suite**

```bash
npx vitest run
```

Expected: **all tests PASS** — 13 tests in `mis-actividades.test.js` (7 existing + 6 new), plus all other test files unchanged.

- [ ] **Step 10: Commit**

```bash
git add src/portal/views/mis-actividades.js tests/portal/views/mis-actividades.test.js
git commit -m "feat: add prescripciones section and tomas history to mis-actividades view"
```
