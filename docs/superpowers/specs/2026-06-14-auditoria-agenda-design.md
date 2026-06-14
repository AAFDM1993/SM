# Auditoría general de mutadores de Agenda/Horario — Diseño técnico

> Este documento cierra el ítem "Auditoría (`registrarLog`)" del backlog de
> `docs/superpowers/specs/2026-06-13-fase-1a-agenda-interna-design.md`
> (sección 9), que quedó explícitamente fuera de alcance de
> `docs/superpowers/specs/2026-06-14-fase-1b-calendar-sync-design.md`.

---

## 1. Resumen del alcance

- **Objetivo**: las 6 acciones mutadoras de Fase 1a
  (`crearCita`, `cambiarEstadoCita`, `cancelarMiCita`,
  `actualizarHorarioConfig`, `crearBloqueo`, `eliminarBloqueo`) registran una
  entrada en `_log` cuando completan exitosamente, igual que ya hacen
  `login_exitoso`/`cambio_password` (en `auth.js`/`guards.js`) y
  `calendario_error` (Fase 1b, en `agenda.js`).
- **Solo camino de éxito**: no se registra nada cuando la función devuelve
  `{error: ...}` o `{ok: false, requiereConfirmacion: true, ...}` — esos casos
  no modifican ninguna hoja y el motivo ya se devuelve al llamador.
- **Precisión sobre el backlog original**: la nota de Fase 1a decía que esto
  sería "a diferencia de `guardarUsuario`/`eliminarUsuario`", pero en
  realidad esas dos funciones (`usuarios.js`) tampoco llaman a
  `registrarLog`. Este es el primer logging de éxito para una mutación de
  negocio en el sistema — el patrón se define aquí y queda disponible como
  precedente para Fase 2 en adelante.
- **Fuera de alcance**: logging de errores/validaciones (`{error: ...}`),
  cambios a `guardarUsuario`/`eliminarUsuario`, helpers de fecha duplicados,
  checklist de despliegue de `_horario_config`/`_bloqueos` (otros ítems del
  mismo backlog, no relacionados con auditoría).

---

## 2. Patrón de logging

Mismo patrón que `cambio_password` (`guards.js:48`):

```js
registrarLog(services, user.codigo, user.rol, '<accion>', '<detalle>');
```

Se llama **después** de que la mutación en la hoja ya se completó, justo
antes del `return {ok: true, ...}` de cada función. `registrarLog` no
modifica el valor de retorno — internamente hace `if (!sheet) return;`
(`log.js`), así que tampoco falla si la hoja `_log` no existe.

---

## 3. Acciones y detalles por función

| Función | `accion` | `detalle` | Notas |
|---|---|---|---|
| `crearCita` (`agenda.js`) | `cita_creada` | `` `${id} paciente=${pacienteCodigo} ${fecha} ${horaInicio}` `` | Se registra siempre, independientemente de si `crearEventoCita` tuvo éxito o no (ese resultado ya genera su propio `calendario_error` si falla). |
| `cambiarEstadoCita` con `estado === 'Completada'` (`agenda.js`) | `cita_completada` | `citaId` | |
| `cambiarEstadoCita` con `estado === 'Cancelada'` (`agenda.js`) | `cita_cancelada` | `citaId` | |
| `cancelarMiCita` (`agenda.js`) | `cita_cancelada` | `citaId` | Misma acción que la cancelación hecha por staff — el actor se distingue por las columnas `codigo`/`rol` en `_log`. |
| `actualizarHorarioConfig` (`horario.js`) | `horario_actualizado` | `''` | Configuración semanal completa; no hay un identificador único que valga la pena registrar. |
| `crearBloqueo` (`horario.js`) | `bloqueo_creado` | `` `${id} ${fechaInicio} a ${fechaFin}` `` | |
| `eliminarBloqueo` (`horario.js`) | `bloqueo_eliminado` | `bloqueoId` | |

---

## 4. Cambios de firma y wiring

### `actualizarHorarioConfig` y `eliminarBloqueo` necesitan `user`

Ambas funciones (`horario.js`) reciben hoy `(b, services)` y no tienen acceso
a `user`. Pasan a `(b, user, services)`, igual que ya hicieron
`cambiarEstadoCita`/`cancelarMiCita` en Fase 1b:

```js
export function actualizarHorarioConfig(b, user, services) {
  // ... validaciones existentes sin cambios ...
  sheet.getRange(2, 1, 7, 5).setValues(values);
  registrarLog(services, user.codigo, user.rol, 'horario_actualizado', '');
  return { ok: true };
}

export function eliminarBloqueo(b, user, services) {
  // ... búsqueda existente sin cambios ...
  sheet.deleteRow(i + 2);
  registrarLog(services, user.codigo, user.rol, 'bloqueo_eliminado', bloqueoId);
  return { ok: true };
}
```

`crearBloqueo(b, user, services)` ya recibe `user` — sin cambio de firma,
solo se agrega la llamada a `registrarLog` antes del `return { ok: true,
bloqueo: {...} }`.

### `backend/src/router.js`

```js
case 'actualizarHorarioConfig':
  return json_(
    requireAuthBody(b.token, ROLES_HORARIO, (user) => actualizarHorarioConfig(b, user, services), services),
    services
  );

case 'eliminarBloqueo':
  return json_(
    requireAuthBody(b.token, ROLES_HORARIO, (user) => eliminarBloqueo(b, user, services), services),
    services
  );
```

(`crearBloqueo` ya pasa `user` — sin cambios en el router para ese caso.)

### Importación nueva en `horario.js`

```js
import { registrarLog } from './log.js';
```

---

## 5. Testing

### `backend/tests/agenda.test.js`

Para `crearCita`, `cambiarEstadoCita` (ambos estados) y `cancelarMiCita`:
verificar que tras una operación exitosa, `services._log` (mock de la hoja
`_log`) recibe una fila nueva con la `accion`/`detalle` esperados y
`codigo`/`rol` del usuario autenticado que hizo la llamada. El archivo ya
tiene `LOG_HEADER` y `_log: [LOG_HEADER]` en `buildServices` desde Fase 1b.

### `backend/tests/horario.test.js`

- Actualizar las 5 llamadas existentes a `actualizarHorarioConfig({...},
  services)` → `actualizarHorarioConfig({...}, ADMIN, services)` (o el actor
  correspondiente según el test).
- Actualizar las 2 llamadas existentes a `eliminarBloqueo({...}, services)` →
  `eliminarBloqueo({...}, ADMIN, services)`.
- Agregar `LOG_HEADER` y `_log: [LOG_HEADER]` a `createMockServices` en este
  archivo, siguiendo el mismo patrón que `agenda.test.js`
  (`LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle']`).
- Para `actualizarHorarioConfig`, `crearBloqueo` y `eliminarBloqueo`:
  agregar una verificación de la fila nueva en `_log` tras cada operación
  exitosa, igual que en `agenda.test.js`.

### `backend/tests/router.test.js`

Los tests existentes de `actualizarHorarioConfig`/`crearBloqueo`/
`eliminarBloqueo` (líneas ~330-410) deben seguir pasando sin cambios de
aserción — solo verifican la respuesta HTTP, no `_log`. Ya incluyen `_log:
[LOG_HEADER]` en `createMockServices` (definido en la línea 23), así que
`registrarLog` no encuentra la hoja faltante.

---

## 6. Fuera de alcance

- Logging de intentos fallidos/validaciones (`{error: ...}` o
  `{ok: false, requiereConfirmacion: true, ...}`) de estas 6 funciones.
- Cambios a `guardarUsuario`/`eliminarUsuario` (`usuarios.js`) — quedan sin
  logging de éxito, ya que no formaban parte del backlog de Fase 1a.
- Los demás ítems del backlog de Fase 1a → 1b (helpers de fecha duplicados,
  checklist de despliegue de `_horario_config`/`_bloqueos`, limpiezas "nice to
  have") — no relacionados con auditoría, se abordan por separado si se
  decide.
