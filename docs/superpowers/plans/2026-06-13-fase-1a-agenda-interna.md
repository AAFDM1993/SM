# Fase 1a: Agenda Interna Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the internal scheduling system (weekly grid agenda, configurable weekly working-hours schedule, date-range blockouts, and the patient-facing "Mi agenda" view) for SMPDJM, fully self-contained within Sheets and the existing GAS backend.

**Architecture:** Two new backend modules (`agenda.js`, `horario.js`) expose 11 new actions wired into the existing `router.js` via `requireAuth`/`requireAuthBody`, following the exact pattern used for `usuarios.js`. `usuarios.js` gains a `listarPacientes` helper. Three new frontend views (`agenda.js`, `agenda-horario.js`, `mi-agenda.js`) follow the existing view pattern (synchronous DOM construction + async `apiGet`/`apiPost` loaders, error handling via `handleAuthError`) and are wired into `dashboard.js`'s `MENUS`/`VIEWS`.

**Tech Stack:** Google Apps Script (backend, bundled via existing `backend/build.js`), Vitest + `backend/mocks/gas-services.js` for backend tests, vanilla JS + Vite for the portal frontend, Vitest + jsdom for frontend tests.

---

## Contexto del modelo de datos (resumen del spec §2, para referencia rápida)

Tres hojas nuevas en el spreadsheet, **creadas manualmente por el usuario**
(igual que `_usuarios`/`_log` en Fase 0 — ningún task de este plan crea hojas
por código). Todas las fechas/horas se guardan y manipulan como **strings**
(`YYYY-MM-DD`, `HH:MM`), nunca como objetos `Date` de Sheets.

### `_horario_config` — exactamente 7 filas de datos, una por día, en este orden fijo

| Col | Campo | Tipo |
|---|---|---|
| 1 | `diaSemana` | `'Lunes'\|'Martes'\|'Miercoles'\|'Jueves'\|'Viernes'\|'Sabado'\|'Domingo'` (sin tildes) |
| 2 | `activo` | boolean (`TRUE`/`FALSE` en la hoja) |
| 3 | `horaInicio` | string `HH:MM` (24h) |
| 4 | `horaFin` | string `HH:MM` (24h) |
| 5 | `duracionSlotMin` | integer (minutos) |

```js
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
```

Este orden se usa en todo el código para indexar filas de horario y construir
las columnas de la cuadrícula semanal.

### `_bloqueos` — empieza vacía, una fila por bloqueo

| Col | Campo | Tipo |
|---|---|---|
| 1 | `id` | `services.Utilities.getUuid()` (UUID completo, **con guiones**) |
| 2 | `fechaInicio` | string `YYYY-MM-DD` |
| 3 | `fechaFin` | string `YYYY-MM-DD`, `>= fechaInicio` |
| 4 | `motivo` | string, puede ser `''` |
| 5 | `creadoPor` | `codigo` del usuario que creó el bloqueo |
| 6 | `fechaCreacion` | `new Date()` |

### `_citas` — empieza vacía, una fila por cita

| Col | Campo | Tipo |
|---|---|---|
| 1 | `id` | `services.Utilities.getUuid()` |
| 2 | `fecha` | string `YYYY-MM-DD` |
| 3 | `horaInicio` | string `HH:MM` |
| 4 | `horaFin` | string `HH:MM`, calculado al crear la cita (`horaInicio` + `duracionSlotMin` del día configurado) |
| 5 | `pacienteCodigo` | `codigo` de un usuario con `rol='usuario'` |
| 6 | `estado` | `'Programada'\|'Cancelada'\|'Completada'` |
| 7 | `creadoPor` | `codigo` del usuario (`administrador`/`psiquiatra`/`recepcion`) que creó la cita |
| 8 | `fechaCreacion` | `new Date()` |
| 9 | `fechaActualizacion` | `new Date()`, actualizado en cada cambio de `estado` |

### Enum de `estado` de un slot en `leerAgenda` (distinto del `estado` de `_citas`)

`'disponible' | 'ocupado' | 'bloqueado'` — ver sección 4 del spec y Task 5.

### IDs y UUIDs

`services.Utilities.getUuid()` devuelve un UUID **con guiones** (mockeado vía
`randomUUID()` de `node:crypto`, p. ej. `'a1b2c3d4-e5f6-...'`). Se usa
directamente como `id` de `_bloqueos`/`_citas`. **No** aplicar
`.replace(/-/g, '')` — eso es específico de `generarSalt` en `hash.js` para
salts de password, no para IDs de entidades.

---

## Estructura de archivos

```
backend/
  src/
    agenda.js              # NUEVO — leerAgenda, crearCita, cambiarEstadoCita, leerMiAgenda, cancelarMiCita + helpers de slots/fechas
    horario.js             # NUEVO — leerHorarioConfig, actualizarHorarioConfig, leerBloqueos, crearBloqueo, eliminarBloqueo
    usuarios.js            # MODIFICADO — + listarPacientes
    router.js               # MODIFICADO — + 11 acciones nuevas
  tests/
    agenda.test.js          # NUEVO
    horario.test.js         # NUEVO
    usuarios.test.js         # MODIFICADO
    router.test.js           # MODIFICADO

src/portal/
  dashboard.js              # MODIFICADO — MENUS habilitados + VIEWS nuevas
  views/
    agenda.js               # NUEVO — cuadrícula semanal (administrador/psiquiatra/recepcion)
    agenda-horario.js        # NUEVO — panel "Configurar horario" (horario semanal + bloqueos)
    mi-agenda.js             # NUEVO — vista paciente (usuario)

tests/portal/
  dashboard.test.js          # MODIFICADO
  views/
    agenda.test.js           # NUEVO
    agenda-horario.test.js    # NUEVO
    mi-agenda.test.js         # NUEVO
```

Orden de implementación: backend completo primero (Tasks 1-9, terminando con
el wiring del router), luego frontend (Tasks 10-16). Cada acción del backend
queda probada de extremo a extremo (incluyendo gating por rol vía
`requireAuth`/`requireAuthBody`) antes de que el frontend la consuma.

---

## Task 1: `listarPacientes` (`backend/src/usuarios.js`)

**Files:**
- Modify: `backend/src/usuarios.js`
- Test: `backend/tests/usuarios.test.js`

- [ ] **Step 1: Write the failing test**

En `backend/tests/usuarios.test.js`, cambia la línea 4 (el import) para incluir
`listarPacientes`:

```js
import { findUser, listarUsuarios, guardarUsuario, eliminarUsuario, listarPacientes } from '../src/usuarios.js';
```

Y agrega este bloque `describe` al final del archivo (después del `describe('eliminarUsuario', ...)`):

```js
describe('listarPacientes', () => {
  it('lista solo codigo y nombre de usuarios con rol usuario', () => {
    const services = buildServices([
      ['ABC123', 'hash1', 'salt1', 'administrador', 'Ana'],
      ['XYZ987', 'hash2', 'salt2', 'usuario', 'Beto'],
      ['DEF456', 'hash3', 'salt3', 'usuario', 'Carla'],
    ]);
    expect(listarPacientes(services)).toEqual({
      ok: true,
      pacientes: [
        { codigo: 'XYZ987', nombre: 'Beto' },
        { codigo: 'DEF456', nombre: 'Carla' },
      ],
    });
  });

  it('devuelve lista vacia si no hay pacientes', () => {
    const services = buildServices([
      ['ABC123', 'hash1', 'salt1', 'administrador', 'Ana'],
    ]);
    expect(listarPacientes(services)).toEqual({ ok: true, pacientes: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/usuarios.test.js`
Expected: FAIL — `listarPacientes` is not exported from `../src/usuarios.js` (TypeError: listarPacientes is not a function).

- [ ] **Step 3: Implement `listarPacientes`**

En `backend/src/usuarios.js`, agrega esta función exportada al final del archivo:

```js
export function listarPacientes(services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  if (!sheet) return { ok: true, pacientes: [] };
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true, pacientes: [] };
  const rows = sheet.getRange(2, 1, last - 1, 5).getValues();
  const pacientes = rows
    .filter((r) => String(r[0]).trim() !== '' && String(r[3]).trim().toLowerCase() === 'usuario')
    .map((r) => ({ codigo: String(r[0]).trim(), nombre: String(r[4]) }));
  return { ok: true, pacientes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/tests/usuarios.test.js`
Expected: PASS (14 tests — 12 existentes + 2 nuevas).

- [ ] **Step 5: Commit**

```bash
git add backend/src/usuarios.js backend/tests/usuarios.test.js
git commit -m "feat(backend): add listarPacientes for patient lookup in agenda"
```

---

## Task 2: `horario.js` — `leerHorarioConfig` y `leerBloqueos`

**Files:**
- Create: `backend/src/horario.js`
- Test: `backend/tests/horario.test.js`

- [ ] **Step 1: Write the failing test**

Crea `backend/tests/horario.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { leerHorarioConfig, leerBloqueos } from '../src/horario.js';

const HORARIO_HEADER = ['diaSemana', 'activo', 'horaInicio', 'horaFin', 'duracionSlotMin'];
const BLOQUEOS_HEADER = ['id', 'fechaInicio', 'fechaFin', 'motivo', 'creadoPor', 'fechaCreacion'];

const HORARIO_LABORAL = [
  ['Lunes', true, '09:00', '18:00', 45],
  ['Martes', true, '09:00', '18:00', 45],
  ['Miercoles', true, '09:00', '18:00', 45],
  ['Jueves', true, '09:00', '18:00', 45],
  ['Viernes', true, '09:00', '18:00', 45],
  ['Sabado', false, '09:00', '13:00', 45],
  ['Domingo', false, '09:00', '13:00', 45],
];

function buildServices({ horario = [], bloqueos = [] } = {}) {
  return createMockServices({
    sheets: {
      _horario_config: [HORARIO_HEADER, ...horario],
      _bloqueos: [BLOQUEOS_HEADER, ...bloqueos],
    },
  });
}

describe('leerHorarioConfig', () => {
  it('lee las 7 filas de horario', () => {
    const services = buildServices({ horario: HORARIO_LABORAL });
    expect(leerHorarioConfig(services)).toEqual({
      ok: true,
      horario: [
        { diaSemana: 'Lunes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Martes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Miercoles', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Jueves', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Viernes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Sabado', activo: false, horaInicio: '09:00', horaFin: '13:00', duracionSlotMin: 45 },
        { diaSemana: 'Domingo', activo: false, horaInicio: '09:00', horaFin: '13:00', duracionSlotMin: 45 },
      ],
    });
  });

  it('devuelve lista vacia si la hoja no tiene filas de datos', () => {
    const services = buildServices();
    expect(leerHorarioConfig(services)).toEqual({ ok: true, horario: [] });
  });
});

describe('leerBloqueos', () => {
  it('lee los bloqueos ordenados por fechaInicio', () => {
    const services = buildServices({
      bloqueos: [
        ['b2', '2026-08-01', '2026-08-10', 'Curso', 'ADM001', new Date()],
        ['b1', '2026-07-01', '2026-07-15', 'Vacaciones', 'ADM001', new Date()],
      ],
    });
    expect(leerBloqueos(services)).toEqual({
      ok: true,
      bloqueos: [
        { id: 'b1', fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' },
        { id: 'b2', fechaInicio: '2026-08-01', fechaFin: '2026-08-10', motivo: 'Curso' },
      ],
    });
  });

  it('devuelve lista vacia si no hay bloqueos', () => {
    const services = buildServices();
    expect(leerBloqueos(services)).toEqual({ ok: true, bloqueos: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/horario.test.js`
Expected: FAIL — Cannot find module `../src/horario.js`.

- [ ] **Step 3: Implement `leerHorarioConfig` and `leerBloqueos`**

Crea `backend/src/horario.js`:

```js
const SHEET_HORARIO_CONFIG = '_horario_config';
const SHEET_BLOQUEOS = '_bloqueos';

export function leerHorarioConfig(services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_HORARIO_CONFIG);
  if (!sheet) return { ok: true, horario: [] };
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true, horario: [] };
  const rows = sheet.getRange(2, 1, last - 1, 5).getValues();
  const horario = rows
    .filter((r) => String(r[0]).trim() !== '')
    .map((r) => ({
      diaSemana: String(r[0]).trim(),
      activo: r[1] === true || String(r[1]).toUpperCase() === 'TRUE',
      horaInicio: String(r[2]),
      horaFin: String(r[3]),
      duracionSlotMin: Number(r[4]),
    }));
  return { ok: true, horario };
}

export function leerBloqueos(services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BLOQUEOS);
  if (!sheet) return { ok: true, bloqueos: [] };
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true, bloqueos: [] };
  const rows = sheet.getRange(2, 1, last - 1, 6).getValues();
  const bloqueos = rows
    .filter((r) => String(r[0]).trim() !== '')
    .map((r) => ({
      id: String(r[0]),
      fechaInicio: String(r[1]),
      fechaFin: String(r[2]),
      motivo: String(r[3] || ''),
    }))
    .sort((a, b) => (a.fechaInicio < b.fechaInicio ? -1 : a.fechaInicio > b.fechaInicio ? 1 : 0));
  return { ok: true, bloqueos };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/tests/horario.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/horario.js backend/tests/horario.test.js
git commit -m "feat(backend): add leerHorarioConfig and leerBloqueos"
```

---

## Task 3: `horario.js` — `actualizarHorarioConfig`

**Files:**
- Modify: `backend/src/horario.js`
- Test: `backend/tests/horario.test.js`

- [ ] **Step 1: Write the failing test**

En `backend/tests/horario.test.js`, cambia el import de la línea 3 para incluir `actualizarHorarioConfig`:

```js
import { leerHorarioConfig, leerBloqueos, actualizarHorarioConfig } from '../src/horario.js';
```

Agrega este bloque `describe` al final del archivo:

```js
describe('actualizarHorarioConfig', () => {
  function horarioValido() {
    return HORARIO_LABORAL.map(([diaSemana, activo, horaInicio, horaFin, duracionSlotMin]) => ({
      diaSemana, activo, horaInicio, horaFin, duracionSlotMin,
    }));
  }

  it('guarda las 7 filas y leerHorarioConfig las refleja', () => {
    const services = buildServices({ horario: HORARIO_LABORAL });
    const horario = horarioValido();
    horario[0] = { ...horario[0], horaInicio: '10:00' };

    expect(actualizarHorarioConfig({ horario }, services)).toEqual({ ok: true });
    expect(leerHorarioConfig(services).horario[0]).toEqual({
      diaSemana: 'Lunes', activo: true, horaInicio: '10:00', horaFin: '18:00', duracionSlotMin: 45,
    });
  });

  it('rechaza si no se envian las 7 filas', () => {
    const services = buildServices({ horario: HORARIO_LABORAL });
    const horario = horarioValido().slice(0, 6);
    expect(actualizarHorarioConfig({ horario }, services)).toEqual({ error: 'Se requieren las 7 filas de horario' });
  });

  it('rechaza si horaInicio >= horaFin en un dia activo', () => {
    const services = buildServices({ horario: HORARIO_LABORAL });
    const horario = horarioValido();
    horario[0] = { ...horario[0], horaInicio: '18:00', horaFin: '09:00' };
    expect(actualizarHorarioConfig({ horario }, services)).toEqual({ error: 'horaInicio debe ser menor que horaFin (Lunes)' });
  });

  it('rechaza si duracionSlotMin no es mayor que 0 en un dia activo', () => {
    const services = buildServices({ horario: HORARIO_LABORAL });
    const horario = horarioValido();
    horario[1] = { ...horario[1], duracionSlotMin: 0 };
    expect(actualizarHorarioConfig({ horario }, services)).toEqual({ error: 'duracionSlotMin debe ser mayor que 0 (Martes)' });
  });

  it('no valida horas ni duracion de un dia inactivo', () => {
    const services = buildServices({ horario: HORARIO_LABORAL });
    const horario = horarioValido();
    horario[5] = { ...horario[5], horaInicio: '18:00', horaFin: '09:00', duracionSlotMin: 0 };
    expect(actualizarHorarioConfig({ horario }, services)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/horario.test.js`
Expected: FAIL — `actualizarHorarioConfig` is not exported from `../src/horario.js`.

- [ ] **Step 3: Implement `actualizarHorarioConfig`**

En `backend/src/horario.js`, agrega esta función exportada al final del archivo:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/tests/horario.test.js`
Expected: PASS (9 tests — 4 existentes + 5 nuevas).

- [ ] **Step 5: Commit**

```bash
git add backend/src/horario.js backend/tests/horario.test.js
git commit -m "feat(backend): add actualizarHorarioConfig with per-day validation"
```

---

## Task 4: `horario.js` — `crearBloqueo` y `eliminarBloqueo`

**Files:**
- Modify: `backend/src/horario.js`
- Test: `backend/tests/horario.test.js`

- [ ] **Step 1: Write the failing test**

En `backend/tests/horario.test.js`:

1. Cambia el import de la línea 3 para incluir `crearBloqueo` y `eliminarBloqueo`:

```js
import { leerHorarioConfig, leerBloqueos, actualizarHorarioConfig, crearBloqueo, eliminarBloqueo } from '../src/horario.js';
```

2. Agrega estas dos constantes después de `BLOQUEOS_HEADER`:

```js
const CITAS_HEADER = ['id', 'fecha', 'horaInicio', 'horaFin', 'pacienteCodigo', 'estado', 'creadoPor', 'fechaCreacion', 'fechaActualizacion'];
const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
```

3. Reemplaza la función `buildServices` completa por esta versión (agrega `citas` y `usuarios`):

```js
function buildServices({ horario = [], bloqueos = [], citas = [], usuarios = [] } = {}) {
  return createMockServices({
    sheets: {
      _horario_config: [HORARIO_HEADER, ...horario],
      _bloqueos: [BLOQUEOS_HEADER, ...bloqueos],
      _citas: [CITAS_HEADER, ...citas],
      _usuarios: [USUARIOS_HEADER, ...usuarios],
    },
  });
}
```

4. Agrega este bloque al final del archivo:

```js
const ADMIN = { codigo: 'ADM001', rol: 'administrador' };

describe('crearBloqueo', () => {
  it('crea un bloqueo cuando no hay citas afectadas', () => {
    const services = buildServices({});
    const result = crearBloqueo({ fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' }, ADMIN, services);
    expect(result.ok).toBe(true);
    expect(result.bloqueo).toMatchObject({ fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' });
    expect(typeof result.bloqueo.id).toBe('string');
    expect(leerBloqueos(services).bloqueos).toHaveLength(1);
  });

  it('rechaza si fechaInicio es posterior a fechaFin', () => {
    const services = buildServices({});
    const result = crearBloqueo({ fechaInicio: '2026-07-15', fechaFin: '2026-07-01', motivo: '' }, ADMIN, services);
    expect(result).toEqual({ error: 'fechaInicio debe ser anterior o igual a fechaFin' });
  });

  it('pide confirmacion si hay citas Programada en el rango', () => {
    const services = buildServices({
      citas: [['c1', '2026-07-05', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = crearBloqueo({ fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' }, ADMIN, services);
    expect(result).toEqual({
      ok: false,
      requiereConfirmacion: true,
      citasAfectadas: [{ id: 'c1', fecha: '2026-07-05', horaInicio: '09:00', pacienteNombre: 'M. Garcia' }],
    });
    expect(leerBloqueos(services).bloqueos).toHaveLength(0);
  });

  it('crea el bloqueo si confirmar:true aunque haya citas afectadas', () => {
    const services = buildServices({
      citas: [['c1', '2026-07-05', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = crearBloqueo({ fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones', confirmar: true }, ADMIN, services);
    expect(result.ok).toBe(true);
    expect(leerBloqueos(services).bloqueos).toHaveLength(1);
  });

  it('ignora citas Canceladas al calcular citasAfectadas', () => {
    const services = buildServices({
      citas: [['c1', '2026-07-05', '09:00', '09:45', 'PAC001', 'Cancelada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = crearBloqueo({ fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' }, ADMIN, services);
    expect(result.ok).toBe(true);
  });
});

describe('eliminarBloqueo', () => {
  it('elimina un bloqueo existente', () => {
    const services = buildServices({
      bloqueos: [['b1', '2026-07-01', '2026-07-15', 'Vacaciones', 'ADM001', new Date()]],
    });
    expect(eliminarBloqueo({ bloqueoId: 'b1' }, services)).toEqual({ ok: true });
    expect(leerBloqueos(services).bloqueos).toHaveLength(0);
  });

  it('devuelve error si el bloqueo no existe', () => {
    const services = buildServices({});
    expect(eliminarBloqueo({ bloqueoId: 'inexistente' }, services)).toEqual({ error: 'Bloqueo no encontrado' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/horario.test.js`
Expected: FAIL — `crearBloqueo`/`eliminarBloqueo` are not exported from `../src/horario.js`.

- [ ] **Step 3: Implement `crearBloqueo` and `eliminarBloqueo`**

En `backend/src/horario.js`:

1. Agrega el import y la constante `SHEET_CITAS` al inicio del archivo (antes de `SHEET_HORARIO_CONFIG`):

```js
import { findUser } from './usuarios.js';

const SHEET_HORARIO_CONFIG = '_horario_config';
const SHEET_BLOQUEOS = '_bloqueos';
const SHEET_CITAS = '_citas';
```

2. Agrega estas funciones al final del archivo:

```js
function leerCitasProgramadas(services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CITAS);
  if (!sheet) return [];
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 6).getValues()
    .filter((r) => String(r[0]).trim() !== '' && String(r[5]) === 'Programada')
    .map((r) => ({ id: String(r[0]), fecha: String(r[1]), horaInicio: String(r[2]), pacienteCodigo: String(r[4]) }));
}

function nombrePaciente(codigo, services) {
  const user = findUser(codigo, services);
  return user ? user.nombre : codigo;
}

export function crearBloqueo(b, user, services) {
  const fechaInicio = String(b.fechaInicio || '');
  const fechaFin = String(b.fechaFin || '');
  const motivo = String(b.motivo || '');

  if (!(fechaInicio <= fechaFin)) {
    return { error: 'fechaInicio debe ser anterior o igual a fechaFin' };
  }

  if (!b.confirmar) {
    const citasAfectadas = leerCitasProgramadas(services)
      .filter((c) => c.fecha >= fechaInicio && c.fecha <= fechaFin)
      .map((c) => ({ id: c.id, fecha: c.fecha, horaInicio: c.horaInicio, pacienteNombre: nombrePaciente(c.pacienteCodigo, services) }));
    if (citasAfectadas.length > 0) {
      return { ok: false, requiereConfirmacion: true, citasAfectadas };
    }
  }

  const id = services.Utilities.getUuid();
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BLOQUEOS);
  sheet.appendRow([id, fechaInicio, fechaFin, motivo, user.codigo, new Date()]);

  return { ok: true, bloqueo: { id, fechaInicio, fechaFin, motivo } };
}

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/tests/horario.test.js`
Expected: PASS (16 tests — 9 existentes + 7 nuevas).

- [ ] **Step 5: Commit**

```bash
git add backend/src/horario.js backend/tests/horario.test.js
git commit -m "feat(backend): add crearBloqueo (with citasAfectadas confirmation) and eliminarBloqueo"
```

---

## Task 5: `agenda.js` — helpers de fecha/slots y `leerAgenda`

Esta tarea crea `backend/src/agenda.js` con todos los helpers internos
(generación de slots, fechas, lectura de `_citas`) que las Tasks 6-8
reutilizarán **sin redefinirlos** — solo agregan nuevas funciones exportadas
al mismo archivo.

Las fechas de prueba usadas en este task y en los siguientes (`2026-06-15` a
`2026-06-21`) corresponden a Lunes-Domingo reales (15 jun 2026 = Lunes).

**Files:**
- Create: `backend/src/agenda.js`
- Test: `backend/tests/agenda.test.js`

- [ ] **Step 1: Write the failing test**

Crea `backend/tests/agenda.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { leerAgenda } from '../src/agenda.js';

const HORARIO_HEADER = ['diaSemana', 'activo', 'horaInicio', 'horaFin', 'duracionSlotMin'];
const BLOQUEOS_HEADER = ['id', 'fechaInicio', 'fechaFin', 'motivo', 'creadoPor', 'fechaCreacion'];
const CITAS_HEADER = ['id', 'fecha', 'horaInicio', 'horaFin', 'pacienteCodigo', 'estado', 'creadoPor', 'fechaCreacion', 'fechaActualizacion'];
const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];

const HORARIO_LABORAL = [
  ['Lunes', true, '09:00', '18:00', 45],
  ['Martes', true, '09:00', '18:00', 45],
  ['Miercoles', true, '09:00', '18:00', 45],
  ['Jueves', true, '09:00', '18:00', 45],
  ['Viernes', true, '09:00', '18:00', 45],
  ['Sabado', false, '09:00', '13:00', 45],
  ['Domingo', false, '09:00', '13:00', 45],
];

function buildServices({ horario = HORARIO_LABORAL, bloqueos = [], citas = [], usuarios = [] } = {}) {
  return createMockServices({
    sheets: {
      _horario_config: [HORARIO_HEADER, ...horario],
      _bloqueos: [BLOQUEOS_HEADER, ...bloqueos],
      _citas: [CITAS_HEADER, ...citas],
      _usuarios: [USUARIOS_HEADER, ...usuarios],
    },
  });
}

describe('leerAgenda', () => {
  it('requiere fechaInicio y fechaFin', () => {
    const services = buildServices();
    expect(leerAgenda(undefined, undefined, services)).toEqual({ error: 'fechaInicio y fechaFin son requeridos' });
    expect(leerAgenda('2026-06-15', undefined, services)).toEqual({ error: 'fechaInicio y fechaFin son requeridos' });
  });

  it('genera 12 slots disponibles para un lunes (09:00-18:00, 45 min)', () => {
    const services = buildServices();
    const result = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(result.ok).toBe(true);
    expect(result.slots).toHaveLength(12);
    expect(result.slots[0]).toEqual({ fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', estado: 'disponible' });
    expect(result.slots[11]).toEqual({ fecha: '2026-06-15', horaInicio: '17:15', horaFin: '18:00', estado: 'disponible' });
    expect(result.horarioConfig).toHaveLength(7);
    expect(result.bloqueos).toEqual([]);
  });

  it('no genera slots para un dia inactivo (sabado)', () => {
    const services = buildServices();
    const result = leerAgenda('2026-06-20', '2026-06-20', services);
    expect(result.ok).toBe(true);
    expect(result.slots).toEqual([]);
  });

  it('marca un slot como ocupado cuando hay una cita Programada', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(result.slots[0]).toEqual({
      fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45',
      estado: 'ocupado', citaId: 'c1', pacienteNombre: 'M. Garcia', estadoCita: 'Programada',
    });
  });

  it('ignora citas Canceladas (el slot vuelve a disponible)', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Cancelada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(result.slots[0]).toEqual({ fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', estado: 'disponible' });
  });

  it('marca como bloqueado un slot sin cita en una fecha bloqueada', () => {
    const services = buildServices({
      bloqueos: [['b1', '2026-06-15', '2026-06-15', 'Feriado', 'ADM001', new Date()]],
    });
    const result = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(result.bloqueos).toEqual([{ id: 'b1', fechaInicio: '2026-06-15', fechaFin: '2026-06-15', motivo: 'Feriado' }]);
    expect(result.slots[0]).toEqual({ fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', estado: 'bloqueado' });
  });

  it('una cita Programada se muestra ocupada aunque la fecha este bloqueada', () => {
    const services = buildServices({
      bloqueos: [['b1', '2026-06-15', '2026-06-15', 'Feriado', 'ADM001', new Date()]],
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(result.slots[0].estado).toBe('ocupado');
    expect(result.slots[1]).toEqual({ fecha: '2026-06-15', horaInicio: '09:45', horaFin: '10:30', estado: 'bloqueado' });
  });

  it('incluye citas Programada fuera del horario activo generado', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '20:00', '20:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = leerAgenda('2026-06-15', '2026-06-15', services);
    const extra = result.slots.find((s) => s.horaInicio === '20:00');
    expect(extra).toEqual({
      fecha: '2026-06-15', horaInicio: '20:00', horaFin: '20:45',
      estado: 'ocupado', citaId: 'c1', pacienteNombre: 'M. Garcia', estadoCita: 'Programada',
    });
    expect(result.slots).toHaveLength(13); // 12 generados + 1 extra
  });

  it('filtra bloqueos que no solapan el rango solicitado', () => {
    const services = buildServices({
      bloqueos: [['b1', '2026-07-01', '2026-07-15', 'Vacaciones', 'ADM001', new Date()]],
    });
    const result = leerAgenda('2026-06-15', '2026-06-19', services);
    expect(result.bloqueos).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/agenda.test.js`
Expected: FAIL — Cannot find module `../src/agenda.js`.

- [ ] **Step 3: Implement helpers and `leerAgenda`**

Crea `backend/src/agenda.js`:

```js
import { leerHorarioConfig, leerBloqueos } from './horario.js';
import { findUser } from './usuarios.js';

const SHEET_CITAS = '_citas';
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

function diaSemanaDeFecha(fecha) {
  const date = new Date(`${fecha}T00:00:00`);
  const indice = (date.getDay() + 6) % 7; // 0=lunes .. 6=domingo
  return DIAS_SEMANA[indice];
}

function rangoFechas(fechaInicio, fechaFin) {
  const fechas = [];
  let actual = new Date(`${fechaInicio}T00:00:00`);
  const fin = new Date(`${fechaFin}T00:00:00`);
  while (actual <= fin) {
    fechas.push(formatearFecha(actual));
    actual = new Date(actual.getTime() + 24 * 60 * 60 * 1000);
  }
  return fechas;
}

function formatearFecha(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function horaAMinutos(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function minutosAHora(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function generarSlots(horaInicio, horaFin, duracionSlotMin) {
  const slots = [];
  let actual = horaAMinutos(horaInicio);
  const fin = horaAMinutos(horaFin);
  while (actual + duracionSlotMin <= fin) {
    slots.push({ horaInicio: minutosAHora(actual), horaFin: minutosAHora(actual + duracionSlotMin) });
    actual += duracionSlotMin;
  }
  return slots;
}

function leerCitasRaw(services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CITAS);
  if (!sheet) return [];
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 9).getValues()
    .filter((r) => String(r[0]).trim() !== '')
    .map((r, i) => ({
      id: String(r[0]),
      fecha: String(r[1]),
      horaInicio: String(r[2]),
      horaFin: String(r[3]),
      pacienteCodigo: String(r[4]),
      estado: String(r[5]),
      creadoPor: String(r[6]),
      fechaCreacion: r[7],
      fechaActualizacion: r[8],
      _fila: i + 2,
    }));
}

function nombrePaciente(codigo, services) {
  const user = findUser(codigo, services);
  return user ? user.nombre : codigo;
}

export function leerAgenda(fechaInicio, fechaFin, services) {
  if (!fechaInicio || !fechaFin) {
    return { error: 'fechaInicio y fechaFin son requeridos' };
  }

  const horarioConfig = leerHorarioConfig(services).horario;
  const bloqueos = leerBloqueos(services).bloqueos
    .filter((bq) => bq.fechaInicio <= fechaFin && bq.fechaFin >= fechaInicio);
  const citas = leerCitasRaw(services).filter((c) => c.fecha >= fechaInicio && c.fecha <= fechaFin);

  const slots = [];

  for (const fecha of rangoFechas(fechaInicio, fechaFin)) {
    const diaSemana = diaSemanaDeFecha(fecha);
    const config = horarioConfig.find((c) => c.diaSemana === diaSemana);
    if (!config || !config.activo) continue;

    const estaBloqueada = bloqueos.some((bq) => bq.fechaInicio <= fecha && fecha <= bq.fechaFin);

    for (const slot of generarSlots(config.horaInicio, config.horaFin, config.duracionSlotMin)) {
      const cita = citas.find((c) => c.fecha === fecha && c.horaInicio === slot.horaInicio && c.estado !== 'Cancelada');
      if (cita) {
        slots.push({
          fecha, horaInicio: slot.horaInicio, horaFin: slot.horaFin,
          estado: 'ocupado', citaId: cita.id, pacienteNombre: nombrePaciente(cita.pacienteCodigo, services), estadoCita: cita.estado,
        });
      } else if (estaBloqueada) {
        slots.push({ fecha, horaInicio: slot.horaInicio, horaFin: slot.horaFin, estado: 'bloqueado' });
      } else {
        slots.push({ fecha, horaInicio: slot.horaInicio, horaFin: slot.horaFin, estado: 'disponible' });
      }
    }
  }

  for (const cita of citas) {
    if (cita.estado === 'Cancelada') continue;
    const yaIncluida = slots.some((s) => s.fecha === cita.fecha && s.horaInicio === cita.horaInicio && s.citaId === cita.id);
    if (!yaIncluida) {
      slots.push({
        fecha: cita.fecha, horaInicio: cita.horaInicio, horaFin: cita.horaFin,
        estado: 'ocupado', citaId: cita.id, pacienteNombre: nombrePaciente(cita.pacienteCodigo, services), estadoCita: cita.estado,
      });
    }
  }

  return { ok: true, horarioConfig, bloqueos, slots };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/tests/agenda.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/agenda.js backend/tests/agenda.test.js
git commit -m "feat(backend): add leerAgenda with weekly slot generation from horario config, bloqueos and citas"
```

---

## Task 6: `agenda.js` — `crearCita`

**Files:**
- Modify: `backend/src/agenda.js`
- Test: `backend/tests/agenda.test.js`

- [ ] **Step 1: Write the failing test**

En `backend/tests/agenda.test.js`, cambia el import de la línea 3 para incluir `crearCita`:

```js
import { leerAgenda, crearCita } from '../src/agenda.js';
```

Agrega esta constante después de `HORARIO_LABORAL`:

```js
const USER_RECEPCION = { codigo: 'REC001', rol: 'recepcion' };
```

Agrega este bloque `describe` al final del archivo:

```js
describe('crearCita', () => {
  it('crea una cita en un slot disponible', () => {
    const services = buildServices({
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC001' }, USER_RECEPCION, services);
    expect(result.ok).toBe(true);
    expect(result.cita).toEqual({
      id: result.cita.id, fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45',
      pacienteCodigo: 'PAC001', pacienteNombre: 'M. Garcia', estado: 'Programada',
    });
    expect(typeof result.cita.id).toBe('string');

    const agenda = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(agenda.slots[0].estado).toBe('ocupado');
    expect(agenda.slots[0].citaId).toBe(result.cita.id);
  });

  it('rechaza un dia inactivo (fuera de horario configurado)', () => {
    const services = buildServices({ usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']] });
    const result = crearCita({ fecha: '2026-06-20', horaInicio: '09:00', pacienteCodigo: 'PAC001' }, USER_RECEPCION, services);
    expect(result).toEqual({ error: 'fecha y horaInicio fuera del horario configurado' });
  });

  it('rechaza una hora que no coincide con ningun slot generado', () => {
    const services = buildServices({ usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']] });
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:10', pacienteCodigo: 'PAC001' }, USER_RECEPCION, services);
    expect(result).toEqual({ error: 'fecha y horaInicio fuera del horario configurado' });
  });

  it('rechaza un slot ya ocupado por otra cita Programada', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia'], ['PAC002', 'h', 's', 'usuario', 'J. Lopez']],
    });
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC002' }, USER_RECEPCION, services);
    expect(result).toEqual({ error: 'Slot no disponible' });
  });

  it('rechaza un slot dentro de un bloqueo', () => {
    const services = buildServices({
      bloqueos: [['b1', '2026-06-15', '2026-06-15', 'Feriado', 'ADM001', new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC001' }, USER_RECEPCION, services);
    expect(result).toEqual({ error: 'Slot no disponible' });
  });

  it('rechaza si el paciente no existe', () => {
    const services = buildServices({});
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'NOEXISTE' }, USER_RECEPCION, services);
    expect(result).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza si el codigo corresponde a un usuario que no es paciente', () => {
    const services = buildServices({
      usuarios: [['ADM002', 'h', 's', 'administrador', 'Otro Admin']],
    });
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'ADM002' }, USER_RECEPCION, services);
    expect(result).toEqual({ error: 'Paciente no encontrado' });
  });

  it('permite reservar un slot cuya cita previa fue Cancelada', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Cancelada', 'ADM001', new Date(), new Date()]],
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia'], ['PAC002', 'h', 's', 'usuario', 'J. Lopez']],
    });
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC002' }, USER_RECEPCION, services);
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/agenda.test.js`
Expected: FAIL — `crearCita` is not exported from `../src/agenda.js`.

- [ ] **Step 3: Implement `crearCita`**

En `backend/src/agenda.js`, agrega esta función exportada al final del archivo:

```js
export function crearCita(b, user, services) {
  const fecha = String(b.fecha || '');
  const horaInicio = String(b.horaInicio || '');
  const pacienteCodigo = String(b.pacienteCodigo || '');

  const horarioConfig = leerHorarioConfig(services).horario;
  const config = horarioConfig.find((c) => c.diaSemana === diaSemanaDeFecha(fecha));
  const slotValido = config && config.activo &&
    generarSlots(config.horaInicio, config.horaFin, config.duracionSlotMin).some((s) => s.horaInicio === horaInicio);
  if (!slotValido) {
    return { error: 'fecha y horaInicio fuera del horario configurado' };
  }

  const bloqueos = leerBloqueos(services).bloqueos;
  const estaBloqueada = bloqueos.some((bq) => bq.fechaInicio <= fecha && fecha <= bq.fechaFin);
  const citas = leerCitasRaw(services);
  const ocupado = citas.some((c) => c.fecha === fecha && c.horaInicio === horaInicio && c.estado !== 'Cancelada');
  if (estaBloqueada || ocupado) {
    return { error: 'Slot no disponible' };
  }

  const paciente = findUser(pacienteCodigo, services);
  if (!paciente || paciente.rol !== 'usuario') {
    return { error: 'Paciente no encontrado' };
  }

  const horaFin = minutosAHora(horaAMinutos(horaInicio) + config.duracionSlotMin);
  const id = services.Utilities.getUuid();
  const ahora = new Date();

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CITAS);
  sheet.appendRow([id, fecha, horaInicio, horaFin, pacienteCodigo, 'Programada', user.codigo, ahora, ahora]);

  return {
    ok: true,
    cita: { id, fecha, horaInicio, horaFin, pacienteCodigo, pacienteNombre: paciente.nombre, estado: 'Programada' },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/tests/agenda.test.js`
Expected: PASS (17 tests — 9 existentes + 8 nuevas).

- [ ] **Step 5: Commit**

```bash
git add backend/src/agenda.js backend/tests/agenda.test.js
git commit -m "feat(backend): add crearCita with slot/horario/bloqueo/paciente validation"
```

---

## Task 7: `agenda.js` — `cambiarEstadoCita`

**Files:**
- Modify: `backend/src/agenda.js`
- Test: `backend/tests/agenda.test.js`

- [ ] **Step 1: Write the failing test**

En `backend/tests/agenda.test.js`, cambia el import de la línea 3 para incluir `cambiarEstadoCita`:

```js
import { leerAgenda, crearCita, cambiarEstadoCita } from '../src/agenda.js';
```

Agrega este bloque `describe` al final del archivo:

```js
describe('cambiarEstadoCita', () => {
  it('marca una cita Programada como Completada', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
    });
    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Completada' }, services);
    expect(result).toEqual({ ok: true });

    const agenda = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(agenda.slots[0].estadoCita).toBe('Completada');
  });

  it('marca una cita Programada como Cancelada', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
    });
    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Cancelada' }, services);
    expect(result).toEqual({ ok: true });

    const agenda = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(agenda.slots[0].estado).toBe('disponible');
  });

  it('rechaza un estado invalido', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
    });
    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Pendiente' }, services);
    expect(result).toEqual({ error: 'Estado invalido' });
  });

  it('rechaza si la cita no existe', () => {
    const services = buildServices({});
    const result = cambiarEstadoCita({ citaId: 'no-existe', estado: 'Completada' }, services);
    expect(result).toEqual({ error: 'Cita no encontrada' });
  });

  it('rechaza si la cita no esta Programada', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Cancelada', 'ADM001', new Date(), new Date()]],
    });
    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Completada' }, services);
    expect(result).toEqual({ error: 'Solo se puede cambiar el estado de una cita Programada' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/agenda.test.js`
Expected: FAIL — `cambiarEstadoCita` is not exported from `../src/agenda.js`.

- [ ] **Step 3: Implement `cambiarEstadoCita`**

En `backend/src/agenda.js`, agrega esta constante junto a las demás constantes del módulo (justo después de `const DIAS_SEMANA = [...]`):

```js
const ESTADOS_CAMBIO_VALIDOS = ['Cancelada', 'Completada'];
```

Agrega esta función exportada al final del archivo:

```js
export function cambiarEstadoCita(b, services) {
  const citaId = String(b.citaId || '');
  const estado = String(b.estado || '');
  if (!ESTADOS_CAMBIO_VALIDOS.includes(estado)) {
    return { error: 'Estado invalido' };
  }
  const citas = leerCitasRaw(services);
  const cita = citas.find((c) => c.id === citaId);
  if (!cita) {
    return { error: 'Cita no encontrada' };
  }
  if (cita.estado !== 'Programada') {
    return { error: 'Solo se puede cambiar el estado de una cita Programada' };
  }
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CITAS);
  sheet.getRange(cita._fila, 6, 1, 1).setValue(estado);
  sheet.getRange(cita._fila, 9, 1, 1).setValue(new Date());
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/tests/agenda.test.js`
Expected: PASS (22 tests — 17 existentes + 5 nuevas).

- [ ] **Step 5: Commit**

```bash
git add backend/src/agenda.js backend/tests/agenda.test.js
git commit -m "feat(backend): add cambiarEstadoCita for Completada/Cancelada transitions"
```

---

## Task 8: `agenda.js` — `leerMiAgenda` y `cancelarMiCita`

**Files:**
- Modify: `backend/src/agenda.js`
- Test: `backend/tests/agenda.test.js`

- [ ] **Step 1: Write the failing test**

En `backend/tests/agenda.test.js`, cambia la línea 1 (import de vitest) para incluir `beforeEach`, `afterEach` y `vi`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
```

Cambia el import de la línea 3 (ahora la línea del import de `../src/agenda.js`) para incluir `leerMiAgenda` y `cancelarMiCita`:

```js
import { leerAgenda, crearCita, cambiarEstadoCita, leerMiAgenda, cancelarMiCita } from '../src/agenda.js';
```

Agrega esta constante junto a `USER_RECEPCION`:

```js
const USER_PACIENTE = { codigo: 'PAC001', rol: 'usuario' };
```

Agrega estos bloques `describe` al final del archivo:

```js
describe('leerMiAgenda', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('separa las citas del paciente en proximas (hoy o futuras, Programada) e historial (pasadas o no Programada)', () => {
    const services = buildServices({
      citas: [
        ['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()],
        ['c2', '2026-06-18', '10:30', '11:15', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()],
        ['c3', '2026-06-16', '09:00', '09:45', 'PAC001', 'Cancelada', 'ADM001', new Date(), new Date()],
        ['c4', '2026-06-19', '09:00', '09:45', 'PAC001', 'Completada', 'ADM001', new Date(), new Date()],
        ['c5', '2026-06-20', '09:00', '09:45', 'PAC002', 'Programada', 'ADM001', new Date(), new Date()],
        ['c6', '2026-06-17', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()],
      ],
    });
    const result = leerMiAgenda(USER_PACIENTE, services);
    expect(result.ok).toBe(true);
    expect(result.proximas).toEqual([
      { id: 'c6', fecha: '2026-06-17', horaInicio: '09:00', horaFin: '09:45', estado: 'Programada' },
      { id: 'c2', fecha: '2026-06-18', horaInicio: '10:30', horaFin: '11:15', estado: 'Programada' },
    ]);
    expect(result.historial).toEqual([
      { id: 'c4', fecha: '2026-06-19', horaInicio: '09:00', horaFin: '09:45', estado: 'Completada' },
      { id: 'c3', fecha: '2026-06-16', horaInicio: '09:00', horaFin: '09:45', estado: 'Cancelada' },
      { id: 'c1', fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', estado: 'Programada' },
    ]);
  });

  it('devuelve listas vacias cuando el paciente no tiene citas', () => {
    const services = buildServices({});
    const result = leerMiAgenda(USER_PACIENTE, services);
    expect(result).toEqual({ ok: true, proximas: [], historial: [] });
  });
});

describe('cancelarMiCita', () => {
  it('cancela una cita Programada propia y libera el slot', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-18', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]],
    });
    const result = cancelarMiCita({ citaId: 'c1' }, USER_PACIENTE, services);
    expect(result).toEqual({ ok: true });

    const agenda = leerAgenda('2026-06-18', '2026-06-18', services);
    expect(agenda.slots[0].estado).toBe('disponible');
  });

  it('rechaza si la cita no existe', () => {
    const services = buildServices({});
    const result = cancelarMiCita({ citaId: 'no-existe' }, USER_PACIENTE, services);
    expect(result).toEqual({ error: 'Cita no encontrada' });
  });

  it('rechaza si la cita pertenece a otro paciente', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-18', '09:00', '09:45', 'PAC002', 'Programada', 'ADM001', new Date(), new Date()]],
    });
    const result = cancelarMiCita({ citaId: 'c1' }, USER_PACIENTE, services);
    expect(result).toEqual({ error: 'No tienes permiso sobre esta cita' });
  });

  it('rechaza si la cita no esta Programada', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-18', '09:00', '09:45', 'PAC001', 'Completada', 'ADM001', new Date(), new Date()]],
    });
    const result = cancelarMiCita({ citaId: 'c1' }, USER_PACIENTE, services);
    expect(result).toEqual({ error: 'Solo se pueden cancelar citas Programadas' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/agenda.test.js`
Expected: FAIL — `leerMiAgenda` y `cancelarMiCita` no están exportadas de `../src/agenda.js`.

- [ ] **Step 3: Implement `leerMiAgenda` y `cancelarMiCita`**

En `backend/src/agenda.js`, agrega estas dos funciones exportadas al final del archivo (junto con el helper privado `mapearCitaSimple`):

```js
function mapearCitaSimple(cita) {
  return { id: cita.id, fecha: cita.fecha, horaInicio: cita.horaInicio, horaFin: cita.horaFin, estado: cita.estado };
}

export function leerMiAgenda(user, services) {
  const hoy = formatearFecha(new Date());
  const citas = leerCitasRaw(services).filter((c) => c.pacienteCodigo === user.codigo);
  const proximas = citas
    .filter((c) => c.estado === 'Programada' && c.fecha >= hoy)
    .sort((a, b) => {
      const ca = a.fecha + a.horaInicio;
      const cb = b.fecha + b.horaInicio;
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    })
    .map(mapearCitaSimple);
  const historial = citas
    .filter((c) => c.estado !== 'Programada' || c.fecha < hoy)
    .sort((a, b) => {
      const ca = a.fecha + a.horaInicio;
      const cb = b.fecha + b.horaInicio;
      return ca < cb ? 1 : ca > cb ? -1 : 0;
    })
    .map(mapearCitaSimple);
  return { ok: true, proximas, historial };
}

export function cancelarMiCita(b, user, services) {
  const citaId = String(b.citaId || '');
  const citas = leerCitasRaw(services);
  const cita = citas.find((c) => c.id === citaId);
  if (!cita) {
    return { error: 'Cita no encontrada' };
  }
  if (cita.pacienteCodigo !== user.codigo) {
    return { error: 'No tienes permiso sobre esta cita' };
  }
  if (cita.estado !== 'Programada') {
    return { error: 'Solo se pueden cancelar citas Programadas' };
  }
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CITAS);
  sheet.getRange(cita._fila, 6, 1, 1).setValue('Cancelada');
  sheet.getRange(cita._fila, 9, 1, 1).setValue(new Date());
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/tests/agenda.test.js`
Expected: PASS (28 tests — 22 existentes + 6 nuevas).

- [ ] **Step 5: Commit**

```bash
git add backend/src/agenda.js backend/tests/agenda.test.js
git commit -m "feat(backend): add leerMiAgenda and cancelarMiCita for patient self-service"
```

---

## Task 9: `router.js` — wiring de las 11 acciones nuevas

**Files:**
- Modify: `backend/src/router.js`
- Modify: `backend/tests/router.test.js`

Esta tarea conecta `agenda.js`, `horario.js` y `listarPacientes` (de
`usuarios.js`) al router, con el gating de roles de la sección 6 del spec.
Las pruebas de lógica de negocio ya viven en `agenda.test.js`/`horario.test.js`
(Tasks 1-8); aquí se prueban únicamente el *wiring* (la acción llega a la
función correcta) y el *gating* de permisos (rol incorrecto → `Permiso
denegado`).

- [ ] **Step 1: Write the failing tests**

En `backend/tests/router.test.js`, agrega estas constantes justo después de
`const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];`:

```js
const HORARIO_HEADER = ['diaSemana', 'activo', 'horaInicio', 'horaFin', 'duracionSlotMin'];
const BLOQUEOS_HEADER = ['id', 'fechaInicio', 'fechaFin', 'motivo', 'creadoPor', 'fechaCreacion'];
const CITAS_HEADER = ['id', 'fecha', 'horaInicio', 'horaFin', 'pacienteCodigo', 'estado', 'creadoPor', 'fechaCreacion', 'fechaActualizacion'];

const HORARIO_LABORAL = [
  ['Lunes', true, '09:00', '18:00', 45],
  ['Martes', true, '09:00', '18:00', 45],
  ['Miercoles', true, '09:00', '18:00', 45],
  ['Jueves', true, '09:00', '18:00', 45],
  ['Viernes', true, '09:00', '18:00', 45],
  ['Sabado', false, '09:00', '13:00', 45],
  ['Domingo', false, '09:00', '13:00', 45],
];
```

Cambia `buildServicesWithUser` para aceptar hojas extra (necesarias para
`_horario_config`, `_bloqueos` y `_citas` en las pruebas de wiring):

```js
function buildServicesWithUser({ codigo, password, rol, nombre, extraSheets = {} }) {
  const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER], ...extraSheets } });
  const salt = generarSalt(services);
  const passwordHash = generarHashSHA256(password + salt, services);
  services.SpreadsheetApp._sheets['_usuarios'].push([codigo, passwordHash, salt, rol, nombre]);
  return services;
}
```

Dentro de `describe('handleGet', ...)`, inmediatamente antes del `});` que
cierra el bloque (después del test `listarUsuarios devuelve la lista de
usuarios para un administrador`), agrega estos 10 tests:

```js
  it('leerAgenda requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerAgenda', token, fechaInicio: '2026-06-15', fechaFin: '2026-06-15' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('leerAgenda devuelve los slots de la semana para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _horario_config: [HORARIO_HEADER, ...HORARIO_LABORAL] },
    });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerAgenda', token, fechaInicio: '2026-06-15', fechaFin: '2026-06-15' } }, services);
    const body = bodyOf(result);
    expect(body.ok).toBe(true);
    expect(body.slots).toHaveLength(12);
    expect(body.horarioConfig).toHaveLength(7);
  });

  it('leerMiAgenda requiere rol usuario', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerMiAgenda', token } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('leerMiAgenda devuelve las citas propias del paciente', () => {
    const services = buildServicesWithUser({
      codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente',
      extraSheets: {
        _citas: [CITAS_HEADER, ['c1', '2099-01-01', '09:00', '09:45', 'USR001', 'Programada', 'ADM001', new Date(), new Date()]],
      },
    });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerMiAgenda', token } }, services);
    const body = bodyOf(result);
    expect(body.ok).toBe(true);
    expect(body.proximas).toEqual([{ id: 'c1', fecha: '2099-01-01', horaInicio: '09:00', horaFin: '09:45', estado: 'Programada' }]);
    expect(body.historial).toEqual([]);
  });

  it('leerHorarioConfig requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerHorarioConfig', token } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('leerHorarioConfig devuelve el horario configurado para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _horario_config: [HORARIO_HEADER, ...HORARIO_LABORAL] },
    });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerHorarioConfig', token } }, services);
    const body = bodyOf(result);
    expect(body.ok).toBe(true);
    expect(body.horario).toHaveLength(7);
  });

  it('leerBloqueos requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerBloqueos', token } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('leerBloqueos devuelve los bloqueos para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _bloqueos: [BLOQUEOS_HEADER, ['b1', '2026-07-01', '2026-07-15', 'Vacaciones', 'ADM001', new Date()]] },
    });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerBloqueos', token } }, services);
    expect(bodyOf(result)).toEqual({ ok: true, bloqueos: [{ id: 'b1', fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' }] });
  });

  it('listarPacientes requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarPacientes', token } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('listarPacientes devuelve los pacientes para recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    services.SpreadsheetApp._sheets['_usuarios'].push(['PAC001', 'hash', 'salt', 'usuario', 'Paciente Uno']);
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarPacientes', token } }, services);
    expect(bodyOf(result)).toEqual({ ok: true, pacientes: [{ codigo: 'PAC001', nombre: 'Paciente Uno' }] });
  });
```

Dentro de `describe('handlePost', ...)`, inmediatamente antes del `});` que
cierra el bloque (después del test `cambiarPassword esta disponible para
cualquier rol autenticado`), agrega estos 12 tests:

```js
  it('crearCita requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearCita', token, fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC001' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('crearCita crea una cita para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _horario_config: [HORARIO_HEADER, ...HORARIO_LABORAL] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['PAC001', 'hash', 'salt', 'usuario', 'Paciente Uno']);
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearCita', token, fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC001' }) } },
      services
    );
    const body = bodyOf(result);
    expect(body.ok).toBe(true);
    expect(body.cita).toMatchObject({ fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', pacienteCodigo: 'PAC001', pacienteNombre: 'Paciente Uno', estado: 'Programada' });
  });

  it('cambiarEstadoCita requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'cambiarEstadoCita', token, citaId: 'c1', estado: 'Completada' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('cambiarEstadoCita actualiza el estado para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _citas: [CITAS_HEADER, ['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date()]] },
    });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'cambiarEstadoCita', token, citaId: 'c1', estado: 'Completada' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });

  it('cancelarMiCita requiere rol usuario', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'cancelarMiCita', token, citaId: 'c1' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('cancelarMiCita cancela una cita propia para usuario', () => {
    const services = buildServicesWithUser({
      codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente',
      extraSheets: { _citas: [CITAS_HEADER, ['c1', '2026-06-15', '09:00', '09:45', 'USR001', 'Programada', 'ADM001', new Date(), new Date()]] },
    });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'cancelarMiCita', token, citaId: 'c1' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });

  it('actualizarHorarioConfig requiere rol administrador o psiquiatra', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'actualizarHorarioConfig', token, horario: [] }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('actualizarHorarioConfig guarda el horario para administrador', () => {
    const services = buildServicesWithUser({
      codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin',
      extraSheets: { _horario_config: [HORARIO_HEADER, ...HORARIO_LABORAL] },
    });
    const token = loginToken(services, 'ADM001', 'secreta123');

    const nuevoHorario = HORARIO_LABORAL.map(([diaSemana, activo, horaInicio, horaFin, duracionSlotMin]) => ({
      diaSemana, activo, horaInicio, horaFin, duracionSlotMin,
    }));

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'actualizarHorarioConfig', token, horario: nuevoHorario }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });

  it('crearBloqueo requiere rol administrador o psiquiatra', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearBloqueo', token, fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('crearBloqueo crea un bloqueo para administrador', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearBloqueo', token, fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' }) } },
      services
    );
    const body = bodyOf(result);
    expect(body.ok).toBe(true);
    expect(body.bloqueo).toMatchObject({ fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' });
  });

  it('eliminarBloqueo requiere rol administrador o psiquiatra', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'eliminarBloqueo', token, bloqueoId: 'b1' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('eliminarBloqueo elimina un bloqueo para administrador', () => {
    const services = buildServicesWithUser({
      codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin',
      extraSheets: { _bloqueos: [BLOQUEOS_HEADER, ['b1', '2026-07-01', '2026-07-15', 'Vacaciones', 'ADM001', new Date()]] },
    });
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'eliminarBloqueo', token, bloqueoId: 'b1' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- backend/tests/router.test.js`
Expected: FAIL — todas las acciones nuevas devuelven `{error: 'Accion no
reconocida'}` porque `router.js` todavía no las conoce.

- [ ] **Step 3: Wire the new actions into the router**

Reemplaza el contenido completo de `backend/src/router.js` con:

```js
import { json_ } from './http.js';
import { login } from './auth.js';
import { listarUsuarios, guardarUsuario, eliminarUsuario, listarPacientes } from './usuarios.js';
import { requireAuth, requireAuthBody, cambiarPassword } from './guards.js';
import { leerAgenda, crearCita, cambiarEstadoCita, leerMiAgenda, cancelarMiCita } from './agenda.js';
import { leerHorarioConfig, leerBloqueos, actualizarHorarioConfig, crearBloqueo, eliminarBloqueo } from './horario.js';

const ROLES_AGENDA = ['administrador', 'psiquiatra', 'recepcion'];
const ROLES_HORARIO = ['administrador', 'psiquiatra'];

export function handleGet(e, services) {
  const p = (e && e.parameter) || {};

  switch (p.accion) {
    case 'ping':
      return json_({ ok: true }, services);

    case 'listarUsuarios':
      return json_(requireAuth(p, ['administrador'], () => listarUsuarios(services), services), services);

    case 'leerAgenda':
      return json_(
        requireAuth(p, ROLES_AGENDA, () => leerAgenda(p.fechaInicio, p.fechaFin, services), services),
        services
      );

    case 'leerMiAgenda':
      return json_(
        requireAuth(p, ['usuario'], (user) => leerMiAgenda(user, services), services),
        services
      );

    case 'leerHorarioConfig':
      return json_(requireAuth(p, ROLES_AGENDA, () => leerHorarioConfig(services), services), services);

    case 'leerBloqueos':
      return json_(requireAuth(p, ROLES_AGENDA, () => leerBloqueos(services), services), services);

    case 'listarPacientes':
      return json_(requireAuth(p, ROLES_AGENDA, () => listarPacientes(services), services), services);

    default:
      return json_({ error: 'Accion no reconocida' }, services);
  }
}

export function handlePost(e, services) {
  let b = {};
  try {
    b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ error: 'JSON invalido' }, services);
  }

  switch (b.accion) {
    case 'login':
      return json_(login(b.codigo, b.password, services), services);

    case 'guardarUsuario':
      return json_(
        requireAuthBody(b.token, ['administrador'], () => guardarUsuario(b, services), services),
        services
      );

    case 'eliminarUsuario':
      return json_(
        requireAuthBody(b.token, ['administrador'], () => eliminarUsuario(b.codigo, services), services),
        services
      );

    case 'cambiarPassword':
      return json_(
        requireAuthBody(b.token, [], (user) => cambiarPassword(b, user, services), services),
        services
      );

    case 'crearCita':
      return json_(
        requireAuthBody(b.token, ROLES_AGENDA, (user) => crearCita(b, user, services), services),
        services
      );

    case 'cambiarEstadoCita':
      return json_(
        requireAuthBody(b.token, ROLES_AGENDA, () => cambiarEstadoCita(b, services), services),
        services
      );

    case 'cancelarMiCita':
      return json_(
        requireAuthBody(b.token, ['usuario'], (user) => cancelarMiCita(b, user, services), services),
        services
      );

    case 'actualizarHorarioConfig':
      return json_(
        requireAuthBody(b.token, ROLES_HORARIO, () => actualizarHorarioConfig(b, services), services),
        services
      );

    case 'crearBloqueo':
      return json_(
        requireAuthBody(b.token, ROLES_HORARIO, (user) => crearBloqueo(b, user, services), services),
        services
      );

    case 'eliminarBloqueo':
      return json_(
        requireAuthBody(b.token, ROLES_HORARIO, () => eliminarBloqueo(b, services), services),
        services
      );

    default:
      return json_({ error: 'Accion no reconocida' }, services);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- backend/tests/router.test.js`
Expected: PASS (33 tests — 11 existentes + 22 nuevas).

- [ ] **Step 5: Commit**

```bash
git add backend/src/router.js backend/tests/router.test.js
git commit -m "feat(backend): wire agenda, horario and listarPacientes actions into router with role gating"
```

---

## Frontend: orden de tareas

El backend (Tasks 1-9) ya está completo y probado. El frontend se construye en
este orden para evitar dependencias rotas entre módulos:

1. **Task 10**: `agenda-horario.js` — panel "Configurar horario" (horario
   semanal). No depende de ningún otro módulo nuevo.
2. **Task 11**: `agenda-horario.js` — sección de bloqueos (mismo archivo).
3. **Task 12**: `views/agenda.js` — cuadrícula semanal + botón "Configurar
   horario" (que abre el panel de la Task 10-11).
4. **Task 13**: `views/agenda.js` — formulario "Nueva cita".
5. **Task 14**: `views/agenda.js` — panel "Detalle de cita".
6. **Task 15**: `views/mi-agenda.js` — vista del paciente.
7. **Task 16**: `dashboard.js` — wiring final de `MENUS`/`VIEWS` (ya existen
   `initAgendaView` e `initMiAgendaView` para importar).

---

## Task 10: `agenda-horario.js` — panel "Configurar horario" (horario semanal)

**Files:**
- Create: `src/portal/views/agenda-horario.js`
- Test: `tests/portal/views/agenda-horario.test.js`

- [ ] **Step 1: Write the failing test**

Crea `tests/portal/views/agenda-horario.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initAgendaHorarioView } from '../../../src/portal/views/agenda-horario.js';
import { setSession, getSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const ADMIN_SESSION = { token: 'admin-tok', codigo: 'ADM001', rol: 'administrador', nombre: 'Admin', debeCambiarPassword: false };
const RECEPCION_SESSION = { token: 'rec-tok', codigo: 'REC001', rol: 'recepcion', nombre: 'Recepcion', debeCambiarPassword: false };

const HORARIO = [
  { diaSemana: 'Lunes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
  { diaSemana: 'Martes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
  { diaSemana: 'Miercoles', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
  { diaSemana: 'Jueves', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
  { diaSemana: 'Viernes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
  { diaSemana: 'Sabado', activo: false, horaInicio: '09:00', horaFin: '13:00', duracionSlotMin: 45 },
  { diaSemana: 'Domingo', activo: false, horaInicio: '09:00', horaFin: '13:00', duracionSlotMin: 45 },
];

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initAgendaHorarioView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(ADMIN_SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockResolvedValue({ ok: true, horario: HORARIO });
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renderiza las 7 filas del horario en orden Lunes a Domingo', async () => {
    initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    expect(apiGet).toHaveBeenCalledWith('leerHorarioConfig', { token: 'admin-tok' });
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(7);
    expect(rows[0].dataset.dia).toBe('Lunes');
    expect(rows[6].dataset.dia).toBe('Domingo');
    expect(rows[0].querySelector('.view-agenda-horario__activo').checked).toBe(true);
    expect(rows[5].querySelector('.view-agenda-horario__activo').checked).toBe(false);
    expect(rows[0].querySelector('.view-agenda-horario__hora-inicio').value).toBe('09:00');
    expect(rows[0].querySelector('.view-agenda-horario__duracion').value).toBe('45');
  });

  it('permite editar y guardar el horario para administrador', async () => {
    apiPost.mockResolvedValue({ ok: true });

    initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const rows = container.querySelectorAll('tbody tr');
    expect(rows[0].querySelector('.view-agenda-horario__activo').disabled).toBe(false);

    rows[0].querySelector('.view-agenda-horario__duracion').value = '30';

    const guardarButton = container.querySelector('.view-agenda-horario__guardar-horario');
    expect(guardarButton).not.toBeNull();
    guardarButton.click();
    await flush();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'actualizarHorarioConfig',
      token: 'admin-tok',
      horario: [
        { diaSemana: 'Lunes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 30 },
        { diaSemana: 'Martes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Miercoles', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Jueves', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Viernes', activo: true, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45 },
        { diaSemana: 'Sabado', activo: false, horaInicio: '09:00', horaFin: '13:00', duracionSlotMin: 45 },
        { diaSemana: 'Domingo', activo: false, horaInicio: '09:00', horaFin: '13:00', duracionSlotMin: 45 },
      ],
    });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('deshabilita los controles y oculta el boton Guardar horario para recepcion', async () => {
    initAgendaHorarioView(container, { session: RECEPCION_SESSION, forced: false });
    await flush();

    const rows = container.querySelectorAll('tbody tr');
    rows.forEach((row) => {
      row.querySelectorAll('input').forEach((input) => {
        expect(input.disabled).toBe(true);
      });
    });
    expect(container.querySelector('.view-agenda-horario__guardar-horario')).toBeNull();
  });

  it('muestra un error inline si actualizarHorarioConfig falla', async () => {
    apiPost.mockResolvedValue({ error: 'horaInicio debe ser menor que horaFin (Lunes)' });

    initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    container.querySelector('.view-agenda-horario__guardar-horario').click();
    await flush();

    const horarioError = container.querySelector('.view-agenda-horario__horario-error');
    expect(horarioError.textContent).toBe('horaInicio debe ser menor que horaFin (Lunes)');
    expect(horarioError.hidden).toBe(false);
  });

  it('redirige al login si leerHorarioConfig devuelve No autorizado', async () => {
    apiGet.mockResolvedValue({ error: 'No autorizado' });

    initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/portal/views/agenda-horario.test.js`
Expected: FAIL — no se puede resolver el módulo
`../../../src/portal/views/agenda-horario.js`.

- [ ] **Step 3: Implement the horario semanal panel**

Crea `src/portal/views/agenda-horario.js`:

```js
import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

export function initAgendaHorarioView(container, ctx) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'view-agenda-horario';

  const heading = document.createElement('h2');
  heading.textContent = 'Configurar horario';
  wrapper.appendChild(heading);

  const errorEl = document.createElement('div');
  errorEl.className = 'view-agenda-horario__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const horarioTable = document.createElement('table');
  horarioTable.className = 'view-agenda-horario__horario-table';
  wrapper.appendChild(horarioTable);

  const horarioError = document.createElement('div');
  horarioError.className = 'view-agenda-horario__horario-error';
  horarioError.hidden = true;
  wrapper.appendChild(horarioError);

  const puedeEditar = ctx.session.rol === 'administrador' || ctx.session.rol === 'psiquiatra';

  if (puedeEditar) {
    const guardarButton = document.createElement('button');
    guardarButton.type = 'button';
    guardarButton.className = 'button button--primary view-agenda-horario__guardar-horario';
    guardarButton.textContent = 'Guardar horario';
    guardarButton.addEventListener('click', handleGuardarHorario);
    wrapper.appendChild(guardarButton);
  }

  container.appendChild(wrapper);

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.hidden = true;
  }

  async function loadHorario() {
    const result = await apiGet('leerHorarioConfig', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    clearError();
    renderHorarioTable(result.horario);
  }

  function renderHorarioTable(horario) {
    horarioTable.innerHTML = '';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Día</th><th>Activo</th><th>Hora inicio</th><th>Hora fin</th><th>Duración (min)</th></tr>';
    horarioTable.appendChild(thead);

    const tbody = document.createElement('tbody');
    DIAS_SEMANA.forEach((dia) => {
      const fila = horario.find((f) => f.diaSemana === dia) || {
        diaSemana: dia, activo: false, horaInicio: '09:00', horaFin: '18:00', duracionSlotMin: 45,
      };

      const tr = document.createElement('tr');
      tr.dataset.dia = dia;

      const tdDia = document.createElement('td');
      tdDia.textContent = dia;
      tr.appendChild(tdDia);

      const tdActivo = document.createElement('td');
      const activoInput = document.createElement('input');
      activoInput.type = 'checkbox';
      activoInput.checked = !!fila.activo;
      activoInput.disabled = !puedeEditar;
      activoInput.className = 'view-agenda-horario__activo';
      tdActivo.appendChild(activoInput);
      tr.appendChild(tdActivo);

      const tdInicio = document.createElement('td');
      const inicioInput = document.createElement('input');
      inicioInput.type = 'time';
      inicioInput.value = fila.horaInicio;
      inicioInput.disabled = !puedeEditar;
      inicioInput.className = 'view-agenda-horario__hora-inicio';
      tdInicio.appendChild(inicioInput);
      tr.appendChild(tdInicio);

      const tdFin = document.createElement('td');
      const finInput = document.createElement('input');
      finInput.type = 'time';
      finInput.value = fila.horaFin;
      finInput.disabled = !puedeEditar;
      finInput.className = 'view-agenda-horario__hora-fin';
      tdFin.appendChild(finInput);
      tr.appendChild(tdFin);

      const tdDuracion = document.createElement('td');
      const duracionInput = document.createElement('input');
      duracionInput.type = 'number';
      duracionInput.value = String(fila.duracionSlotMin);
      duracionInput.disabled = !puedeEditar;
      duracionInput.className = 'view-agenda-horario__duracion';
      tdDuracion.appendChild(duracionInput);
      tr.appendChild(tdDuracion);

      tbody.appendChild(tr);
    });
    horarioTable.appendChild(tbody);
  }

  async function handleGuardarHorario() {
    horarioError.hidden = true;

    const horario = DIAS_SEMANA.map((dia) => {
      const tr = horarioTable.querySelector(`tbody tr[data-dia="${dia}"]`);
      return {
        diaSemana: dia,
        activo: tr.querySelector('.view-agenda-horario__activo').checked,
        horaInicio: tr.querySelector('.view-agenda-horario__hora-inicio').value,
        horaFin: tr.querySelector('.view-agenda-horario__hora-fin').value,
        duracionSlotMin: Number(tr.querySelector('.view-agenda-horario__duracion').value),
      };
    });

    const result = await apiPost({ accion: 'actualizarHorarioConfig', token: ctx.session.token, horario });
    if (result.error) {
      if (handleAuthError(result)) return;
      horarioError.textContent = result.error;
      horarioError.hidden = false;
      return;
    }
    await loadHorario();
  }

  loadHorario();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/portal/views/agenda-horario.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/portal/views/agenda-horario.js tests/portal/views/agenda-horario.test.js
git commit -m "feat(frontend): add agenda-horario view with editable weekly schedule panel"
```

---

## Task 11: `agenda-horario.js` — sección de bloqueos

**Files:**
- Modify: `src/portal/views/agenda-horario.js`
- Modify: `tests/portal/views/agenda-horario.test.js`

- [ ] **Step 1: Write the failing tests**

En `tests/portal/views/agenda-horario.test.js`, haz estos 4 cambios:

1. Agrega esta constante después de `HORARIO`:

```js
const BLOQUEOS = [
  { id: 'b1', fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' },
];
```

2. En `beforeEach`, reemplaza la línea `apiGet.mockResolvedValue({ ok: true, horario: HORARIO });` por:

```js
    apiGet.mockImplementation((accion) => {
      if (accion === 'leerHorarioConfig') return Promise.resolve({ ok: true, horario: HORARIO });
      if (accion === 'leerBloqueos') return Promise.resolve({ ok: true, bloqueos: BLOQUEOS });
      return Promise.resolve({ error: 'Accion no reconocida' });
    });
```

3. En el test `'permite editar y guardar el horario para administrador'`, reemplaza `expect(apiGet).toHaveBeenCalledTimes(2);` por `expect(apiGet).toHaveBeenCalledTimes(3);` (ahora `initAgendaHorarioView` también llama a `leerBloqueos` al cargar).

4. Agrega este bloque `describe('bloqueos', ...)` justo antes del `});` final que cierra `describe('initAgendaHorarioView', ...)`:

```js
  describe('bloqueos', () => {
    it('renderiza la lista de bloqueos existentes y el boton Eliminar para administrador', async () => {
      initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
      await flush();

      expect(apiGet).toHaveBeenCalledWith('leerBloqueos', { token: 'admin-tok' });
      const items = container.querySelectorAll('.view-agenda-horario__bloqueo-item');
      expect(items.length).toBe(1);
      expect(items[0].textContent).toContain('2026-07-01 – 2026-07-15: Vacaciones');
      expect(items[0].querySelector('.view-agenda-horario__bloqueo-eliminar')).not.toBeNull();
    });

    it('permite eliminar un bloqueo para administrador', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      apiPost.mockResolvedValue({ ok: true });

      initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
      await flush();

      container.querySelector('.view-agenda-horario__bloqueo-eliminar').click();
      await flush();

      expect(apiPost).toHaveBeenCalledWith({ accion: 'eliminarBloqueo', token: 'admin-tok', bloqueoId: 'b1' });
      const bloqueosCalls = apiGet.mock.calls.filter(([accion]) => accion === 'leerBloqueos');
      expect(bloqueosCalls.length).toBe(2);
    });

    it('no elimina un bloqueo si se cancela la confirmacion', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
      await flush();

      container.querySelector('.view-agenda-horario__bloqueo-eliminar').click();
      await flush();

      expect(apiPost).not.toHaveBeenCalled();
    });

    it('permite agregar un bloqueo sin citas afectadas para administrador', async () => {
      apiPost.mockResolvedValue({ ok: true, bloqueo: { id: 'b2', fechaInicio: '2026-08-01', fechaFin: '2026-08-10', motivo: 'Curso' } });

      initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
      await flush();

      container.querySelector('.view-agenda-horario__bloqueo-fecha-inicio').value = '2026-08-01';
      container.querySelector('.view-agenda-horario__bloqueo-fecha-fin').value = '2026-08-10';
      container.querySelector('.view-agenda-horario__bloqueo-motivo').value = 'Curso';
      container.querySelector('.view-agenda-horario__bloqueo-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flush();

      expect(apiPost).toHaveBeenCalledWith({
        accion: 'crearBloqueo',
        token: 'admin-tok',
        fechaInicio: '2026-08-01',
        fechaFin: '2026-08-10',
        motivo: 'Curso',
        confirmar: false,
      });
      const bloqueosCalls = apiGet.mock.calls.filter(([accion]) => accion === 'leerBloqueos');
      expect(bloqueosCalls.length).toBe(2);
      expect(container.querySelector('.view-agenda-horario__bloqueo-fecha-inicio').value).toBe('');
    });

    it('muestra confirmacion si hay citas afectadas y permite confirmar la creacion', async () => {
      apiPost
        .mockResolvedValueOnce({
          ok: false,
          requiereConfirmacion: true,
          citasAfectadas: [{ id: 'c1', fecha: '2026-07-05', horaInicio: '09:00', pacienteNombre: 'M. Garcia' }],
        })
        .mockResolvedValueOnce({ ok: true, bloqueo: { id: 'b2', fechaInicio: '2026-07-01', fechaFin: '2026-07-15', motivo: 'Vacaciones' } });

      initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
      await flush();

      container.querySelector('.view-agenda-horario__bloqueo-fecha-inicio').value = '2026-07-01';
      container.querySelector('.view-agenda-horario__bloqueo-fecha-fin').value = '2026-07-15';
      container.querySelector('.view-agenda-horario__bloqueo-motivo').value = 'Vacaciones';
      container.querySelector('.view-agenda-horario__bloqueo-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flush();

      const confirmBox = container.querySelector('.view-agenda-horario__bloqueo-confirm');
      expect(confirmBox.hidden).toBe(false);
      const citasAfectadas = confirmBox.querySelectorAll('.view-agenda-horario__citas-afectadas li');
      expect(citasAfectadas.length).toBe(1);
      expect(citasAfectadas[0].textContent).toBe('2026-07-05 09:00 - M. Garcia');

      container.querySelector('.view-agenda-horario__bloqueo-confirmar').click();
      await flush();

      expect(apiPost).toHaveBeenLastCalledWith({
        accion: 'crearBloqueo',
        token: 'admin-tok',
        fechaInicio: '2026-07-01',
        fechaFin: '2026-07-15',
        motivo: 'Vacaciones',
        confirmar: true,
      });
      expect(confirmBox.hidden).toBe(true);
    });

    it('muestra un error inline si crearBloqueo falla', async () => {
      apiPost.mockResolvedValue({ error: 'fechaInicio debe ser anterior o igual a fechaFin' });

      initAgendaHorarioView(container, { session: ADMIN_SESSION, forced: false });
      await flush();

      container.querySelector('.view-agenda-horario__bloqueo-fecha-inicio').value = '2026-07-15';
      container.querySelector('.view-agenda-horario__bloqueo-fecha-fin').value = '2026-07-01';
      container.querySelector('.view-agenda-horario__bloqueo-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flush();

      const bloqueosError = container.querySelector('.view-agenda-horario__bloqueos-error');
      expect(bloqueosError.textContent).toBe('fechaInicio debe ser anterior o igual a fechaFin');
      expect(bloqueosError.hidden).toBe(false);
    });

    it('oculta el formulario de bloqueos y el boton Eliminar para recepcion', async () => {
      initAgendaHorarioView(container, { session: RECEPCION_SESSION, forced: false });
      await flush();

      expect(container.querySelector('.view-agenda-horario__bloqueo-form')).toBeNull();
      expect(container.querySelector('.view-agenda-horario__bloqueo-eliminar')).toBeNull();
      const items = container.querySelectorAll('.view-agenda-horario__bloqueo-item');
      expect(items.length).toBe(1);
      expect(items[0].textContent).toContain('2026-07-01 – 2026-07-15: Vacaciones');
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/portal/views/agenda-horario.test.js`
Expected: FAIL — los 7 tests nuevos del bloque `bloqueos` fallan porque
`.view-agenda-horario__bloqueo-item`, `.view-agenda-horario__bloqueo-form`,
etc. no existen; el test `'permite editar y guardar el horario para
administrador'` también falla (`apiGet` se llamó 2 veces, se esperaban 3).
Los otros 4 tests existentes siguen pasando.

- [ ] **Step 3: Implement the bloqueos section**

En `src/portal/views/agenda-horario.js`, haz estos 3 cambios:

1. Reemplaza:

```js
  if (puedeEditar) {
    const guardarButton = document.createElement('button');
    guardarButton.type = 'button';
    guardarButton.className = 'button button--primary view-agenda-horario__guardar-horario';
    guardarButton.textContent = 'Guardar horario';
    guardarButton.addEventListener('click', handleGuardarHorario);
    wrapper.appendChild(guardarButton);
  }

  container.appendChild(wrapper);
```

con:

```js
  if (puedeEditar) {
    const guardarButton = document.createElement('button');
    guardarButton.type = 'button';
    guardarButton.className = 'button button--primary view-agenda-horario__guardar-horario';
    guardarButton.textContent = 'Guardar horario';
    guardarButton.addEventListener('click', handleGuardarHorario);
    wrapper.appendChild(guardarButton);
  }

  const bloqueosHeading = document.createElement('h2');
  bloqueosHeading.textContent = 'Bloqueos';
  wrapper.appendChild(bloqueosHeading);

  const bloqueosError = document.createElement('div');
  bloqueosError.className = 'view-agenda-horario__bloqueos-error';
  bloqueosError.hidden = true;
  wrapper.appendChild(bloqueosError);

  const bloqueosList = document.createElement('ul');
  bloqueosList.className = 'view-agenda-horario__bloqueos-list';
  wrapper.appendChild(bloqueosList);

  if (puedeEditar) {
    const bloqueoForm = document.createElement('form');
    bloqueoForm.className = 'view-agenda-horario__bloqueo-form';

    const fechaInicioInput = document.createElement('input');
    fechaInicioInput.type = 'date';
    fechaInicioInput.className = 'view-agenda-horario__bloqueo-fecha-inicio';
    bloqueoForm.appendChild(fechaInicioInput);

    const fechaFinInput = document.createElement('input');
    fechaFinInput.type = 'date';
    fechaFinInput.className = 'view-agenda-horario__bloqueo-fecha-fin';
    bloqueoForm.appendChild(fechaFinInput);

    const motivoInput = document.createElement('input');
    motivoInput.type = 'text';
    motivoInput.placeholder = 'Motivo (opcional)';
    motivoInput.className = 'view-agenda-horario__bloqueo-motivo';
    bloqueoForm.appendChild(motivoInput);

    const agregarButton = document.createElement('button');
    agregarButton.type = 'submit';
    agregarButton.className = 'button button--primary view-agenda-horario__bloqueo-agregar';
    agregarButton.textContent = 'Agregar bloqueo';
    bloqueoForm.appendChild(agregarButton);

    bloqueoForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleCrearBloqueo(false);
    });

    wrapper.appendChild(bloqueoForm);

    const bloqueoConfirm = document.createElement('div');
    bloqueoConfirm.className = 'view-agenda-horario__bloqueo-confirm';
    bloqueoConfirm.hidden = true;

    const confirmText = document.createElement('p');
    confirmText.textContent = 'Hay citas programadas en este rango:';
    bloqueoConfirm.appendChild(confirmText);

    const citasAfectadasList = document.createElement('ul');
    citasAfectadasList.className = 'view-agenda-horario__citas-afectadas';
    bloqueoConfirm.appendChild(citasAfectadasList);

    const confirmarButton = document.createElement('button');
    confirmarButton.type = 'button';
    confirmarButton.className = 'button button--primary view-agenda-horario__bloqueo-confirmar';
    confirmarButton.textContent = 'Crear bloqueo de todos modos';
    confirmarButton.addEventListener('click', () => handleCrearBloqueo(true));
    bloqueoConfirm.appendChild(confirmarButton);

    const cancelarConfirmButton = document.createElement('button');
    cancelarConfirmButton.type = 'button';
    cancelarConfirmButton.className = 'view-agenda-horario__bloqueo-cancelar-confirm';
    cancelarConfirmButton.textContent = 'Cancelar';
    cancelarConfirmButton.addEventListener('click', () => {
      bloqueoConfirm.hidden = true;
    });
    bloqueoConfirm.appendChild(cancelarConfirmButton);

    wrapper.appendChild(bloqueoConfirm);
  }

  container.appendChild(wrapper);
```

2. Reemplaza:

```js
    const result = await apiPost({ accion: 'actualizarHorarioConfig', token: ctx.session.token, horario });
    if (result.error) {
      if (handleAuthError(result)) return;
      horarioError.textContent = result.error;
      horarioError.hidden = false;
      return;
    }
    await loadHorario();
  }

  loadHorario();
}
```

con:

```js
    const result = await apiPost({ accion: 'actualizarHorarioConfig', token: ctx.session.token, horario });
    if (result.error) {
      if (handleAuthError(result)) return;
      horarioError.textContent = result.error;
      horarioError.hidden = false;
      return;
    }
    await loadHorario();
  }

  async function loadBloqueos() {
    const result = await apiGet('leerBloqueos', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      bloqueosError.textContent = result.error;
      bloqueosError.hidden = false;
      return;
    }
    bloqueosError.hidden = true;
    renderBloqueosList(result.bloqueos);
  }

  function renderBloqueosList(bloqueos) {
    bloqueosList.innerHTML = '';
    bloqueos.forEach((bloqueo) => {
      const li = document.createElement('li');
      li.className = 'view-agenda-horario__bloqueo-item';
      li.dataset.id = bloqueo.id;

      const texto = document.createElement('span');
      texto.textContent = `${bloqueo.fechaInicio} – ${bloqueo.fechaFin}: ${bloqueo.motivo}`;
      li.appendChild(texto);

      if (puedeEditar) {
        const eliminarButton = document.createElement('button');
        eliminarButton.type = 'button';
        eliminarButton.className = 'view-agenda-horario__bloqueo-eliminar';
        eliminarButton.textContent = 'Eliminar';
        eliminarButton.addEventListener('click', () => handleEliminarBloqueo(bloqueo.id));
        li.appendChild(eliminarButton);
      }

      bloqueosList.appendChild(li);
    });
  }

  async function handleEliminarBloqueo(bloqueoId) {
    if (!window.confirm('¿Eliminar este bloqueo?')) return;
    const result = await apiPost({ accion: 'eliminarBloqueo', token: ctx.session.token, bloqueoId });
    if (result.error) {
      if (handleAuthError(result)) return;
      bloqueosError.textContent = result.error;
      bloqueosError.hidden = false;
      return;
    }
    bloqueosError.hidden = true;
    await loadBloqueos();
  }

  async function handleCrearBloqueo(confirmar) {
    bloqueosError.hidden = true;

    const fechaInicio = wrapper.querySelector('.view-agenda-horario__bloqueo-fecha-inicio').value;
    const fechaFin = wrapper.querySelector('.view-agenda-horario__bloqueo-fecha-fin').value;
    const motivo = wrapper.querySelector('.view-agenda-horario__bloqueo-motivo').value;

    const result = await apiPost({ accion: 'crearBloqueo', token: ctx.session.token, fechaInicio, fechaFin, motivo, confirmar });
    if (result.error) {
      if (handleAuthError(result)) return;
      bloqueosError.textContent = result.error;
      bloqueosError.hidden = false;
      return;
    }

    const bloqueoConfirm = wrapper.querySelector('.view-agenda-horario__bloqueo-confirm');
    if (result.requiereConfirmacion) {
      const citasAfectadasList = wrapper.querySelector('.view-agenda-horario__citas-afectadas');
      citasAfectadasList.innerHTML = '';
      result.citasAfectadas.forEach((cita) => {
        const li = document.createElement('li');
        li.textContent = `${cita.fecha} ${cita.horaInicio} - ${cita.pacienteNombre}`;
        citasAfectadasList.appendChild(li);
      });
      bloqueoConfirm.hidden = false;
      return;
    }

    bloqueoConfirm.hidden = true;
    wrapper.querySelector('.view-agenda-horario__bloqueo-fecha-inicio').value = '';
    wrapper.querySelector('.view-agenda-horario__bloqueo-fecha-fin').value = '';
    wrapper.querySelector('.view-agenda-horario__bloqueo-motivo').value = '';
    await loadBloqueos();
  }

  loadHorario();
  loadBloqueos();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/portal/views/agenda-horario.test.js`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/portal/views/agenda-horario.js tests/portal/views/agenda-horario.test.js
git commit -m "feat(frontend): add bloqueos management to agenda-horario view"
```

---

## Task 12: `agenda.js` — cuadrícula semanal y panel "Configurar horario"

**Files:**
- Create: `src/portal/views/agenda.js`
- Test: `tests/portal/views/agenda.test.js`

- [ ] **Step 1: Write the failing test**

Crea `tests/portal/views/agenda.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initAgendaView } from '../../../src/portal/views/agenda.js';
import { initAgendaHorarioView } from '../../../src/portal/views/agenda-horario.js';
import { setSession, getSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('../../../src/portal/views/agenda-horario.js', () => ({
  initAgendaHorarioView: vi.fn((container) => {
    container.textContent = 'agenda-horario-mock';
  }),
}));

const ADMIN_SESSION = { token: 'admin-tok', codigo: 'ADM001', rol: 'administrador', nombre: 'Admin', debeCambiarPassword: false };

const AGENDA_RESPONSE = {
  ok: true,
  horarioConfig: [],
  bloqueos: [],
  slots: [
    { fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', estado: 'ocupado', citaId: 'c1', pacienteNombre: 'M. Garcia', estadoCita: 'Programada' },
    { fecha: '2026-06-15', horaInicio: '09:45', horaFin: '10:30', estado: 'disponible' },
    { fecha: '2026-06-16', horaInicio: '09:00', horaFin: '09:45', estado: 'bloqueado' },
    { fecha: '2026-06-16', horaInicio: '09:45', horaFin: '10:30', estado: 'disponible' },
    { fecha: '2026-06-17', horaInicio: '09:00', horaFin: '09:45', estado: 'disponible' },
  ],
};

// Reimplementacion local de las funciones de fecha para calcular el valor
// esperado de "la semana actual" sin depender de mockear el reloj.
function formatearFecha(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function lunesDeSemana(date) {
  const dia = (date.getDay() + 6) % 7;
  const lunes = new Date(date);
  lunes.setDate(date.getDate() - dia);
  return lunes;
}

function sumarDias(date, dias) {
  const result = new Date(date);
  result.setDate(date.getDate() + dias);
  return result;
}

function ddmm(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initAgendaView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(ADMIN_SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockResolvedValue(AGENDA_RESPONSE);
    apiPost.mockReset();
    initAgendaHorarioView.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renderiza la cuadricula semanal a partir de leerAgenda', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const headerCells = container.querySelectorAll('.view-agenda__grid thead th');
    expect(headerCells.length).toBe(4);
    expect(headerCells[0].textContent).toBe('Hora');
    expect(headerCells[1].textContent).toBe('Lun 15');
    expect(headerCells[2].textContent).toBe('Mar 16');
    expect(headerCells[3].textContent).toBe('Mié 17');

    const rows = container.querySelectorAll('.view-agenda__grid tbody tr');
    expect(rows.length).toBe(2);

    const row1 = rows[0].querySelectorAll('td');
    expect(row1[0].textContent).toBe('09:00');
    expect(row1[1].className).toContain('view-agenda__cell--ocupado');
    expect(row1[1].textContent).toBe('M. Garcia');
    expect(row1[1].dataset.citaId).toBe('c1');
    expect(row1[2].className).toContain('view-agenda__cell--bloqueado');
    expect(row1[3].className).toContain('view-agenda__cell--disponible');

    const row2 = rows[1].querySelectorAll('td');
    expect(row2[0].textContent).toBe('09:45');
    expect(row2[1].className).toContain('view-agenda__cell--disponible');
    expect(row2[1].dataset.fecha).toBe('2026-06-15');
    expect(row2[1].dataset.horaInicio).toBe('09:45');
    expect(row2[2].className).toContain('view-agenda__cell--disponible');
    expect(row2[3].className).toContain('view-agenda__cell--vacio');
  });

  it('el rango de fechas por defecto es la semana actual (lunes a domingo)', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const lunes = lunesDeSemana(new Date());
    const domingo = sumarDias(lunes, 6);
    expect(apiGet).toHaveBeenCalledWith('leerAgenda', {
      token: 'admin-tok',
      fechaInicio: formatearFecha(lunes),
      fechaFin: formatearFecha(domingo),
    });
  });

  it('muestra el rango de la semana actual en el encabezado', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const lunes = lunesDeSemana(new Date());
    const domingo = sumarDias(lunes, 6);
    expect(container.querySelector('.view-agenda__semana-label').textContent).toBe(
      `Semana del ${ddmm(lunes)} al ${ddmm(domingo)}`
    );
  });

  it('la navegacion recarga leerAgenda con la semana anterior y siguiente', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const lunes = lunesDeSemana(new Date());
    const fechaInicioActual = formatearFecha(lunes);
    const fechaFinActual = formatearFecha(sumarDias(lunes, 6));

    container.querySelector('.view-agenda__prev').click();
    await flush();

    const lunesAnterior = sumarDias(lunes, -7);
    expect(apiGet).toHaveBeenLastCalledWith('leerAgenda', {
      token: 'admin-tok',
      fechaInicio: formatearFecha(lunesAnterior),
      fechaFin: formatearFecha(sumarDias(lunesAnterior, 6)),
    });

    container.querySelector('.view-agenda__next').click();
    await flush();

    expect(apiGet).toHaveBeenLastCalledWith('leerAgenda', {
      token: 'admin-tok',
      fechaInicio: fechaInicioActual,
      fechaFin: fechaFinActual,
    });
  });

  it('el boton Configurar horario abre el panel agenda-horario y Cerrar lo oculta y recarga', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const panel = container.querySelector('.view-agenda__panel');
    expect(panel.hidden).toBe(true);

    container.querySelector('.view-agenda__configurar-horario').click();

    expect(panel.hidden).toBe(false);
    expect(initAgendaHorarioView).toHaveBeenCalledWith(expect.any(HTMLElement), { session: ADMIN_SESSION, forced: false });
    expect(panel.textContent).toContain('agenda-horario-mock');

    const apiGetCallsBefore = apiGet.mock.calls.length;
    container.querySelector('.view-agenda__panel-cerrar').click();
    await flush();

    expect(panel.hidden).toBe(true);
    expect(apiGet.mock.calls.length).toBe(apiGetCallsBefore + 1);
  });

  it('muestra un error inline si leerAgenda devuelve un error', async () => {
    apiGet.mockResolvedValue({ error: 'fechaInicio y fechaFin son requeridos' });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const errorEl = container.querySelector('.view-agenda__error');
    expect(errorEl.textContent).toBe('fechaInicio y fechaFin son requeridos');
    expect(errorEl.hidden).toBe(false);
  });

  it('redirige al login si leerAgenda devuelve No autorizado', async () => {
    apiGet.mockResolvedValue({ error: 'No autorizado' });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/portal/views/agenda.test.js`
Expected: FAIL — no se puede resolver el módulo
`../../../src/portal/views/agenda.js`.

- [ ] **Step 3: Implement the weekly grid view**

Crea `src/portal/views/agenda.js`:

```js
import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';
import { initAgendaHorarioView } from './agenda-horario.js';

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function formatearFecha(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatearFechaDDMM(fecha) {
  const [, m, d] = fecha.split('-');
  return `${d}/${m}`;
}

function formatearFechaCorta(fecha) {
  const date = new Date(`${fecha}T00:00:00`);
  const dia = (date.getDay() + 6) % 7;
  const d = String(date.getDate()).padStart(2, '0');
  return `${DIAS_CORTOS[dia]} ${d}`;
}

function lunesDeSemana(date) {
  const dia = (date.getDay() + 6) % 7;
  const lunes = new Date(date);
  lunes.setDate(date.getDate() - dia);
  return lunes;
}

function sumarDias(date, dias) {
  const result = new Date(date);
  result.setDate(date.getDate() + dias);
  return result;
}

export function initAgendaView(container, ctx) {
  container.innerHTML = '';

  let semanaInicio = lunesDeSemana(new Date());

  const wrapper = document.createElement('div');
  wrapper.className = 'view-agenda';

  const header = document.createElement('div');
  header.className = 'view-agenda__header';

  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.className = 'view-agenda__prev';
  prevButton.textContent = '‹';
  prevButton.addEventListener('click', () => {
    semanaInicio = sumarDias(semanaInicio, -7);
    loadAgenda();
  });
  header.appendChild(prevButton);

  const semanaLabel = document.createElement('span');
  semanaLabel.className = 'view-agenda__semana-label';
  header.appendChild(semanaLabel);

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'view-agenda__next';
  nextButton.textContent = '›';
  nextButton.addEventListener('click', () => {
    semanaInicio = sumarDias(semanaInicio, 7);
    loadAgenda();
  });
  header.appendChild(nextButton);

  const configurarHorarioButton = document.createElement('button');
  configurarHorarioButton.type = 'button';
  configurarHorarioButton.className = 'button button--primary view-agenda__configurar-horario';
  configurarHorarioButton.textContent = 'Configurar horario';
  configurarHorarioButton.addEventListener('click', () => {
    panelContainer.hidden = false;
    panelContainer.innerHTML = '';

    const cerrarButton = document.createElement('button');
    cerrarButton.type = 'button';
    cerrarButton.className = 'view-agenda__panel-cerrar';
    cerrarButton.textContent = 'Cerrar';
    cerrarButton.addEventListener('click', () => {
      panelContainer.hidden = true;
      panelContainer.innerHTML = '';
      loadAgenda();
    });
    panelContainer.appendChild(cerrarButton);

    const panelContent = document.createElement('div');
    panelContainer.appendChild(panelContent);
    initAgendaHorarioView(panelContent, ctx);
  });
  header.appendChild(configurarHorarioButton);

  wrapper.appendChild(header);

  const errorEl = document.createElement('div');
  errorEl.className = 'view-agenda__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const gridTable = document.createElement('table');
  gridTable.className = 'view-agenda__grid';
  wrapper.appendChild(gridTable);

  const panelContainer = document.createElement('div');
  panelContainer.className = 'view-agenda__panel';
  panelContainer.hidden = true;
  wrapper.appendChild(panelContainer);

  container.appendChild(wrapper);

  async function loadAgenda() {
    const fechaInicio = formatearFecha(semanaInicio);
    const fechaFin = formatearFecha(sumarDias(semanaInicio, 6));
    semanaLabel.textContent = `Semana del ${formatearFechaDDMM(fechaInicio)} al ${formatearFechaDDMM(fechaFin)}`;

    const result = await apiGet('leerAgenda', { token: ctx.session.token, fechaInicio, fechaFin });
    if (result.error) {
      if (handleAuthError(result)) return;
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    renderGrid(result.slots);
  }

  function renderGrid(slots) {
    gridTable.innerHTML = '';

    const fechas = [...new Set(slots.map((s) => s.fecha))].sort();
    const horas = [...new Set(slots.map((s) => s.horaInicio))].sort();

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const horaTh = document.createElement('th');
    horaTh.textContent = 'Hora';
    headerRow.appendChild(horaTh);
    fechas.forEach((fecha) => {
      const th = document.createElement('th');
      th.textContent = formatearFechaCorta(fecha);
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    gridTable.appendChild(thead);

    const tbody = document.createElement('tbody');
    horas.forEach((hora) => {
      const tr = document.createElement('tr');
      const horaTd = document.createElement('td');
      horaTd.textContent = hora;
      tr.appendChild(horaTd);

      fechas.forEach((fecha) => {
        const slot = slots.find((s) => s.fecha === fecha && s.horaInicio === hora);
        const td = document.createElement('td');
        td.className = 'view-agenda__cell';

        if (!slot) {
          td.classList.add('view-agenda__cell--vacio');
        } else if (slot.estado === 'disponible') {
          td.classList.add('view-agenda__cell--disponible');
          td.dataset.fecha = slot.fecha;
          td.dataset.horaInicio = slot.horaInicio;
          td.dataset.horaFin = slot.horaFin;
        } else if (slot.estado === 'ocupado') {
          td.classList.add('view-agenda__cell--ocupado');
          td.textContent = slot.pacienteNombre;
          td.dataset.citaId = slot.citaId;
          td.dataset.fecha = slot.fecha;
          td.dataset.horaInicio = slot.horaInicio;
          td.dataset.horaFin = slot.horaFin;
          td.dataset.estadoCita = slot.estadoCita;
        } else if (slot.estado === 'bloqueado') {
          td.classList.add('view-agenda__cell--bloqueado');
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
    gridTable.appendChild(tbody);
  }

  loadAgenda();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/portal/views/agenda.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/portal/views/agenda.js tests/portal/views/agenda.test.js
git commit -m "feat(frontend): add agenda view with weekly grid and horario panel toggle"
```

---

## Task 13: `agenda.js` — formulario "Nueva cita"

**Files:**
- Modify: `tests/portal/views/agenda.test.js`
- Modify: `src/portal/views/agenda.js`

- [ ] **Step 1: Modify the test file**

Aplica estos cambios a `tests/portal/views/agenda.test.js`:

**Cambio 1:** Añade `PACIENTES_RESPONSE` justo después de la constante `AGENDA_RESPONSE`:

```js
const PACIENTES_RESPONSE = {
  ok: true,
  pacientes: [
    { codigo: 'P001', nombre: 'Maria Garcia' },
    { codigo: 'P002', nombre: 'Juan Lopez' },
    { codigo: 'P003', nombre: 'Ana Ruiz' },
  ],
};
```

**Cambio 2:** En `beforeEach`, reemplaza:

```js
    apiGet.mockResolvedValue(AGENDA_RESPONSE);
```

por:

```js
    apiGet.mockImplementation((accion) => {
      if (accion === 'leerAgenda') return Promise.resolve(AGENDA_RESPONSE);
      if (accion === 'listarPacientes') return Promise.resolve(PACIENTES_RESPONSE);
      return Promise.resolve({ error: 'Accion no reconocida' });
    });
```

**Cambio 3:** Justo antes del `});` final que cierra el `describe('initAgendaView', () => { ... })`, añade estos 7 tests nuevos:

```js

  it('al hacer click en una celda disponible se abre el formulario Nueva cita', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--disponible[data-fecha="2026-06-15"][data-hora-inicio="09:45"]');
    cell.click();
    await flush();

    expect(apiGet).toHaveBeenCalledWith('listarPacientes', { token: 'admin-tok' });

    const panel = container.querySelector('.view-agenda__cita-panel');
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('2026-06-15');
    expect(panel.textContent).toContain('09:45 a 10:30');
  });

  it('el formulario Nueva cita filtra pacientes por nombre mientras se escribe', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--disponible[data-fecha="2026-06-15"][data-hora-inicio="09:45"]');
    cell.click();
    await flush();

    const input = container.querySelector('.view-agenda__paciente-input');
    input.value = 'gar';
    input.dispatchEvent(new Event('input'));

    const resultados = container.querySelectorAll('.view-agenda__paciente-resultados li');
    expect(resultados.length).toBe(1);
    expect(resultados[0].textContent).toBe('Maria Garcia');
  });

  it('Guardar llama a crearCita con fecha, horaInicio y pacienteCodigo, y recarga la cuadricula', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      cita: { id: 'c2', fecha: '2026-06-15', horaInicio: '09:45', horaFin: '10:30', pacienteCodigo: 'P001', pacienteNombre: 'Maria Garcia', estado: 'Programada' },
    });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--disponible[data-fecha="2026-06-15"][data-hora-inicio="09:45"]');
    cell.click();
    await flush();

    const input = container.querySelector('.view-agenda__paciente-input');
    input.value = 'gar';
    input.dispatchEvent(new Event('input'));
    container.querySelector('.view-agenda__paciente-resultados li').click();

    const apiGetCallsBefore = apiGet.mock.calls.length;
    container.querySelector('.view-agenda__guardar-cita').click();
    await flush();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'crearCita',
      token: 'admin-tok',
      fecha: '2026-06-15',
      horaInicio: '09:45',
      pacienteCodigo: 'P001',
    });
    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(true);
    expect(apiGet.mock.calls.length).toBe(apiGetCallsBefore + 1);
  });

  it('muestra un error inline si crearCita falla', async () => {
    apiPost.mockResolvedValue({ error: 'Slot no disponible' });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--disponible[data-fecha="2026-06-15"][data-hora-inicio="09:45"]');
    cell.click();
    await flush();

    container.querySelector('.view-agenda__guardar-cita').click();
    await flush();

    const errorEl = container.querySelector('.view-agenda__cita-error');
    expect(errorEl.textContent).toBe('Slot no disponible');
    expect(errorEl.hidden).toBe(false);
  });

  it('Cancelar cierra el formulario Nueva cita sin llamar a crearCita', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--disponible[data-fecha="2026-06-15"][data-hora-inicio="09:45"]');
    cell.click();
    await flush();

    container.querySelector('.view-agenda__cancelar-cita').click();

    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(true);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('redirige al login si listarPacientes devuelve No autorizado', async () => {
    apiGet.mockImplementation((accion) => {
      if (accion === 'leerAgenda') return Promise.resolve(AGENDA_RESPONSE);
      if (accion === 'listarPacientes') return Promise.resolve({ error: 'No autorizado' });
      return Promise.resolve({ error: 'Accion no reconocida' });
    });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--disponible[data-fecha="2026-06-15"][data-hora-inicio="09:45"]');
    cell.click();
    await flush();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/portal/views/agenda.test.js`
Expected: FAIL — las celdas `.view-agenda__cell--disponible` no tienen handler de
click, `.view-agenda__cita-panel` no existe.

- [ ] **Step 3: Modify the implementation**

Aplica estos cambios a `src/portal/views/agenda.js`:

**Cambio 1:** Justo antes de `container.appendChild(wrapper);`, añade la creación
del panel de "Nueva cita" / "Detalle de cita":

```js
  const citaPanel = document.createElement('div');
  citaPanel.className = 'view-agenda__cita-panel';
  citaPanel.hidden = true;
  wrapper.appendChild(citaPanel);

```

(quedando inmediatamente después del bloque que crea `panelContainer` y antes de
`container.appendChild(wrapper);`).

**Cambio 2:** Dentro de `renderGrid`, en la rama `disponible`, añade el listener de
click. El bloque queda así:

```js
        } else if (slot.estado === 'disponible') {
          td.classList.add('view-agenda__cell--disponible');
          td.dataset.fecha = slot.fecha;
          td.dataset.horaInicio = slot.horaInicio;
          td.dataset.horaFin = slot.horaFin;
          td.addEventListener('click', () => abrirNuevaCita(slot));
        } else if (slot.estado === 'ocupado') {
```

**Cambio 3:** Justo después del cierre de la función `renderGrid` (después de su
`}` de cierre) y antes de `loadAgenda();`, añade la función `abrirNuevaCita`:

```js

  async function abrirNuevaCita(slot) {
    citaPanel.innerHTML = '';
    citaPanel.hidden = false;

    const heading = document.createElement('h3');
    heading.textContent = 'Nueva cita';
    citaPanel.appendChild(heading);

    const info = document.createElement('p');
    info.textContent = `Fecha: ${slot.fecha} — Horario: ${slot.horaInicio} a ${slot.horaFin}`;
    citaPanel.appendChild(info);

    const pacienteInput = document.createElement('input');
    pacienteInput.type = 'text';
    pacienteInput.className = 'view-agenda__paciente-input';
    pacienteInput.placeholder = 'Buscar paciente...';
    citaPanel.appendChild(pacienteInput);

    const pacienteCodigoInput = document.createElement('input');
    pacienteCodigoInput.type = 'hidden';
    pacienteCodigoInput.className = 'view-agenda__paciente-codigo';
    citaPanel.appendChild(pacienteCodigoInput);

    const resultadosList = document.createElement('ul');
    resultadosList.className = 'view-agenda__paciente-resultados';
    citaPanel.appendChild(resultadosList);

    const citaError = document.createElement('div');
    citaError.className = 'view-agenda__cita-error';
    citaError.hidden = true;
    citaPanel.appendChild(citaError);

    const guardarButton = document.createElement('button');
    guardarButton.type = 'button';
    guardarButton.className = 'button button--primary view-agenda__guardar-cita';
    guardarButton.textContent = 'Guardar';
    citaPanel.appendChild(guardarButton);

    const cancelarButton = document.createElement('button');
    cancelarButton.type = 'button';
    cancelarButton.className = 'view-agenda__cancelar-cita';
    cancelarButton.textContent = 'Cancelar';
    cancelarButton.addEventListener('click', () => {
      citaPanel.hidden = true;
      citaPanel.innerHTML = '';
    });
    citaPanel.appendChild(cancelarButton);

    const result = await apiGet('listarPacientes', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      citaError.textContent = result.error;
      citaError.hidden = false;
      return;
    }
    const pacientes = result.pacientes;

    pacienteInput.addEventListener('input', () => {
      const texto = pacienteInput.value.trim().toLowerCase();
      resultadosList.innerHTML = '';
      pacienteCodigoInput.value = '';
      if (!texto) return;
      pacientes
        .filter((p) => p.nombre.toLowerCase().includes(texto))
        .forEach((p) => {
          const li = document.createElement('li');
          li.textContent = p.nombre;
          li.addEventListener('click', () => {
            pacienteInput.value = p.nombre;
            pacienteCodigoInput.value = p.codigo;
            resultadosList.innerHTML = '';
          });
          resultadosList.appendChild(li);
        });
    });

    guardarButton.addEventListener('click', async () => {
      citaError.hidden = true;
      const resultCita = await apiPost({
        accion: 'crearCita',
        token: ctx.session.token,
        fecha: slot.fecha,
        horaInicio: slot.horaInicio,
        pacienteCodigo: pacienteCodigoInput.value,
      });
      if (resultCita.error) {
        if (handleAuthError(resultCita)) return;
        citaError.textContent = resultCita.error;
        citaError.hidden = false;
        return;
      }
      citaPanel.hidden = true;
      citaPanel.innerHTML = '';
      await loadAgenda();
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/portal/views/agenda.test.js`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/portal/views/agenda.js tests/portal/views/agenda.test.js
git commit -m "feat(frontend): add Nueva cita form to agenda view"
```

---

## Task 14: `agenda.js` — panel "Detalle de cita"

**Files:**
- Modify: `tests/portal/views/agenda.test.js`
- Modify: `src/portal/views/agenda.js`

- [ ] **Step 1: Modify the test file**

Justo antes del `});` final que cierra el `describe('initAgendaView', () => { ... })`,
añade estos 6 tests nuevos:

```js

  it('al hacer click en una celda ocupada se abre el panel Detalle de cita con botones de accion', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();

    const panel = container.querySelector('.view-agenda__cita-panel');
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('M. Garcia');
    expect(panel.textContent).toContain('2026-06-15');
    expect(panel.textContent).toContain('09:00 a 09:45');
    expect(panel.textContent).toContain('Programada');
    expect(container.querySelector('.view-agenda__marcar-completada')).not.toBeNull();
    expect(container.querySelector('.view-agenda__cancelar-cita-existente')).not.toBeNull();
  });

  it('Marcar completada llama a cambiarEstadoCita con estado Completada y recarga la cuadricula', async () => {
    apiPost.mockResolvedValue({ ok: true });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();

    const apiGetCallsBefore = apiGet.mock.calls.length;
    container.querySelector('.view-agenda__marcar-completada').click();
    await flush();

    expect(apiPost).toHaveBeenCalledWith({ accion: 'cambiarEstadoCita', token: 'admin-tok', citaId: 'c1', estado: 'Completada' });
    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(true);
    expect(apiGet.mock.calls.length).toBe(apiGetCallsBefore + 1);
  });

  it('el boton Cancelar del detalle llama a cambiarEstadoCita con estado Cancelada', async () => {
    apiPost.mockResolvedValue({ ok: true });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();

    container.querySelector('.view-agenda__cancelar-cita-existente').click();
    await flush();

    expect(apiPost).toHaveBeenCalledWith({ accion: 'cambiarEstadoCita', token: 'admin-tok', citaId: 'c1', estado: 'Cancelada' });
  });

  it('muestra un error inline si cambiarEstadoCita falla', async () => {
    apiPost.mockResolvedValue({ error: 'Solo se puede cambiar el estado de una cita Programada' });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();

    container.querySelector('.view-agenda__marcar-completada').click();
    await flush();

    const errorEl = container.querySelector('.view-agenda__detalle-error');
    expect(errorEl.textContent).toBe('Solo se puede cambiar el estado de una cita Programada');
    expect(errorEl.hidden).toBe(false);
  });

  it('una cita en estado Completada o Cancelada se muestra de solo lectura sin botones de accion', async () => {
    const response = {
      ...AGENDA_RESPONSE,
      slots: AGENDA_RESPONSE.slots.map((s) =>
        s.citaId === 'c1' ? { ...s, estadoCita: 'Completada' } : s
      ),
    };
    apiGet.mockImplementation((accion) => {
      if (accion === 'leerAgenda') return Promise.resolve(response);
      if (accion === 'listarPacientes') return Promise.resolve(PACIENTES_RESPONSE);
      return Promise.resolve({ error: 'Accion no reconocida' });
    });

    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();

    const panel = container.querySelector('.view-agenda__cita-panel');
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('Completada');
    expect(container.querySelector('.view-agenda__marcar-completada')).toBeNull();
    expect(container.querySelector('.view-agenda__cancelar-cita-existente')).toBeNull();
  });

  it('Cerrar cierra el panel Detalle de cita sin llamar a cambiarEstadoCita', async () => {
    initAgendaView(container, { session: ADMIN_SESSION, forced: false });
    await flush();

    const cell = container.querySelector('.view-agenda__cell--ocupado[data-fecha="2026-06-15"][data-hora-inicio="09:00"]');
    cell.click();

    container.querySelector('.view-agenda__cerrar-detalle').click();

    expect(container.querySelector('.view-agenda__cita-panel').hidden).toBe(true);
    expect(apiPost).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/portal/views/agenda.test.js`
Expected: FAIL — las celdas `.view-agenda__cell--ocupado` no tienen handler de
click, no existen `.view-agenda__marcar-completada`,
`.view-agenda__cancelar-cita-existente`, `.view-agenda__detalle-error` ni
`.view-agenda__cerrar-detalle`.

- [ ] **Step 3: Modify the implementation**

Aplica estos cambios a `src/portal/views/agenda.js`:

**Cambio 1:** Dentro de `renderGrid`, en la rama `ocupado`, añade el listener de
click. El bloque queda así:

```js
        } else if (slot.estado === 'ocupado') {
          td.classList.add('view-agenda__cell--ocupado');
          td.textContent = slot.pacienteNombre;
          td.dataset.citaId = slot.citaId;
          td.dataset.fecha = slot.fecha;
          td.dataset.horaInicio = slot.horaInicio;
          td.dataset.horaFin = slot.horaFin;
          td.dataset.estadoCita = slot.estadoCita;
          td.addEventListener('click', () => abrirDetalleCita(slot));
        } else if (slot.estado === 'bloqueado') {
```

**Cambio 2:** Justo después del cierre de la función `abrirNuevaCita` (después de
su `}` de cierre) y antes de `loadAgenda();`, añade la función
`abrirDetalleCita`:

```js

  function abrirDetalleCita(slot) {
    citaPanel.innerHTML = '';
    citaPanel.hidden = false;

    const heading = document.createElement('h3');
    heading.textContent = 'Detalle de cita';
    citaPanel.appendChild(heading);

    const info = document.createElement('p');
    info.textContent = `Paciente: ${slot.pacienteNombre} — Fecha: ${slot.fecha} — Horario: ${slot.horaInicio} a ${slot.horaFin} — Estado: ${slot.estadoCita}`;
    citaPanel.appendChild(info);

    const detalleError = document.createElement('div');
    detalleError.className = 'view-agenda__detalle-error';
    detalleError.hidden = true;
    citaPanel.appendChild(detalleError);

    async function handleCambiarEstado(estado) {
      detalleError.hidden = true;
      const result = await apiPost({ accion: 'cambiarEstadoCita', token: ctx.session.token, citaId: slot.citaId, estado });
      if (result.error) {
        if (handleAuthError(result)) return;
        detalleError.textContent = result.error;
        detalleError.hidden = false;
        return;
      }
      citaPanel.hidden = true;
      citaPanel.innerHTML = '';
      await loadAgenda();
    }

    if (slot.estadoCita === 'Programada') {
      const completarButton = document.createElement('button');
      completarButton.type = 'button';
      completarButton.className = 'button button--primary view-agenda__marcar-completada';
      completarButton.textContent = 'Marcar completada';
      completarButton.addEventListener('click', () => handleCambiarEstado('Completada'));
      citaPanel.appendChild(completarButton);

      const cancelarCitaButton = document.createElement('button');
      cancelarCitaButton.type = 'button';
      cancelarCitaButton.className = 'view-agenda__cancelar-cita-existente';
      cancelarCitaButton.textContent = 'Cancelar';
      cancelarCitaButton.addEventListener('click', () => handleCambiarEstado('Cancelada'));
      citaPanel.appendChild(cancelarCitaButton);
    }

    const cerrarButton = document.createElement('button');
    cerrarButton.type = 'button';
    cerrarButton.className = 'view-agenda__cerrar-detalle';
    cerrarButton.textContent = 'Cerrar';
    cerrarButton.addEventListener('click', () => {
      citaPanel.hidden = true;
      citaPanel.innerHTML = '';
    });
    citaPanel.appendChild(cerrarButton);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/portal/views/agenda.test.js`
Expected: PASS (20 tests).

- [ ] **Step 5: Commit**

```bash
git add src/portal/views/agenda.js tests/portal/views/agenda.test.js
git commit -m "feat(frontend): add Detalle de cita panel to agenda view"
```

---

## Task 15: `mi-agenda.js` — vista del paciente

**Files:**
- Create: `src/portal/views/mi-agenda.js`
- Test: `tests/portal/views/mi-agenda.test.js`

- [ ] **Step 1: Write the failing test**

Crea `tests/portal/views/mi-agenda.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initMiAgendaView } from '../../../src/portal/views/mi-agenda.js';
import { setSession, getSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const USER_SESSION = { token: 'user-tok', codigo: 'PAC001', rol: 'usuario', nombre: 'Paciente Test', debeCambiarPassword: false };

const MI_AGENDA_RESPONSE = {
  ok: true,
  proximas: [
    { id: 'c6', fecha: '2026-06-17', horaInicio: '09:00', horaFin: '09:45', estado: 'Programada' },
    { id: 'c2', fecha: '2026-06-18', horaInicio: '10:30', horaFin: '11:15', estado: 'Programada' },
  ],
  historial: [
    { id: 'c4', fecha: '2026-06-19', horaInicio: '09:00', horaFin: '09:45', estado: 'Completada' },
    { id: 'c3', fecha: '2026-06-16', horaInicio: '09:00', horaFin: '09:45', estado: 'Cancelada' },
  ],
};

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initMiAgendaView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(USER_SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockResolvedValue(MI_AGENDA_RESPONSE);
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renderiza las proximas citas con boton Cancelar para citas Programadas', async () => {
    initMiAgendaView(container, { session: USER_SESSION, forced: false });
    await flush();

    expect(apiGet).toHaveBeenCalledWith('leerMiAgenda', { token: 'user-tok' });

    const items = container.querySelectorAll('.view-mi-agenda__proximas li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('2026-06-17 09:00 - 09:45 (Programada)');
    expect(items[0].querySelector('.view-mi-agenda__cancelar')).not.toBeNull();
    expect(items[1].textContent).toContain('2026-06-18 10:30 - 11:15 (Programada)');
  });

  it('renderiza el historial de solo lectura sin botones', async () => {
    initMiAgendaView(container, { session: USER_SESSION, forced: false });
    await flush();

    const items = container.querySelectorAll('.view-mi-agenda__historial li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('2026-06-19 09:00 - 09:45 (Completada)');
    expect(items[0].querySelector('button')).toBeNull();
    expect(items[1].textContent).toContain('2026-06-16 09:00 - 09:45 (Cancelada)');
  });

  it('muestra el estado vacio para proximas e historial cuando no hay citas', async () => {
    apiGet.mockResolvedValue({ ok: true, proximas: [], historial: [] });

    initMiAgendaView(container, { session: USER_SESSION, forced: false });
    await flush();

    expect(container.querySelector('.view-mi-agenda__proximas').textContent).toContain('No tienes citas próximas.');
    expect(container.querySelector('.view-mi-agenda__historial').textContent).toContain('No tienes citas en tu historial.');
  });

  it('permite cancelar una cita propia con confirmacion y recarga ambas listas', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    apiPost.mockResolvedValue({ ok: true });

    initMiAgendaView(container, { session: USER_SESSION, forced: false });
    await flush();

    container.querySelector('.view-mi-agenda__proximas li .view-mi-agenda__cancelar').click();
    await flush();

    expect(apiPost).toHaveBeenCalledWith({ accion: 'cancelarMiCita', token: 'user-tok', citaId: 'c6' });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('no cancela una cita si se cancela la confirmacion', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    initMiAgendaView(container, { session: USER_SESSION, forced: false });
    await flush();

    container.querySelector('.view-mi-agenda__proximas li .view-mi-agenda__cancelar').click();
    await flush();

    expect(apiPost).not.toHaveBeenCalled();
  });

  it('muestra un error inline si cancelarMiCita falla', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    apiPost.mockResolvedValue({ error: 'Solo se pueden cancelar citas Programadas' });

    initMiAgendaView(container, { session: USER_SESSION, forced: false });
    await flush();

    container.querySelector('.view-mi-agenda__proximas li .view-mi-agenda__cancelar').click();
    await flush();

    const errorEl = container.querySelector('.view-mi-agenda__error');
    expect(errorEl.textContent).toBe('Solo se pueden cancelar citas Programadas');
    expect(errorEl.hidden).toBe(false);
  });

  it('redirige al login si leerMiAgenda devuelve No autorizado', async () => {
    apiGet.mockResolvedValue({ error: 'No autorizado' });

    initMiAgendaView(container, { session: USER_SESSION, forced: false });
    await flush();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/portal/views/mi-agenda.test.js`
Expected: FAIL — no se puede resolver el módulo
`../../../src/portal/views/mi-agenda.js`.

- [ ] **Step 3: Implement the patient view**

Crea `src/portal/views/mi-agenda.js`:

```js
import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';

export function initMiAgendaView(container, ctx) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'view-mi-agenda';

  const errorEl = document.createElement('div');
  errorEl.className = 'view-mi-agenda__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const proximasHeading = document.createElement('h2');
  proximasHeading.textContent = 'Próximas citas';
  wrapper.appendChild(proximasHeading);

  const proximasList = document.createElement('ul');
  proximasList.className = 'view-mi-agenda__proximas';
  wrapper.appendChild(proximasList);

  const historialHeading = document.createElement('h2');
  historialHeading.textContent = 'Historial';
  wrapper.appendChild(historialHeading);

  const historialList = document.createElement('ul');
  historialList.className = 'view-mi-agenda__historial';
  wrapper.appendChild(historialList);

  container.appendChild(wrapper);

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.hidden = true;
  }

  async function loadMiAgenda() {
    const result = await apiGet('leerMiAgenda', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    clearError();
    renderProximas(result.proximas);
    renderHistorial(result.historial);
  }

  function renderProximas(proximas) {
    proximasList.innerHTML = '';
    if (proximas.length === 0) {
      const li = document.createElement('li');
      li.className = 'view-mi-agenda__vacio';
      li.textContent = 'No tienes citas próximas.';
      proximasList.appendChild(li);
      return;
    }
    proximas.forEach((cita) => {
      const li = document.createElement('li');
      li.className = 'view-mi-agenda__cita';
      li.dataset.id = cita.id;

      const span = document.createElement('span');
      span.textContent = `${cita.fecha} ${cita.horaInicio} - ${cita.horaFin} (${cita.estado})`;
      li.appendChild(span);

      if (cita.estado === 'Programada') {
        const cancelarButton = document.createElement('button');
        cancelarButton.type = 'button';
        cancelarButton.className = 'view-mi-agenda__cancelar';
        cancelarButton.textContent = 'Cancelar';
        cancelarButton.addEventListener('click', () => handleCancelar(cita.id));
        li.appendChild(cancelarButton);
      }

      proximasList.appendChild(li);
    });
  }

  function renderHistorial(historial) {
    historialList.innerHTML = '';
    if (historial.length === 0) {
      const li = document.createElement('li');
      li.className = 'view-mi-agenda__vacio';
      li.textContent = 'No tienes citas en tu historial.';
      historialList.appendChild(li);
      return;
    }
    historial.forEach((cita) => {
      const li = document.createElement('li');
      li.className = 'view-mi-agenda__cita';
      li.textContent = `${cita.fecha} ${cita.horaInicio} - ${cita.horaFin} (${cita.estado})`;
      historialList.appendChild(li);
    });
  }

  async function handleCancelar(citaId) {
    if (!window.confirm('¿Cancelar esta cita?')) return;
    const result = await apiPost({ accion: 'cancelarMiCita', token: ctx.session.token, citaId });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    await loadMiAgenda();
  }

  loadMiAgenda();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/portal/views/mi-agenda.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/portal/views/mi-agenda.js tests/portal/views/mi-agenda.test.js
git commit -m "feat(frontend): add mi-agenda view for patient self-service"
```

---

## Task 16: `dashboard.js` — wiring final de `MENUS` y `VIEWS`

**Files:**
- Modify: `src/portal/dashboard.js`
- Modify: `tests/portal/dashboard.test.js`

- [ ] **Step 1: Modify the test file**

Aplica estos cambios a `tests/portal/dashboard.test.js`:

**Cambio 1:** Añade los imports y mocks de las nuevas vistas. Después de:

```js
import { initCambiarPasswordView } from '../../src/portal/views/cambiar-password.js';
```

añade:

```js
import { initAgendaView } from '../../src/portal/views/agenda.js';
import { initMiAgendaView } from '../../src/portal/views/mi-agenda.js';
```

Y después de:

```js
vi.mock('../../src/portal/views/cambiar-password.js', () => ({ initCambiarPasswordView: vi.fn() }));
```

añade:

```js
vi.mock('../../src/portal/views/agenda.js', () => ({ initAgendaView: vi.fn() }));
vi.mock('../../src/portal/views/mi-agenda.js', () => ({ initMiAgendaView: vi.fn() }));
```

**Cambio 2:** Justo después del test `'cambia de vista al hacer click en un item habilitado'` (después de su `});` de cierre) y antes del test `'fuerza la vista de cambiar contrasena...'`, añade estos 2 tests nuevos:

```js

  it('cambia a la vista agenda al hacer click en el item Agenda para administrador', () => {
    setSession(ADMIN_SESSION);

    initDashboard();
    document.querySelector('#nav-menu .dashboard-nav__item[data-view="agenda"]').click();

    expect(initAgendaView).toHaveBeenCalledWith(document.getElementById('dashboard-main'), {
      session: ADMIN_SESSION,
      forced: false,
    });
  });

  it('cambia a la vista mi-agenda al hacer click en el item Mi agenda para usuario', () => {
    const session = { token: 'tok', codigo: 'PAC001', rol: 'usuario', nombre: 'Paciente', debeCambiarPassword: false };
    setSession(session);

    initDashboard();
    document.querySelector('#nav-menu .dashboard-nav__item[data-view="mi-agenda"]').click();

    expect(initMiAgendaView).toHaveBeenCalledWith(document.getElementById('dashboard-main'), {
      session,
      forced: false,
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/portal/dashboard.test.js`
Expected: FAIL — `agenda` y `mi-agenda` siguen `disabled` en `MENUS`
(`enabled: false`), por lo que los botones no tienen listener de click y
`initAgendaView`/`initMiAgendaView` nunca se llaman.

- [ ] **Step 3: Wire up the new views**

Aplica estos cambios a `src/portal/dashboard.js`:

**Cambio 1:** Añade los imports de las nuevas vistas después de:

```js
import { initCambiarPasswordView } from './views/cambiar-password.js';
```

```js
import { initAgendaView } from './views/agenda.js';
import { initMiAgendaView } from './views/mi-agenda.js';
```

**Cambio 2:** Reemplaza el objeto `MENUS` completo:

```js
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
```

por:

```js
export const MENUS = {
  administrador: [
    { id: 'usuarios', label: 'Gestión de usuarios', enabled: true },
    { id: 'agenda', label: 'Agenda', enabled: true },
    { id: 'historia-clinica', label: 'Historia Clínica', enabled: false },
    { id: 'prescripciones', label: 'Prescripciones', enabled: false },
    { id: 'escalas', label: 'Escalas', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
  psiquiatra: [
    { id: 'agenda', label: 'Agenda', enabled: true },
    { id: 'historia-clinica', label: 'Historia Clínica', enabled: false },
    { id: 'prescripciones', label: 'Prescripciones', enabled: false },
    { id: 'escalas', label: 'Escalas', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
  recepcion: [
    { id: 'agenda', label: 'Agenda', enabled: true },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
  usuario: [
    { id: 'mi-agenda', label: 'Mi agenda', enabled: true },
    { id: 'mis-escalas', label: 'Mis escalas', enabled: false },
    { id: 'mis-actividades', label: 'Mis actividades', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
};
```

**Cambio 3:** Reemplaza el objeto `VIEWS`:

```js
export const VIEWS = {
  inicio: initInicioView,
  usuarios: initUsuariosView,
  'cambiar-password': initCambiarPasswordView,
};
```

por:

```js
export const VIEWS = {
  inicio: initInicioView,
  usuarios: initUsuariosView,
  'cambiar-password': initCambiarPasswordView,
  agenda: initAgendaView,
  'mi-agenda': initMiAgendaView,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/portal/dashboard.test.js`
Expected: PASS (12 tests).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — todos los tests de backend (`backend/tests/`) y frontend
(`tests/`) en verde.

- [ ] **Step 6: Commit**

```bash
git add src/portal/dashboard.js tests/portal/dashboard.test.js
git commit -m "feat(frontend): enable agenda and mi-agenda views in dashboard navigation"
```

---
