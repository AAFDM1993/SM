# Diseño: SMPDJM — Sub-entregas 4 y 5: Escalas de evaluación

**Fecha:** 2026-07-12
**Proyecto:** SMPDJM — webapp para "Petra Diana Jara Muñoz - Psiquiatra"

---

## 1. Resumen y alcance

Esta entrega implementa el módulo de **Escalas de evaluación**, cubriendo tanto
sub-entrega 4 (psiquiatra aplica escalas) como sub-entrega 5 (paciente completa
escalas desde su portal). Ambas se diseñan juntas porque comparten el mismo
modelo de datos.

**Objetivo:**

- La psiquiatra puede **aplicar** una escala manualmente durante la consulta
  (ella ingresa las respuestas).
- La psiquiatra puede **enviar** una escala al paciente para que la complete
  por su cuenta; el paciente recibe un email de aviso.
- El paciente completa las escalas pendientes desde su portal ("Mis escalas").
- Todos los resultados (aplicados por la psiquiatra o por el paciente) son
  visibles en la ficha del paciente (psiquiatra) y en el portal del paciente.
- El sistema calcula automáticamente el puntaje y la interpretación del
  cribado (Part A positivo/negativo).

**Escala inicial:** ASRS v1.1 — Adult ADHD Self-Report Scale (OMS), 18
preguntas, respuestas 0-4. El catálogo es extensible: agregar más escalas en
el futuro solo requiere sumar entradas al objeto de catálogo en el código.

**Fuera de alcance:** múltiples escalas simultáneas (solo ASRS v1.1 por ahora),
edición o eliminación de resultados ya guardados, notificaciones push, gráficos
de evolución temporal, exportación de resultados.

---

## 2. Modelo de datos

### Hoja `_escalas_aplicaciones` (1 fila por aplicación)

| Col | Campo | Notas |
|---|---|---|
| 0 | `id` | UUID |
| 1 | `pacienteCodigo` | FK a `_usuarios.codigo` |
| 2 | `escalaTipo` | `'asrs-v1.1'` |
| 3 | `modo` | `'manual'` (psiquiatra aplica) \| `'autoaplicada'` (paciente completa) |
| 4 | `estado` | `'pendiente'` \| `'completada'` |
| 5 | `respuestas` | JSON string `{"q1":2,"q2":1,...}` — vacío si pendiente |
| 6 | `puntajeTotal` | número 0-72 como string — vacío si pendiente |
| 7 | `partAPositivo` | `'true'`/`'false'` — vacío si pendiente |
| 8 | `creadoPor` | código de la psiquiatra que creó/asignó |
| 9 | `fechaCreacion` | ISO timestamp |
| 10 | `completadoPor` | código de quien completó (psiquiatra o paciente) — vacío si pendiente |
| 11 | `fechaCompletada` | ISO timestamp — vacío si pendiente |

El email del paciente se lee de `_pacientes.email` (col 4, ya existente).

### Catálogo de escalas (hardcodeado en `backend/src/escalas.js`)

Objeto `ESCALAS` con entrada `'asrs-v1.1'`:
- `nombre`: `'ASRS v1.1 - Escala de autoevaluación de TDHA en adultos'`
- `preguntas`: array de 18 objetos `{num, texto}`
- `opciones`: `['Nunca', 'Raramente', 'A veces', 'Con frecuencia', 'Con mucha frecuencia']`
- `calcularScore(respuestas)`: función que retorna `{puntajeTotal, partAPositivo}`

No se usa hoja de Sheets para el catálogo. Cuando haya más escalas, se suman
como nuevas entradas al objeto `ESCALAS`.

---

## 3. Algoritmo de scoring ASRS v1.1

**Inputs:** objeto `respuestas` con claves `q1`–`q18`, valores 0-4.

**Part A screener (Q1-Q6):**
- Q1, Q2, Q3: cuenta como positivo si `respuesta >= 2` (A veces o más)
- Q4, Q5, Q6: cuenta como positivo si `respuesta >= 3` (Con frecuencia o más)
- `partAPositivo = (positivos >= 4)`

**Puntaje total:** suma de `q1`+`q2`+...+`q18` (rango 0-72).

**Validación de respuestas:** cada valor debe ser entero en `[0, 4]`. Si alguna
respuesta es inválida o falta alguna de las 18 preguntas, el backend rechaza
con `{error: 'Respuestas inválidas o incompletas'}`.

---

## 4. Backend: `backend/src/escalas.js`

### `aplicarEscala(b, user, services)`

- **Actor:** psiquiatra
- Requiere: `pacienteCodigo`, `escalaTipo`, `respuestas` (objeto con q1-q18)
- Valida: paciente existe con `rol='usuario'`; `escalaTipo` en `ESCALAS`;
  todas las respuestas son válidas (0-4, completas)
- Calcula score con `ESCALAS[escalaTipo].calcularScore(respuestas)`
- Guarda fila en `_escalas_aplicaciones`: `estado='completada'`, `modo='manual'`,
  `respuestas=JSON.stringify(respuestas)`, `puntajeTotal`, `partAPositivo`,
  `completadoPor=user.codigo`, `fechaCompletada=new Date().toISOString()`
- `registrarLog(..., 'escala_aplicada', \`${id} paciente=${pacienteCodigo} tipo=${escalaTipo}\`)`
- Retorna `{ok: true, aplicacion: {id, pacienteCodigo, escalaTipo, modo, estado, puntajeTotal, partAPositivo, fechaCompletada}}`

### `asignarEscala(b, user, services)`

- **Actor:** psiquiatra
- Requiere: `pacienteCodigo`, `escalaTipo`
- Valida: paciente existe con `rol='usuario'`; `escalaTipo` en `ESCALAS`;
  paciente tiene email en `_pacientes` (si no: `{error: 'El paciente no tiene email registrado'}`)
- Guarda fila: `estado='pendiente'`, `modo='autoaplicada'`, respuestas/puntaje/completadoPor
  vacíos
- Envía email: `services.MailApp.sendEmail(email, asunto, cuerpo)` con enlace
  al portal del paciente y nombre de la escala
- `registrarLog(..., 'escala_asignada', \`${id} paciente=${pacienteCodigo} tipo=${escalaTipo}\`)`
- Retorna `{ok: true, aplicacionId: id}`

### `completarEscala(b, user, services)`

- **Actor:** paciente (`usuario`)
- Requiere: `aplicacionId`, `respuestas`
- Valida: aplicación existe en `_escalas_aplicaciones`; `pacienteCodigo ===
  user.codigo`; `estado='pendiente'`; respuestas válidas
- Calcula score
- Actualiza la fila: `estado='completada'`, `respuestas`, `puntajeTotal`,
  `partAPositivo`, `completadoPor=user.codigo`,
  `fechaCompletada=new Date().toISOString()`
- `registrarLog(..., 'escala_completada', \`${aplicacionId}\`)`
- Retorna `{ok: true, aplicacion: {id, escalaTipo, puntajeTotal, partAPositivo, fechaCompletada}}`

### `listarEscalasPaciente(codigo, services)`

- **Actor:** psiquiatra
- Valida: paciente existe con `rol='usuario'`
- Filtra `_escalas_aplicaciones` por `pacienteCodigo === codigo`
- Ordena por `fechaCreacion` descendente
- Retorna `{ok: true, escalas: [{id, escalaTipo, modo, estado, puntajeTotal, partAPositivo, creadoPor, fechaCreacion, fechaCompletada}, ...]}`

### `listarMisEscalas(user, services)`

- **Actor:** paciente
- Igual que `listarEscalasPaciente` usando `user.codigo`
- Incluye `respuestas` en cada item cuando `estado='completada'`
  (el paciente puede ver sus respuestas guardadas)

---

## 5. Router: `backend/src/router.js`

Nueva constante `ROLES_ESCALAS = ['psiquiatra']`.

**GET:**
| Acción | Roles |
|---|---|
| `listarEscalasPaciente` (param: `codigo`) | `ROLES_ESCALAS` |
| `listarMisEscalas` | `['usuario']` |

**POST:**
| Acción | Roles |
|---|---|
| `aplicarEscala` | `ROLES_ESCALAS` |
| `asignarEscala` | `ROLES_ESCALAS` |
| `completarEscala` | `['usuario']` |

---

## 6. Frontend — psiquiatra: `src/portal/views/historia-clinica.js`

Nueva sección dentro del detalle del paciente (nivel 2), después de
Prescripciones: **"Escalas de evaluación"**.

### 6.1 Lista de escalas

Tabla con columnas: Tipo | Modo | Estado | Puntaje Total | Part A | Fecha.
- `modo='manual'` → "Aplicada"
- `modo='autoaplicada'` y `estado='pendiente'` → "Pendiente (paciente)"
- `modo='autoaplicada'` y `estado='completada'` → "Autoaplicada"
- `estado='pendiente'` → puntaje y Part A muestran "—"
- `partAPositivo='true'` → "Positivo"; `'false'` → "Negativo"

Cargada vía `apiGet('listarEscalasPaciente', {codigo})` al abrir la ficha.

### 6.2 Formulario "Aplicar escala ahora"

Botón toggle. Al expandir muestra:
- Selector de escala (`<select>`, solo `ASRS v1.1` por ahora)
- 18 preguntas, cada una con 5 radio buttons (Nunca...Con mucha frecuencia)
- Botón "Guardar"

Al guardar: `apiPost('aplicarEscala', {pacienteCodigo, escalaTipo, respuestas})`.
Éxito: inserta resultado al inicio de la tabla, colapsa el formulario, resetea.
Error: muestra mensaje de error.

### 6.3 Formulario "Enviar al paciente"

Botón toggle independiente. Al expandir:
- Selector de escala
- Botón "Enviar"

Al enviar: `apiPost('asignarEscala', {pacienteCodigo, escalaTipo})`.
Éxito: inserta fila "Pendiente" en la tabla, muestra "Email enviado al paciente",
colapsa formulario.
Error `'El paciente no tiene email registrado'`: muestra ese mensaje específico.

Solo uno de los dos formularios puede estar expandido a la vez.

---

## 7. Frontend — paciente: `src/portal/views/mis-escalas.js`

Nueva vista, activada en `MENUS.usuario` (`enabled: true`).

### 7.1 Escalas pendientes

Grupo superior. Por cada escala pendiente: card con nombre de escala y fecha
asignada + botón "Completar". Al hacer click: muestra las 18 preguntas inline
con radio buttons. Al enviar: `apiPost('completarEscala', {aplicacionId, respuestas})`.
Éxito: mueve la escala al grupo de completadas con el score calculado.

### 7.2 Escalas completadas

Tabla: Tipo | Modo | Puntaje Total | Part A | Fecha completada.
- `modo='manual'` → "Aplicada por psiquiatra"
- `modo='autoaplicada'` → "Autoaplicada"

### 7.3 Preguntas ASRS (compartidas)

Las 18 preguntas y sus opciones se definen en un módulo auxiliar
`src/portal/views/escalas-catalogo.js` importado tanto por `historia-clinica.js`
como por `mis-escalas.js`. Evita duplicar la definición en el frontend.

### 7.4 Dashboard

- `VIEWS['mis-escalas'] = initMisEscalasView` en `dashboard.js`
- `MENUS.usuario`: `mis-escalas` pasa de `enabled: false` a `enabled: true`

---

## 8. Mocks de servicios

`createMockServices` en `backend/mocks/gas-services.js` debe incluir:
```js
MailApp: { sendEmail: () => {} }
```
(ya existente el patrón; solo agregar si no está).

---

## 9. Testing

### `backend/tests/escalas.test.js` (nuevo)

- `aplicarEscala`: guarda con `modo='manual'` y `estado='completada'`; calcula
  puntaje correcto; calcula Part A positivo y negativo correctamente; rechaza
  paciente no encontrado; rechaza `escalaTipo` desconocido; rechaza respuestas
  incompletas o fuera de rango; registra log `escala_aplicada`
- `asignarEscala`: guarda con `modo='autoaplicada'` y `estado='pendiente'`;
  llama `MailApp.sendEmail` con el email del paciente; rechaza paciente sin
  email; registra log `escala_asignada`
- `completarEscala`: actualiza fila existente a `completada` con score correcto;
  rechaza si `aplicacionId` no pertenece al usuario autenticado; rechaza si ya
  `estado='completada'`; registra log `escala_completada`
- `listarEscalasPaciente`: retorna todas las escalas del paciente ordenadas por
  fecha descendente; retorna `[]` si no hay escalas; rechaza paciente no encontrado
- `listarMisEscalas`: retorna solo las escalas del paciente autenticado

### `backend/tests/router.test.js` (modificado)

- GET `listarEscalasPaciente`: permite psiquiatra, rechaza administrador/recepcion/usuario/sin token
- GET `listarMisEscalas`: permite usuario, rechaza psiquiatra/administrador
- POST `aplicarEscala`, `asignarEscala`: permiten psiquiatra, rechazan el resto
- POST `completarEscala`: permite usuario, rechaza psiquiatra/administrador

### `tests/portal/views/historia-clinica.test.js` (modificado)

- Renderiza sección "Escalas de evaluación" al abrir ficha del paciente
- Muestra tabla con escalas existentes (pendientes y completadas)
- Formulario "Aplicar escala": guarda y agrega resultado a la tabla
- Formulario "Enviar al paciente": llama `asignarEscala`, muestra "Email enviado"
- Error "sin email": muestra mensaje específico
- Solo un formulario abierto a la vez

### `tests/portal/views/mis-escalas.test.js` (nuevo)

- Renderiza escalas pendientes y completadas
- Botón "Completar" expande preguntas inline
- Envío exitoso mueve escala de pendientes a completadas con score
- Muestra puntaje y Part A correctamente

---

## 10. Build GAS

Agregar `'escalas.js'` al array `FILES` en `backend/build.js`, antes de `router.js`.

---

## 11. Checklist de despliegue

- Crear hoja `_escalas_aplicaciones` en el Spreadsheet con cabeceras:
  `id, pacienteCodigo, escalaTipo, modo, estado, respuestas, puntajeTotal,
  partAPositivo, creadoPor, fechaCreacion, completadoPor, fechaCompletada`
- Verificar que la cuenta de GAS tenga permiso para enviar email (scope
  `https://www.googleapis.com/auth/gmail.send` — GAS lo solicita automáticamente
  al usar `MailApp`)
- Verificar que los pacientes de prueba tengan email registrado en `_pacientes`
- Hacer nuevo deploy del backend tras el build
