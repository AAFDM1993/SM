# Diseño: SMPDJM — Mis actividades (Parte B): Adherencia a prescripciones

**Fecha:** 2026-07-21
**Proyecto:** SMPDJM — webapp para "Petra Diana Jara Muñoz - Psiquiatra"

---

## 1. Resumen y alcance

Esta entrega implementa la segunda parte de **"Mis actividades"**: registro libre de
tomas de medicamentos prescritos por la psiquiatra.

**Objetivo:**

- El paciente ve sus prescripciones activas en "Mis actividades".
- Por cada prescripción, puede presionar "Tomé" para registrar la toma (con nota opcional).
- El paciente ve el historial de todas sus tomas registradas.
- La psiquiatra no ve las tomas en la Historia Clínica (fuera de alcance en esta entrega).

**Fuera de alcance:** horarios esperados / schedules, notificaciones, edición o eliminación
de tomas registradas, visualización de adherencia por parte de la psiquiatra, prescripciones
vencidas en la sección de activas (aunque sí aparecen en el historial si tienen tomas).

---

## 2. Modelo de datos

### Hoja `_prescripciones_tomas` (nueva, 1 fila por toma registrada)

| Col | Campo | Notas |
|---|---|---|
| 0 | `id` | UUID |
| 1 | `prescripcionId` | FK a `_prescripciones.id` |
| 2 | `fechaHora` | ISO timestamp (`new Date().toISOString()`) |
| 3 | `nota` | texto opcional (vacío si el paciente no escribió nada) |
| 4 | `completadoPor` | código del paciente |

No se almacena ningún "horario esperado" — el modelo es registro libre.

### Hoja `_prescripciones` (existente, sin cambios)

Columnas: `id, pacienteCodigo, medicamento (cifrado), dosis (cifrado), frecuencia (cifrado), fechaInicio, fechaFin, creadoPor, fechaCreacion`

---

## 3. Backend: extensión de `backend/src/prescripciones.js`

Se agregan dos funciones nuevas al módulo existente. Las dos funciones existentes
(`crearPrescripcion`, `listarPrescripciones`) no se modifican.

### `listarMisPrescripciones(user, services)`

- **Actor:** paciente (`usuario`)
- Filtra `_prescripciones` por `pacienteCodigo === user.codigo`
- Descifra `medicamento`, `dosis`, `frecuencia` con `safeDecrypt` (igual que `listarPrescripciones`)
- Para cada prescripción, carga `tomas` desde `_prescripciones_tomas` filtrando por
  `prescripcionId === p.id`, ordenadas por `fechaHora` desc
- Toma devuelta: `{ id, fechaHora, nota }` (sin `completadoPor`, no necesario para el frontend)
- Retorna `{ ok: true, prescripciones: [{id, medicamento, dosis, frecuencia, fechaInicio, fechaFin, tomas: [{id, fechaHora, nota}]}] }`
- El filtrado "activa hoy" lo hace el frontend (backend devuelve todas las del paciente)

### `registrarToma(b, user, services)`

- **Actor:** paciente (`usuario`)
- Requiere en `b`: `prescripcionId`
- Opcional en `b`: `nota` (si ausente o vacío, se guarda `''`)
- Validaciones:
  - `prescripcionId` presente y no vacío
  - Prescripción existe en `_prescripciones`
  - `prescripcion.pacienteCodigo === user.codigo` (prevención IDOR)
- Guarda fila en `_prescripciones_tomas`:
  `[uuid, prescripcionId, new Date().toISOString(), nota||'', user.codigo]`
- `registrarLog(services, user.codigo, user.rol, 'toma_registrada', prescripcionId)`
- Retorna `{ ok: true, toma: { id, prescripcionId, fechaHora, nota, completadoPor } }`

---

## 4. Router: `backend/src/router.js`

Extender el import existente:
```js
import { crearPrescripcion, listarPrescripciones, listarMisPrescripciones, registrarToma } from './prescripciones.js';
```

**GET** (antes de `default:`):
```js
case 'listarMisPrescripciones':
  return json_(
    requireAuth(p, ['usuario'], (user) => listarMisPrescripciones(user, services), services),
    services
  );
```

**POST** (antes de `default:`):
```js
case 'registrarToma':
  return json_(
    requireAuthBody(b.token, ['usuario'], (user) => registrarToma(b, user, services), services),
    services
  );
```

No se necesita constante `ROLES_` nueva — ambas rutas usan `['usuario']` inline.

---

## 5. setupSheets: `backend/src/index.js`

Agregar en el array `SHEETS` antes de `_log`:
```js
{ name: '_prescripciones_tomas', header: ['id', 'prescripcionId', 'fechaHora', 'nota', 'completadoPor'] },
```

---

## 6. Build GAS: `backend/build.js`

Sin cambio — `prescripciones.js` ya está en el array `FILES`.

---

## 7. Frontend — paciente: `src/portal/views/mis-actividades.js`

Se agrega una nueva sección **"Mis prescripciones"** al final de la vista existente.
`initMisActividadesView` carga prescripciones en paralelo con tareas.

### 7.1 Carga

```js
const [actividadesResult, prescripcionesResult] = await Promise.all([
  apiGet('listarMisActividades', { token }),
  apiGet('listarMisPrescripciones', { token }),
]);
```

Si cualquiera devuelve error: muestra el error y sale.

### 7.2 Sección "Mis prescripciones activas" (`.view-mis-actividades__prescripciones`)

- **Activas hoy**: `fechaInicio ≤ hoy ≤ fechaFin` o `fechaFin === ''`
- Si no hay activas: texto "No hay prescripciones activas."
- Por cada prescripción activa:
  - `div.view-mis-actividades__prescripcion-item`
  - Nombre: `medicamento — dosis (frecuencia)` en `div.view-mis-actividades__prescripcion-nombre`
  - Botón `.view-mis-actividades__btn-toma` → al click expande inline:
    - `textarea.view-mis-actividades__toma-nota` placeholder "Nota opcional..."
    - `div.view-mis-actividades__toma-error` (hidden)
    - `button.view-mis-actividades__btn-confirmar-toma` "Confirmar toma"
  - Al confirmar: `apiPost({ accion: 'registrarToma', token, prescripcionId: p.id, nota })`
  - Éxito: inserta toma al inicio de `p.tomas`, re-renderiza historial, colapsa form y limpia nota
  - Error: muestra en `.view-mis-actividades__toma-error`

### 7.3 Sección "Historial de tomas" (`.view-mis-actividades__tomas-historial`)

Tabla `.view-mis-actividades__tomas-tabla` con columnas: **Medicamento | Fecha/Hora | Nota**

- Aplana todas las tomas de todas las prescripciones: `{ medicamento, ...toma }`
- Ordena por `fechaHora` desc
- `nota` → texto o "—" si vacío
- `fechaHora` → muestra primeros 16 chars del ISO string (`"2026-07-21T10:32"`)

---

## 8. Testing

### `backend/tests/prescripciones.test.js` (~7 tests nuevos)

- `listarMisPrescripciones`: retorna prescripciones del paciente autenticado; descifra campos; incluye tomas ordenadas desc; retorna `[]` si no hay; no retorna prescripciones de otro paciente
- `registrarToma`: guarda con campos correctos; registra log `toma_registrada`; retorna `{ok, toma}`; rechaza si prescripción no existe; rechaza si prescripción pertenece a otro paciente; rechaza si falta `prescripcionId`

### `backend/tests/router.test.js` (~4 tests nuevos)

- GET `listarMisPrescripciones`: usuario ✓, psiquiatra ✗ (`'Permiso denegado'`)
- POST `registrarToma`: usuario ✓, psiquiatra ✗ (`'Permiso denegado'`)

### `tests/portal/views/mis-actividades.test.js` (~6 tests nuevos)

- Llama `listarMisPrescripciones` con token al inicializar
- Muestra prescripción activa con medicamento/dosis/frecuencia
- No muestra prescripción vencida en activas
- `btn-toma` expande form con textarea
- Confirmar toma llama `registrarToma` con `prescripcionId` y nota
- Éxito agrega toma al historial y colapsa el form

---

## 9. Checklist de despliegue

- Correr `setupSheets()` en GAS para crear `_prescripciones_tomas`
- Build del bundle GAS (`node build.js`) y redeployar script
