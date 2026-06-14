# Fase 1b: Sincronización con Google Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las citas creadas/gestionadas en SMPDJM (`_citas`) se sincronizan automáticamente (una sola dirección) hacia un calendario dedicado "Consultas SMPDJM" en la cuenta de Google de Petra, sin bloquear ni alterar el resultado de las operaciones sobre `_citas` si la sincronización falla.

**Architecture:** Nuevo módulo `backend/src/calendario.js` (sin dependencias de `agenda.js`) expone `obtenerCalendarioConsultas`, `crearEventoCita` y `eliminarEventoCita`, envolviendo `CalendarApp`/`PropertiesService`. `backend/src/agenda.js` importa de él: `crearCita` crea el evento, `cambiarEstadoCita('Cancelada')` y `cancelarMiCita` lo eliminan. Todas las llamadas van envueltas en `try/catch` con `registrarLog(..., 'calendario_error', ...)` (best-effort). `_citas` gana una décima columna `calendarEventId`. `backend/build.js` debe listar `calendario.js` antes de `agenda.js`, y `backend/src/index.js` añade `CalendarApp` a `gasServices`.

**Tech Stack:** Google Apps Script `CalendarApp` / `PropertiesService` (ejecutados como "Execute as: Me", cuenta de Petra), mockeados en `backend/mocks/gas-services.js` para Vitest (`npx vitest run <archivo>` desde la raíz del repo).

---

### Task 1: Mock de `CalendarApp` + `obtenerCalendarioConsultas`

**Files:**
- Modify: `backend/mocks/gas-services.js`
- Create: `backend/src/calendario.js`
- Create: `backend/tests/calendario.test.js`

- [ ] **Step 1: Añadir `createMockCalendarApp` al mock de servicios GAS**

En `backend/mocks/gas-services.js`, después de la función `createMockContentService` (justo antes de `createMockServices`), añade:

```js
export function createMockCalendarApp() {
  const calendars = new Map();
  let nextCalendarId = 1;
  let nextEventId = 1;

  function buildCalendar(id, name) {
    const events = new Map();
    return {
      getId: () => id,
      getName: () => name,
      createEvent(title, start, end, options) {
        const eventId = `event-${nextEventId++}`;
        const event = {
          getId: () => eventId,
          getTitle: () => title,
          deleteEvent: () => events.delete(eventId),
        };
        events.set(eventId, event);
        return event;
      },
      getEventById: (eventId) => events.get(eventId) || null,
    };
  }

  return {
    getCalendarsByName(name) {
      return [...calendars.values()].filter((cal) => cal.getName() === name);
    },
    createCalendar(name) {
      const id = `calendar-${nextCalendarId++}`;
      const calendar = buildCalendar(id, name);
      calendars.set(id, calendar);
      return calendar;
    },
    getCalendarById(id) {
      return calendars.get(id) || null;
    },
  };
}
```

Luego, en `createMockServices`, añade `CalendarApp: createMockCalendarApp(),` al objeto devuelto:

```js
export function createMockServices(initialData = {}) {
  return {
    Utilities: createMockUtilities(),
    SpreadsheetApp: createMockSpreadsheet(initialData.sheets || {}),
    CacheService: createMockCacheService(),
    PropertiesService: createMockPropertiesService(initialData.properties || {}),
    ContentService: createMockContentService(),
    CalendarApp: createMockCalendarApp(),
  };
}
```

- [ ] **Step 2: Escribir los tests (fallarán: `backend/src/calendario.js` no existe)**

Crea `backend/tests/calendario.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { obtenerCalendarioConsultas } from '../src/calendario.js';

describe('obtenerCalendarioConsultas', () => {
  it('crea el calendario "Consultas SMPDJM" si no existe ninguno', () => {
    const services = createMockServices();
    const calendario = obtenerCalendarioConsultas(services);
    expect(calendario.getName()).toBe('Consultas SMPDJM');
    expect(services.CalendarApp.getCalendarsByName('Consultas SMPDJM')).toHaveLength(1);
  });

  it('en llamadas posteriores reutiliza el mismo calendario (cacheado en PropertiesService)', () => {
    const services = createMockServices();
    const primero = obtenerCalendarioConsultas(services);
    const segundo = obtenerCalendarioConsultas(services);
    expect(segundo.getId()).toBe(primero.getId());
    expect(services.CalendarApp.getCalendarsByName('Consultas SMPDJM')).toHaveLength(1);
  });

  it('si la propiedad no esta guardada, reutiliza un calendario existente por nombre', () => {
    const services = createMockServices();
    const creado = services.CalendarApp.createCalendar('Consultas SMPDJM');
    const encontrado = obtenerCalendarioConsultas(services);
    expect(encontrado.getId()).toBe(creado.getId());
    expect(services.CalendarApp.getCalendarsByName('Consultas SMPDJM')).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Ejecutar los tests y confirmar que fallan**

Run: `npx vitest run backend/tests/calendario.test.js`
Expected: FAIL — `Failed to resolve import "../src/calendario.js"` (el archivo aún no existe).

- [ ] **Step 4: Crear `backend/src/calendario.js` con `obtenerCalendarioConsultas`**

```js
const PROP_CALENDAR_ID = 'CALENDAR_ID_CONSULTAS';
const NOMBRE_CALENDARIO = 'Consultas SMPDJM';

export function obtenerCalendarioConsultas(services) {
  const props = services.PropertiesService.getScriptProperties();
  const idGuardado = props.getProperty(PROP_CALENDAR_ID);
  if (idGuardado) {
    const cal = services.CalendarApp.getCalendarById(idGuardado);
    if (cal) return cal;
  }

  const existentes = services.CalendarApp.getCalendarsByName(NOMBRE_CALENDARIO);
  const calendario = existentes.length > 0
    ? existentes[0]
    : services.CalendarApp.createCalendar(NOMBRE_CALENDARIO);

  props.setProperty(PROP_CALENDAR_ID, calendario.getId());
  return calendario;
}
```

- [ ] **Step 5: Ejecutar los tests y confirmar que pasan**

Run: `npx vitest run backend/tests/calendario.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/mocks/gas-services.js backend/src/calendario.js backend/tests/calendario.test.js
git commit -m "feat(calendario): add CalendarApp mock and obtenerCalendarioConsultas"
```

---

### Task 2: `crearEventoCita` y `eliminarEventoCita`

**Files:**
- Modify: `backend/src/calendario.js`
- Modify: `backend/tests/calendario.test.js`

- [ ] **Step 1: Añadir los tests (fallarán: las funciones no existen)**

En `backend/tests/calendario.test.js`, actualiza el import y añade los dos `describe` siguientes al final del archivo:

```js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { obtenerCalendarioConsultas, crearEventoCita, eliminarEventoCita } from '../src/calendario.js';
```

```js
describe('crearEventoCita', () => {
  it('crea un evento "Consulta: <nombre>" con el horario indicado y devuelve su id', () => {
    const services = createMockServices();
    const eventId = crearEventoCita(
      { fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', pacienteNombre: 'M. Garcia' },
      services,
    );
    expect(typeof eventId).toBe('string');
    expect(eventId).not.toBe('');

    const calendario = obtenerCalendarioConsultas(services);
    const evento = calendario.getEventById(eventId);
    expect(evento.getTitle()).toBe('Consulta: M. Garcia');
  });
});

describe('eliminarEventoCita', () => {
  it('elimina un evento existente', () => {
    const services = createMockServices();
    const eventId = crearEventoCita(
      { fecha: '2026-06-15', horaInicio: '09:00', horaFin: '09:45', pacienteNombre: 'M. Garcia' },
      services,
    );
    eliminarEventoCita(eventId, services);
    const calendario = obtenerCalendarioConsultas(services);
    expect(calendario.getEventById(eventId)).toBeNull();
  });

  it('no hace nada si el eventId esta vacio', () => {
    const services = createMockServices();
    expect(() => eliminarEventoCita('', services)).not.toThrow();
  });

  it('no hace nada si el evento ya no existe', () => {
    const services = createMockServices();
    expect(() => eliminarEventoCita('event-inexistente', services)).not.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar los tests y confirmar que fallan**

Run: `npx vitest run backend/tests/calendario.test.js`
Expected: FAIL — `crearEventoCita`/`eliminarEventoCita` no son exportados por `../src/calendario.js`.

- [ ] **Step 3: Implementar `crearEventoCita` y `eliminarEventoCita`**

Añade al final de `backend/src/calendario.js`:

```js
export function crearEventoCita({ fecha, horaInicio, horaFin, pacienteNombre }, services) {
  const calendario = obtenerCalendarioConsultas(services);
  const inicio = new Date(`${fecha}T${horaInicio}:00`);
  const fin = new Date(`${fecha}T${horaFin}:00`);
  const evento = calendario.createEvent(`Consulta: ${pacienteNombre}`, inicio, fin, {
    description: 'Cita agendada en SMPDJM.',
  });
  return evento.getId();
}

export function eliminarEventoCita(eventId, services) {
  if (!eventId) return;
  const calendario = obtenerCalendarioConsultas(services);
  const evento = calendario.getEventById(eventId);
  if (evento) evento.deleteEvent();
}
```

- [ ] **Step 4: Ejecutar los tests y confirmar que pasan**

Run: `npx vitest run backend/tests/calendario.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/calendario.js backend/tests/calendario.test.js
git commit -m "feat(calendario): add crearEventoCita and eliminarEventoCita"
```

---

### Task 3: Build (`backend/build.js`, `backend/src/index.js`, `backend/tests/build.test.js`)

**Files:**
- Modify: `backend/build.js`
- Modify: `backend/src/index.js`
- Modify: `backend/tests/build.test.js`

- [ ] **Step 1: Añadir `calendario.js` a `FILES` antes de `agenda.js`**

En `backend/build.js`, modifica el array `FILES`:

```js
const FILES = [
  'hash.js',
  'aes.js',
  'log.js',
  'usuarios.js',
  'horario.js',
  'calendario.js',
  'agenda.js',
  'auth.js',
  'guards.js',
  'http.js',
  'router.js',
  'index.js',
];
```

- [ ] **Step 2: Añadir `CalendarApp` a `gasServices` en `index.js`**

En `backend/src/index.js`, modifica el objeto `gasServices`:

```js
const gasServices = {
  Utilities,
  SpreadsheetApp,
  CacheService,
  PropertiesService,
  ContentService,
  CalendarApp,
};
```

- [ ] **Step 3: Escribir test de regresión + actualizar tests funcionales existentes**

Estos cambios deben ejecutarse juntos: añadir `CalendarApp` a `gasServices` (Step 2) hace que el bundle generado referencie el identificador global `CalendarApp` al evaluar `gasServices` — los dos tests funcionales existentes en `backend/tests/build.test.js` fallarán con `ReferenceError: CalendarApp is not defined` si no se actualizan.

En `backend/tests/build.test.js`, ambos tests funcionales (`'define doGet y doPost funcionales tras la concatenacion'` e `'incluye las acciones de agenda/horario (leerHorarioConfig no lanza ReferenceError)'`) tienen el mismo bloque de asignación de `globalThis` y el mismo bloque `finally` de limpieza, repetidos una vez por test (2 ocurrencias de cada uno). Aplica estos dos reemplazos con `replace_all` para cubrir ambos tests a la vez:

1. Reemplaza (2 ocurrencias):

```js
    globalThis.ContentService = services.ContentService;
```

por:

```js
    globalThis.ContentService = services.ContentService;
    globalThis.CalendarApp = services.CalendarApp;
```

2. Reemplaza (2 ocurrencias):

```js
      delete globalThis.ContentService;
```

por:

```js
      delete globalThis.ContentService;
      delete globalThis.CalendarApp;
```

3. Añade un nuevo test al final de `describe('build.js', ...)`, antes del cierre del `describe`:

```js
  it('incluye calendario.js antes de agenda.js en el bundle (orden de FILES)', () => {
    const output = readFileSync(OUTPUT_PATH, 'utf8');
    expect(output).toMatch(/function\s+obtenerCalendarioConsultas/);
    expect(output).toMatch(/function\s+crearEventoCita/);
    expect(output).toMatch(/function\s+eliminarEventoCita/);
    expect(output.indexOf('function crearEventoCita')).toBeLessThan(output.indexOf('function crearCita'));
  });
```

- [ ] **Step 4: Ejecutar los tests y confirmar que pasan**

Run: `npx vitest run backend/tests/build.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/build.js backend/src/index.js backend/tests/build.test.js
git commit -m "build: include calendario.js before agenda.js and wire CalendarApp"
```

---

### Task 4: `crearCita` crea el evento en Calendar

**Files:**
- Modify: `backend/src/agenda.js`
- Modify: `backend/tests/agenda.test.js`

- [ ] **Step 1: Preparar fixtures de test — `_log`, `CITAS_HEADER` con `calendarEventId`, e importar `vi`**

En `backend/tests/agenda.test.js`:

1. El import ya incluye `vi` (línea 1: `import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';`) — no cambia.

2. Añade la constante `LOG_HEADER` junto a las otras constantes de cabecera (después de `USUARIOS_HEADER`):

```js
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];
```

3. Actualiza `CITAS_HEADER` para incluir la nueva columna:

```js
const CITAS_HEADER = ['id', 'fecha', 'horaInicio', 'horaFin', 'pacienteCodigo', 'estado', 'creadoPor', 'fechaCreacion', 'fechaActualizacion', 'calendarEventId'];
```

4. Añade `_log: [LOG_HEADER]` a las hojas creadas por `buildServices`:

```js
function buildServices({ horario = HORARIO_LABORAL, bloqueos = [], citas = [], usuarios = [] } = {}) {
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

- [ ] **Step 2: Escribir los tests de integración con Calendar para `crearCita`**

Añade un nuevo `describe` al final del bloque `describe('crearCita', ...)` (después de su última `it`, antes del cierre `});` de `describe('crearCita', ...)`), o como hermano inmediatamente después:

```js
describe('crearCita - integracion con Calendar', () => {
  it('crea el evento en "Consultas SMPDJM" y guarda calendarEventId', () => {
    const services = buildServices({
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC001' }, USER_RECEPCION, services);
    expect(result.ok).toBe(true);

    const filas = services.SpreadsheetApp._sheets['_citas'];
    const fila = filas.find((r) => r[0] === result.cita.id);
    expect(fila[9]).not.toBe('');

    const calendario = services.CalendarApp.getCalendarsByName('Consultas SMPDJM')[0];
    const evento = calendario.getEventById(fila[9]);
    expect(evento.getTitle()).toBe('Consulta: M. Garcia');
  });

  it('si Calendar falla, la cita se guarda igual con calendarEventId vacio y se registra el error', () => {
    const services = buildServices({
      usuarios: [['PAC001', 'h', 's', 'usuario', 'M. Garcia']],
    });
    const calendario = services.CalendarApp.createCalendar('Consultas SMPDJM');
    vi.spyOn(calendario, 'createEvent').mockImplementation(() => {
      throw new Error('Calendar API error');
    });

    const result = crearCita({ fecha: '2026-06-15', horaInicio: '09:00', pacienteCodigo: 'PAC001' }, USER_RECEPCION, services);
    expect(result.ok).toBe(true);

    const filas = services.SpreadsheetApp._sheets['_citas'];
    const fila = filas.find((r) => r[0] === result.cita.id);
    expect(fila[9]).toBe('');

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'calendario_error');
    expect(logEntry).toBeDefined();
    expect(logEntry[4]).toMatch(/crearCita/);
  });
});
```

- [ ] **Step 3: Ejecutar los tests y confirmar que fallan**

Run: `npx vitest run backend/tests/agenda.test.js`
Expected: FAIL — el primer nuevo test falla porque `fila[9]` es `''` (aún no se crea ningún evento); el segundo falla porque `logEntry` es `undefined` (aún no se llama a `registrarLog`).

- [ ] **Step 4: Implementar la integración en `crearCita` y `leerCitasRaw`**

En `backend/src/agenda.js`, actualiza los imports al inicio del archivo:

```js
import { leerHorarioConfig, leerBloqueos } from './horario.js';
import { findUser } from './usuarios.js';
import { crearEventoCita, eliminarEventoCita } from './calendario.js';
import { registrarLog } from './log.js';
```

Actualiza `leerCitasRaw` (lee 10 columnas en vez de 9, añade `calendarEventId`):

```js
function leerCitasRaw(services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CITAS);
  if (!sheet) return [];
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 10).getValues()
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
      calendarEventId: String(r[9] || ''),
      _fila: i + 2,
    }));
}
```

En `crearCita`, sustituye el bloque final (desde `const sheet = services.SpreadsheetApp...` hasta `sheet.appendRow(...)`) por:

```js
  let calendarEventId = '';
  try {
    calendarEventId = crearEventoCita(
      { fecha, horaInicio, horaFin, pacienteNombre: paciente.nombre },
      services,
    );
  } catch (e) {
    registrarLog(services, user.codigo, user.rol, 'calendario_error', `crearCita ${id}: ${e.message}`);
  }

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CITAS);
  sheet.appendRow([id, fecha, horaInicio, horaFin, pacienteCodigo, 'Programada', user.codigo, ahora, ahora, calendarEventId]);
```

(El resto de `crearCita` — validaciones, cálculo de `horaFin`/`id`/`ahora`, y el `return` final — no cambia.)

- [ ] **Step 5: Ejecutar los tests y confirmar que pasan**

Run: `npx vitest run backend/tests/agenda.test.js`
Expected: PASS (todos los tests de `agenda.test.js`)

- [ ] **Step 6: Commit**

```bash
git add backend/src/agenda.js backend/tests/agenda.test.js
git commit -m "feat(agenda): sync crearCita with Calendar (calendarEventId column)"
```

---

### Task 5: `cambiarEstadoCita` — cambio de firma + elimina evento al cancelar

**Files:**
- Modify: `backend/src/agenda.js`
- Modify: `backend/src/router.js`
- Modify: `backend/tests/agenda.test.js`

- [ ] **Step 1: Actualizar las llamadas existentes a `cambiarEstadoCita` y añadir los nuevos tests**

`cambiarEstadoCita` pasa a recibir `user` como segundo argumento (necesario para `registrarLog`). En `backend/tests/agenda.test.js`, dentro de `describe('cambiarEstadoCita', ...)`, actualiza las 5 llamadas existentes añadiendo `USER_RECEPCION` como segundo argumento:

```js
    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Completada' }, USER_RECEPCION, services);
```
```js
    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Cancelada' }, USER_RECEPCION, services);
```
```js
    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Pendiente' }, USER_RECEPCION, services);
```
```js
    const result = cambiarEstadoCita({ citaId: 'no-existe', estado: 'Completada' }, USER_RECEPCION, services);
```
```js
    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Completada' }, USER_RECEPCION, services);
```

(Hay dos llamadas con exactamente `{ citaId: 'c1', estado: 'Completada' }, services` — una en `'marca una cita Programada como Completada'` y otra en `'rechaza si la cita no esta Programada'`. Actualiza ambas.)

Luego añade un nuevo `describe` después de `describe('cambiarEstadoCita', ...)`:

```js
describe('cambiarEstadoCita - integracion con Calendar', () => {
  it('al cancelar, elimina el evento de Calendar y limpia calendarEventId', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date(), '']],
    });
    const calendario = services.CalendarApp.createCalendar('Consultas SMPDJM');
    const evento = calendario.createEvent('Consulta: M. Garcia', new Date('2026-06-15T09:00:00'), new Date('2026-06-15T09:45:00'), {});
    services.SpreadsheetApp._sheets['_citas'][1][9] = evento.getId();

    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Cancelada' }, USER_RECEPCION, services);
    expect(result).toEqual({ ok: true });

    expect(calendario.getEventById(evento.getId())).toBeNull();
    expect(services.SpreadsheetApp._sheets['_citas'][1][9]).toBe('');
  });

  it('si eliminar el evento falla, la cita igual queda Cancelada y se registra el error', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date(), 'event-1']],
    });
    const calendario = services.CalendarApp.createCalendar('Consultas SMPDJM');
    vi.spyOn(calendario, 'getEventById').mockImplementation(() => {
      throw new Error('Calendar API error');
    });

    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Cancelada' }, USER_RECEPCION, services);
    expect(result).toEqual({ ok: true });

    const agenda = leerAgenda('2026-06-15', '2026-06-15', services);
    expect(agenda.slots[0].estado).toBe('disponible');

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'calendario_error');
    expect(logEntry).toBeDefined();
    expect(logEntry[4]).toMatch(/cambiarEstadoCita/);
  });

  it('al completar, no elimina el evento ni modifica calendarEventId', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-15', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date(), 'event-1']],
    });
    const result = cambiarEstadoCita({ citaId: 'c1', estado: 'Completada' }, USER_RECEPCION, services);
    expect(result).toEqual({ ok: true });
    expect(services.SpreadsheetApp._sheets['_citas'][1][9]).toBe('event-1');
  });
});
```

- [ ] **Step 2: Ejecutar los tests y confirmar que fallan**

Run: `npx vitest run backend/tests/agenda.test.js`
Expected: FAIL — `cambiarEstadoCita` aún tiene la firma `(b, services)`, por lo que `user` (segundo argumento) se interpreta como `services` y las pruebas existentes y nuevas fallan (p. ej. `TypeError` al leer `services.SpreadsheetApp` de `USER_RECEPCION`, o las aserciones sobre Calendar fallan).

- [ ] **Step 3: Implementar el cambio de firma y la eliminación del evento al cancelar**

En `backend/src/agenda.js`, sustituye `cambiarEstadoCita` completa:

```js
export function cambiarEstadoCita(b, user, services) {
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

En `backend/src/router.js`, actualiza el `case 'cambiarEstadoCita'` (dentro de `handlePost`):

```js
    case 'cambiarEstadoCita':
      return json_(
        requireAuthBody(b.token, ROLES_AGENDA, (user) => cambiarEstadoCita(b, user, services), services),
        services
      );
```

- [ ] **Step 4: Ejecutar los tests y confirmar que pasan**

Run: `npx vitest run backend/tests/agenda.test.js backend/tests/router.test.js`
Expected: PASS (todos los tests de ambos archivos)

- [ ] **Step 5: Commit**

```bash
git add backend/src/agenda.js backend/src/router.js backend/tests/agenda.test.js
git commit -m "feat(agenda): cambiarEstadoCita removes Calendar event on cancellation"
```

---

### Task 6: `cancelarMiCita` — elimina el evento al cancelar

**Files:**
- Modify: `backend/src/agenda.js`
- Modify: `backend/tests/agenda.test.js`

- [ ] **Step 1: Escribir los tests de integración con Calendar para `cancelarMiCita`**

Añade un nuevo `describe` después de `describe('cancelarMiCita', ...)` en `backend/tests/agenda.test.js`:

```js
describe('cancelarMiCita - integracion con Calendar', () => {
  it('al cancelar, elimina el evento de Calendar y limpia calendarEventId', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-18', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date(), '']],
    });
    const calendario = services.CalendarApp.createCalendar('Consultas SMPDJM');
    const evento = calendario.createEvent('Consulta: M. Garcia', new Date('2026-06-18T09:00:00'), new Date('2026-06-18T09:45:00'), {});
    services.SpreadsheetApp._sheets['_citas'][1][9] = evento.getId();

    const result = cancelarMiCita({ citaId: 'c1' }, USER_PACIENTE, services);
    expect(result).toEqual({ ok: true });

    expect(calendario.getEventById(evento.getId())).toBeNull();
    expect(services.SpreadsheetApp._sheets['_citas'][1][9]).toBe('');
  });

  it('si eliminar el evento falla, la cita igual queda Cancelada y se registra el error', () => {
    const services = buildServices({
      citas: [['c1', '2026-06-18', '09:00', '09:45', 'PAC001', 'Programada', 'ADM001', new Date(), new Date(), 'event-1']],
    });
    const calendario = services.CalendarApp.createCalendar('Consultas SMPDJM');
    vi.spyOn(calendario, 'getEventById').mockImplementation(() => {
      throw new Error('Calendar API error');
    });

    const result = cancelarMiCita({ citaId: 'c1' }, USER_PACIENTE, services);
    expect(result).toEqual({ ok: true });

    const agenda = leerAgenda('2026-06-18', '2026-06-18', services);
    expect(agenda.slots[0].estado).toBe('disponible');

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'calendario_error');
    expect(logEntry).toBeDefined();
    expect(logEntry[4]).toMatch(/cancelarMiCita/);
  });
});
```

- [ ] **Step 2: Ejecutar los tests y confirmar que fallan**

Run: `npx vitest run backend/tests/agenda.test.js`
Expected: FAIL — el primer test falla porque el evento no se elimina y `calendarEventId` no se limpia; el segundo falla porque no se registra ningún `calendario_error`.

- [ ] **Step 3: Implementar la eliminación del evento en `cancelarMiCita`**

En `backend/src/agenda.js`, sustituye el cuerpo de `cancelarMiCita` a partir de `sheet.getRange(cita._fila, 9, 1, 1).setValue(new Date());` (manteniendo todo lo anterior sin cambios):

```js
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

  try {
    eliminarEventoCita(cita.calendarEventId, services);
  } catch (e) {
    registrarLog(services, user.codigo, user.rol, 'calendario_error', `cancelarMiCita ${citaId}: ${e.message}`);
  }
  sheet.getRange(cita._fila, 10, 1, 1).setValue('');

  return { ok: true };
}
```

- [ ] **Step 4: Ejecutar la suite completa y confirmar que todo pasa**

Run: `npx vitest run`
Expected: PASS (todos los tests del proyecto, incluyendo `backend/tests/*` y los tests de frontend existentes)

- [ ] **Step 5: Commit**

```bash
git add backend/src/agenda.js backend/tests/agenda.test.js
git commit -m "feat(agenda): cancelarMiCita removes Calendar event on cancellation"
```

---

## Fuera de alcance (recordatorio)

Backfill de citas existentes, cambios de frontend, sincronización inversa, invitaciones a pacientes, y auditoría general de los 6 mutadores de Fase 1a — ver sección 9 de `docs/superpowers/specs/2026-06-14-fase-1b-calendar-sync-design.md`. El `appsscript.json` (scope de Calendar) y la re-autorización de Petra son pasos operativos de despliegue, no parte de este plan de código.
