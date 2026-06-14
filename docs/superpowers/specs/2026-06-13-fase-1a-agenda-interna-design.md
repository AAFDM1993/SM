# Fase 1a: Agenda interna — Diseño técnico

> Este documento desarrolla la sección **"Fase 1 | Agenda"** del roadmap de
> `docs/superpowers/specs/2026-06-12-fase-0-base-sistema-design.md`, dividida
> en dos sub-fases independientes (decisión tomada durante el brainstorming
> de esta fase):
>
> - **Fase 1a (este documento)**: agenda interna — citas, horario semanal
>   configurable, bloqueos de fechas y vista "Mi agenda" del paciente. Vive
>   completamente dentro de SMPDJM (Sheets + backend propio).
> - **Fase 1b (futura, spec separado)**: sincronización con Google Calendar,
>   construida sobre la base de Fase 1a (requiere configurar credenciales
>   OAuth de Google aparte).

---

## 1. Resumen del alcance

- **Modelo**: gestión centralizada. `administrador`, `psiquiatra` y
  `recepcion` crean y gestionan citas sobre un calendario único (un solo
  profesional — no hay múltiples áreas/recursos). El paciente (`usuario`)
  solo ve "Mi agenda" (sus propias citas) y puede cancelar las suyas.
- **Horario**: slots de duración fija, generados a partir de un horario
  semanal configurable desde la UI por `administrador` y `psiquiatra`
  (`recepcion` lo ve en modo solo lectura).
- **Bloqueos**: rangos de fechas marcables como no disponibles (vacaciones,
  festivos, ausencias puntuales), configurables por `administrador` y
  `psiquiatra`.
- **Pacientes**: toda cita se vincula a un usuario ya registrado con
  `rol = 'usuario'`. No se admiten pacientes sin cuenta.
- **Estados de cita**: `Programada`, `Cancelada`, `Completada` (sin estado
  "No asistió" en esta fase).
- **Datos de una cita**: paciente, fecha, hora de inicio, hora de fin
  (derivada del slot al crearla) y estado. Sin campos de texto libre/notas
  (eso se aborda en Fase 2 — Historia clínica).
- **Vista principal de agenda**: cuadrícula semanal (días en columnas,
  horarios en filas), con navegación semana a semana.
- **Fuera de alcance de Fase 1a**: sincronización con Google Calendar (Fase
  1b) y recordatorios/notificaciones (se evaluarán junto con la integración
  de Gmail/Calendar).

---

## 2. Modelo de datos (Google Sheets)

Tres hojas nuevas, creadas manualmente en el spreadsheet (igual que `_usuarios`
y `_log` en Fase 0), con fila de encabezado y los datos descritos abajo.

### Hoja `_horario_config`

Exactamente **7 filas de datos**, una por día de la semana, en este orden fijo
(igual al orden de columnas de la cuadrícula semanal):

| Columna | Campo | Notas |
|---|---|---|
| 1 | `diaSemana` | `Lunes`, `Martes`, `Miercoles`, `Jueves`, `Viernes`, `Sabado`, `Domingo` (sin tildes, para comparación exacta en código) |
| 2 | `activo` | `TRUE` / `FALSE` — si `FALSE`, ese día no aparece como columna en la cuadrícula y no genera slots |
| 3 | `horaInicio` | Texto `HH:MM` (24h), p. ej. `09:00` |
| 4 | `horaFin` | Texto `HH:MM` (24h), p. ej. `18:00` |
| 5 | `duracionSlotMin` | Número entero de minutos por slot, p. ej. `45` |

**Valores iniciales sugeridos** (a configurar manualmente al crear la hoja, y
ajustables luego desde la UI): Lunes a Viernes `activo=TRUE`,
`horaInicio=09:00`, `horaFin=18:00`, `duracionSlotMin=45`; Sábado y Domingo
`activo=FALSE`.

### Hoja `_bloqueos`

| Columna | Campo | Notas |
|---|---|---|
| 1 | `id` | `services.Utilities.getUuid()` (mismo patrón que `generarSalt` en `hash.js`) |
| 2 | `fechaInicio` | Texto `YYYY-MM-DD` |
| 3 | `fechaFin` | Texto `YYYY-MM-DD` (≥ `fechaInicio`) |
| 4 | `motivo` | Texto libre, opcional |
| 5 | `creadoPor` | `codigo` del usuario que creó el bloqueo |
| 6 | `fechaCreacion` | `new Date()` (timestamp de creación) |

Empieza vacía (solo encabezado); los bloqueos se crean desde la UI.

### Hoja `_citas`

| Columna | Campo | Notas |
|---|---|---|
| 1 | `id` | `services.Utilities.getUuid()` |
| 2 | `fecha` | Texto `YYYY-MM-DD` |
| 3 | `horaInicio` | Texto `HH:MM` |
| 4 | `horaFin` | Texto `HH:MM` — calculado a partir de `horaInicio + duracionSlotMin` **en el momento de crear la cita**, para que cambios futuros al horario no alteren citas ya creadas |
| 5 | `pacienteCodigo` | `codigo` de un usuario con `rol = 'usuario'` |
| 6 | `estado` | `Programada` / `Cancelada` / `Completada` |
| 7 | `creadoPor` | `codigo` del usuario (`administrador`/`psiquiatra`/`recepcion`) que creó la cita |
| 8 | `fechaCreacion` | `new Date()` |
| 9 | `fechaActualizacion` | `new Date()`, actualizado en cada cambio de estado |

Empieza vacía (solo encabezado).

Todas las fechas/horas se guardan y manipulan como **strings** (`YYYY-MM-DD`,
`HH:MM`), no como objetos `Date` de Sheets — evita problemas de zona horaria
al leer/escribir y simplifica las comparaciones.

---

## 3. Backend — acciones API

Nuevas acciones en `backend/src/router.js`, siguiendo el patrón existente
(`requireAuth`/`requireAuthBody` con array de roles). Se organizan en dos
módulos nuevos:

- **`backend/src/agenda.js`**: `leerAgenda`, `crearCita`, `cambiarEstadoCita`,
  `leerMiAgenda`, `cancelarMiCita`, y la lógica de cálculo de slots (sección
  4).
- **`backend/src/horario.js`**: `leerHorarioConfig`,
  `actualizarHorarioConfig`, `leerBloqueos`, `crearBloqueo`,
  `eliminarBloqueo`.
- **`backend/src/usuarios.js`** (existente, se le añade una función):
  `listarPacientes` — devuelve solo `{codigo, nombre}` de usuarios con
  `rol = 'usuario'`. Es necesaria porque `listarUsuarios` (que devuelve todos
  los roles) está restringida a `administrador`, y `recepcion` necesita poder
  buscar pacientes al crear una cita.

### `doGet` (query params)

| `accion` | Roles | Params | Respuesta éxito | Errores propios |
|---|---|---|---|---|
| `leerAgenda` | administrador, psiquiatra, recepcion | `token, fechaInicio, fechaFin` | `{ok:true, horarioConfig:[...7], bloqueos:[...], slots:[...]}` (ver sección 4) | `{error:'fechaInicio y fechaFin son requeridos'}` |
| `leerMiAgenda` | usuario | `token` | `{ok:true, proximas:[...], historial:[...]}` (cada item: `{id, fecha, horaInicio, horaFin, estado}`) | — |
| `leerHorarioConfig` | administrador, psiquiatra, recepcion | `token` | `{ok:true, horario:[...7 filas]}` | — |
| `leerBloqueos` | administrador, psiquiatra, recepcion | `token` | `{ok:true, bloqueos:[{id,fechaInicio,fechaFin,motivo}, ...]}`, ordenados por `fechaInicio` | — |
| `listarPacientes` | administrador, psiquiatra, recepcion | `token` | `{ok:true, pacientes:[{codigo, nombre}, ...]}` | — |

### `doPost` (body JSON)

| `accion` | Roles | Body | Respuesta éxito | Errores propios |
|---|---|---|---|---|
| `crearCita` | administrador, psiquiatra, recepcion | `{token, fecha, horaInicio, pacienteCodigo}` | `{ok:true, cita:{id, fecha, horaInicio, horaFin, pacienteCodigo, pacienteNombre, estado:'Programada'}}` | `{error:'Slot no disponible'}` / `{error:'Paciente no encontrado'}` / `{error:'fecha y horaInicio fuera del horario configurado'}` |
| `cambiarEstadoCita` | administrador, psiquiatra, recepcion | `{token, citaId, estado}` (`estado` ∈ `Cancelada`\|`Completada`) | `{ok:true}` | `{error:'Cita no encontrada'}` / `{error:'Estado invalido'}` / `{error:'Solo se puede cambiar el estado de una cita Programada'}` |
| `cancelarMiCita` | usuario | `{token, citaId}` | `{ok:true}` | `{error:'Cita no encontrada'}` / `{error:'No tienes permiso sobre esta cita'}` / `{error:'Solo se pueden cancelar citas Programadas'}` |
| `actualizarHorarioConfig` | administrador, psiquiatra | `{token, horario:[...7 filas {diaSemana,activo,horaInicio,horaFin,duracionSlotMin}]}` | `{ok:true}` | `{error:'horaInicio debe ser menor que horaFin (<dia>)'}` / `{error:'duracionSlotMin debe ser mayor que 0 (<dia>)'}` / `{error:'Se requieren las 7 filas de horario'}` |
| `crearBloqueo` | administrador, psiquiatra | `{token, fechaInicio, fechaFin, motivo, confirmar?}` | `{ok:true, bloqueo:{id,fechaInicio,fechaFin,motivo}}` o, si hay conflicto y `!confirmar`: `{ok:false, requiereConfirmacion:true, citasAfectadas:[{id,fecha,horaInicio,pacienteNombre}, ...]}` | `{error:'fechaInicio debe ser anterior o igual a fechaFin'}` |
| `eliminarBloqueo` | administrador, psiquiatra | `{token, bloqueoId}` | `{ok:true}` | `{error:'Bloqueo no encontrado'}` |

Todas las acciones devuelven `{error:'No autorizado'}` / `{error:'Permiso
denegado'}` vía `requireAuth`/`requireAuthBody` cuando corresponde, igual que
el resto del sistema.

---

## 4. Cálculo de la agenda (`leerAgenda`)

### Algoritmo

Para el rango `[fechaInicio, fechaFin]` solicitado:

1. Cargar `_horario_config` (7 filas), `_bloqueos` y las filas de `_citas`
   cuya `fecha` esté en el rango.
2. Para cada `fecha` del rango:
   - Determinar `diaSemana` (`Lunes`..`Domingo`) a partir de `fecha`.
   - Buscar la fila de `_horario_config` para ese `diaSemana`.
   - Si `activo = FALSE` → esa fecha no aparece como columna (sin slots).
   - Si `activo = TRUE`:
     - `estaBloqueada` = existe un `_bloqueos` tal que
       `fechaInicio <= fecha <= fechaFin`.
     - Generar slots desde `horaInicio` hasta `horaFin` en incrementos de
       `duracionSlotMin` (mismo patrón que `generarSlots` de NUEVOCENTYR):
       mientras `t + duracionSlotMin <= horaFin`, slot
       `[t, t+duracionSlotMin)`, avanzar `t += duracionSlotMin`.
     - Para cada slot generado:
       - Si existe una `_cita` con esa `fecha` y `horaInicio` y
         `estado != 'Cancelada'` → `estado: 'ocupado'`, incluir `citaId`,
         `pacienteNombre` (resuelto vía `findUser` de `usuarios.js`) y el
         estado real de la cita en el campo `estadoCita`
         (`Programada`/`Completada`).
       - Si no hay cita y `estaBloqueada` → `estado: 'bloqueado'`.
       - Si no hay cita y no está bloqueada → `estado: 'disponible'`.
3. **Citas fuera del horario activo**: cualquier `_cita` con `fecha` en el
   rango y `estado != 'Cancelada'` que no haya quedado incluida en el paso 2
   (p. ej. porque el horario configurado cambió y esa hora ya no forma parte
   de los slots generados) se agrega igualmente al resultado con
   `estado: 'ocupado'`, `citaId`, `pacienteNombre` y `estadoCita`, para que el
   personal siempre pueda ver y gestionar citas ya creadas.

### Forma de la respuesta

```jsonc
{
  "ok": true,
  "horarioConfig": [ {"diaSemana":"Lunes","activo":true,"horaInicio":"09:00","horaFin":"18:00","duracionSlotMin":45}, /* ...7 */ ],
  "bloqueos": [ {"id":"...", "fechaInicio":"2026-07-01","fechaFin":"2026-07-15","motivo":"Vacaciones"} ], // solo los que solapan el rango
  "slots": [
    {"fecha":"2026-06-15","horaInicio":"09:00","horaFin":"09:45","estado":"ocupado","citaId":"...","pacienteNombre":"M. García","estadoCita":"Programada"},
    {"fecha":"2026-06-15","horaInicio":"09:45","horaFin":"10:30","estado":"disponible"},
    {"fecha":"2026-06-20","horaInicio":"09:00","horaFin":"09:45","estado":"bloqueado"}
  ]
}
```

El frontend construye la cuadrícula así: las **columnas** son las fechas del
rango cuyo día está `activo` (más cualquier fecha adicional que aparezca en
`slots` por la regla del paso 3); las **filas** son la unión de todos los
`horaInicio` distintos presentes en `slots`. Una celda sin slot
correspondiente para esa combinación fecha/hora se renderiza vacía
(no aplica).

### Casos límite

- **Crear un bloqueo sobre fechas con citas `Programada`**: `crearBloqueo`
  responde `{ok:false, requiereConfirmacion:true, citasAfectadas:[...]}` si
  no se envía `confirmar:true`. El frontend muestra la lista de citas
  afectadas y, si el usuario confirma, repite la llamada con
  `confirmar:true`. Las citas **no se cancelan automáticamente**.
- **Doble reserva del mismo slot**: `crearCita` revalida en el momento de
  guardar que no exista ya una `_cita` con esa `fecha`+`horaInicio` y
  `estado != 'Cancelada'`, y que el slot no esté `bloqueado` ni fuera del
  horario activo — independientemente de lo que mostrara la cuadrícula al
  cargarse.
- **Cancelar una cita libera el slot**: al pasar a `Cancelada` (vía
  `cambiarEstadoCita` o `cancelarMiCita`), el slot vuelve a `estado:
  'disponible'` (o `'bloqueado'` si la fecha cae en un bloqueo) en la
  siguiente lectura de `leerAgenda`.
- **`actualizarHorarioConfig`** valida, por cada una de las 7 filas con
  `activo = TRUE`: `horaInicio < horaFin` y `duracionSlotMin > 0` (entero).
  Filas con `activo = FALSE` no se validan (sus horas se ignoran).

---

## 5. Frontend

### Estructura de archivos (adiciones sobre la de Fase 0)

```
src/portal/views/
  agenda.js              # vista 'agenda' (administrador, psiquiatra, recepcion)
  agenda-horario.js       # panel "Configurar horario" (horario semanal + bloqueos)
  mi-agenda.js            # vista 'mi-agenda' (usuario)

tests/portal/views/
  agenda.test.js
  agenda-horario.test.js
  mi-agenda.test.js

backend/src/
  agenda.js
  horario.js

backend/tests/
  agenda.test.js
  horario.test.js
```

### `src/portal/dashboard.js`

- **`MENUS`**: habilitar (`enabled: true`) el ítem `agenda` para
  `administrador`, `psiquiatra` y `recepcion`; habilitar `mi-agenda` para
  `usuario`.
- **`VIEWS`**: agregar `agenda: initAgendaView` y
  `'mi-agenda': initMiAgendaView`.

### Vista `agenda` (`administrador`, `psiquiatra`, `recepcion`)

- **Cabecera**: navegación `‹ Semana del DD/MM al DD/MM ›` (botones
  prev/next semana) + botón **"Configurar horario"**.
- **Cuadrícula semanal**: construida a partir de la respuesta de
  `leerAgenda` como se describe en la sección 4. Cada celda según `estado`:
  - `disponible`: celda clara, clicable → abre formulario **"Nueva cita"**.
  - `ocupado`: celda con color (`--color-lavanda`) mostrando
    `pacienteNombre`; clicable → abre panel de **detalle de cita**.
  - `bloqueado`: celda gris, no clicable.
  - Sin slot para esa combinación fecha/hora: celda vacía, no clicable.
- **Formulario "Nueva cita"** (al hacer clic en una celda `disponible`):
  - Muestra `fecha` y horario del slot (no editables).
  - Campo "Paciente": buscador/select sobre `listarPacientes` (filtra por
    nombre mientras se escribe).
  - Botón "Guardar" → `apiPost({accion:'crearCita', token, fecha,
    horaInicio, pacienteCodigo})`. Si `ok`, cierra el formulario y recarga
    la cuadrícula (nueva llamada a `leerAgenda`). Si `error`, se muestra en
    línea dentro del formulario.
- **Detalle de cita** (al hacer clic en una celda `ocupado`):
  - Muestra `pacienteNombre`, `fecha`, horario y `estadoCita`.
  - Si `estadoCita === 'Programada'`: botones **"Marcar completada"** y
    **"Cancelar"**, cada uno llama a `apiPost({accion:'cambiarEstadoCita',
    token, citaId, estado})` con `estado` = `'Completada'` o `'Cancelada'`
    respectivamente, y recarga la cuadrícula tras `ok`.
  - Si `estadoCita` es `Completada` o `Cancelada`: solo lectura, sin botones
    de acción (son estados finales).

### Panel "Configurar horario" (`agenda-horario.js`)

Accesible desde el botón de la vista `agenda` para los tres roles, pero:

- `administrador` / `psiquiatra`: controles editables + botones de guardar.
- `recepcion`: mismos datos, todos los controles deshabilitados (solo
  lectura) — útil para entender por qué ciertos días/celdas aparecen
  bloqueados o inactivos.

Contenido:

1. **Horario semanal**: una fila por día (`Lunes`..`Domingo`, orden fijo)
   con: checkbox `activo`, input hora `horaInicio`, input hora `horaFin`,
   input numérico `duracionSlotMin`. Botón **"Guardar horario"** →
   `apiPost({accion:'actualizarHorarioConfig', token, horario:[...7]})`. Tras
   `ok`, recarga el panel; si `error`, se muestra en línea.
2. **Bloqueos**: lista de bloqueos (`leerBloqueos`) con `fechaInicio –
   fechaFin: motivo` y botón "Eliminar" (`eliminarBloqueo`) por fila.
   Formulario para agregar: `fechaInicio`, `fechaFin`, `motivo` (opcional) →
   `crearBloqueo`.
   - Si la respuesta es `{ok:false, requiereConfirmacion:true,
     citasAfectadas:[...]}`, se muestra la lista de citas afectadas
     (`fecha`, `horaInicio`, `pacienteNombre`) y un botón **"Crear bloqueo
     de todos modos"** que repite la llamada con `confirmar:true`.
   - Tras `ok`, recarga la lista de bloqueos y la cuadrícula de `agenda` (los
     slots bloqueados cambian).

### Vista `mi-agenda` (`usuario`)

- **"Próximas citas"**: lista de `proximas` (de `leerMiAgenda`), ordenadas
  por `fecha`+`horaInicio` ascendente. Cada fila: `fecha`, `horaInicio –
  horaFin`, `estado`, y botón **"Cancelar"** si `estado === 'Programada'`.
  - Clic en "Cancelar" → `confirm()` nativo → `apiPost({accion:
    'cancelarMiCita', token, citaId})`. Tras `ok`, recarga ambas listas.
  - Si `proximas` está vacío: mensaje "No tienes citas próximas."
- **"Historial"**: lista de `historial` (citas pasadas o en estado
  `Cancelada`/`Completada`), ordenadas por `fecha`+`horaInicio`
  descendente, sin acciones. Si está vacío: "No tienes citas en tu
  historial."

---

## 6. Permisos por rol (resumen)

| Acción | administrador | psiquiatra | recepcion | usuario |
|---|---|---|---|---|
| `leerAgenda` | ✅ | ✅ | ✅ | ❌ |
| `crearCita` | ✅ | ✅ | ✅ | ❌ |
| `cambiarEstadoCita` | ✅ | ✅ | ✅ | ❌ |
| `listarPacientes` | ✅ | ✅ | ✅ | ❌ |
| `leerMiAgenda` / `cancelarMiCita` | ❌ | ❌ | ❌ | ✅ |
| `leerHorarioConfig` / `leerBloqueos` | ✅ | ✅ | ✅ (solo lectura) | ❌ |
| `actualizarHorarioConfig` | ✅ | ✅ | ❌ | ❌ |
| `crearBloqueo` / `eliminarBloqueo` | ✅ | ✅ | ❌ | ❌ |

---

## 7. Testing

| Archivo | Cubre |
|---|---|
| `backend/tests/agenda.test.js` | `leerAgenda`: generación de slots a partir de `_horario_config` + `_bloqueos` + `_citas` (disponible/ocupado/bloqueado, citas fuera de horario activo). `crearCita`: éxito; rechazos (slot ocupado, bloqueado, fuera de horario, paciente inexistente o sin `rol='usuario'`). `cambiarEstadoCita`: transiciones válidas/invalidas, cita inexistente. `leerMiAgenda`/`cancelarMiCita`: separación próximas/historial, pertenencia del usuario, solo cancela `Programada`. Gating por rol de las 6 acciones según la tabla de la sección 6. |
| `backend/tests/horario.test.js` | `leerHorarioConfig`/`leerBloqueos`: lectura. `actualizarHorarioConfig`: validaciones (`horaInicio<horaFin`, `duracionSlotMin>0`, 7 filas requeridas) y permisos (`recepcion` denegado). `crearBloqueo`: validación de fechas, detección de `citasAfectadas` + flujo `confirmar`, permisos. `eliminarBloqueo`: éxito y "Bloqueo no encontrado". |
| `tests/portal/views/agenda.test.js` | Render de la cuadrícula semanal a partir de una respuesta mock de `leerAgenda` (celdas disponible/ocupado/bloqueado/vacía); navegación de semana recarga `leerAgenda` con el nuevo rango; clic en celda disponible abre "Nueva cita" y llama `crearCita`; clic en celda ocupada abre detalle y los botones llaman `cambiarEstadoCita` con el `estado` correcto, ocultos si la cita ya está `Completada`/`Cancelada`. |
| `tests/portal/views/agenda-horario.test.js` | Render del horario semanal y bloqueos desde mocks; `administrador`/`psiquiatra` ven controles editables y `recepcion` los ve deshabilitados; guardar horario llama `actualizarHorarioConfig`; agregar bloqueo llama `crearBloqueo`, maneja `requiereConfirmacion` mostrando `citasAfectadas` y reenvía con `confirmar:true`; eliminar bloqueo llama `eliminarBloqueo`. |
| `tests/portal/views/mi-agenda.test.js` | Render de "Próximas citas" e "Historial" desde un mock de `leerMiAgenda`; botón "Cancelar" solo visible si `estado==='Programada'` y llama `cancelarMiCita`; estados vacíos ("No tienes citas..."). |

---

## 8. Fuera de alcance (recordatorio)

- **Fase 1b** (spec separado): sincronización de `_citas` con Google
  Calendar (crear/actualizar/eliminar eventos en el calendario de la
  psiquiatra), incluyendo configuración de credenciales OAuth.
- **Recordatorios/notificaciones**: se evaluarán junto con la integración de
  Gmail/Calendar, no en esta fase.
- **Estado "No asistió"**: descartado para esta fase (solo `Programada` /
  `Cancelada` / `Completada`).

---

## 9. Seguimiento para Fase 1b (revisión final de Fase 1a)

La revisión final de Fase 1a (commits `3eb1e5b..4a17b0a`) encontró y corrigió
un bug crítico de build (`backend/build.js` no incluía `agenda.js`/
`horario.js` en el bundle de GAS) y 3 issues de UX (confirmación al cancelar
una cita, panel de cita obsoleto al navegar/abrir "Configurar horario",
validación de paciente vacío en "Nueva cita"). Quedan pendientes los
siguientes puntos para considerar al planificar Fase 1b:

- **Auditoría (`registrarLog`)**: a diferencia de `guardarUsuario`/
  `eliminarUsuario` (Fase 0), las 6 acciones mutadoras de esta fase
  (`crearCita`, `cambiarEstadoCita`, `cancelarMiCita`,
  `actualizarHorarioConfig`, `crearBloqueo`, `eliminarBloqueo`) no registran
  entradas en el log de auditoría. Decidir si Fase 1b debe agregar logging a
  estas acciones (consistencia con el resto del sistema) o si se considera
  deliberadamente fuera de alcance.
- **Helpers de fecha duplicados**: `formatearFecha`, `lunesDeSemana`,
  `sumarDias`, `formatearFechaCorta`/`formatearFechaDDMM` están duplicados
  entre `backend/src/agenda.js`, `src/portal/views/agenda.js` y sus tests.
  Como Fase 1b incorpora sincronización con Google Calendar (manejo de
  fechas/zonas horarias más exigente), se recomienda consolidar estos
  helpers en un módulo compartido como primera tarea de preparación de
  Fase 1b.
- **Hojas `_horario_config`/`_bloqueos` ausentes**: `leerHorarioConfig`/
  `leerBloqueos` devuelven listas vacías silenciosamente si esas hojas no
  existen en el spreadsheet. Antes del go-live, verificar como checklist de
  despliegue que ambas hojas existan con las cabeceras correctas en el
  spreadsheet de producción.
- **Nice to have** (no bloquean, considerar si se toca el código cercano):
  duplicación del helper `nombrePaciente` entre `backend/src/agenda.js` y
  `backend/src/horario.js`; duplicación de strings de formato de fecha entre
  `agenda.js` y `mi-agenda.js`; nombres `formatearFechaDDMM` vs
  `formatearFechaCorta` pueden confundirse; agregar al checklist del plan un
  paso explícito de "actualizar `backend/build.js` FILES" al crear nuevos
  módulos backend; considerar un chequeo en build-time que detecte
  declaraciones `const`/`let` duplicadas al concatenar módulos (generalizaría
  la protección agregada en `backend/tests/build.test.js` para el caso
  `SHEET_CITAS`/`SHEET_CITAS_AGENDA`).
