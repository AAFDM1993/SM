# Diseño: SMPDJM — Mis actividades (Parte C): Auto-registro de síntomas

**Fecha:** 2026-07-21
**Proyecto:** SMPDJM — webapp para "Petra Diana Jara Muñoz - Psiquiatra"

---

## 1. Resumen y alcance

Esta entrega implementa la tercera parte de **"Mis actividades"**: el paciente
puede registrar síntomas en cualquier momento (modelo free-log), eligiendo el
tipo de síntoma e indicando una intensidad 1–5 con nota opcional.

**Objetivo:**

- El paciente registra síntomas desde "Mis actividades" cuando lo desee.
- Cada registro captura: tipo (Ánimo, Ansiedad, Sueño, Energía, Irritabilidad),
  intensidad (1–5) y nota opcional.
- La psiquiatra ve el historial de síntomas del paciente en la Historia Clínica.

**Fuera de alcance:** alertas o notificaciones por síntomas extremos, gráficas
de tendencia, configuración de tipos de síntoma por paciente, edición o
eliminación de registros ya guardados, restricción de frecuencia de registro.

---

## 2. Modelo de datos

### Hoja `_sintomas` (7 columnas)

| Col | Campo | Notas |
|---|---|---|
| 0 | `id` | UUID |
| 1 | `pacienteCodigo` | FK a `_usuarios.codigo` |
| 2 | `tipo` | `'Ánimo'` \| `'Ansiedad'` \| `'Sueño'` \| `'Energía'` \| `'Irritabilidad'` |
| 3 | `intensidad` | entero 1–5 (guardado como número) |
| 4 | `nota` | texto libre, vacío `''` si no se provee |
| 5 | `fechaHora` | `new Date().toISOString()` — timestamp ISO |
| 6 | `registradoPor` | `user.codigo` del paciente |

Sin cifrado — los tipos e intensidades no son PII sensible.

La hoja se agrega a `setupSheets()` en `backend/src/index.js` **antes** de `_log`:

```js
{ name: '_sintomas', header: ['id', 'pacienteCodigo', 'tipo', 'intensidad', 'nota', 'fechaHora', 'registradoPor'] },
```

---

## 3. Backend

### 3.1 Nuevo archivo `backend/src/sintomas.js`

```js
const TIPOS_VALIDOS = ['Ánimo', 'Ansiedad', 'Sueño', 'Energía', 'Irritabilidad'];
const SHEET_SINTOMAS = '_sintomas';
```

#### `registrarSintoma(b, user, services)` — rol `['usuario']`

Validaciones (en orden):
1. `tipo` ausente o vacío → `{ error: 'tipo es requerido' }`
2. `tipo` no está en `TIPOS_VALIDOS` → `{ error: 'Tipo de síntoma inválido' }`
3. `intensidad` ausente → `{ error: 'intensidad es requerida' }`
4. `intensidad` no es entero 1–5 → `{ error: 'Intensidad debe ser un número entre 1 y 5' }`

Si válido: guarda fila `[id, user.codigo, tipo, intensidad, nota||'', fechaHora, user.codigo]`,
registra log `'sintoma_registrado'` con detalle `tipo`.

Retorna: `{ ok: true, sintoma: { id, tipo, intensidad, nota, fechaHora } }`

#### `listarMisSintomas(user, services)` — rol `['usuario']`

Filtra `_sintomas` por `row[1] === user.codigo` (case-insensitive `.toLowerCase()`).
Ordena desc por `fechaHora`.

Retorna: `{ ok: true, sintomas: [{ id, tipo, intensidad, nota, fechaHora }] }`

#### `listarSintomasPaciente(codigo, services)` — rol `['psiquiatra']`

Filtra `_sintomas` por `row[1] === codigo` (case-insensitive).
Ordena desc por `fechaHora`.

Retorna: `{ ok: true, sintomas: [{ id, tipo, intensidad, nota, fechaHora }] }`

### 3.2 Extensión de `backend/src/router.js`

**Import extendido:**
```js
import { registrarSintoma, listarMisSintomas, listarSintomasPaciente } from './sintomas.js';
```

**Nuevas rutas GET** (añadir antes del `default:` en `handleGet`):
```
'listarMisSintomas'        → requireAuth(p, ['usuario'], ...)
'listarSintomasPaciente'   → requireAuth(p, ['psiquiatra'], ...) — usa p.codigo
```

**Nueva ruta POST** (antes del `default:` en `handlePost`):
```
'registrarSintoma'         → requireAuthBody(b.token, ['usuario'], ...)
```

### 3.3 Build (`backend/build.js`)

Agregar `'sintomas.js'` a la lista `FILES`, antes de `'auth.js'`:

```js
'sintomas.js',
'auth.js',
```

---

## 4. Frontend — Paciente (`src/portal/views/mis-actividades.js`)

### 4.1 Nueva sección "Mis síntomas"

Al final de la vista (después de `tomasHistorialSection`), se añade:

**Sección formulario** (`view-mis-actividades__sintomas`):
- `<h3>` "Mis síntomas"
- `<select>` tipo (`view-mis-actividades__sintoma-tipo`) — 5 opciones: Ánimo, Ansiedad, Sueño, Energía, Irritabilidad
- `<select>` intensidad (`view-mis-actividades__sintoma-intensidad`) — opciones 1, 2, 3, 4, 5
- `<textarea>` nota (`view-mis-actividades__sintoma-nota`), placeholder "Nota opcional..."
- `<div>` error (`view-mis-actividades__sintoma-form-error`), hidden
- `<button>` "Registrar síntoma" (`view-mis-actividades__btn-registrar-sintoma`)

El formulario es **siempre visible** (sin colapsar). Al confirmar éxito:
prepend al array `sintomas` con `result.sintoma`, llamar `renderSintomasHistorial()`,
y limpiar los selects y textarea.

**Sección historial** (`view-mis-actividades__sintomas-historial`):
- `<h3>` "Historial de síntomas"
- `<table>` (`view-mis-actividades__sintomas-tabla`) — columnas: Fecha/Hora · Tipo · Intensidad · Nota
- Fecha/Hora: `fechaHora.slice(0, 16).replace('T', ' ')`
- Si no hay registros: `<tbody>` con fila vacía o sin filas (la tabla puede quedar vacía)

### 4.2 Estado y carga

Nuevo estado: `let sintomas = [];`

`loadActividades` extiende el `Promise.all` existente con un tercer fetch:
```js
const [actividadesResult, prescripcionesResult, sintomasResult] = await Promise.all([
  apiGet('listarMisActividades', { token: ctx.session.token }),
  apiGet('listarMisPrescripciones', { token: ctx.session.token }),
  apiGet('listarMisSintomas', { token: ctx.session.token }),
]);
```

Error de `sintomasResult` se maneja igual que los otros dos (muestra en `errorEl` y return).

---

## 5. Frontend — Psiquiatra (`src/portal/views/historia-clinica.js`)

### 5.1 Nueva sección en la ficha del paciente

Después de `renderTareas(...)`, cargar y renderizar síntomas:

```js
const sintomasResult = await apiGet('listarSintomasPaciente', {
  token: ctx.session.token, codigo: paciente.codigo
});
if (sintomasResult.error) { ... showError / return; }
renderSintomas(paciente, sintomasResult.sintomas);
```

### 5.2 `renderSintomas(paciente, sintomas)`

Sección de solo lectura (`view-historia-clinica__sintomas`):
- `<h4>` "Síntomas auto-registrados"
- Si `sintomas.length === 0`: texto "Sin registros de síntomas."
- Si hay registros: `<table>` con columnas Fecha/Hora · Tipo · Intensidad · Nota
  - Fecha/Hora: `fechaHora.slice(0, 16).replace('T', ' ')`
  - Filas ordenadas desc (ya vienen ordenadas del backend)

---

## 6. Tests

### 6.1 `backend/tests/sintomas.test.js` (nuevo, ~14 tests)

**`describe('registrarSintoma')`** — 7 tests:
1. retorna error si falta `tipo`
2. retorna error si `tipo` no está en `TIPOS_VALIDOS`
3. retorna error si falta `intensidad`
4. retorna error si `intensidad` es 0
5. retorna error si `intensidad` es 6
6. guarda fila correcta, registra log `'sintoma_registrado'` y retorna `{ ok, sintoma }`
7. guarda `nota` vacía si no se provee

**`describe('listarMisSintomas')`** — 4 tests:
8. retorna lista vacía si no hay registros
9. no retorna síntomas de otro paciente
10. retorna síntomas del paciente ordenados desc por `fechaHora`
11. `intensidad` retornada es número (no string)

**`describe('listarSintomasPaciente')`** — 3 tests:
12. retorna lista vacía si no hay registros
13. retorna síntomas del paciente filtrados
14. ordena desc por `fechaHora`

### 6.2 `backend/tests/router.test.js` (+6 tests)

```
listarMisSintomas      → permite usuario ✓ / rechaza psiquiatra ✗
listarSintomasPaciente → permite psiquiatra ✓ / rechaza usuario ✗
registrarSintoma       → permite usuario ✓ / rechaza psiquiatra ✗
```

Para `registrarSintoma permite usuario`: body con `tipo: 'Ánimo'`, `intensidad: 3`.

Nueva constante en el archivo:
```js
const SINTOMAS_HEADER_R = ['id', 'pacienteCodigo', 'tipo', 'intensidad', 'nota', 'fechaHora', 'registradoPor'];
```

Para `listarSintomasPaciente`: usar param `codigo` con el `extraSheets` de `_sintomas`.

### 6.3 `tests/portal/views/mis-actividades.test.js` (+6 tests)

`beforeEach` ya usa `mockImplementation` — agregar rama:
```js
if (accion === 'listarMisSintomas') return Promise.resolve({ ok: true, sintomas: [] });
```

Nuevos tests:
1. llama `listarMisSintomas` al cargar
2. muestra historial con síntomas registrados (Fecha/Hora, Tipo, Intensidad)
3. "Registrar síntoma" llama `apiPost` con `accion: 'registrarSintoma'`, `tipo`, `intensidad`, `nota`
4. error de API se muestra en el `div` de error del formulario
5. éxito prepend síntoma al historial y limpia selects y textarea
6. muestra `'Sin registros'` o historial vacío si `sintomas: []`

### 6.4 `tests/portal/views/historia-clinica.test.js` (+4 tests)

`beforeEach` — agregar rama en `apiGet.mockImplementation`:
```js
if (accion === 'listarSintomasPaciente') return Promise.resolve({ ok: true, sintomas: [] });
```

Nuevos tests:
1. llama `listarSintomasPaciente` con `codigo` del paciente
2. muestra tabla de síntomas cuando hay registros
3. muestra "Sin registros de síntomas." cuando el array está vacío
4. error de `listarSintomasPaciente` muestra error y detiene carga

---

## 7. Archivos modificados / creados

| Acción | Ruta |
|---|---|
| Crear | `backend/src/sintomas.js` |
| Crear | `backend/tests/sintomas.test.js` |
| Modificar | `backend/src/router.js` |
| Modificar | `backend/src/index.js` |
| Modificar | `backend/build.js` |
| Modificar | `backend/tests/router.test.js` |
| Modificar | `src/portal/views/mis-actividades.js` |
| Modificar | `tests/portal/views/mis-actividades.test.js` |
| Modificar | `src/portal/views/historia-clinica.js` |
| Modificar | `tests/portal/views/historia-clinica.test.js` |

---

## 8. Restricciones globales

- `TIPOS_VALIDOS = ['Ánimo', 'Ansiedad', 'Sueño', 'Energía', 'Irritabilidad']` (exacto, con tildes)
- `intensidad` validada como entero en rango `[1, 5]` en el backend
- `nota` guardada como `''` cuando ausente (nunca `null` ni `undefined`)
- Log action: `'sintoma_registrado'`
- `registrarSintoma` solo para rol `['usuario']`; `listarMisSintomas` solo para rol `['usuario']`
- `listarSintomasPaciente` solo para rol `['psiquiatra']`
- Fecha/Hora en display: `fechaHora.slice(0, 16).replace('T', ' ')`
- Hoja `_sintomas` se inserta antes de `_log` en `setupSheets()`
- `sintomas.js` se inserta antes de `auth.js` en `FILES` de `build.js`
