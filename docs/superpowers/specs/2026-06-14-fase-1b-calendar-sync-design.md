# Fase 1b: Sincronización con Google Calendar — Diseño técnico

> Este documento desarrolla la sub-fase **Fase 1b**, descrita en
> `docs/superpowers/specs/2026-06-13-fase-1a-agenda-interna-design.md` como
> "sincronización con Google Calendar, construida sobre la base de Fase 1a".
> Se apoya en el modelo de datos y las acciones de
> `backend/src/agenda.js` (hoja `_citas`) definidas en ese documento.

---

## 1. Resumen del alcance

- **Objetivo**: visibilidad para Petra. Las citas creadas/gestionadas en
  SMPDJM aparecen automáticamente en su Google Calendar, con los
  recordatorios y notificaciones móviles que Calendar ya provee.
- **Dirección única**: SMPDJM → Calendar. SMPDJM/Sheets sigue siendo la
  **fuente de verdad**; Calendar es un espejo para Petra. No hay
  sincronización inversa (ediciones manuales hechas directamente en Calendar
  no se reflejan en SMPDJM y pueden perderse si esa cita vuelve a
  sincronizarse).
- **Sin invitaciones a pacientes**: los eventos se crean solo en el
  calendario de Petra, sin invitados.
- **Autenticación**: `CalendarApp` se ejecuta bajo la cuenta de Google de
  Petra (modelo GAS "Execute as: Me"), igual que `SpreadsheetApp` hoy. No se
  requieren credenciales OAuth separadas ni UI de configuración — solo una
  autorización de permisos estándar de Google al desplegar/actualizar el
  script (ver sección 8).
- **Calendario destino**: un calendario secundario dedicado, **"Consultas
  SMPDJM"**, creado automáticamente la primera vez que se necesita (no el
  calendario principal/personal de Petra). Así ella puede activar/configurar
  visibilidad y notificaciones de este calendario de forma independiente en
  su teléfono.
- **Contenido del evento**: título `Consulta: <nombre completo del
  paciente>`.
- **Sincronización por operación**:
  - `crearCita` → crea el evento en "Consultas SMPDJM".
  - `cambiarEstadoCita('Cancelada')` y `cancelarMiCita` → eliminan el evento.
  - `cambiarEstadoCita('Completada')` → sin acción sobre Calendar (el evento
    queda como quedó, ya cumplió su función de recordatorio).
- **Semántica "best-effort"**: cualquier fallo de la API de Calendar se
  registra en `_log` pero **no bloquea ni revierte** la operación sobre
  `_citas`. Sheets sigue siendo la fuente de verdad independientemente del
  resultado de la sincronización.
- **Fuera de alcance**: backfill de citas existentes, cambios de frontend,
  sincronización inversa, invitaciones a pacientes, auditoría general de los
  6 mutadores de Fase 1a (ver sección 9).

---

## 2. Modelo de datos — `_citas` (columna nueva)

Se añade una décima columna a la hoja `_citas` (definida en el documento de
Fase 1a):

| Columna | Campo | Notas |
|---|---|---|
| 10 | `calendarEventId` | ID del evento en "Consultas SMPDJM", o `''` si no hay evento sincronizado (sincronización falló, la cita es anterior a Fase 1b, o la cita está `Cancelada`). |

`leerCitasRaw` (en `backend/src/agenda.js`) pasa de leer 9 a 10 columnas:

```js
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
```

Las hojas `_citas` existentes (de pruebas/uso de Fase 1a) no tienen esta
columna: `r[9]` será `undefined` y `String(r[9] || '')` da `''`, tratándose
como "sin evento" sin error. No se requiere migración.

---

## 3. Nuevo módulo `backend/src/calendario.js`

Módulo sin dependencias de `agenda.js` (para que `agenda.js` pueda importar
de él). Expone tres funciones:

### `obtenerCalendarioConsultas(services)`

Localiza o crea el calendario dedicado, cacheando su ID para no buscarlo cada
vez:

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

### `crearEventoCita({fecha, horaInicio, horaFin, pacienteNombre}, services)`

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
```

### `eliminarEventoCita(eventId, services)`

No-op si `eventId` está vacío o si el evento ya no existe (p. ej. Petra lo
borró manualmente):

```js
export function eliminarEventoCita(eventId, services) {
  if (!eventId) return;
  const calendario = obtenerCalendarioConsultas(services);
  const evento = calendario.getEventById(eventId);
  if (evento) evento.deleteEvent();
}
```

---

## 4. Integración en `backend/src/agenda.js`

### `crearCita(b, user, services)`

Tras resolver `paciente` y antes de `appendRow`, se intenta crear el evento.
El `id` de la cita ya está generado en este punto (vía
`services.Utilities.getUuid()`), por lo que se usa en el log de error si
hace falta:

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

sheet.appendRow([id, fecha, horaInicio, horaFin, pacienteCodigo, 'Programada', user.codigo, ahora, ahora, calendarEventId]);
```

Una sola escritura en la hoja, sin importar el resultado de Calendar. La
respuesta de la acción (`{ok:true, cita:{...}}`) no cambia — `calendarEventId`
es un detalle interno, no se expone en la API.

### `cambiarEstadoCita(b, user, services)` — cambio de firma

Esta función pasa a recibir `user` (necesario para `registrarLog`). El
router debe actualizarse:

```js
// backend/src/router.js
case 'cambiarEstadoCita':
  return json_(
    requireAuthBody(b.token, ROLES_AGENDA, (user) => cambiarEstadoCita(b, user, services), services),
    services,
  );
```

Tras la actualización existente de `estado` y `fechaActualizacion`, si el
nuevo estado es `'Cancelada'` se elimina el evento y se limpia la columna:

```js
export function cambiarEstadoCita(b, user, services) {
  // ... validaciones existentes sin cambios ...

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

Si `estado === 'Completada'`, no hay ningún cambio adicional respecto a hoy.

### `cancelarMiCita(b, user, services)`

`user` ya está disponible. Mismo patrón que `cambiarEstadoCita('Cancelada')`:

```js
export function cancelarMiCita(b, user, services) {
  // ... validaciones existentes sin cambios ...

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

### Importaciones nuevas en `agenda.js`

```js
import { crearEventoCita, eliminarEventoCita } from './calendario.js';
import { registrarLog } from './log.js';
```

---

## 5. Manejo de errores y logging

Todas las llamadas a `calendario.js` desde `agenda.js` están envueltas en
`try/catch`. Si fallan (API de Calendar no disponible, calendario borrado de
forma inesperada, etc.):

- Se llama a `registrarLog(services, user.codigo, user.rol,
  'calendario_error', '<contexto>: <mensaje del error>')` — mismo patrón que
  `login_exitoso`/`login_fallido`/`cambio_password` en `auth.js`/`guards.js`.
- La operación sobre `_citas` **continúa y se considera exitosa**:
  `crearCita` guarda `calendarEventId: ''`, `cambiarEstadoCita`/
  `cancelarMiCita` devuelven `{ok:true}` igual que hoy.
- La respuesta de la API **no cambia** — no se añaden campos nuevos para
  indicar el estado de la sincronización. Es un detalle interno, visible solo
  en `_log` para diagnóstico.

Esta es la **única** adición de auditoría en Fase 1b. La auditoría general de
los 6 mutadores de Fase 1a (issue #2 del backlog, sección 9 del documento de
Fase 1a) sigue pendiente y queda fuera de este alcance.

---

## 6. Build (`backend/build.js`)

`calendario.js` no depende de `agenda.js`, pero `agenda.js` pasa a importar
de `calendario.js`, así que debe listarse **antes**:

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

---

## 7. Testing

### `backend/mocks/gas-services.js`

Nuevo `createMockCalendarApp(initialData)`, siguiendo el patrón de
`createMockSpreadsheet` (estado en memoria, sin red):

- Mantiene un registro de calendarios por nombre/ID. Cada calendario tiene un
  `Map` de eventos por ID (`title`, `start`, `end`, `description`).
- `CalendarApp.getCalendarsByName(name)` → array de objetos calendario que
  coinciden por nombre (vacío si no existe ninguno).
- `CalendarApp.createCalendar(name)` → crea y devuelve un nuevo calendario.
- `CalendarApp.getCalendarById(id)` → devuelve el calendario o `null`.
- Cada calendario expone: `getId()`, `createEvent(title, start, end, {description}) → Event`,
  `getEventById(id) → Event | null`.
- `Event` expone: `getId()`, `getTitle()`, `deleteEvent()` (lo elimina del
  `Map` del calendario).

`createMockServices(initialData)` se extiende para incluir
`CalendarApp: createMockCalendarApp(initialData.calendarApp)`.

### `backend/tests/calendario.test.js` (nuevo)

- `obtenerCalendarioConsultas`: crea "Consultas SMPDJM" si no existe; en
  llamadas posteriores reutiliza el mismo calendario (vía
  `PropertiesService` o por nombre si la propiedad no está).
- `crearEventoCita`: crea un evento con el título `Consulta: <nombre>` y el
  horario correcto; devuelve un `eventId` no vacío.
- `eliminarEventoCita`: elimina un evento existente; no lanza error si
  `eventId` es `''` o si el evento no existe.

### `backend/tests/agenda.test.js` (extensión)

- `crearCita` exitosa: el mock de `CalendarApp` recibe un `createEvent` con
  el título `Consulta: <pacienteNombre>`, y la fila guardada en `_citas`
  tiene `calendarEventId` no vacío (columna 10).
- `cambiarEstadoCita(..., 'Cancelada')` y `cancelarMiCita`: el evento
  correspondiente se elimina del mock de `CalendarApp` y `calendarEventId`
  queda `''` en la fila.
- `cambiarEstadoCita(..., 'Completada')`: no se llama a `eliminarEventoCita`
  ni se modifica `calendarEventId`.
- **Caso de fallo**: si el mock de `CalendarApp` lanza un error (p. ej.
  `createEvent` configurado para fallar), `crearCita` sigue devolviendo
  `{ok:true, cita:{...}}`, la fila se guarda con `calendarEventId: ''`, y se
  agrega una entrada `calendario_error` en el mock de `_log`. Lo mismo para
  `cambiarEstadoCita`/`cancelarMiCita` con `eliminarEventoCita` fallando.

### `backend/tests/build.test.js` (extensión)

Test de regresión análogo al que ya existe para `agenda.js`/`horario.js`:
confirma que `calendario.js` está incluido en `FILES` y que aparece **antes**
de `agenda.js` (de lo contrario el bundle generado tendría un
`ReferenceError` al usar `crearEventoCita`/`eliminarEventoCita` antes de su
definición).

---

## 8. Despliegue (operativo, no código)

- El `appsscript.json` del proyecto GAS necesita el scope
  `https://www.googleapis.com/auth/calendar` (lectura/escritura de
  calendarios). Al desplegar/actualizar el script con este cambio, Petra
  deberá **re-autorizar** el script una vez — prompt estándar de permisos de
  Google, sin configuración adicional.
- En la primera ejecución de `crearCita` tras el despliegue,
  `obtenerCalendarioConsultas` creará automáticamente el calendario
  "Consultas SMPDJM" en la cuenta de Petra. A partir de ahí, ella puede
  abrirlo en Google Calendar (web o móvil) y ajustar su visibilidad,
  color y notificaciones como cualquier otro calendario secundario.

---

## 9. Fuera de alcance

- **Backfill de citas existentes**: las filas de `_citas` creadas antes de
  Fase 1b quedan con `calendarEventId: ''` y se tratan como "sin evento". No
  se crean eventos retroactivamente.
- **Cambios de frontend**: la sincronización es completamente transparente
  para el staff y los pacientes; no se añaden indicadores ni enlaces a
  Calendar en la UI de SMPDJM.
- **Sincronización inversa**: ediciones o eliminaciones manuales hechas
  directamente en "Consultas SMPDJM" no se reflejan en `_citas` y pueden
  perderse si esa cita se vuelve a sincronizar (p. ej. al cancelarla).
- **Invitaciones a pacientes**: los eventos no incluyen invitados ni generan
  notificaciones a los pacientes.
- **Auditoría general de los 6 mutadores de Fase 1a** (issue #2 del backlog
  de la sección 9 del documento de Fase 1a): sigue pendiente, fuera de este
  alcance. Fase 1b solo añade `registrarLog('calendario_error', ...)` para
  fallos de sincronización con Calendar.
- **Limitación conocida**: si `eliminarEventoCita` falla por un error
  transitorio al cancelar una cita, el evento puede quedar "huérfano" en
  "Consultas SMPDJM" (la columna `calendarEventId` se limpia igualmente).
  Aceptable para un calendario de bajo volumen — Petra lo notaría y podría
  borrarlo manualmente.
