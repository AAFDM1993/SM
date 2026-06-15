# Diseño: SMPDJM — Fase 2 (parte 2): Historia clínica — antecedentes y notas de evolución

**Fecha:** 2026-06-15
**Proyecto:** SMPDJM — webapp para "Petra Diana Jara Muñoz - Psiquiatra"

---

## 1. Resumen y alcance

Fase 2 (Historia Clínica) se divide en sub-entregas. La primera ("Ficha y
alta de pacientes",
`docs/superpowers/specs/2026-06-15-fase-2-ficha-pacientes-design.md`) cubrió
la ficha básica y el alta de pacientes. Esta es la **segunda**: antecedentes
médicos y notas de evolución, con acceso exclusivo para el rol `psiquiatra` y
cifrado del contenido clínico.

**Objetivo de esta entrega:**

- Nueva sección **"Historia Clínica"** en el portal, visible y habilitada
  solo para `psiquiatra`: lista de pacientes → detalle con antecedentes
  médicos (editable) y notas de evolución (histórico inmutable + alta).
- **Antecedentes médicos**: registro único por paciente, 5 campos de texto
  libre (antecedentes personales, antecedentes psiquiátricos, antecedentes
  familiares, alergias, medicación actual), editable en cualquier momento.
- **Notas de evolución**: registro histórico append-only por consulta
  (fecha, motivo de consulta, notas/evolución, diagnóstico). Una vez
  guardada, una nota no se puede editar ni eliminar.
- Todo el contenido clínico de texto libre (los 5 campos de antecedentes y
  los 3 campos de texto de cada nota) se cifra con `encrypt_`/`decrypt_`
  (AES, infraestructura preparada en Fase 0, ver
  `docs/superpowers/specs/2026-06-12-fase-0-base-sistema-design.md` punto 5
  de "Autenticación y seguridad").

**Fuera de alcance** (ver sección 7 para detalle completo): diagnósticos
estructurados/CIE-10, edición/eliminación de notas de evolución, vinculación
de notas con citas de `_citas`, acceso del paciente a su propia historia
clínica, prescripciones (Fase 3), exportar/imprimir, búsqueda/filtrado de
notas.

---

## 2. Modelo de datos

Dos hojas nuevas en el Spreadsheet, separadas de `_pacientes` (que sigue
siendo de datos básicos no clínicos, accesible a `administrador`/`recepcion`):

### Hoja `_antecedentes` (1 fila por paciente)

| Columna | Campo | Notas |
|---|---|---|
| 0 | `codigo` | DNI, FK a `_usuarios.codigo` |
| 1 | `antecedentesPersonales` | cifrado AES (base64) |
| 2 | `antecedentesPsiquiatricos` | cifrado AES |
| 3 | `antecedentesFamiliares` | cifrado AES |
| 4 | `alergias` | cifrado AES |
| 5 | `medicacionActual` | cifrado AES |
| 6 | `fechaActualizacion` | fecha de la última actualización |
| 7 | `actualizadoPor` | `codigo` del psiquiatra que actualizó |

### Hoja `_notas_evolucion` (1 fila por nota, append-only)

| Columna | Campo | Notas |
|---|---|---|
| 0 | `id` | UUID |
| 1 | `pacienteCodigo` | FK a `_usuarios.codigo` |
| 2 | `fecha` | `YYYY-MM-DD`, fecha de la consulta (editable, default hoy en el formulario) |
| 3 | `motivoConsulta` | cifrado AES, opcional |
| 4 | `notas` | cifrado AES, evolución/observaciones — obligatorio |
| 5 | `diagnostico` | cifrado AES, opcional |
| 6 | `creadoPor` | `codigo` del psiquiatra que creó la nota |
| 7 | `fechaCreacion` | timestamp real de creación del registro |

---

## 3. Backend: funciones, router y permisos

### Nuevo archivo `backend/src/historia-clinica.js`

#### `leerAntecedentes(codigo, services)`

- Verifica que `codigo` exista en `_usuarios` con `rol === 'usuario'`; si no,
  `{error: 'Paciente no encontrado'}`.
- Verifica que la hoja `_antecedentes` exista; si no, `{error: 'Hoja de
  antecedentes no encontrada'}`.
- Busca la fila correspondiente en `_antecedentes` por `codigo`; si no
  existe (paciente sin antecedentes registrados aún), los 5 campos se
  devuelven como `''` — no es un error.
- Descifra los 5 campos con `decrypt_`.
- Devuelve `{ok: true, antecedentes: {codigo, antecedentesPersonales,
  antecedentesPsiquiatricos, antecedentesFamiliares, alergias,
  medicacionActual, fechaActualizacion}}` (`fechaActualizacion: ''` si nunca
  se guardó).

#### `actualizarAntecedentes(b, user, services)`

- Requiere `codigo`; verifica que exista en `_usuarios` con `rol ===
  'usuario'`; si no, `{error: 'Paciente no encontrado'}`.
- Verifica que la hoja `_antecedentes` exista; si no, `{error: 'Hoja de
  antecedentes no encontrada'}` (verificado antes de escribir nada).
- Cifra con `encrypt_` los 5 campos recibidos (`antecedentesPersonales`,
  `antecedentesPsiquiatricos`, `antecedentesFamiliares`, `alergias`,
  `medicacionActual`), incluso si vienen vacíos (`''`), para mantener un
  formato uniforme y simplificar `leerAntecedentes`.
- Upsert por `codigo` en `_antecedentes`:
  - Si existe fila, actualiza columnas 1-5 + `fechaActualizacion = new
    Date()` + `actualizadoPor = user.codigo`.
  - Si no existe, agrega una fila nueva con esos mismos valores.
- `registrarLog(services, user.codigo, user.rol, 'antecedentes_actualizados',
  codigo)`.
- Devuelve `{ok: true}`.

#### `crearNotaEvolucion(b, user, services)`

- Requiere `codigo`, `fecha` y `notas` no vacíos; si falta alguno, `{error:
  'codigo, fecha y notas son requeridos'}`. `motivoConsulta` y `diagnostico`
  son opcionales (se guardan como `''` si no se envían).
- Verifica que `codigo` exista en `_usuarios` con `rol === 'usuario'`; si no,
  `{error: 'Paciente no encontrado'}`.
- Verifica que la hoja `_notas_evolucion` exista; si no, `{error: 'Hoja de
  notas de evolución no encontrada'}` (verificado antes de escribir nada).
- Cifra `motivoConsulta`, `notas` y `diagnostico` con `encrypt_`.
- `id = services.Utilities.getUuid()`, `fechaCreacion = new Date()`.
- Agrega fila a `_notas_evolucion`: `[id, codigo, fecha, motivoCifrado,
  notasCifrado, diagnosticoCifrado, user.codigo, fechaCreacion]`.
- `registrarLog(services, user.codigo, user.rol, 'nota_evolucion_creada',
  \`${id} paciente=${codigo} ${fecha}\`)`.
- Devuelve `{ok: true, nota: {id, pacienteCodigo: codigo, fecha,
  motivoConsulta, notas, diagnostico, creadoPor: user.codigo,
  fechaCreacion}}` — eco en texto plano de los valores recibidos (más `id`
  y `fechaCreacion` generados), evitando releer/descifrar la fila recién
  escrita.

#### `listarNotasEvolucion(codigo, services)`

- Verifica que `codigo` exista en `_usuarios` con `rol === 'usuario'`; si no,
  `{error: 'Paciente no encontrado'}`.
- Verifica que la hoja `_notas_evolucion` exista; si no, `{error: 'Hoja de
  notas de evolución no encontrada'}`.
- Filtra las filas con `pacienteCodigo === codigo` y descifra
  `motivoConsulta`, `notas` y `diagnostico` de cada una.
- Ordena por `fecha` descendente (más reciente primero); empates se resuelven
  por `fechaCreacion` descendente.
- Devuelve `{ok: true, notas: [{id, fecha, motivoConsulta, notas,
  diagnostico, creadoPor, fechaCreacion}, ...]}` (`notas: []` si el paciente
  no tiene ninguna — no es un error).

### `backend/src/router.js`

- Nueva constante `ROLES_HISTORIA_CLINICA = ['psiquiatra']`.
- GET (vía `requireAuth`): `leerAntecedentes` y `listarNotasEvolucion`, ambas
  reciben `codigo` como query param.
- POST (vía `requireAuthBody`): `actualizarAntecedentes`,
  `crearNotaEvolucion`.
- Las cuatro acciones usan `ROLES_HISTORIA_CLINICA` — rechazan
  `administrador`, `recepcion` y `usuario`.

---

## 4. Portal: vista "Historia Clínica" y navegación

### `src/portal/dashboard.js`

- `MENUS.psiquiatra`: el ítem `{ id: 'historia-clinica', label: 'Historia
  Clínica', enabled: false }` pasa a `enabled: true`.
- `MENUS.administrador`: se elimina el ítem `historia-clinica` — el acceso es
  exclusivo de `psiquiatra` y nunca aplicará a `administrador`, por lo que
  mantenerlo como placeholder permanente sería confuso.
- `VIEWS['historia-clinica'] = initHistoriaClinicaView`.

### Nuevo `src/portal/views/historia-clinica.js`

Módulo con función `initHistoriaClinicaView(container, ctx)`, con una vista
de dos niveles:

**Nivel 1 — Lista de pacientes**

- Reutiliza `listarFichasPacientes` (ya accesible para `psiquiatra` desde la
  entrega anterior).
- Input de búsqueda que filtra cliente-side por nombre o DNI (mismo patrón
  que `views/pacientes.js`).
- Tabla con columnas DNI / Nombre. Click en una fila → nivel 2 para ese
  paciente.

**Nivel 2 — Detalle del paciente**

- Encabezado con nombre y DNI del paciente, y botón "Volver a la lista" que
  regresa al nivel 1.
- **Sección "Antecedentes médicos"**: formulario con 5 `<textarea>`
  (Antecedentes personales, Antecedentes psiquiátricos, Antecedentes
  familiares, Alergias, Medicación actual), precargado vía
  `leerAntecedentes`. Botón "Guardar antecedentes" → `actualizarAntecedentes`,
  con mensaje de éxito/error.
- **Sección "Notas de evolución"**:
  - Lista de notas existentes vía `listarNotasEvolucion`, ordenadas de más
    reciente a más antigua, cada una mostrando fecha, motivo de consulta,
    notas y diagnóstico — solo lectura, sin opción de editar ni eliminar.
  - Formulario "Nueva nota": fecha (`input type="date"`, valor inicial =
    hoy), motivo de consulta, notas (`<textarea>`, obligatorio), diagnóstico.
    Botón "Guardar nota" → `crearNotaEvolucion`. Al guardar exitosamente, la
    nota se inserta al inicio de la lista y el formulario se limpia.
    Validación cliente: `notas` no vacío.

---

## 5. Validaciones y casos especiales

- **Cifrado**: si `AES_KEY` no está configurada en `PropertiesService`,
  `encrypt_`/`decrypt_` lanzan una excepción (comportamiento ya existente en
  `aes.js`, ver `backend/src/aes.js`); no se agrega manejo especial — el
  error se propaga. No existe un modo "sin cifrado".
- **Hoja `_antecedentes`/`_notas_evolucion` ausente**:
  `leerAntecedentes`/`actualizarAntecedentes`/`crearNotaEvolucion`/`listarNotasEvolucion`
  devuelven `{error: 'Hoja de ... no encontrada'}` si la hoja correspondiente
  no existe (mismo patrón que `pacientes.js`/`horario.js`).
- **Paciente sin antecedentes (sin fila en `_antecedentes`)**:
  `leerAntecedentes` devuelve los 5 campos como `''` — no es un error.
  `actualizarAntecedentes` hace upsert (crea la fila si no existe).
- **Paciente sin notas de evolución**: `listarNotasEvolucion` devuelve
  `{ok: true, notas: []}` — no es un error.
- **Notas de evolución inmutables**: no existen `actualizarNotaEvolucion` ni
  `eliminarNotaEvolucion`. Un error de registro se corrige agregando una nota
  nueva aclaratoria.
- **`notas` obligatorio, `motivoConsulta`/`diagnostico` opcionales**: en
  `crearNotaEvolucion`, solo `codigo`, `fecha` y `notas` son obligatorios.
- **Auditoría**: `antecedentes_actualizados` (detalle `codigo`) y
  `nota_evolucion_creada` (detalle `` `${id} paciente=${codigo} ${fecha}` ``),
  llamados después de completar la mutación y antes del `return {ok: true,
  ...}`, mismo patrón que
  `docs/superpowers/specs/2026-06-14-auditoria-agenda-design.md`.

---

## 6. Testing

- **`backend/tests/historia-clinica.test.js`** (nuevo):
  - `leerAntecedentes`: devuelve antecedentes descifrados para un paciente
    con fila en `_antecedentes`; devuelve campos vacíos si no hay fila (sin
    error); error si `codigo` no corresponde a un `usuario`; error si falta
    la hoja `_antecedentes`.
  - `actualizarAntecedentes`: cifra y guarda los 5 campos; hace upsert (crea
    fila si no existe, actualiza si existe); error si `codigo` no
    corresponde a un `usuario`; error si falta la hoja; registra
    `antecedentes_actualizados` en `_log` con `codigo`/`rol` del usuario
    autenticado.
  - `crearNotaEvolucion`: cifra y agrega fila en `_notas_evolucion` con los
    valores correctos; rechaza si falta `codigo`, `fecha` o `notas`; error
    si `codigo` no corresponde a un `usuario`; error si falta la hoja;
    registra `nota_evolucion_creada`.
  - `listarNotasEvolucion`: devuelve notas descifradas de un paciente
    ordenadas por fecha descendente; devuelve `[]` si no tiene notas; error
    si `codigo` no corresponde a un `usuario`; error si falta la hoja.
  - Verificación de round-trip de cifrado usando un `AES_KEY` mock (mismo
    patrón que `backend/tests/aes.test.js`).

- **`backend/tests/router.test.js`**: nuevos casos para `leerAntecedentes`,
  `actualizarAntecedentes`, `crearNotaEvolucion`, `listarNotasEvolucion` —
  verifican que `ROLES_HISTORIA_CLINICA` permite solo `psiquiatra` y rechaza
  `administrador`/`recepcion`/`usuario`/sin token, y la forma de la respuesta
  HTTP.

- **`tests/portal/views/historia-clinica.test.js`** (nuevo): renderizado de
  la lista de pacientes y filtro de búsqueda (nivel 1); drill-down al detalle
  de un paciente al hacer click en una fila; carga de antecedentes
  precargados vía `leerAntecedentes`; guardar antecedentes (éxito y error de
  backend); renderizado de la lista de notas de evolución vía
  `listarNotasEvolucion`; flujo de alta de nota nueva (inserción al inicio de
  la lista, limpieza del formulario); validación de campo `notas` requerido;
  redirección a login si alguna llamada devuelve `No autorizado`.

- **`tests/portal/dashboard.test.js`**: verifica que el item "Historia
  Clínica" aparece como `enabled: true` solo en `MENUS.psiquiatra` y está
  ausente de `MENUS.administrador`; test de cambio de vista al hacer click en
  el item para `psiquiatra`.

---

## 7. Fuera de alcance

- Diagnósticos estructurados o codificados (CIE-10): el campo `diagnostico`
  es texto libre dentro de cada nota de evolución.
- Edición o eliminación de notas de evolución ya guardadas (registro
  inmutable).
- Vinculación de notas de evolución con citas específicas de `_citas`.
- Acceso del paciente (rol `usuario`) a su propia historia clínica.
- Prescripciones (Fase 3).
- Exportar o imprimir la historia clínica.
- Búsqueda o filtrado de notas de evolución dentro del histórico de un
  paciente.

### Checklist de despliegue

- Agregar la hoja `_antecedentes` al Spreadsheet con las columnas: `codigo,
  antecedentesPersonales, antecedentesPsiquiatricos, antecedentesFamiliares,
  alergias, medicacionActual, fechaActualizacion, actualizadoPor`.
- Agregar la hoja `_notas_evolucion` al Spreadsheet con las columnas: `id,
  pacienteCodigo, fecha, motivoConsulta, notas, diagnostico, creadoPor,
  fechaCreacion`.
- Verificar que `AES_KEY` esté configurada en `PropertiesService` (Script
  Properties) del proyecto de Apps Script — sin ella, `encrypt_`/`decrypt_`
  lanzan excepción y toda esta funcionalidad falla (no hay modo sin
  cifrado).
