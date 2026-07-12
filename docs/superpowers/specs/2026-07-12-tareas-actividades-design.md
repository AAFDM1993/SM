# Diseño: SMPDJM — Mis actividades (Parte A): Tareas asignadas

**Fecha:** 2026-07-12
**Proyecto:** SMPDJM — webapp para "Petra Diana Jara Muñoz - Psiquiatra"

---

## 1. Resumen y alcance

Esta entrega implementa la primera parte de **"Mis actividades"**: tareas
que la psiquiatra asigna al paciente para realizar entre sesiones.

**Objetivo:**

- La psiquiatra asigna tareas desde la Historia Clínica del paciente.
- Una tarea puede ser **única** (un solo día) o **recurrente** (frecuencia
  diaria o semanal dentro de un rango de fechas).
- El paciente ve sus tareas pendientes en "Mis actividades" y marca cada
  ocurrencia como cumplida, con nota opcional.
- La psiquiatra puede ver el cumplimiento del paciente en la Historia Clínica.

**Fuera de alcance:** edición o eliminación de tareas ya asignadas,
notificaciones push o email al paciente, adjuntos/archivos, tareas con
fecha de vencimiento horaria, "desmarcar" una ocurrencia ya completada.

---

## 2. Modelo de datos

### Hoja `_tareas` (1 fila por tarea asignada)

| Col | Campo | Notas |
|---|---|---|
| 0 | `id` | UUID |
| 1 | `pacienteCodigo` | FK a `_usuarios.codigo` |
| 2 | `titulo` | texto libre, requerido |
| 3 | `descripcion` | texto libre, puede estar vacío |
| 4 | `tipo` | `'única'` \| `'recurrente'` |
| 5 | `frecuencia` | `'diaria'` \| `'semanal'` — vacío si `tipo='única'` |
| 6 | `fechaInicio` | `YYYY-MM-DD` |
| 7 | `fechaFin` | `YYYY-MM-DD` — igual a `fechaInicio` si `tipo='única'` |
| 8 | `creadoPor` | código de la psiquiatra |
| 9 | `fechaCreacion` | ISO timestamp (`new Date().toISOString()`) |

### Hoja `_tareas_registros` (1 fila por ocurrencia completada)

| Col | Campo | Notas |
|---|---|---|
| 0 | `id` | UUID |
| 1 | `tareaId` | FK a `_tareas.id` |
| 2 | `fechaOcurrencia` | `YYYY-MM-DD` — qué día/semana corresponde |
| 3 | `nota` | texto opcional del paciente |
| 4 | `completadoPor` | código del paciente |
| 5 | `fechaCompletacion` | ISO timestamp |

**Lógica de ocurrencias:** el frontend calcula las fechas esperadas a partir
de `fechaInicio`, `fechaFin` y `frecuencia` usando aritmética de fechas pura.
Solo se muestran ocurrencias con fecha ≤ hoy. Las futuras no se muestran.

Para tareas `'única'`: una sola ocurrencia en `fechaInicio`.
Para `'diaria'`: una ocurrencia por cada día en `[fechaInicio, fechaFin]`.
Para `'semanal'`: una ocurrencia por cada semana (día = fechaInicio + N*7 días) mientras ≤ fechaFin.

---

## 3. Backend: `backend/src/tareas.js`

### `asignarTarea(b, user, services)`

- **Actor:** psiquiatra
- Requiere en `b`: `pacienteCodigo`, `titulo`, `tipo`, `fechaInicio`, `fechaFin`
- Requiere `frecuencia` (`'diaria'` | `'semanal'`) si `tipo === 'recurrente'`
- Validaciones:
  - Paciente existe en `_usuarios` con `rol === 'usuario'`
  - `titulo` no vacío
  - `tipo` es `'única'` o `'recurrente'`
  - `fechaInicio` y `fechaFin` son strings `YYYY-MM-DD` válidos
  - `fechaFin >= fechaInicio`
  - Si `tipo === 'recurrente'`: `frecuencia` es `'diaria'` o `'semanal'`
- Guarda fila en `_tareas` con `id = Utilities.getUuid()`, `creadoPor = user.codigo`, `fechaCreacion = new Date().toISOString()`; `frecuencia` vacío si `tipo='única'`
- `registrarLog(..., 'tarea_asignada', \`${id} paciente=${pacienteCodigo}\`)`
- Retorna `{ok: true, tarea: {id, pacienteCodigo, titulo, descripcion, tipo, frecuencia, fechaInicio, fechaFin, creadoPor, fechaCreacion}}`

### `listarTareasPaciente(codigo, services)`

- **Actor:** psiquiatra
- Valida: paciente existe con `rol='usuario'`
- Filtra `_tareas` por `pacienteCodigo === codigo`, ordena por `fechaCreacion` desc
- Para cada tarea: filtra `_tareas_registros` por `tareaId === tarea.id`
- Retorna `{ok: true, tareas: [{id, pacienteCodigo, titulo, descripcion, tipo, frecuencia, fechaInicio, fechaFin, creadoPor, fechaCreacion, registros: [{id, fechaOcurrencia, nota, fechaCompletacion}]}]}`

### `listarMisActividades(user, services)`

- **Actor:** paciente (`usuario`)
- Igual que `listarTareasPaciente` usando `user.codigo`; no necesita validar paciente porque `user` ya es el autenticado

### `completarOcurrencia(b, user, services)`

- **Actor:** paciente (`usuario`)
- Requiere en `b`: `tareaId`, `fechaOcurrencia` (`YYYY-MM-DD`), `nota` (opcional, puede estar ausente)
- Validaciones:
  - Tarea existe en `_tareas`
  - `tarea.pacienteCodigo === user.codigo`
  - `fechaOcurrencia` es string `YYYY-MM-DD` válido
  - `fechaOcurrencia >= tarea.fechaInicio` y `fechaOcurrencia <= tarea.fechaFin`
  - No existe ya un registro en `_tareas_registros` con mismo `tareaId` + `fechaOcurrencia`
- Guarda fila en `_tareas_registros` con nuevo UUID, `completadoPor = user.codigo`, `fechaCompletacion = new Date().toISOString()`
- `registrarLog(..., 'tarea_completada', \`${tareaId} fecha=${fechaOcurrencia}\`)`
- Retorna `{ok: true, registro: {id, tareaId, fechaOcurrencia, nota, completadoPor, fechaCompletacion}}`

---

## 4. Router: `backend/src/router.js`

Nueva constante `ROLES_TAREAS = ['psiquiatra']`.

**GET:**
| Acción | Roles |
|---|---|
| `listarTareasPaciente` (param: `codigo`) | `['psiquiatra']` |
| `listarMisActividades` | `['usuario']` |

**POST:**
| Acción | Roles |
|---|---|
| `asignarTarea` | `['psiquiatra']` |
| `completarOcurrencia` | `['usuario']` |

---

## 5. Frontend — psiquiatra: `src/portal/views/historia-clinica.js`

Nueva sección **"Tareas"** dentro del detalle del paciente, después de Escalas.
Cargada vía `apiGet('listarTareasPaciente', {codigo})` al abrir la ficha.

### 5.1 Tabla de tareas

Columnas: **Título** | **Tipo** | **Período** | **Cumplimiento**

- Tipo: `'única'` → "Única"; `'recurrente'` → `"Recurrente (diaria)"` o `"Recurrente (semanal)"`
- Período: `fechaInicio` si única; `fechaInicio — fechaFin` si recurrente
- Cumplimiento: `N/M completadas`, donde M = ocurrencias esperadas hasta hoy,
  N = registros guardados. Si M = 0 (tarea futura), muestra "—"

### 5.2 Formulario "Asignar tarea"

Botón toggle `.view-historia-clinica__tareas-btn-asignar`. Al expandir:

- `<input type="text">` para título (requerido)
- `<textarea>` para descripción (opcional)
- Radio group `tipo`: "Única" / "Recurrente"
- Si **Única**: `<input type="date">` con label "Fecha" (mapea a `fechaInicio` y `fechaFin`)
- Si **Recurrente**: `<select>` frecuencia (Diaria / Semanal) + `<input type="date">` "Fecha inicio" + `<input type="date">` "Fecha fin"
- Los campos de recurrencia se muestran/ocultan según el radio seleccionado
- Botón "Guardar" → `apiPost('asignarTarea', {pacienteCodigo, titulo, descripcion, tipo, frecuencia, fechaInicio, fechaFin})`
- Éxito: inserta la tarea al inicio de la tabla con `0/M completadas`, colapsa formulario, resetea campos
- Error: muestra mensaje `.view-historia-clinica__tareas-error`

---

## 6. Frontend — paciente: `src/portal/views/mis-actividades.js`

Nueva vista. `MENUS.usuario`: `mis-actividades` pasa de `enabled: false` a `enabled: true`.
`VIEWS['mis-actividades'] = initMisActividadesView` en `dashboard.js`.

### 6.1 Sección "Pendientes"

Por cada tarea con ocurrencias pendientes (esperadas hasta hoy y sin registro),
muestra un grupo con el título de la tarea y una lista de ocurrencias pendientes.

Cada ocurrencia pendiente:
- Muestra la fecha (`YYYY-MM-DD`)
- Botón `.view-mis-actividades__btn-cumplir` (data-tarea-id, data-fecha)
- Al hacer click: expande inline un `<textarea>` para nota opcional + botón "Confirmar"
- Al confirmar: `apiPost('completarOcurrencia', {tareaId, fechaOcurrencia, nota})`
- Éxito: mueve la ocurrencia a la sección de completadas y re-renderiza

Si no hay pendientes: muestra "No hay actividades pendientes."

### 6.2 Sección "Completadas"

Tabla con columnas: **Tarea** | **Fecha** | **Nota**
- Fecha = `fechaOcurrencia`
- Nota = texto o "—" si no hay nota
- Ordenada por `fechaOcurrencia` desc

### 6.3 Función helper `calcularOcurrencias(tarea)`

```js
function calcularOcurrencias(tarea) {
  const hoy = new Date().toISOString().slice(0, 10);
  const fin = tarea.fechaFin < hoy ? tarea.fechaFin : hoy;
  const ocurrencias = [];
  let cur = tarea.fechaInicio;
  while (cur <= fin) {
    ocurrencias.push(cur);
    if (tarea.tipo === 'única') break;
    const d = new Date(cur + 'T12:00:00Z');
    if (tarea.frecuencia === 'diaria') d.setUTCDate(d.getUTCDate() + 1);
    else d.setUTCDate(d.getUTCDate() + 7);
    cur = d.toISOString().slice(0, 10);
  }
  return ocurrencias;
}
```

Usada en `mis-actividades.js`. La misma lógica se duplica como función
local en `historia-clinica.js` para el cálculo de M en la columna
Cumplimiento — no se extrae a módulo compartido (YAGNI).

---

## 7. Build GAS y setupSheets

- Agregar `'tareas.js'` al array `FILES` en `backend/build.js`, después de `'escalas.js'`
- Agregar a `setupSheets` en `backend/src/index.js`:

```js
{ name: '_tareas', header: ['id','pacienteCodigo','titulo','descripcion','tipo','frecuencia','fechaInicio','fechaFin','creadoPor','fechaCreacion'] },
{ name: '_tareas_registros', header: ['id','tareaId','fechaOcurrencia','nota','completadoPor','fechaCompletacion'] },
```

---

## 8. Testing

### `backend/tests/tareas.test.js` (nuevo, ~20 tests)

- `asignarTarea`: guarda con campos correctos; rechaza paciente no encontrado; rechaza tipo inválido; rechaza fechaFin < fechaInicio; rechaza recurrente sin frecuencia; registra log `tarea_asignada`
- `listarTareasPaciente`: retorna tareas con registros incluidos; retorna `[]` si no hay; rechaza paciente no encontrado
- `listarMisActividades`: retorna solo tareas del paciente autenticado; incluye registros
- `completarOcurrencia`: guarda registro; rechaza si tarea no pertenece al usuario; rechaza fecha fuera de rango; rechaza ocurrencia ya registrada; registra log `tarea_completada`

### `backend/tests/router.test.js` (modificado, ~8 tests nuevos)

- GET `listarTareasPaciente`: permite psiquiatra, rechaza usuario/sin token
- GET `listarMisActividades`: permite usuario, rechaza psiquiatra
- POST `asignarTarea`: permite psiquiatra, rechaza usuario
- POST `completarOcurrencia`: permite usuario, rechaza psiquiatra

### `tests/portal/views/historia-clinica.test.js` (modificado, ~6 tests nuevos)

- Renderiza sección "Tareas" al abrir ficha
- Muestra tabla con tareas y cumplimiento `N/M`
- Formulario asignar: muestra/oculta campos según tipo
- Asignar éxito: inserta tarea en tabla

### `tests/portal/views/mis-actividades.test.js` (nuevo, ~7 tests)

- Llama `listarMisActividades` con token
- Muestra pendientes agrupadas por tarea
- Muestra tabla de completadas
- "Marcar cumplida" expande textarea
- `completarOcurrencia` mueve ocurrencia a completadas
- Muestra "No hay actividades pendientes" si no hay
- Error de validación al confirmar sin tarea válida

---

## 9. Checklist de despliegue

- Correr `setupSheets()` en GAS para crear `_tareas` y `_tareas_registros`
- Build del bundle GAS (`node build.js`) y redeployar script
