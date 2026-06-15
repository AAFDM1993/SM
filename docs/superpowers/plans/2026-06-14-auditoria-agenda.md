# Auditoría general de mutadores de Agenda/Horario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 6 successful Fase 1a mutators (`crearCita`, `cambiarEstadoCita`, `cancelarMiCita`, `actualizarHorarioConfig`, `crearBloqueo`, `eliminarBloqueo`) write an entry to `_log` via `registrarLog`, closing the audit-logging backlog item from Fase 1a.

**Architecture:** Each mutator calls `registrarLog(services, user.codigo, user.rol, accion, detalle)` right before its final `return { ok: true, ... }`, following the existing `cambio_password`/`calendario_error` pattern (`backend/src/log.js`). `actualizarHorarioConfig` and `eliminarBloqueo` (both in `backend/src/horario.js`) gain a `user` parameter threaded from `backend/src/router.js`, since they don't currently receive it. `crearBloqueo` already receives `user`.

**Tech Stack:** Vanilla JS (Google Apps Script backend), Vitest for tests, in-memory mocked sheets (`_log`, `_citas`, `_bloqueos`, `_horario_config`) via `createMockServices` (`backend/mocks/gas-services.js`).

**Reference spec:** `docs/superpowers/specs/2026-06-14-auditoria-agenda-design.md`

---

### Task 1: `crearCita` logs `cita_creada`

**Files:**
- Modify: `backend/src/agenda.js:171-178`
- Test: `backend/tests/agenda.test.js` (in `describe('crearCita', ...)`, after line 194)

- [ ] **Step 1: Write the failing test**

In `backend/tests/agenda.test.js`, inside `describe('crearCita', () => { ... })`, insert this new test right after the existing `it('permite reservar un slot cuya cita previa fue Cancelada', ...)` test (which ends at line 194), and before the describe block's closing `});` (line 195):

```js
  it('registra cita_creada en _log', () => {
    const services = buildServices({
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC001' }, USER_RECEPCION, services);
    expect(result.ok).toBe(true);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'cita_creada');
    expect(logEntry).toBeDefined();
    expect(logEntry[1]).toBe('REC001');
    expect(logEntry[2]).toBe('recepcion');
    expect(logEntry[4]).toBe(`${result.cita.id} paciente=PAC001 2026-06-15 09:00`);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run backend/tests/agenda.test.js`
Expected: FAIL — only the new "registra cita_creada en _log" test fails, with `logEntry` being `undefined` (`expect(logEntry).toBeDefined()` fails). All other tests in the file still pass.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/agenda.js`, `crearCita` currently ends with (lines 171-178):

```js
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CITAS);
  sheet.appendRow([id, fecha, horaInicio, horaFin, pacienteCodigo, 'Programada', user.codigo, ahora, ahora, calendarEventId]);

  return {
    ok: true,
    cita: { id, fecha, horaInicio, horaFin, pacienteCodigo, pacienteNombre: paciente.nombre, estado: 'Programada' },
  };
}
```

Add a `registrarLog` call after `appendRow` and before `return`:

```js
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CITAS);
  sheet.appendRow([id, fecha, horaInicio, horaFin, pacienteCodigo, 'Programada', user.codigo, ahora, ahora, calendarEventId]);

  registrarLog(services, user.codigo, user.rol, 'cita_creada', `${id} paciente=${pacienteCodigo} ${fecha} ${horaInicio}`);

  return {
    ok: true,
    cita: { id, fecha, horaInicio, horaFin, pacienteCodigo, pacienteNombre: paciente.nombre, estado: 'Programada' },
  };
}
```

(`registrarLog` is already imported in `agenda.js` from Fase 1b — no new import needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/tests/agenda.test.js`
Expected: PASS — all tests in the file pass, including "registra cita_creada en _log".

- [ ] **Step 5: Commit**

```bash
git add backend/src/agenda.js backend/tests/agenda.test.js
git commit -m "feat(agenda): log cita_creada on crearCita"
```

---

### Task 2: `cambiarEstadoCita` logs `cita_completada` / `cita_cancelada`

**Files:**
- Modify: `backend/src/agenda.js:194-208`
- Test: `backend/tests/agenda.test.js` (in `describe('cambiarEstadoCita', ...)`, after line 258)

- [ ] **Step 1: Write the failing test**

In `backend/tests/agenda.test.js`, inside `describe('cambiarEstadoCita', () => { ... })`, insert these two new tests right after the existing `it('marca una cita Programada como Cancelada', ...)` test (which ends at line 258), and before `it('rechaza un estado invalido', ...)` (line 260):

```js
  it('registra cita_completada en _log', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
    });
    cambiarEstadoCita({ citaId: 'c1', estado: 'Completada' }, USER_RECEPCION, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'cita_completada');
    expect(logEntry).toBeDefined();
    expect(logEntry[1]).toBe('REC001');
    expect(logEntry[2]).toBe('recepcion');
    expect(logEntry[4]).toBe('c1');
  });

  it('registra cita_cancelada en _log', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
    });
    cambiarEstadoCita({ citaId: 'c1', estado: 'Cancelada' }, USER_RECEPCION, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'cita_cancelada');
    expect(logEntry).toBeDefined();
    expect(logEntry[1]).toBe('REC001');
    expect(logEntry[2]).toBe('recepcion');
    expect(logEntry[4]).toBe('c1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run backend/tests/agenda.test.js`
Expected: FAIL — the two new tests fail (`logEntry` is `undefined` in both). All other tests still pass.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/agenda.js`, `cambiarEstadoCita` currently ends with (lines 198-208):

```js
  if (estado === 'Cancelada') {
    try {
      eliminarEventoCita(cita.calendarEventId, services);
    } catch (e) {
      registrarLog(services, user.codigo, user.rol, 'calendario_error', `cambiarEstadoCita ${citaId}: ${e.message}`);
    }
    sheet.getRange(cita._fila, 10, 1, 1).setValue('');
  }

  return { ok: true };
}
```

Add a `registrarLog` call after the `if (estado === 'Cancelada')` block and before `return`:

```js
  if (estado === 'Cancelada') {
    try {
      eliminarEventoCita(cita.calendarEventId, services);
    } catch (e) {
      registrarLog(services, user.codigo, user.rol, 'calendario_error', `cambiarEstadoCita ${citaId}: ${e.message}`);
    }
    sheet.getRange(cita._fila, 10, 1, 1).setValue('');
  }

  registrarLog(services, user.codigo, user.rol, estado === 'Cancelada' ? 'cita_cancelada' : 'cita_completada', citaId);

  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/tests/agenda.test.js`
Expected: PASS — all tests in the file pass, including "registra cita_completada en _log" and "registra cita_cancelada en _log".

- [ ] **Step 5: Commit**

```bash
git add backend/src/agenda.js backend/tests/agenda.test.js
git commit -m "feat(agenda): log cita_completada/cita_cancelada on cambiarEstadoCita"
```

---

### Task 3: `cancelarMiCita` logs `cita_cancelada`

**Files:**
- Modify: `backend/src/agenda.js:249-261`
- Test: `backend/tests/agenda.test.js` (in `describe('cancelarMiCita', ...)`, after line 381)

- [ ] **Step 1: Write the failing test**

In `backend/tests/agenda.test.js`, inside `describe('cancelarMiCita', () => { ... })`, insert this new test right after the existing `it('cancela una cita Programada propia y libera el slot', ...)` test (which ends at line 381), and before `it('rechaza si la cita no existe', ...)` (line 383):

```js
  it('registra cita_cancelada en _log', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-18', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
    });
    cancelarMiCita({ citaId: 'c1' }, USER_PACIENTE, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'cita_cancelada');
    expect(logEntry).toBeDefined();
    expect(logEntry[1]).toBe('PAC001');
    expect(logEntry[2]).toBe('usuario');
    expect(logEntry[4]).toBe('c1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run backend/tests/agenda.test.js`
Expected: FAIL — the new "registra cita_cancelada en _log" test fails (`logEntry` is `undefined`). All other tests still pass.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/agenda.js`, `cancelarMiCita` currently ends with (lines 249-261):

```js
  sheet.getRange(cita._fila, 6, 1, 1).setValue('Cancelada');
  sheet.getRange(cita._fila, 9, 1, 1).setValue(new Date());

  try {
    eliminarEventoCita(cita.calendarEventId, services);
  } catch (e) {
    registrarLog(services, user.codigo, user.rol, 'calendario_error', `cancelarMiCita ${citaId}: ${e.message}`);
  }
  sheet.getRange(cita._fila, 10, 1, 1).setValue('');

  return { ok: true };
}
```

Add a `registrarLog` call after the calendar try/catch and before `return`:

```js
  sheet.getRange(cita._fila, 6, 1, 1).setValue('Cancelada');
  sheet.getRange(cita._fila, 9, 1, 1).setValue(new Date());

  try {
    eliminarEventoCita(cita.calendarEventId, services);
  } catch (e) {
    registrarLog(services, user.codigo, user.rol, 'calendario_error', `cancelarMiCita ${citaId}: ${e.message}`);
  }
  sheet.getRange(cita._fila, 10, 1, 1).setValue('');

  registrarLog(services, user.codigo, user.rol, 'cita_cancelada', citaId);

  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/tests/agenda.test.js`
Expected: PASS — all tests in the file pass, including "registra cita_cancelada en _log" (new in `cancelarMiCita` describe block).

- [ ] **Step 5: Commit**

```bash
git add backend/src/agenda.js backend/tests/agenda.test.js
git commit -m "feat(agenda): log cita_cancelada on cancelarMiCita"
```

---

### Task 4: `actualizarHorarioConfig` receives `user` and logs `horario_actualizado`

**Files:**
- Modify: `backend/src/horario.js:1-5,43-71`
- Modify: `backend/src/router.js` (`case 'actualizarHorarioConfig'`)
- Test: `backend/tests/horario.test.js`

- [ ] **Step 1: Write the failing test**

In `backend/tests/horario.test.js`:

1. Add a `LOG_HEADER` constant next to the other header constants (after line 8, `USUARIOS_HEADER`):

```js
const HORARIO_HEADER = ['diaSemana', 'activo', 'horaInicio', 'horaFin', 'duracionSlotMin'];
const BLOQUEOS_HEADER = ['id', 'fechaInicio', 'fechaFin', 'motivo', 'creadoPor', 'fechaCreacion'];
const CITAS_HEADER = ['id', 'fecha', 'horaInicio', 'horaFin', 'pacienteCodigo', 'estado', 'creadoPor', 'fechaCreacion', 'fechaActualizacion'];
const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];
```

2. Add `_log: [LOG_HEADER]` to `buildServices` (lines 20-29):

```js
function buildServices({ horario = [], bloqueos = [], citas = [], usuarios = [] } = {}) {
  return createMockServices({
    sheets: {
      _horario_config: [HORARIO_HEADER, ...horario],
      _bloqueos: [BLOQUEOS_HEADER, ...bloqueos],
      _citas: [CITAS_HEADER, ...citas],
      _usuarios: [USUARIOS_HEADER, ...usuarios],
      _log: [LOG_HEADER],
    },
  });
}
```

3. In `describe('actualizarHorarioConfig', ...)`, update the 5 existing calls to `actualizarHorarioConfig({ horario }, services)` to pass `ADMIN` as the second argument (the `ADMIN` constant is already defined later in this file, at what is currently line 123 — referencing it here is valid since `it` callbacks run after the whole module is evaluated):

Line 89: `expect(actualizarHorarioConfig({ horario }, services)).toEqual({ ok: true });`
→ `expect(actualizarHorarioConfig({ horario }, ADMIN, services)).toEqual({ ok: true });`

Line 98: `expect(actualizarHorarioConfig({ horario }, services)).toEqual({ error: 'Se requieren las 7 filas de horario' });`
→ `expect(actualizarHorarioConfig({ horario }, ADMIN, services)).toEqual({ error: 'Se requieren las 7 filas de horario' });`

Line 105: `expect(actualizarHorarioConfig({ horario }, services)).toEqual({ error: 'horaInicio debe ser menor que horaFin (Lunes)' });`
→ `expect(actualizarHorarioConfig({ horario }, ADMIN, services)).toEqual({ error: 'horaInicio debe ser menor que horaFin (Lunes)' });`

Line 112: `expect(actualizarHorarioConfig({ horario }, services)).toEqual({ error: 'duracionSlotMin debe ser mayor que 0 (Martes)' });`
→ `expect(actualizarHorarioConfig({ horario }, ADMIN, services)).toEqual({ error: 'duracionSlotMin debe ser mayor que 0 (Martes)' });`

Line 119: `expect(actualizarHorarioConfig({ horario }, services)).toEqual({ ok: true });`
→ `expect(actualizarHorarioConfig({ horario }, ADMIN, services)).toEqual({ ok: true });`

4. Add a new test at the end of `describe('actualizarHorarioConfig', ...)`, after the `it('no valida horas ni duracion de un dia inactivo', ...)` test (which ends at line 120) and before the describe block's closing `});` (line 121):

```js
  it('registra horario_actualizado en _log', () => {
    const services = buildServices({ horario: HORARIO_LABORAL });
    const horario = horarioValido();

    actualizarHorarioConfig({ horario }, ADMIN, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'horario_actualizado');
    expect(logEntry).toBeDefined();
    expect(logEntry[1]).toBe('ADM001');
    expect(logEntry[2]).toBe('administrador');
    expect(logEntry[4]).toBe('');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run backend/tests/horario.test.js`
Expected: FAIL — 3 tests in `describe('actualizarHorarioConfig', ...)` fail with a TypeError (`Cannot read properties of undefined (reading 'getActiveSpreadsheet')`):
- `'guarda las 7 filas y leerHorarioConfig las refleja'`
- `'no valida horas ni duracion de un dia inactivo'`
- `'registra horario_actualizado en _log'` (new)

These three reach the sheet-writing code, where `services` (now actually `ADMIN`, since the function still has signature `(b, services)` and receives 3 arguments) has no `SpreadsheetApp`. The other 3 validation tests (`'rechaza si no se envian las 7 filas'`, `'rechaza si horaInicio >= horaFin...'`, `'rechaza si duracionSlotMin no es mayor que 0...'`) still pass because they return early without touching `services`. All other describe blocks in the file still pass.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/horario.js`, add the `registrarLog` import (line 1):

```js
import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';
```

Then change `actualizarHorarioConfig` (lines 43-71) from:

```js
export function actualizarHorarioConfig(b, services) {
  const horario = b && b.horario;
  if (!Array.isArray(horario) || horario.length !== 7) {
    return { error: 'Se requieren las 7 filas de horario' };
  }

  for (const fila of horario) {
    const activo = fila.activo === true || String(fila.activo).toUpperCase() === 'TRUE';
    if (!activo) continue;
    if (!(String(fila.horaInicio) < String(fila.horaFin))) {
      return { error: `horaInicio debe ser menor que horaFin (${fila.diaSemana})` };
    }
    const duracion = Number(fila.duracionSlotMin);
    if (!(Number.isInteger(duracion) && duracion > 0)) {
      return { error: `duracionSlotMin debe ser mayor que 0 (${fila.diaSemana})` };
    }
  }

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_HORARIO_CONFIG);
  const values = horario.map((fila) => [
    String(fila.diaSemana),
    fila.activo === true || String(fila.activo).toUpperCase() === 'TRUE',
    String(fila.horaInicio),
    String(fila.horaFin),
    Number(fila.duracionSlotMin),
  ]);
  sheet.getRange(2, 1, 7, 5).setValues(values);
  return { ok: true };
}
```

to:

```js
export function actualizarHorarioConfig(b, user, services) {
  const horario = b && b.horario;
  if (!Array.isArray(horario) || horario.length !== 7) {
    return { error: 'Se requieren las 7 filas de horario' };
  }

  for (const fila of horario) {
    const activo = fila.activo === true || String(fila.activo).toUpperCase() === 'TRUE';
    if (!activo) continue;
    if (!(String(fila.horaInicio) < String(fila.horaFin))) {
      return { error: `horaInicio debe ser menor que horaFin (${fila.diaSemana})` };
    }
    const duracion = Number(fila.duracionSlotMin);
    if (!(Number.isInteger(duracion) && duracion > 0)) {
      return { error: `duracionSlotMin debe ser mayor que 0 (${fila.diaSemana})` };
    }
  }

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_HORARIO_CONFIG);
  const values = horario.map((fila) => [
    String(fila.diaSemana),
    fila.activo === true || String(fila.activo).toUpperCase() === 'TRUE',
    String(fila.horaInicio),
    String(fila.horaFin),
    Number(fila.duracionSlotMin),
  ]);
  sheet.getRange(2, 1, 7, 5).setValues(values);

  registrarLog(services, user.codigo, user.rol, 'horario_actualizado', '');

  return { ok: true };
}
```

Finally, in `backend/src/router.js`, update `case 'actualizarHorarioConfig'` from:

```js
    case 'actualizarHorarioConfig':
      return json_(
        requireAuthBody(b.token, ROLES_HORARIO, () => actualizarHorarioConfig(b, services), services),
        services
      );
```

to:

```js
    case 'actualizarHorarioConfig':
      return json_(
        requireAuthBody(b.token, ROLES_HORARIO, (user) => actualizarHorarioConfig(b, user, services), services),
        services
      );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/tests/horario.test.js`
Expected: PASS — all tests in the file pass, including "registra horario_actualizado en _log".

Then run: `npx vitest run backend/tests/router.test.js`
Expected: PASS — `'actualizarHorarioConfig requiere rol administrador o psiquiatra'` and `'actualizarHorarioConfig guarda el horario para administrador'` both still pass unchanged (they only assert on the HTTP response body, and `buildServicesWithUser` already includes `_log: [LOG_HEADER]`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/horario.js backend/src/router.js backend/tests/horario.test.js
git commit -m "feat(horario): pass user to actualizarHorarioConfig and log horario_actualizado"
```

---

### Task 5: `crearBloqueo` logs `bloqueo_creado`

**Files:**
- Modify: `backend/src/horario.js:106-111`
- Test: `backend/tests/horario.test.js` (in `describe('crearBloqueo', ...)`, after line 133)

- [ ] **Step 1: Write the failing test**

In `backend/tests/horario.test.js`, inside `describe('crearBloqueo', () => { ... })`, insert this new test right after the existing `it('crea un bloqueo cuando no hay citas afectadas', ...)` test (which ends at line 133), and before `it('rechaza si fechaInicio es posterior a fechaFin', ...)` (line 135):

```js
  it('registra bloqueo_creado en _log', () => {
    const services = buildServices({});
    const result = crearBloqueo({ fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' }, ADMIN, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'bloqueo_creado');
    expect(logEntry).toBeDefined();
    expect(logEntry[1]).toBe('ADM001');
    expect(logEntry[2]).toBe('administrador');
    expect(logEntry[4]).toBe(`${result.bloqueo.id} 2026-07-01 a 2026-07-15`);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run backend/tests/horario.test.js`
Expected: FAIL — the new "registra bloqueo_creado en _log" test fails (`logEntry` is `undefined`). All other tests in the file still pass.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/horario.js`, `crearBloqueo` currently ends with (lines 106-111):

```js
  const id = services.Utilities.getUuid();
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BLOQUEOS);
  sheet.appendRow([id, fechaInicio, fechaFin, motivo, user.codigo, new Date()]);

  return { ok: true, bloqueo: { id, fechaInicio, fechaFin, motivo } };
}
```

Add a `registrarLog` call after `appendRow` and before `return`:

```js
  const id = services.Utilities.getUuid();
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BLOQUEOS);
  sheet.appendRow([id, fechaInicio, fechaFin, motivo, user.codigo, new Date()]);

  registrarLog(services, user.codigo, user.rol, 'bloqueo_creado', `${id} ${fechaInicio} a ${fechaFin}`);

  return { ok: true, bloqueo: { id, fechaInicio, fechaFin, motivo } };
}
```

(`registrarLog` is already imported in `horario.js` from Task 4 — no new import needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/tests/horario.test.js`
Expected: PASS — all tests in the file pass, including "registra bloqueo_creado en _log".

- [ ] **Step 5: Commit**

```bash
git add backend/src/horario.js backend/tests/horario.test.js
git commit -m "feat(horario): log bloqueo_creado on crearBloqueo"
```

---

### Task 6: `eliminarBloqueo` receives `user` and logs `bloqueo_eliminado`

**Files:**
- Modify: `backend/src/horario.js:113-127`
- Modify: `backend/src/router.js` (`case 'eliminarBloqueo'`)
- Test: `backend/tests/horario.test.js` (in `describe('eliminarBloqueo', ...)`)

- [ ] **Step 1: Write the failing test**

In `backend/tests/horario.test.js`, inside `describe('eliminarBloqueo', () => { ... })`:

1. Update the 2 existing calls to pass `ADMIN` as the second argument:

Line 180: `expect(eliminarBloqueo({ bloqueoId: 'b1' }, services)).toEqual({ ok: true });`
→ `expect(eliminarBloqueo({ bloqueoId: 'b1' }, ADMIN, services)).toEqual({ ok: true });`

Line 186: `expect(eliminarBloqueo({ bloqueoId: 'inexistente' }, services)).toEqual({ error: 'Bloqueo no encontrado' });`
→ `expect(eliminarBloqueo({ bloqueoId: 'inexistente' }, ADMIN, services)).toEqual({ error: 'Bloqueo no encontrado' });`

2. Add a new test after the existing `it('devuelve error si el bloqueo no existe', ...)` test (which ends at line 187), and before the describe block's closing `});` (line 188):

```js
  it('registra bloqueo_eliminado en _log', () => {
    const services = buildServices({
      bloqueos: [['b1', '2026-07-01', '2026-07-15', 'Vacaciones', 'ADM001', new Date()]],
    });
    eliminarBloqueo({ bloqueoId: 'b1' }, ADMIN, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'bloqueo_eliminado');
    expect(logEntry).toBeDefined();
    expect(logEntry[1]).toBe('ADM001');
    expect(logEntry[2]).toBe('administrador');
    expect(logEntry[4]).toBe('b1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run backend/tests/horario.test.js`
Expected: FAIL — all 3 tests in `describe('eliminarBloqueo', ...)` fail with a TypeError (`Cannot read properties of undefined (reading 'getActiveSpreadsheet')`), because `eliminarBloqueo` still has signature `(b, services)`, reads `services.SpreadsheetApp` on its very first line, and now receives `ADMIN` as its 2nd argument. All other describe blocks in the file still pass.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/horario.js`, change `eliminarBloqueo` (lines 113-127) from:

```js
export function eliminarBloqueo(b, services) {
  const bloqueoId = String(b.bloqueoId || '');
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BLOQUEOS);
  if (!sheet) return { error: 'Bloqueo no encontrado' };
  const last = sheet.getLastRow();
  if (last < 2) return { error: 'Bloqueo no encontrado' };
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === bloqueoId) {
      sheet.deleteRow(i + 2);
      return { ok: true };
    }
  }
  return { error: 'Bloqueo no encontrado' };
}
```

to:

```js
export function eliminarBloqueo(b, user, services) {
  const bloqueoId = String(b.bloqueoId || '');
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BLOQUEOS);
  if (!sheet) return { error: 'Bloqueo no encontrado' };
  const last = sheet.getLastRow();
  if (last < 2) return { error: 'Bloqueo no encontrado' };
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === bloqueoId) {
      sheet.deleteRow(i + 2);
      registrarLog(services, user.codigo, user.rol, 'bloqueo_eliminado', bloqueoId);
      return { ok: true };
    }
  }
  return { error: 'Bloqueo no encontrado' };
}
```

Finally, in `backend/src/router.js`, update `case 'eliminarBloqueo'` from:

```js
    case 'eliminarBloqueo':
      return json_(
        requireAuthBody(b.token, ROLES_HORARIO, () => eliminarBloqueo(b, services), services),
        services
      );
```

to:

```js
    case 'eliminarBloqueo':
      return json_(
        requireAuthBody(b.token, ROLES_HORARIO, (user) => eliminarBloqueo(b, user, services), services),
        services
      );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run backend/tests/horario.test.js`
Expected: PASS — all tests in the file pass, including "registra bloqueo_eliminado en _log".

Then run: `npx vitest run backend/tests/router.test.js`
Expected: PASS — `'eliminarBloqueo requiere rol administrador o psiquiatra'` and `'eliminarBloqueo elimina un bloqueo para administrador'` both still pass unchanged.

Finally run the full suite: `npx vitest run`
Expected: PASS — 261 tests across 23 files, 0 failures (254 existing + 7 new: 1 from Task 1, 2 from Task 2, 1 from Task 3, 1 from Task 4, 1 from Task 5, 1 from Task 6).

- [ ] **Step 5: Commit**

```bash
git add backend/src/horario.js backend/src/router.js backend/tests/horario.test.js
git commit -m "feat(horario): pass user to eliminarBloqueo and log bloqueo_eliminado"
```
