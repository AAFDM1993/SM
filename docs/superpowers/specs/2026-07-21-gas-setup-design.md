# Diseño: SMPDJM — GAS Setup completo

**Fecha:** 2026-07-21
**Proyecto:** SMPDJM — webapp para "Petra Diana Jara Muñoz - Psiquiatra"

---

## 1. Resumen y alcance

Reemplazar `setupSheets()` en `backend/src/index.js` por una función `setup()`
más completa que cubre todo el proceso de inicialización del script GAS en un
solo paso: creación de hojas, generación de `AES_KEY` y pre-inicialización del
calendario de citas.

**Objetivo:** Petra ejecuta `setup()` una sola vez desde el editor de Apps
Script y el sistema queda listo para operar — sin pasos manuales adicionales
en Script Properties ni en Google Calendar.

**Fuera de alcance:** creación de usuarios iniciales, exportación de la clave
AES, cambios de frontend, endpoints de API nuevos.

---

## 2. Función `setup()` en `backend/src/index.js`

Reemplaza `setupSheets()`. Misma firma — función global ejecutable desde el
editor GAS, sin parámetros.

### Paso 1 — Hojas

Mismo comportamiento que `setupSheets()` actual: itera el array `SHEETS` y
crea cada hoja con su header si no existe; si ya existe la deja intacta.
`Logger.log('Creada: ' + name)` / `Logger.log('Ya existe: ' + name)`.

Array `SHEETS` sin cambios (14 hojas, de `_usuarios` a `_log`).

### Paso 2 — AES_KEY

```js
const props = PropertiesService.getScriptProperties();
const aesKey = props.getProperty('AES_KEY');
if (aesKey) {
  Logger.log('AES_KEY: ya configurada');
} else {
  const newKey = Utilities.getUuid().replace(/-/g, '');
  props.setProperty('AES_KEY', newKey);
  Logger.log('AES_KEY generada: ' + newKey + ' — copia esta clave y guárdala en un lugar seguro');
}
```

- Idempotente: si `AES_KEY` ya existe, no se toca.
- Si no existe, genera 32 hex chars (128 bits) via UUID sin guiones.
- La clave aparece en el Logger para que Petra la copie como respaldo.

### Paso 3 — Calendario

```js
try {
  const cal = obtenerCalendarioConsultas(gasServices);
  Logger.log('Calendario "Consultas SMPDJM": ' + cal.getId());
} catch (e) {
  Logger.log('ADVERTENCIA calendario: ' + e.message);
}
```

- Llama a `obtenerCalendarioConsultas(gasServices)` para crear o reutilizar el
  calendario "Consultas SMPDJM" de forma anticipada.
- Si falla (scope de Calendar no autorizado, etc.) se loguea la advertencia
  pero el setup continúa — no es un error fatal.
- Idempotente: si el calendario ya existe, se reutiliza (via
  `PropertiesService` o búsqueda por nombre).

### Paso 4 — Resumen

```js
Logger.log('Setup completo.');
```

### Garantías de idempotencia

Se puede ejecutar múltiples veces en producción sin efectos secundarios:

| Elemento | Comportamiento si ya existe |
|---|---|
| Hoja en Sheets | Se omite (no se modifica) |
| `AES_KEY` en Props | Se deja intacta |
| Calendario "Consultas SMPDJM" | Se reutiliza |

---

## 3. Build

`setup()` está en `index.js`, que ya es el último archivo en `FILES`. No hay
cambios en `build.js`.

`obtenerCalendarioConsultas` ya está disponible en el bundle (viene de
`calendario.js`, que se incluye antes de `agenda.js`).

---

## 4. Testing

No se añaden tests nuevos:

- La lógica de generación de `AES_KEY` es una sola línea
  (`Utilities.getUuid().replace(/-/g, '')`).
- `obtenerCalendarioConsultas` ya tiene tests en `calendario.test.js`.
- `setupSheets` tampoco tenía tests (función GAS-only, no ejecutable en
  Vitest sin mocks completos de `SpreadsheetApp`/`Logger`/`PropertiesService`).

---

## 5. Despliegue

Al ejecutar `setup()` desde el editor de Apps Script:

1. El editor pedirá autorizar los permisos del script si hay nuevos scopes
   (Google Calendar). Petra acepta el prompt estándar de Google.
2. Las hojas se crean en el Spreadsheet activo.
3. `AES_KEY` queda guardada en Script Properties — Petra copia el valor del
   Logger y lo guarda fuera del sistema (p. ej. un gestor de contraseñas).
4. El calendario "Consultas SMPDJM" queda creado y disponible en Google
   Calendar de Petra.

---

## 6. Archivos modificados

| Acción | Ruta |
|---|---|
| Modificar | `backend/src/index.js` |
