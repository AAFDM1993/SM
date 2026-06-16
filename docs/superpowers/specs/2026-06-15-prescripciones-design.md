# Prescripciones — Diseño (Fase 2, Sub-entrega 3)

## 1. Objetivo

Permitir a la psiquiatra registrar y consultar prescripciones de medicamentos para cada paciente, como una sección adicional dentro de la vista de Historia Clínica existente. Las prescripciones son de solo escritura (no se editan ni eliminan), accesibles únicamente por el rol `psiquiatra`.

---

## 2. Alcance

**Incluido:**
- Crear una prescripción para un paciente (medicamento, dosis, frecuencia, fechaInicio, fechaFin)
- Listar todas las prescripciones de un paciente, ordenadas por fechaInicio descendente
- Cifrado AES de los campos de texto médico (medicamento, dosis, frecuencia)
- Registro en log de auditoría de cada prescripción creada
- Sección "Prescripciones" dentro de la ficha del paciente en la vista Historia Clínica

**Fuera de alcance:**
- Edición o cancelación de prescripciones
- Vista de prescripciones para el paciente (rol `usuario`)
- Vista separada "Prescripciones" en el menú del dashboard (el ítem queda `enabled: false`)
- Impresión o exportación de recetas
- Alertas de interacciones medicamentosas

---

## 3. Modelo de datos

### Sheet `_prescripciones`

Header row: `id, pacienteCodigo, medicamento, dosis, frecuencia, fechaInicio, fechaFin, creadoPor, fechaCreacion`

| col | campo | tipo en sheet | notas |
|-----|-------|---------------|-------|
| 1 | `id` | texto | UUID generado por `Utilities.getUuid()` |
| 2 | `pacienteCodigo` | texto | DNI del paciente (sin cifrar, clave de búsqueda) |
| 3 | `medicamento` | texto cifrado | AES-256 |
| 4 | `dosis` | texto cifrado | AES-256 |
| 5 | `frecuencia` | texto cifrado | AES-256 |
| 6 | `fechaInicio` | texto | formato `YYYY-MM-DD`, sin cifrar |
| 7 | `fechaFin` | texto | formato `YYYY-MM-DD`, vacío si no definido, sin cifrar |
| 8 | `creadoPor` | texto | código del usuario psiquiatra |
| 9 | `fechaCreacion` | Date | timestamp de inserción |

Los campos `fechaInicio` y `fechaFin` no se cifran porque son fechas de calendario sin información clínica directa.

---

## 4. Backend — `backend/src/prescripciones.js`

Módulo nuevo, autónomo. No comparte helpers con otros módulos.

### Helper local

```js
function validarPaciente(codigo, services)
```
- Llama a `findUser(codigo, services)` de `./usuarios.js`
- Retorna el usuario si existe y tiene `rol === 'usuario'`, `null` en caso contrario
- Mismo patrón que `validarPaciente` en `historia-clinica.js`, definido localmente para mantener cada módulo autónomo

### `crearPrescripcion(b, user, services)`

**Parámetros:**
- `b`: body del request con `{ codigo, medicamento, dosis, frecuencia, fechaInicio, fechaFin? }`
- `user`: usuario autenticado (`{ codigo, rol, ... }`)
- `services`: servicios de Google Apps Script (mock o reales)

**Lógica:**
1. Extraer y normalizar `codigo`, `medicamento`, `dosis`, `frecuencia`, `fechaInicio` (trim)
2. Si alguno de los 4 campos requeridos está vacío → `{ error: 'codigo, medicamento, dosis, frecuencia y fechaInicio son requeridos' }`
3. `validarPaciente(codigo, services)` → si null → `{ error: 'Paciente no encontrado' }`
4. Obtener sheet `_prescripciones` → si no existe → `{ error: 'Hoja de prescripciones no encontrada' }`
5. Cifrar `medicamento`, `dosis`, `frecuencia` con `encrypt_(valor, services)`
6. Generar `id = services.Utilities.getUuid()`
7. `sheet.appendRow([id, usuario.codigo, medicamento_enc, dosis_enc, frecuencia_enc, fechaInicio, fechaFin, user.codigo, new Date()])`
8. `registrarLog(services, user.codigo, user.rol, 'prescripcion_creada', \`\${id} paciente=\${usuario.codigo} \${fechaInicio}\`)`
9. Retornar `{ ok: true, prescripcion: { id, pacienteCodigo: usuario.codigo, medicamento, dosis, frecuencia, fechaInicio, fechaFin, creadoPor: user.codigo, fechaCreacion } }` — en texto plano (no cifrado), mismo patrón que `crearNotaEvolucion`

### `listarPrescripciones(codigo, services)`

**Parámetros:**
- `codigo`: DNI del paciente
- `services`: servicios

**Lógica:**
1. `validarPaciente(codigo, services)` → si null → `{ error: 'Paciente no encontrado' }`
2. Obtener sheet `_prescripciones` → si no existe → `{ error: 'Hoja de prescripciones no encontrada' }`
3. Leer todas las filas (`getRange(2, 1, last-1, 9).getValues()`)
4. Filtrar por `pacienteCodigo === usuario.codigo`
5. Para cada fila, descifrar `medicamento`, `dosis`, `frecuencia` con `decrypt_`
6. Ordenar por `fechaInicio` descendente; tiebreaker: `fechaCreacion` descendente
7. Retornar `{ ok: true, prescripciones: [{ id, pacienteCodigo, medicamento, dosis, frecuencia, fechaInicio, fechaFin, creadoPor, fechaCreacion }] }`

---

## 5. Router — `backend/src/router.js`

Cambios mínimos siguiendo el patrón establecido:

**Import nuevo** (después del import de `historia-clinica.js`):
```js
import { crearPrescripcion, listarPrescripciones } from './prescripciones.js';
```

**Constante nueva** (después de `ROLES_HISTORIA_CLINICA`):
```js
const ROLES_PRESCRIPCIONES = ['psiquiatra'];
```

**GET nuevo** (en `handleGet`, después del caso `listarNotasEvolucion`):
```js
case 'listarPrescripciones':
  return json_(
    requireAuth(p, ROLES_PRESCRIPCIONES, () => listarPrescripciones(p.codigo, services), services),
    services
  );
```

**POST nuevo** (en `handlePost`, después del caso `crearNotaEvolucion`):
```js
case 'crearPrescripcion':
  return json_(
    requireAuthBody(b.token, ROLES_PRESCRIPCIONES, (user) => crearPrescripcion(b, user, services), services),
    services
  );
```

---

## 6. Frontend — `src/portal/views/historia-clinica.js`

La función `abrirFicha(paciente)` se extiende con una tercera llamada API después de `listarNotasEvolucion`:

```js
const prescripcionesResult = await apiGet('listarPrescripciones', { token: ctx.session.token, codigo: paciente.codigo });
if (prescripcionesResult.error) {
  if (handleAuthError(prescripcionesResult)) return;
  showError(prescripcionesResult.error);
  return;
}
renderPrescripciones(paciente, prescripcionesResult.prescripciones);
```

### Nueva función `renderPrescripciones(paciente, prescripciones)`

Agrega una nueva `<section class="view-historia-clinica__prescripciones">` dentro de `fichaContainer`, con:

**Lista de prescripciones existentes** (solo lectura):
- `<ul class="view-historia-clinica__prescripciones-lista">` con items `<li class="view-historia-clinica__prescripcion">`
- Cada item muestra: medicamento, dosis, frecuencia, fechaInicio → fechaFin (o "(sin fecha fin)" si vacío)
- Función interna `renderListaPrescripciones()` (mismo patrón que `renderListaNotas()` en notas)

**Formulario "Nueva prescripción"** `<form class="view-historia-clinica__prescripcion-form">`:
- `<input class="view-historia-clinica__prescripcion-medicamento-input">` (texto, requerido)
- `<input class="view-historia-clinica__prescripcion-dosis-input">` (texto, requerido)
- `<input class="view-historia-clinica__prescripcion-frecuencia-input">` (texto, requerido)
- `<input class="view-historia-clinica__prescripcion-fechainicio-input" type="date">` (requerido, default hoy)
- `<input class="view-historia-clinica__prescripcion-fechafin-input" type="date">` (opcional)
- `<div class="view-historia-clinica__prescripcion-form-error">` (oculto hasta error)
- Botón submit "Guardar prescripción"

**Validación cliente:** si `medicamento`, `dosis`, `frecuencia` o `fechaInicio` están vacíos → mostrar error `'medicamento, dosis, frecuencia y fechaInicio son requeridos'` sin llamar a la API.

**Submit exitoso:**
- `apiPost({ accion: 'crearPrescripcion', token, codigo, medicamento, dosis, frecuencia, fechaInicio, fechaFin })`
- `prescripciones.unshift(result.prescripcion)` + `renderListaPrescripciones()`
- Limpiar formulario (resetear fechaInicio a hoy, vaciar resto)

---

## 7. Tests

### `backend/tests/prescripciones.test.js` (nuevo, ~12 tests)

Constantes de cabecera:
```js
const PRESCRIPCIONES_HEADER = ['id', 'pacienteCodigo', 'medicamento', 'dosis', 'frecuencia', 'fechaInicio', 'fechaFin', 'creadoPor', 'fechaCreacion'];
```

**`crearPrescripcion`** (~6 tests):
- Retorna error si faltan campos requeridos (medicamento, dosis, frecuencia, fechaInicio)
- Retorna error si el paciente no existe
- Retorna error si la hoja `_prescripciones` no existe
- Crea la prescripción, verifica row cifrado en sheet y entrada en `_log`
- Retorna `{ ok: true, prescripcion: { ... } }` con campos en texto plano
- `fechaFin` vacío si no se provee

**`listarPrescripciones`** (~6 tests):
- Retorna error si el paciente no existe
- Retorna `{ ok: true, prescripciones: [] }` si no hay filas
- Lista y descifra correctamente
- Filtra solo las prescripciones del paciente solicitado
- Ordena por `fechaInicio` descendente
- Usa `fechaCreacion` como tiebreaker cuando `fechaInicio` es igual

### `backend/tests/router.test.js` (+6 tests)

Constante nueva:
```js
const PRESCRIPCIONES_HEADER = ['id', 'pacienteCodigo', 'medicamento', 'dosis', 'frecuencia', 'fechaInicio', 'fechaFin', 'creadoPor', 'fechaCreacion'];
```

**GET:**
- `listarPrescripciones` requiere rol psiquiatra → `{ error: 'Permiso denegado' }` para administrador
- `listarPrescripciones` devuelve prescripciones para psiquiatra → `{ ok: true, prescripciones: [] }`

**POST:**
- `crearPrescripcion` requiere rol psiquiatra → `{ error: 'Permiso denegado' }` para administrador
- `crearPrescripcion` crea prescripción para psiquiatra → `{ ok: true, prescripcion: { ... } }` (requiere AES_KEY)
- `crearPrescripcion` retorna error si faltan campos requeridos

**Total GET en router.test.js:** 51 tests (49 actuales + 2)
**Total POST en router.test.js:** (actuales + 3)

### `tests/portal/views/historia-clinica.test.js` (+4 tests)

Mock de `apiGet` extendido para responder a `'listarPrescripciones'` con `{ ok: true, prescripciones: [] }` por defecto.

- Carga y muestra prescripciones al abrir ficha (llama `apiGet('listarPrescripciones', ...)`)
- Crea una nueva prescripción y la antepone a la lista
- Valida campos requeridos antes de enviar (sin llamar a la API)
- Limpia el formulario después de crear

---

## 8. Conteo de tests esperado

| etapa | archivos | tests |
|-------|----------|-------|
| Antes de esta entrega | 27 | 341 |
| + `prescripciones.test.js` (nuevo) | 28 | 353 |
| + tests en `router.test.js` | 28 | 358 |
| + tests en `historia-clinica.test.js` | 28 | 362 |
| **Final** | **28** | **362** |

---

## 9. Deployment note (manual, antes de usar en producción)

1. Crear sheet `_prescripciones` con header row: `id, pacienteCodigo, medicamento, dosis, frecuencia, fechaInicio, fechaFin, creadoPor, fechaCreacion`
2. Verificar que `AES_KEY` esté configurada en Script Properties del proyecto Apps Script (requerida para cifrar medicamento, dosis, frecuencia)
