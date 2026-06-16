# Prescripciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add prescription creation and listing to the Historia Clínica view, backed by a new `prescripciones.js` backend module with AES encryption.

**Architecture:** New `backend/src/prescripciones.js` module with `crearPrescripcion` and `listarPrescripciones` functions. Router wired with `ROLES_PRESCRIPCIONES = ['psiquiatra']`. Frontend extends `abrirFicha` in the existing `historia-clinica.js` view with a third API call and a new `renderPrescripciones` function.

**Tech Stack:** Google Apps Script backend (vanilla JS modules), Vitest, jsdom, vanilla JS DOM frontend.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/prescripciones.js` | Create | `crearPrescripcion`, `listarPrescripciones` |
| `backend/tests/prescripciones.test.js` | Create | 12 unit tests for the module |
| `backend/src/router.js` | Modify | Import + ROLES_PRESCRIPCIONES + 2 cases |
| `backend/tests/router.test.js` | Modify | +6 integration tests |
| `src/portal/views/historia-clinica.js` | Modify | Extend `abrirFicha` + add `renderPrescripciones` |
| `tests/portal/views/historia-clinica.test.js` | Modify | Update mock + 4 new tests |

---

### Task 1: Create `backend/src/prescripciones.js` + `backend/tests/prescripciones.test.js`

**Files:**
- Create: `backend/src/prescripciones.js`
- Create: `backend/tests/prescripciones.test.js`

- [ ] **Step 1: Write `backend/tests/prescripciones.test.js` (failing)**

```js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { encrypt_, decrypt_ } from '../src/aes.js';
import { crearPrescripcion, listarPrescripciones } from '../src/prescripciones.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre', 'telefono', 'email'];
const PRESCRIPCIONES_HEADER = ['id', 'pacienteCodigo', 'medicamento', 'dosis', 'frecuencia', 'fechaInicio', 'fechaFin', 'creadoPor', 'fechaCreacion'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];
const AES_KEY = '000102030405060708090a0b0c0d0e0f';

const PSIQUIATRA = { codigo: 'PSI001', rol: 'psiquiatra', nombre: 'Dra. Petra' };

function buildServices({ usuarios = [], prescripciones = [] } = {}) {
  return createMockServices({
    sheets: {
      _usuarios: [USUARIOS_HEADER, ...usuarios],
      _prescripciones: [PRESCRIPCIONES_HEADER, ...prescripciones],
      _log: [LOG_HEADER],
    },
    properties: { AES_KEY },
  });
}

describe('crearPrescripcion', () => {
  it('retorna error si faltan campos requeridos', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const result = crearPrescripcion({ codigo: 'PAC001', medicamento: '', dosis: '10mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'codigo, medicamento, dosis, frecuencia y fechaInicio son requeridos' });
  });

  it('retorna error si paciente no existe', () => {
    const services = buildServices();
    const result = crearPrescripcion({ codigo: 'NOEXISTE', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'Paciente no encontrado' });
  });

  it('retorna error si la hoja no existe', () => {
    const services = createMockServices({
      sheets: {
        _usuarios: [USUARIOS_HEADER, ['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']],
        _log: [LOG_HEADER],
      },
      properties: { AES_KEY },
    });
    const result = crearPrescripcion({ codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'Hoja de prescripciones no encontrada' });
  });

  it('crea la prescripcion, cifra campos y registra log', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const result = crearPrescripcion({ codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    expect(result.ok).toBe(true);
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_prescripciones');
    const rows = sheet.getRange(2, 1, 1, 9).getValues();
    const row = rows[0];
    expect(decrypt_(row[2], services)).toBe('Sertralina');
    expect(decrypt_(row[3], services)).toBe('50mg');
    expect(decrypt_(row[4], services)).toBe('diario');
    expect(row[5]).toBe('2026-06-01');
    const log = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_log');
    const logRows = log.getRange(2, 1, 1, 5).getValues();
    expect(logRows[0][3]).toBe('prescripcion_creada');
  });

  it('retorna prescripcion en texto plano', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const result = crearPrescripcion({ codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01', fechaFin: '2026-12-01' }, PSIQUIATRA, services);
    expect(result.prescripcion.medicamento).toBe('Sertralina');
    expect(result.prescripcion.dosis).toBe('50mg');
    expect(result.prescripcion.frecuencia).toBe('diario');
    expect(result.prescripcion.fechaFin).toBe('2026-12-01');
    expect(result.prescripcion.creadoPor).toBe('PSI001');
  });

  it('fechaFin vacio si no se provee', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const result = crearPrescripcion({ codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    expect(result.prescripcion.fechaFin).toBe('');
  });
});

describe('listarPrescripciones', () => {
  it('retorna error si el paciente no existe', () => {
    const services = buildServices();
    expect(listarPrescripciones('NOEXISTE', services)).toEqual({ error: 'Paciente no encontrado' });
  });

  it('retorna prescripciones vacias si no hay filas', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    const result = listarPrescripciones('PAC001', services);
    expect(result).toEqual({ ok: true, prescripciones: [] });
  });

  it('descifra correctamente los campos cifrados', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    crearPrescripcion({ codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    const result = listarPrescripciones('PAC001', services);
    expect(result.prescripciones[0].medicamento).toBe('Sertralina');
    expect(result.prescripciones[0].dosis).toBe('50mg');
    expect(result.prescripciones[0].frecuencia).toBe('diario');
  });

  it('filtra solo las prescripciones del paciente solicitado', () => {
    const services = buildServices({
      usuarios: [
        ['PAC001', 'x', 'x', 'usuario', 'Maria', '', ''],
        ['PAC002', 'x', 'x', 'usuario', 'Carlos', '', ''],
      ],
    });
    crearPrescripcion({ codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    crearPrescripcion({ codigo: 'PAC002', medicamento: 'Fluoxetina', dosis: '20mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    const result = listarPrescripciones('PAC001', services);
    expect(result.prescripciones.length).toBe(1);
    expect(result.prescripciones[0].medicamento).toBe('Sertralina');
  });

  it('ordena por fechaInicio descendente', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    crearPrescripcion({ codigo: 'PAC001', medicamento: 'Vieja', dosis: '10mg', frecuencia: 'diario', fechaInicio: '2026-01-01' }, PSIQUIATRA, services);
    crearPrescripcion({ codigo: 'PAC001', medicamento: 'Nueva', dosis: '20mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    const result = listarPrescripciones('PAC001', services);
    expect(result.prescripciones[0].medicamento).toBe('Nueva');
    expect(result.prescripciones[1].medicamento).toBe('Vieja');
  });

  it('usa fechaCreacion como tiebreaker cuando fechaInicio es igual', () => {
    const services = buildServices({ usuarios: [['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']] });
    crearPrescripcion({ codigo: 'PAC001', medicamento: 'Primera', dosis: '10mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    crearPrescripcion({ codigo: 'PAC001', medicamento: 'Segunda', dosis: '20mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }, PSIQUIATRA, services);
    const result = listarPrescripciones('PAC001', services);
    expect(result.prescripciones[0].medicamento).toBe('Segunda');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run backend/tests/prescripciones.test.js
```

Expected: FAIL — `Cannot find module '../src/prescripciones.js'`

- [ ] **Step 3: Create `backend/src/prescripciones.js`**

```js
import { encrypt_, decrypt_ } from './aes.js';
import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const SHEET_PRESCRIPCIONES = '_prescripciones';

function validarPaciente(codigo, services) {
  const usuario = findUser(codigo, services);
  if (!usuario || usuario.rol !== 'usuario') return null;
  return usuario;
}

export function crearPrescripcion(b, user, services) {
  const codigo = String(b.codigo || '').trim();
  const medicamento = String(b.medicamento || '').trim();
  const dosis = String(b.dosis || '').trim();
  const frecuencia = String(b.frecuencia || '').trim();
  const fechaInicio = String(b.fechaInicio || '').trim();
  if (!codigo || !medicamento || !dosis || !frecuencia || !fechaInicio) {
    return { error: 'codigo, medicamento, dosis, frecuencia y fechaInicio son requeridos' };
  }
  const usuario = validarPaciente(codigo, services);
  if (!usuario) return { error: 'Paciente no encontrado' };
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PRESCRIPCIONES);
  if (!sheet) return { error: 'Hoja de prescripciones no encontrada' };
  const fechaFin = String(b.fechaFin || '');
  const id = services.Utilities.getUuid();
  const fechaCreacion = new Date();
  sheet.appendRow([
    id, usuario.codigo,
    encrypt_(medicamento, services), encrypt_(dosis, services), encrypt_(frecuencia, services),
    fechaInicio, fechaFin, user.codigo, fechaCreacion,
  ]);
  registrarLog(services, user.codigo, user.rol, 'prescripcion_creada', `${id} paciente=${usuario.codigo} ${fechaInicio}`);
  return { ok: true, prescripcion: { id, pacienteCodigo: usuario.codigo, medicamento, dosis, frecuencia, fechaInicio, fechaFin, creadoPor: user.codigo, fechaCreacion } };
}

export function listarPrescripciones(codigo, services) {
  const usuario = validarPaciente(codigo, services);
  if (!usuario) return { error: 'Paciente no encontrado' };
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PRESCRIPCIONES);
  if (!sheet) return { error: 'Hoja de prescripciones no encontrada' };
  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 9).getValues();
  const prescripciones = rows
    .filter((row) => String(row[1]).trim().toLowerCase() === usuario.codigo.toLowerCase())
    .map((row) => ({
      id: String(row[0]), pacienteCodigo: String(row[1]),
      medicamento: decrypt_(row[2], services), dosis: decrypt_(row[3], services), frecuencia: decrypt_(row[4], services),
      fechaInicio: String(row[5]), fechaFin: String(row[6]), creadoPor: String(row[7]), fechaCreacion: row[8],
    }))
    .sort((a, b) => {
      if (a.fechaInicio !== b.fechaInicio) return a.fechaInicio < b.fechaInicio ? 1 : -1;
      return new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime();
    });
  return { ok: true, prescripciones };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run backend/tests/prescripciones.test.js
```

Expected: 12/12 PASS

- [ ] **Step 5: Run full suite to check no regressions**

```
npx vitest run
```

Expected: 28 files, 353 tests, 0 failures

- [ ] **Step 6: Commit**

```
git add backend/src/prescripciones.js backend/tests/prescripciones.test.js
git commit -m "feat: add prescripciones backend module (crearPrescripcion, listarPrescripciones)"
```

---

### Task 2: Wire router — `backend/src/router.js` + `backend/tests/router.test.js`

**Files:**
- Modify: `backend/src/router.js`
- Modify: `backend/tests/router.test.js`

- [ ] **Step 1: Add tests to `backend/tests/router.test.js` (failing)**

After line 14 (`const AES_KEY = ...`), add:

```js
const PRESCRIPCIONES_HEADER = ['id', 'pacienteCodigo', 'medicamento', 'dosis', 'frecuencia', 'fechaInicio', 'fechaFin', 'creadoPor', 'fechaCreacion'];
```

Before the closing `});` of `describe('handleGet', ...)` (currently line 278), add these 2 tests:

```js
  it('listarPrescripciones requiere rol psiquiatra', () => {
    const services = buildServicesWithUser({ rol: 'administrador', extraSheets: { _prescripciones: [PRESCRIPCIONES_HEADER] } });
    const token = loginToken('ADM001', services);
    const result = JSON.parse(handleGet({ parameter: { accion: 'listarPrescripciones', token, codigo: 'PAC001' } }, services).getContent());
    expect(result).toEqual({ error: 'Permiso denegado' });
  });

  it('listarPrescripciones devuelve prescripciones para psiquiatra', () => {
    const services = buildServicesWithUser({ rol: 'psiquiatra', extraSheets: { _prescripciones: [PRESCRIPCIONES_HEADER] } });
    const token = loginToken('PSI001', services);
    services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_usuarios')
      .appendRow(['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']);
    const result = JSON.parse(handleGet({ parameter: { accion: 'listarPrescripciones', token, codigo: 'PAC001' } }, services).getContent());
    expect(result.ok).toBe(true);
    expect(result.prescripciones).toEqual([]);
  });
```

Before the closing `});` of `describe('handlePost', ...)` (currently line 634), add these 4 tests:

```js
  it('crearPrescripcion requiere rol psiquiatra', () => {
    const services = buildServicesWithUser({ rol: 'administrador', extraSheets: { _prescripciones: [PRESCRIPCIONES_HEADER] } });
    const token = loginToken('ADM001', services);
    const result = JSON.parse(handlePost({ postData: { contents: JSON.stringify({ accion: 'crearPrescripcion', token, codigo: 'PAC001', medicamento: 'X', dosis: 'Y', frecuencia: 'Z', fechaInicio: '2026-06-01' }) } }, services).getContent());
    expect(result).toEqual({ error: 'Permiso denegado' });
  });

  it('crearPrescripcion retorna error si faltan campos requeridos', () => {
    const services = buildServicesWithUser({ rol: 'psiquiatra', extraSheets: { _prescripciones: [PRESCRIPCIONES_HEADER] } });
    const token = loginToken('PSI001', services);
    const result = JSON.parse(handlePost({ postData: { contents: JSON.stringify({ accion: 'crearPrescripcion', token, codigo: 'PAC001', medicamento: '', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }) } }, services).getContent());
    expect(result).toEqual({ error: 'codigo, medicamento, dosis, frecuencia y fechaInicio son requeridos' });
  });

  it('crearPrescripcion crea prescripcion para psiquiatra', () => {
    const services = buildServicesWithUser({ rol: 'psiquiatra', extraSheets: { _prescripciones: [PRESCRIPCIONES_HEADER] } });
    services.PropertiesService.getScriptProperties().setProperty('AES_KEY', AES_KEY);
    const token = loginToken('PSI001', services);
    services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_usuarios')
      .appendRow(['PAC001', 'x', 'x', 'usuario', 'Maria', '', '']);
    const result = JSON.parse(handlePost({ postData: { contents: JSON.stringify({ accion: 'crearPrescripcion', token, codigo: 'PAC001', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }) } }, services).getContent());
    expect(result.ok).toBe(true);
    expect(result.prescripcion.medicamento).toBe('Sertralina');
  });

  it('crearPrescripcion retorna error si paciente no encontrado', () => {
    const services = buildServicesWithUser({ rol: 'psiquiatra', extraSheets: { _prescripciones: [PRESCRIPCIONES_HEADER] } });
    services.PropertiesService.getScriptProperties().setProperty('AES_KEY', AES_KEY);
    const token = loginToken('PSI001', services);
    const result = JSON.parse(handlePost({ postData: { contents: JSON.stringify({ accion: 'crearPrescripcion', token, codigo: 'NOEXISTE', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-01' }) } }, services).getContent());
    expect(result).toEqual({ error: 'Paciente no encontrado' });
  });
```

- [ ] **Step 2: Run test to verify new tests fail**

```
npx vitest run backend/tests/router.test.js
```

Expected: FAIL on the 6 new tests — `Accion no reconocida`

- [ ] **Step 3: Update `backend/src/router.js`**

After line 8 (the historia-clinica import), add:

```js
import { crearPrescripcion, listarPrescripciones } from './prescripciones.js';
```

After line 13 (`const ROLES_HISTORIA_CLINICA = ['psiquiatra'];`), add:

```js
const ROLES_PRESCRIPCIONES = ['psiquiatra'];
```

In `handleGet`, after the `listarNotasEvolucion` case (after its closing `);`), add:

```js
    case 'listarPrescripciones':
      return json_(
        requireAuth(p, ROLES_PRESCRIPCIONES, () => listarPrescripciones(p.codigo, services), services),
        services
      );
```

In `handlePost`, after the `crearNotaEvolucion` case (after its closing `);`), add:

```js
    case 'crearPrescripcion':
      return json_(
        requireAuthBody(b.token, ROLES_PRESCRIPCIONES, (user) => crearPrescripcion(b, user, services), services),
        services
      );
```

- [ ] **Step 4: Run router tests**

```
npx vitest run backend/tests/router.test.js
```

Expected: all 55 tests pass (49 existing + 6 new)

- [ ] **Step 5: Run full suite**

```
npx vitest run
```

Expected: 28 files, 359 tests, 0 failures

- [ ] **Step 6: Commit**

```
git add backend/src/router.js backend/tests/router.test.js
git commit -m "feat: wire prescripciones in router (GET listarPrescripciones, POST crearPrescripcion)"
```

---

### Task 3: Frontend — extend `historia-clinica.js` + update its tests

**Files:**
- Modify: `src/portal/views/historia-clinica.js`
- Modify: `tests/portal/views/historia-clinica.test.js`

- [ ] **Step 1: Add 4 new tests to `tests/portal/views/historia-clinica.test.js` (failing)**

In the `beforeEach` `apiGet.mockImplementation` block (lines 46–51), add before the final `return Promise.resolve(...)`:

```js
      if (accion === 'listarPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
```

Before the closing `});` of `describe('initHistoriaClinicaView', ...)` (last line), add:

```js
  it('carga y muestra prescripciones al abrir ficha', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    expect(apiGet).toHaveBeenCalledWith('listarPrescripciones', { token: 'psi-tok', codigo: '45678912' });
    expect(container.querySelector('.view-historia-clinica__prescripciones')).not.toBeNull();
  });

  it('crea una nueva prescripcion y la antepone a la lista', async () => {
    const nuevaPrescripcion = { id: 'p1', pacienteCodigo: '45678912', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-15', fechaFin: '', creadoPor: 'PSI001', fechaCreacion: new Date() };
    apiPost.mockResolvedValue({ ok: true, prescripcion: nuevaPrescripcion });

    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const form = container.querySelector('.view-historia-clinica__prescripcion-form');
    form.querySelector('.view-historia-clinica__prescripcion-medicamento-input').value = 'Sertralina';
    form.querySelector('.view-historia-clinica__prescripcion-dosis-input').value = '50mg';
    form.querySelector('.view-historia-clinica__prescripcion-frecuencia-input').value = 'diario';
    form.querySelector('.view-historia-clinica__prescripcion-fechainicio-input').value = '2026-06-15';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(apiPost).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'crearPrescripcion',
      token: 'psi-tok',
      codigo: '45678912',
      medicamento: 'Sertralina',
    }));
    const items = container.querySelectorAll('.view-historia-clinica__prescripcion');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Sertralina');
  });

  it('valida campos requeridos antes de enviar prescripcion', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const form = container.querySelector('.view-historia-clinica__prescripcion-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    const formError = container.querySelector('.view-historia-clinica__prescripcion-form-error');
    expect(formError.hidden).toBe(false);
    expect(formError.textContent).toBe('medicamento, dosis, frecuencia y fechaInicio son requeridos');
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('limpia el formulario de prescripcion despues de crear', async () => {
    const nuevaPrescripcion = { id: 'p1', pacienteCodigo: '45678912', medicamento: 'Sertralina', dosis: '50mg', frecuencia: 'diario', fechaInicio: '2026-06-15', fechaFin: '', creadoPor: 'PSI001', fechaCreacion: new Date() };
    apiPost.mockResolvedValue({ ok: true, prescripcion: nuevaPrescripcion });

    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const form = container.querySelector('.view-historia-clinica__prescripcion-form');
    form.querySelector('.view-historia-clinica__prescripcion-medicamento-input').value = 'Sertralina';
    form.querySelector('.view-historia-clinica__prescripcion-dosis-input').value = '50mg';
    form.querySelector('.view-historia-clinica__prescripcion-frecuencia-input').value = 'diario';
    form.querySelector('.view-historia-clinica__prescripcion-fechainicio-input').value = '2026-06-15';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(form.querySelector('.view-historia-clinica__prescripcion-medicamento-input').value).toBe('');
    expect(form.querySelector('.view-historia-clinica__prescripcion-dosis-input').value).toBe('');
    expect(form.querySelector('.view-historia-clinica__prescripcion-frecuencia-input').value).toBe('');
    expect(form.querySelector('.view-historia-clinica__prescripcion-fechainicio-input').value).toBe(new Date().toISOString().slice(0, 10));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run tests/portal/views/historia-clinica.test.js
```

Expected: FAIL on 4 new tests — `prescripciones` not rendered / form not found

- [ ] **Step 3: Update `src/portal/views/historia-clinica.js`**

**Part A — Extend `abrirFicha`:** After `renderNotas(paciente, notasResult.notas);` (line 140), before the closing `}` of `abrirFicha`, add:

```js
    const prescripcionesResult = await apiGet('listarPrescripciones', { token: ctx.session.token, codigo: paciente.codigo });
    if (prescripcionesResult.error) {
      if (handleAuthError(prescripcionesResult)) return;
      showError(prescripcionesResult.error);
      return;
    }
    renderPrescripciones(paciente, prescripcionesResult.prescripciones);
```

**Part B — Add `renderPrescripciones` function:** After the closing `}` of `renderNotas` (line 346), before `loadPacientes()` (line 348), insert:

```js
  function renderPrescripciones(paciente, prescripciones) {
    const section = document.createElement('section');
    section.className = 'view-historia-clinica__prescripciones';

    const titulo = document.createElement('h4');
    titulo.textContent = 'Prescripciones';
    section.appendChild(titulo);

    const lista = document.createElement('ul');
    lista.className = 'view-historia-clinica__prescripciones-lista';
    section.appendChild(lista);

    function renderListaPrescripciones() {
      lista.innerHTML = '';
      prescripciones.forEach((p) => {
        const item = document.createElement('li');
        item.className = 'view-historia-clinica__prescripcion';
        const fin = p.fechaFin ? p.fechaFin : '(sin fecha fin)';
        item.textContent = `${p.medicamento} — ${p.dosis} — ${p.frecuencia} — ${p.fechaInicio} → ${fin}`;
        lista.appendChild(item);
      });
    }

    renderListaPrescripciones();

    const form = document.createElement('form');
    form.className = 'view-historia-clinica__prescripcion-form';

    const medLabel = document.createElement('label');
    medLabel.textContent = 'Medicamento';
    const medInput = document.createElement('input');
    medInput.type = 'text';
    medInput.className = 'view-historia-clinica__prescripcion-medicamento-input';
    medLabel.appendChild(medInput);
    form.appendChild(medLabel);

    const dosisLabel = document.createElement('label');
    dosisLabel.textContent = 'Dosis';
    const dosisInput = document.createElement('input');
    dosisInput.type = 'text';
    dosisInput.className = 'view-historia-clinica__prescripcion-dosis-input';
    dosisLabel.appendChild(dosisInput);
    form.appendChild(dosisLabel);

    const frecLabel = document.createElement('label');
    frecLabel.textContent = 'Frecuencia';
    const frecInput = document.createElement('input');
    frecInput.type = 'text';
    frecInput.className = 'view-historia-clinica__prescripcion-frecuencia-input';
    frecLabel.appendChild(frecInput);
    form.appendChild(frecLabel);

    const fechaInicioLabel = document.createElement('label');
    fechaInicioLabel.textContent = 'Fecha inicio';
    const fechaInicioInput = document.createElement('input');
    fechaInicioInput.type = 'date';
    fechaInicioInput.className = 'view-historia-clinica__prescripcion-fechainicio-input';
    fechaInicioInput.value = new Date().toISOString().slice(0, 10);
    fechaInicioLabel.appendChild(fechaInicioInput);
    form.appendChild(fechaInicioLabel);

    const fechaFinLabel = document.createElement('label');
    fechaFinLabel.textContent = 'Fecha fin (opcional)';
    const fechaFinInput = document.createElement('input');
    fechaFinInput.type = 'date';
    fechaFinInput.className = 'view-historia-clinica__prescripcion-fechafin-input';
    fechaFinLabel.appendChild(fechaFinInput);
    form.appendChild(fechaFinLabel);

    const formError = document.createElement('div');
    formError.className = 'view-historia-clinica__prescripcion-form-error';
    formError.hidden = true;
    form.appendChild(formError);

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'button button--primary';
    saveButton.textContent = 'Guardar prescripción';
    form.appendChild(saveButton);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      formError.hidden = true;

      const medicamento = medInput.value.trim();
      const dosis = dosisInput.value.trim();
      const frecuencia = frecInput.value.trim();
      const fechaInicio = fechaInicioInput.value;
      if (!medicamento || !dosis || !frecuencia || !fechaInicio) {
        formError.textContent = 'medicamento, dosis, frecuencia y fechaInicio son requeridos';
        formError.hidden = false;
        return;
      }

      const result = await apiPost({
        accion: 'crearPrescripcion',
        token: ctx.session.token,
        codigo: paciente.codigo,
        medicamento,
        dosis,
        frecuencia,
        fechaInicio,
        fechaFin: fechaFinInput.value,
      });

      if (result.error) {
        if (handleAuthError(result)) return;
        formError.textContent = result.error;
        formError.hidden = false;
        return;
      }

      prescripciones.unshift(result.prescripcion);
      renderListaPrescripciones();

      medInput.value = '';
      dosisInput.value = '';
      frecInput.value = '';
      fechaInicioInput.value = new Date().toISOString().slice(0, 10);
      fechaFinInput.value = '';
    });

    section.appendChild(form);
    fichaContainer.appendChild(section);
  }

```

- [ ] **Step 4: Run historia-clinica tests**

```
npx vitest run tests/portal/views/historia-clinica.test.js
```

Expected: 15/15 PASS

- [ ] **Step 5: Run full suite**

```
npx vitest run
```

Expected: 28 files, 363 tests, 0 failures

- [ ] **Step 6: Commit**

```
git add src/portal/views/historia-clinica.js tests/portal/views/historia-clinica.test.js
git commit -m "feat: add Prescripciones section to Historia Clinica view"
```

---

### Task 4: Final verification + finish branch

- [ ] **Step 1: Run full test suite**

```
npx vitest run
```

Expected: **28 files, 363 tests, 0 failures**

- [ ] **Step 2: Invoke `superpowers:finishing-a-development-branch`**

Use the finishing-a-development-branch skill to present completion options to the user.
