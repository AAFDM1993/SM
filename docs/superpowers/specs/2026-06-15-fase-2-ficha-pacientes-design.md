# Diseño: SMPDJM — Fase 2 (parte 1): Ficha y alta de pacientes

**Fecha:** 2026-06-15
**Proyecto:** SMPDJM — webapp para "Petra Diana Jara Muñoz - Psiquiatra"

---

## 1. Resumen y alcance

Fase 2 (Historia Clínica) se divide en sub-entregas. Esta es la **primera**:
gestión de la ficha de pacientes y alta automática de cuentas. Las notas
clínicas (evolución, diagnósticos, antecedentes) quedan como sub-entrega
futura, bajo la sección "Historia Clínica" del portal (que sigue como
placeholder).

**Objetivo de esta entrega:**

- Nueva sección **"Pacientes"** en el portal, visible para
  `administrador`, `psiquiatra` y `recepcion`: lista con buscador + ficha
  de alta/edición.
- Al crear un paciente nuevo, además de su ficha se crea automáticamente su
  cuenta de acceso (`_usuarios`, `rol = 'usuario'`, contraseña inicial =
  DNI, cambio obligatorio en el primer login — infraestructura ya existente
  de Fase 0, ver `docs/superpowers/specs/2026-06-12-fase-0-base-sistema-design.md`
  secciones "Cambio de contraseña" y "Alta de pacientes").
- **Ficha básica**: DNI (código), nombre, fecha de nacimiento, sexo,
  teléfono, email, contacto de emergencia (nombre + teléfono).

**Fuera de alcance** (ver sección 7 para detalle completo): notas/evolución
clínica, antecedentes médicos, diagnósticos, prescripciones, edición del DNI,
eliminación de pacientes, validación de formato de teléfono/email, alta de
paciente desde el flujo de "crear cita".

---

## 2. Modelo de datos

Nueva hoja **`_pacientes`** en el Spreadsheet, separada de `_usuarios` (que
sigue siendo exclusivamente de autenticación, sin cambios de esquema):

| Columna | Campo | Notas |
|---|---|---|
| 0 | `codigo` | DNI, FK a `_usuarios.codigo` |
| 1 | `fechaNacimiento` | `YYYY-MM-DD`, opcional |
| 2 | `sexo` | `Masculino` / `Femenino` / `Otro`, opcional |
| 3 | `telefono` | opcional |
| 4 | `email` | opcional |
| 5 | `contactoEmergenciaNombre` | opcional |
| 6 | `contactoEmergenciaTelefono` | opcional |
| 7 | `fechaAlta` | fecha de creación de la ficha |
| 8 | `creadoPor` | `codigo` del staff que dio de alta |

`_usuarios.nombre` permanece como fuente canónica del nombre del paciente
(usado hoy por `findUser`/`nombrePaciente` en `agenda.js`). `_pacientes` no
duplica `nombre`.

---

## 3. Backend: funciones, router y permisos

### Nuevo archivo `backend/src/pacientes.js`

#### `crearPaciente(b, user, services)`

- Requiere `codigo` (DNI) y `nombre` no vacíos; si falta alguno, `{error:
  'codigo y nombre son requeridos'}`. El resto de campos de ficha
  (`fechaNacimiento`, `sexo`, `telefono`, `email`,
  `contactoEmergenciaNombre`, `contactoEmergenciaTelefono`) son opcionales
  (se guardan como `''` si no se envían).
- Verifica que la hoja `_pacientes` exista; si no, `{error: 'Hoja de
  pacientes no encontrada'}`.
- Verifica que `codigo` no exista ya en `_usuarios` (cualquier rol,
  comparación case-insensitive como `findUser`); si existe, `{error: 'Ya
  existe un usuario con ese código'}`. Esta validación ocurre **antes** de
  escribir nada, para no dejar filas huérfanas.
- Crea fila en `_usuarios`: `[codigo, hash(DNI + salt), salt, 'usuario',
  nombre]`, reutilizando `generarSalt`/`generarHashSHA256` de `hash.js`
  (mismo patrón que `guardarUsuario` en `usuarios.js`).
- Crea fila en `_pacientes`: `[codigo, fechaNacimiento, sexo, telefono,
  email, contactoEmergenciaNombre, contactoEmergenciaTelefono, new Date(),
  user.codigo]`.
- `registrarLog(services, user.codigo, user.rol, 'paciente_creado',
  \`${codigo} ${nombre}\`)`.
- Devuelve `{ok: true, paciente: {codigo, nombre, fechaNacimiento, sexo,
  telefono, email, contactoEmergenciaNombre, contactoEmergenciaTelefono}}`.

#### `actualizarPaciente(b, user, services)`

- Requiere `codigo` y `nombre` no vacíos; si falta alguno, `{error: 'codigo
  y nombre son requeridos'}`.
- Busca `codigo` en `_usuarios` con `rol === 'usuario'`; si no existe,
  `{error: 'Paciente no encontrado'}`.
- Verifica que la hoja `_pacientes` exista; si no, `{error: 'Hoja de
  pacientes no encontrada'}` (verificado antes de escribir nada, mismo
  criterio que `crearPaciente`).
- Actualiza `_usuarios.nombre` si cambió respecto al valor almacenado.
- Busca fila existente en `_pacientes` por `codigo`:
  - Si existe, actualiza sus columnas 1-6 (`fechaNacimiento` ...
    `contactoEmergenciaTelefono`) con los valores recibidos.
  - Si no existe (paciente "legacy", creado antes de esta entrega vía
    "Gestión de usuarios"), agrega una fila nueva con
    `fechaAlta = new Date()` y `creadoPor = user.codigo`.
- `registrarLog(services, user.codigo, user.rol, 'paciente_actualizado',
  codigo)`.
- Devuelve `{ok: true}`.

#### `leerFichaPaciente(codigo, services)`

- Busca `codigo` en `_usuarios` con `rol === 'usuario'`; si no existe,
  `{error: 'Paciente no encontrado'}`.
- Verifica que la hoja `_pacientes` exista; si no, `{error: 'Hoja de
  pacientes no encontrada'}`.
- Busca fila correspondiente en `_pacientes` (si no hay fila para ese
  `codigo` — caso "legacy" —, los campos de ficha se devuelven como `''`).
- Devuelve `{ok: true, paciente: {codigo, nombre, fechaNacimiento, sexo,
  telefono, email, contactoEmergenciaNombre, contactoEmergenciaTelefono}}`.

#### `listarFichasPacientes(services)`

- Verifica que la hoja `_pacientes` exista; si no, `{error: 'Hoja de
  pacientes no encontrada'}`.
- Recorre `_usuarios` filtrando `rol === 'usuario'` (mismo filtro que
  `listarPacientes` en `usuarios.js`).
- Para cada uno, busca su fila en `_pacientes` y enriquece con
  `telefono`/`email` (`''` si no hay fila — caso "legacy").
- Devuelve `{ok: true, pacientes: [{codigo, nombre, telefono, email}, ...]}`.
- Función nueva e independiente de `listarPacientes` (en `usuarios.js`,
  usada por el selector de paciente al crear citas en Fase 1a) — esa
  función no se modifica.

### `backend/src/router.js`

- Nueva constante `ROLES_PACIENTES = ['administrador', 'psiquiatra',
  'recepcion']`.
- POST (vía `requireAuthBody`): `crearPaciente`, `actualizarPaciente`.
- GET (vía `requireAuth`): `leerFichaPaciente` (recibe `codigo` como query
  param), `listarFichasPacientes`.
- Las cuatro acciones usan `ROLES_PACIENTES`.

---

## 4. Portal: vista "Pacientes" y navegación

### `src/portal/dashboard.js`

- Nuevo item de menú `{ id: 'pacientes', label: 'Pacientes', enabled: true
  }`, agregado a `MENUS.administrador`, `MENUS.psiquiatra` y
  `MENUS.recepcion`, después de `'agenda'`.
- `VIEWS.pacientes = initPacientesView`.

### Nuevo `src/portal/views/pacientes.js`

Sigue el patrón de `views/agenda.js`/`views/usuarios.js` (módulo con función
`initPacientesView(main, ctx)`).

- **Lista**: input de búsqueda (filtra cliente-side por nombre o DNI sobre
  el resultado de `listarFichasPacientes`), tabla con columnas DNI / Nombre
  / Teléfono, botón **"+ Nuevo paciente"**.
- **Ficha** (un solo formulario para alta y edición):
  - **Alta**: campo `codigo` (DNI) editable y vacío; resto de campos vacíos.
    Solo DNI + nombre son obligatorios para guardar.
  - **Edición**: se abre al hacer clic en una fila de la lista; precarga
    datos vía `leerFichaPaciente`; campo `codigo` deshabilitado (no
    editable).
  - Campos: nombre, fecha de nacimiento (`input type="date"`), sexo
    (`<select>`: vacío / Masculino / Femenino / Otro), teléfono, email,
    contacto de emergencia (nombre + teléfono).
  - Botón "Guardar" → llama a `crearPaciente` (modo alta) o
    `actualizarPaciente` (modo edición).
  - Validación cliente: DNI + nombre no vacíos antes de enviar (igual que
    el patrón existente en `views/usuarios.js`).
  - Al crear exitosamente, mensaje de confirmación indicando que la cuenta
    de acceso quedó creada con contraseña inicial igual al DNI y que el
    paciente deberá cambiarla en su primer login.

---

## 5. Validaciones y casos especiales

- **DNI duplicado**: `crearPaciente` revisa `_usuarios` (cualquier rol,
  case-insensitive) antes de escribir; si ya existe, `{error: 'Ya existe un
  usuario con ese código'}`.
- **Hoja `_pacientes` ausente**: `crearPaciente`, `actualizarPaciente`,
  `leerFichaPaciente` y `listarFichasPacientes` devuelven `{error: 'Hoja de
  pacientes no encontrada'}` si la hoja no existe (mismo patrón que
  `actualizarHorarioConfig`/`crearBloqueo` en `horario.js`). Excepción:
  `leerFichaPaciente` y `listarFichasPacientes` no fallan si la hoja existe
  pero no hay fila para un `codigo` dado — en ese caso devuelven campos de
  ficha vacíos (caso "legacy", ver siguiente punto).
- **Pacientes "legacy"** (creados antes de esta entrega vía "Gestión de
  usuarios", con fila en `_usuarios` pero sin fila en `_pacientes`):
  - `leerFichaPaciente` devuelve `nombre` + campos de ficha vacíos (`''`).
  - `actualizarPaciente` hace upsert: si no existe fila en `_pacientes` para
    ese `codigo`, la crea (con `fechaAlta = new Date()`, `creadoPor =
    user.codigo`).
  - `listarFichasPacientes` los incluye con `telefono`/`email` vacíos.
- **`codigo` (DNI) inmutable**: no se puede editar tras la creación — es el
  identificador de login y se referencia desde `_citas.pacienteCodigo`.
  Corregir un DNI mal ingresado queda fuera de alcance de esta entrega.
- **`nombre` obligatorio también al editar**: `actualizarPaciente` rechaza
  `nombre` vacío con `{error: 'codigo y nombre son requeridos'}`.
- **`fechaNacimiento`**: string `YYYY-MM-DD` (mismo formato que
  `_citas.fecha`, producido naturalmente por `<input type="date">`).
- **`sexo`**: uno de `Masculino` / `Femenino` / `Otro`, o `''` si no se
  selecciona — sin validación adicional de valores permitidos en el
  backend (el `<select>` del frontend restringe las opciones).
- **`telefono`/`email`**: texto libre, sin validación de formato en esta
  entrega.
- **Auditoría**: `paciente_creado` (detalle `` `${codigo} ${nombre}` ``) y
  `paciente_actualizado` (detalle `codigo`), llamados después de completar
  la mutación y antes del `return {ok: true, ...}`, mismo patrón que
  `docs/superpowers/specs/2026-06-14-auditoria-agenda-design.md`.

---

## 6. Testing

- **`backend/tests/pacientes.test.js`** (nuevo):
  - `crearPaciente`: crea filas en `_usuarios` y `_pacientes` con los
    valores correctos; rechaza DNI duplicado; rechaza `nombre` vacío;
    rechaza si falta la hoja `_pacientes`; registra `paciente_creado` en
    `_log` con `codigo`/`rol` del usuario autenticado.
  - `actualizarPaciente`: actualiza ficha y `nombre`; hace upsert para
    paciente legacy sin fila en `_pacientes`; rechaza `codigo` inexistente y
    `nombre` vacío; registra `paciente_actualizado`.
  - `leerFichaPaciente`: devuelve ficha completa para paciente con fila en
    `_pacientes`; devuelve campos vacíos para legacy; error si `codigo` no
    existe como `usuario`.
  - `listarFichasPacientes`: devuelve lista enriquecida, incluyendo
    pacientes legacy con `telefono`/`email` vacíos.

- **`backend/tests/router.test.js`**: nuevos casos para `crearPaciente`,
  `actualizarPaciente`, `leerFichaPaciente`, `listarFichasPacientes` —
  verifican que `ROLES_PACIENTES` permite administrador/psiquiatra/recepción
  y rechaza `usuario`, y la forma de la respuesta HTTP.

- **`tests/portal/views/pacientes.test.js`** (nuevo): renderizado de la
  lista, filtro de búsqueda por nombre/DNI, flujo de alta (formulario vacío
  → `crearPaciente`, mensaje de confirmación con contraseña inicial), flujo
  de edición (formulario precargado vía `leerFichaPaciente` →
  `actualizarPaciente`, campo DNI deshabilitado), validación de campos
  obligatorios (DNI + nombre).

- **`tests/portal/dashboard.test.js`**: verifica que el item "Pacientes"
  aparece en `MENUS.administrador`, `MENUS.psiquiatra` y `MENUS.recepcion`.

---

## 7. Fuera de alcance

- Notas clínicas, evolución, antecedentes médicos, diagnósticos, motivo de
  consulta — sub-entrega futura de Fase 2, bajo "Historia Clínica".
- Prescripciones (Fase 3).
- Edición del DNI (`codigo`) de un paciente existente.
- Eliminación de pacientes desde la vista "Pacientes".
- Validación de formato de teléfono/email (se aceptan como texto libre).
- Alta de paciente integrada en el flujo de "crear cita" (posible mejora
  futura; por ahora el staff usa "Pacientes" primero y luego selecciona al
  paciente en la agenda).

### Checklist de despliegue

- Agregar la hoja `_pacientes` al Spreadsheet con las columnas: `codigo,
  fechaNacimiento, sexo, telefono, email, contactoEmergenciaNombre,
  contactoEmergenciaTelefono, fechaAlta, creadoPor`.
