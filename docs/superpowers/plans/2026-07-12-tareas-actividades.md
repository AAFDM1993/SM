# Tareas Asignadas (Mis actividades — Parte A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar tareas asignadas por la psiquiatra al paciente, con seguimiento de ocurrencias (únicas o recurrentes) completadas por el paciente desde su portal.

**Architecture:** Backend en `backend/src/tareas.js` (4 funciones); rutas nuevas en `router.js`; sección "Tareas" en `historia-clinica.js` (psiquiatra); vista `mis-actividades.js` (paciente). Dos hojas: `_tareas` (definición) + `_tareas_registros` (completaciones). La lógica de ocurrencias esperadas se calcula en el frontend con aritmética de fechas pura (UTC, sin librerías).

**Tech Stack:** Google Apps Script (backend GAS), Vitest (tests), vanilla JS (frontend)

## Global Constraints

- Timestamps: siempre `new Date().toISOString()` — nunca `new Date().toString()` ni strings de fecha locale
- Fechas de rango: strings `YYYY-MM-DD`; validar con regex `/^\d{4}-\d{2}-\d{2}$/`
- `tipo`: `'única'` | `'recurrente'` (con tilde en única)
- `frecuencia`: `'diaria'` | `'semanal'` — presente solo si `tipo === 'recurrente'`; guardado como string vacío en la hoja si `tipo === 'única'`
- `_tareas` header (10 cols): `['id','pacienteCodigo','titulo','descripcion','tipo','frecuencia','fechaInicio','fechaFin','creadoPor','fechaCreacion']`
- `_tareas_registros` header (6 cols): `['id','tareaId','fechaOcurrencia','nota','completadoPor','fechaCompletacion']`
- `asignarTarea` y `listarTareasPaciente`: solo rol `'psiquiatra'`
- `listarMisActividades` y `completarOcurrencia`: solo rol `'usuario'`
- Error de permiso por rol: `'Permiso denegado'` (no `'No autorizado'` — eso es para token ausente/inválido)
- `calcularOcurrencias`: usa `new Date(cur + 'T12:00:00Z')` y `.setUTCDate` para evitar problemas de zona horaria
- CSS BEM: clases `view-historia-clinica__tareas-*` y `view-mis-actividades__*`
- `tareas.js` va en `build.js` después de `'escalas.js'`, antes de `'auth.js'`
- En `setupSheets`: `_tareas` y `_tareas_registros` van antes de `_log`

---

### Task 1: Backend `tareas.js` + unit tests

**Files:**
- Create: `backend/src/tareas.js`
- Create: `backend/tests/tareas.test.js`

**Interfaces:**
- Consumes: `findUser(codigo, services)` de `./usuarios.js`; `registrarLog(services, codigo, rol, accion, detalle)` de `./log.js`; `services.SpreadsheetApp`, `services.Utilities.getUuid()`
- Produces:
  - `asignarTarea(b, user, services)` → `{ok:true, tarea:{id,pacienteCodigo,titulo,descripcion,tipo,frecuencia,fechaInicio,fechaFin,creadoPor,fechaCreacion}}` | `{error:string}`
  - `listarTareasPaciente(codigo, services)` → `{ok:true, tareas:[...]}` | `{error:string}`
  - `listarMisActividades(user, services)` → `{ok:true, tareas:[...]}` | `{error:string}`
  - `completarOcurrencia(b, user, services)` → `{ok:true, registro:{id,tareaId,fechaOcurrencia,nota,completadoPor,fechaCompletacion}}` | `{error:string}`
  - cada tarea en el array `tareas` tiene `registros: [{id,fechaOcurrencia,nota,fechaCompletacion}]`

- [ ] **Step 1: Escribir los tests fallidos**

Crear `backend/tests/tareas.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { asignarTarea, listarTareasPaciente, listarMisActividades, completarOcurrencia } from '../src/tareas.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const TAREAS_HEADER = ['id', 'pacienteCodigo', 'titulo', 'descripcion', 'tipo', 'frecuencia', 'fechaInicio', 'fechaFin', 'creadoPor', 'fechaCreacion'];
const REGISTROS_HEADER = ['id', 'tareaId', 'fechaOcurrencia', 'nota', 'completadoPor', 'fechaCompletacion'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];

const PSIQUIATRA = { codigo: 'PSI001', rol: 'psiquiatra', nombre: 'Dra. Petra' };
const PACIENTE_USER = { codigo: 'PAC001', rol: 'usuario', nombre: 'Maria' };
const USUARIO_ROW = ['PAC001', 'x', 'x', 'usuario', 'Maria'];

function buildServices({ usuarios = [], tareas = [], registros = [] } = {}) {
  return createMockServices({
    sheets: {
      _usuarios: [USUARIOS_HEADER, ...usuarios],
      _tareas: [TAREAS_HEADER, ...tareas],
      _tareas_registros: [REGISTROS_HEADER, ...registros],
      _log: [LOG_HEADER],
    },
  });
}

const TAREA_UNICA_ROW = ['t1', 'PAC001', 'Meditar', 'Descripcion', 'única', '', '2026-07-10', '2026-07-10', 'PSI001', '2026-07-10T10:00:00.000Z'];
const TAREA_RECURRENTE_ROW = ['t2', 'PAC001', 'Caminar', '', 'recurrente', 'diaria', '2026-07-10', '2026-07-14', 'PSI001', '2026-07-10T09:00:00.000Z'];

describe('asignarTarea', () => {
  it('guarda tarea única con campos correctos', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    const result = asignarTarea(
      { pacienteCodigo: 'PAC001', titulo: 'Meditar', tipo: 'única', fechaInicio: '2026-07-15', fechaFin: '2026-07-15' },
      PSIQUIATRA, services
    );
    expect(result.ok).toBe(true);
    expect(result.tarea.titulo).toBe('Meditar');
    expect(result.tarea.tipo).toBe('única');
    expect(result.tarea.frecuencia).toBe('');
    expect(result.tarea.id).toBeDefined();
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_tareas');
    const row = sheet.getRange(2, 1, 1, 10).getValues()[0];
    expect(row[2]).toBe('Meditar');
    expect(row[4]).toBe('única');
    expect(row[5]).toBe('');
  });

  it('guarda tarea recurrente con frecuencia', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    const result = asignarTarea(
      { pacienteCodigo: 'PAC001', titulo: 'Caminar', tipo: 'recurrente', frecuencia: 'diaria', fechaInicio: '2026-07-15', fechaFin: '2026-07-21' },
      PSIQUIATRA, services
    );
    expect(result.ok).toBe(true);
    expect(result.tarea.frecuencia).toBe('diaria');
    const row = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_tareas').getRange(2, 1, 1, 10).getValues()[0];
    expect(row[5]).toBe('diaria');
  });

  it('guarda descripcion vacía cuando no se pasa', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    const result = asignarTarea(
      { pacienteCodigo: 'PAC001', titulo: 'Tarea sin desc', tipo: 'única', fechaInicio: '2026-07-15', fechaFin: '2026-07-15' },
      PSIQUIATRA, services
    );
    expect(result.tarea.descripcion).toBe('');
  });

  it('rechaza paciente no encontrado', () => {
    const services = buildServices();
    expect(asignarTarea(
      { pacienteCodigo: 'NOEXISTE', titulo: 'X', tipo: 'única', fechaInicio: '2026-07-15', fechaFin: '2026-07-15' },
      PSIQUIATRA, services
    )).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza tipo inválido', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    expect(asignarTarea(
      { pacienteCodigo: 'PAC001', titulo: 'X', tipo: 'mensual', fechaInicio: '2026-07-15', fechaFin: '2026-07-15' },
      PSIQUIATRA, services
    )).toEqual({ error: 'tipo debe ser única o recurrente' });
  });

  it('rechaza fechaFin < fechaInicio', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    expect(asignarTarea(
      { pacienteCodigo: 'PAC001', titulo: 'X', tipo: 'única', fechaInicio: '2026-07-20', fechaFin: '2026-07-15' },
      PSIQUIATRA, services
    )).toEqual({ error: 'fechaFin debe ser mayor o igual a fechaInicio' });
  });

  it('rechaza recurrente sin frecuencia', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    expect(asignarTarea(
      { pacienteCodigo: 'PAC001', titulo: 'X', tipo: 'recurrente', fechaInicio: '2026-07-15', fechaFin: '2026-07-21' },
      PSIQUIATRA, services
    )).toEqual({ error: 'frecuencia debe ser diaria o semanal para tareas recurrentes' });
  });

  it('registra log tarea_asignada', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    asignarTarea(
      { pacienteCodigo: 'PAC001', titulo: 'X', tipo: 'única', fechaInicio: '2026-07-15', fechaFin: '2026-07-15' },
      PSIQUIATRA, services
    );
    const log = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_log');
    expect(log.getRange(2, 1, 1, 5).getValues()[0][3]).toBe('tarea_asignada');
  });
});

describe('listarTareasPaciente', () => {
  it('retorna tareas con registros incluidos', () => {
    const services = buildServices({
      usuarios: [USUARIO_ROW],
      tareas: [TAREA_UNICA_ROW],
      registros: [['r1', 't1', '2026-07-10', 'bien', 'PAC001', '2026-07-10T20:00:00.000Z']],
    });
    const result = listarTareasPaciente('PAC001', services);
    expect(result.ok).toBe(true);
    expect(result.tareas.length).toBe(1);
    expect(result.tareas[0].titulo).toBe('Meditar');
    expect(result.tareas[0].registros.length).toBe(1);
    expect(result.tareas[0].registros[0].fechaOcurrencia).toBe('2026-07-10');
  });

  it('retorna [] si no hay tareas', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW] });
    expect(listarTareasPaciente('PAC001', services)).toEqual({ ok: true, tareas: [] });
  });

  it('rechaza paciente no encontrado', () => {
    const services = buildServices();
    expect(listarTareasPaciente('NOEXISTE', services)).toEqual({ error: 'Paciente no encontrado' });
  });
});

describe('listarMisActividades', () => {
  it('retorna solo las tareas del paciente autenticado', () => {
    const services = buildServices({
      usuarios: [USUARIO_ROW, ['PAC002', 'x', 'x', 'usuario', 'Carlos']],
      tareas: [
        TAREA_UNICA_ROW,
        ['t3', 'PAC002', 'Otra tarea', '', 'única', '', '2026-07-10', '2026-07-10', 'PSI001', '2026-07-10T08:00:00.000Z'],
      ],
    });
    const result = listarMisActividades(PACIENTE_USER, services);
    expect(result.ok).toBe(true);
    expect(result.tareas.length).toBe(1);
    expect(result.tareas[0].pacienteCodigo).toBe('PAC001');
  });

  it('incluye registros de cada tarea', () => {
    const services = buildServices({
      usuarios: [USUARIO_ROW],
      tareas: [TAREA_UNICA_ROW],
      registros: [['r1', 't1', '2026-07-10', '', 'PAC001', '2026-07-10T20:00:00.000Z']],
    });
    const result = listarMisActividades(PACIENTE_USER, services);
    expect(result.tareas[0].registros.length).toBe(1);
  });
});

describe('completarOcurrencia', () => {
  it('guarda registro con campos correctos', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], tareas: [TAREA_UNICA_ROW] });
    const result = completarOcurrencia(
      { tareaId: 't1', fechaOcurrencia: '2026-07-10', nota: 'Lo hice' },
      PACIENTE_USER, services
    );
    expect(result.ok).toBe(true);
    expect(result.registro.tareaId).toBe('t1');
    expect(result.registro.fechaOcurrencia).toBe('2026-07-10');
    expect(result.registro.nota).toBe('Lo hice');
    expect(result.registro.id).toBeDefined();
    const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_tareas_registros');
    const row = sheet.getRange(2, 1, 1, 6).getValues()[0];
    expect(row[1]).toBe('t1');
    expect(row[2]).toBe('2026-07-10');
  });

  it('guarda nota vacía cuando no se pasa', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], tareas: [TAREA_UNICA_ROW] });
    const result = completarOcurrencia({ tareaId: 't1', fechaOcurrencia: '2026-07-10' }, PACIENTE_USER, services);
    expect(result.ok).toBe(true);
    expect(result.registro.nota).toBe('');
  });

  it('rechaza si la tarea no pertenece al usuario', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], tareas: [TAREA_UNICA_ROW] });
    expect(completarOcurrencia(
      { tareaId: 't1', fechaOcurrencia: '2026-07-10' },
      { codigo: 'PAC002', rol: 'usuario' }, services
    )).toEqual({ error: 'No autorizado' });
  });

  it('rechaza fecha fuera del rango de la tarea', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], tareas: [TAREA_UNICA_ROW] });
    expect(completarOcurrencia(
      { tareaId: 't1', fechaOcurrencia: '2026-07-11' },
      PACIENTE_USER, services
    )).toEqual({ error: 'Fecha fuera del rango de la tarea' });
  });

  it('rechaza ocurrencia ya registrada', () => {
    const services = buildServices({
      usuarios: [USUARIO_ROW],
      tareas: [TAREA_UNICA_ROW],
      registros: [['r1', 't1', '2026-07-10', '', 'PAC001', '2026-07-10T20:00:00.000Z']],
    });
    expect(completarOcurrencia(
      { tareaId: 't1', fechaOcurrencia: '2026-07-10' },
      PACIENTE_USER, services
    )).toEqual({ error: 'Esta ocurrencia ya fue registrada' });
  });

  it('registra log tarea_completada', () => {
    const services = buildServices({ usuarios: [USUARIO_ROW], tareas: [TAREA_UNICA_ROW] });
    completarOcurrencia({ tareaId: 't1', fechaOcurrencia: '2026-07-10' }, PACIENTE_USER, services);
    const log = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_log');
    expect(log.getRange(2, 1, 1, 5).getValues()[0][3]).toBe('tarea_completada');
  });
});
```

- [ ] **Step 2: Correr tests y verificar que fallan**

```bash
npx vitest run backend/tests/tareas.test.js
```
Expected: FAIL — `Cannot find module '../src/tareas.js'`

- [ ] **Step 3: Implementar `backend/src/tareas.js`**

```js
import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const SHEET_TAREAS = '_tareas';
const SHEET_REGISTROS = '_tareas_registros';

function esFechaValida(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str + 'T12:00:00Z').getTime());
}

function parseTarea(row) {
  return {
    id: String(row[0]),
    pacienteCodigo: String(row[1]),
    titulo: String(row[2]),
    descripcion: String(row[3]),
    tipo: String(row[4]),
    frecuencia: String(row[5]),
    fechaInicio: String(row[6]),
    fechaFin: String(row[7]),
    creadoPor: String(row[8]),
    fechaCreacion: String(row[9]),
  };
}

function parseRegistro(row) {
  return {
    id: String(row[0]),
    tareaId: String(row[1]),
    fechaOcurrencia: String(row[2]),
    nota: String(row[3]),
    completadoPor: String(row[4]),
    fechaCompletacion: String(row[5]),
  };
}

function getTareasDelPaciente(codigo, sheetTareas, sheetRegistros) {
  const needle = codigo.toLowerCase();
  const lastT = sheetTareas.getLastRow();
  const tareas = lastT < 2 ? [] :
    sheetTareas.getRange(2, 1, lastT - 1, 10).getValues()
      .filter((r) => String(r[1]).trim().toLowerCase() === needle)
      .map(parseTarea)
      .sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

  const lastR = sheetRegistros.getLastRow();
  const allRegistros = lastR < 2 ? [] :
    sheetRegistros.getRange(2, 1, lastR - 1, 6).getValues().map(parseRegistro);

  tareas.forEach((t) => {
    t.registros = allRegistros
      .filter((r) => r.tareaId === t.id)
      .map((r) => ({ id: r.id, fechaOcurrencia: r.fechaOcurrencia, nota: r.nota, fechaCompletacion: r.fechaCompletacion }));
  });

  return tareas;
}

export function asignarTarea(b, user, services) {
  const pacienteCodigo = String(b.pacienteCodigo || '').trim();
  const titulo = String(b.titulo || '').trim();
  const tipo = String(b.tipo || '').trim();
  const fechaInicio = String(b.fechaInicio || '').trim();
  const fechaFin = String(b.fechaFin || '').trim();

  if (!pacienteCodigo || !titulo || !tipo || !fechaInicio || !fechaFin) {
    return { error: 'pacienteCodigo, titulo, tipo, fechaInicio y fechaFin son requeridos' };
  }
  if (tipo !== 'única' && tipo !== 'recurrente') return { error: 'tipo debe ser única o recurrente' };
  if (!esFechaValida(fechaInicio) || !esFechaValida(fechaFin)) return { error: 'Fechas inválidas' };
  if (fechaFin < fechaInicio) return { error: 'fechaFin debe ser mayor o igual a fechaInicio' };

  let frecuencia = '';
  if (tipo === 'recurrente') {
    frecuencia = String(b.frecuencia || '').trim();
    if (frecuencia !== 'diaria' && frecuencia !== 'semanal') {
      return { error: 'frecuencia debe ser diaria o semanal para tareas recurrentes' };
    }
  }

  const paciente = findUser(pacienteCodigo, services);
  if (!paciente || paciente.rol !== 'usuario') return { error: 'Paciente no encontrado' };

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAREAS);
  if (!sheet) return { error: 'Hoja de tareas no encontrada' };

  const id = services.Utilities.getUuid();
  const descripcion = String(b.descripcion || '').trim();
  const fechaCreacion = new Date().toISOString();

  sheet.appendRow([id, pacienteCodigo, titulo, descripcion, tipo, frecuencia, fechaInicio, fechaFin, user.codigo, fechaCreacion]);
  registrarLog(services, user.codigo, user.rol, 'tarea_asignada', `${id} paciente=${pacienteCodigo}`);

  return { ok: true, tarea: { id, pacienteCodigo, titulo, descripcion, tipo, frecuencia, fechaInicio, fechaFin, creadoPor: user.codigo, fechaCreacion } };
}

export function listarTareasPaciente(codigo, services) {
  const paciente = findUser(codigo, services);
  if (!paciente || paciente.rol !== 'usuario') return { error: 'Paciente no encontrado' };

  const sheetTareas = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAREAS);
  if (!sheetTareas) return { error: 'Hoja de tareas no encontrada' };
  const sheetRegistros = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REGISTROS);
  if (!sheetRegistros) return { error: 'Hoja de registros no encontrada' };

  return { ok: true, tareas: getTareasDelPaciente(codigo, sheetTareas, sheetRegistros) };
}

export function listarMisActividades(user, services) {
  const sheetTareas = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAREAS);
  if (!sheetTareas) return { error: 'Hoja de tareas no encontrada' };
  const sheetRegistros = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REGISTROS);
  if (!sheetRegistros) return { error: 'Hoja de registros no encontrada' };

  return { ok: true, tareas: getTareasDelPaciente(user.codigo, sheetTareas, sheetRegistros) };
}

export function completarOcurrencia(b, user, services) {
  const tareaId = String(b.tareaId || '').trim();
  const fechaOcurrencia = String(b.fechaOcurrencia || '').trim();

  if (!tareaId || !fechaOcurrencia) return { error: 'tareaId y fechaOcurrencia son requeridos' };
  if (!esFechaValida(fechaOcurrencia)) return { error: 'Fecha inválida' };

  const sheetTareas = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAREAS);
  if (!sheetTareas) return { error: 'Hoja de tareas no encontrada' };

  const lastT = sheetTareas.getLastRow();
  if (lastT < 2) return { error: 'Tarea no encontrada' };
  const tareaRow = sheetTareas.getRange(2, 1, lastT - 1, 10).getValues().find((r) => String(r[0]) === tareaId);
  if (!tareaRow) return { error: 'Tarea no encontrada' };

  const tarea = parseTarea(tareaRow);
  if (tarea.pacienteCodigo.toLowerCase() !== user.codigo.toLowerCase()) return { error: 'No autorizado' };
  if (fechaOcurrencia < tarea.fechaInicio || fechaOcurrencia > tarea.fechaFin) {
    return { error: 'Fecha fuera del rango de la tarea' };
  }

  const sheetRegistros = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REGISTROS);
  if (!sheetRegistros) return { error: 'Hoja de registros no encontrada' };

  const lastR = sheetRegistros.getLastRow();
  if (lastR >= 2) {
    const yaExiste = sheetRegistros.getRange(2, 1, lastR - 1, 6).getValues()
      .some((r) => String(r[1]) === tareaId && String(r[2]) === fechaOcurrencia);
    if (yaExiste) return { error: 'Esta ocurrencia ya fue registrada' };
  }

  const id = services.Utilities.getUuid();
  const nota = String(b.nota || '').trim();
  const fechaCompletacion = new Date().toISOString();

  sheetRegistros.appendRow([id, tareaId, fechaOcurrencia, nota, user.codigo, fechaCompletacion]);
  registrarLog(services, user.codigo, user.rol, 'tarea_completada', `${tareaId} fecha=${fechaOcurrencia}`);

  return { ok: true, registro: { id, tareaId, fechaOcurrencia, nota, completadoPor: user.codigo, fechaCompletacion } };
}
```

- [ ] **Step 4: Correr tests y verificar que pasan**

```bash
npx vitest run backend/tests/tareas.test.js
```
Expected: 16 tests passing

- [ ] **Step 5: Commit**

```bash
git add backend/src/tareas.js backend/tests/tareas.test.js
git commit -m "feat: add tareas backend module with unit tests"
```

---

### Task 2: Router + build + setupSheets + router tests

**Files:**
- Modify: `backend/src/router.js`
- Modify: `backend/src/index.js`
- Modify: `backend/build.js`
- Modify: `backend/tests/router.test.js`

**Interfaces:**
- Consumes (de Task 1): `asignarTarea(b, user, services)`, `listarTareasPaciente(codigo, services)`, `listarMisActividades(user, services)`, `completarOcurrencia(b, user, services)` de `'./tareas.js'`
- Produce: rutas `listarTareasPaciente` (GET, psiquiatra), `listarMisActividades` (GET, usuario), `asignarTarea` (POST, psiquiatra), `completarOcurrencia` (POST, usuario)

- [ ] **Step 1: Escribir los nuevos tests de router**

Agregar al final de `backend/tests/router.test.js` (dentro del `describe('handleGet'...)` y `describe('handlePost'...)`):

```js
// En describe('handleGet'):
const TAREAS_HEADER_R = ['id','pacienteCodigo','titulo','descripcion','tipo','frecuencia','fechaInicio','fechaFin','creadoPor','fechaCreacion'];
const REGISTROS_HEADER_R = ['id','tareaId','fechaOcurrencia','nota','completadoPor','fechaCompletacion'];

it('listarTareasPaciente permite psiquiatra', () => {
  const services = buildServicesWithUser({
    codigo: 'PSI001', password: 'clave123', rol: 'psiquiatra', nombre: 'Dra. Petra',
    extraSheets: {
      _tareas: [TAREAS_HEADER_R],
      _tareas_registros: [REGISTROS_HEADER_R],
    },
  });
  services.SpreadsheetApp._sheets['_usuarios'].push(['PAC001', 'x', 'x', 'usuario', 'Maria']);
  const token = loginToken(services, 'PSI001', 'clave123');
  const result = handleGet({ parameter: { accion: 'listarTareasPaciente', token, codigo: 'PAC001' } }, services);
  expect(bodyOf(result).ok).toBe(true);
  expect(bodyOf(result).tareas).toEqual([]);
});

it('listarTareasPaciente rechaza usuario', () => {
  const services = buildServicesWithUser({ codigo: 'USR001', password: 'clave123', rol: 'usuario', nombre: 'Paciente' });
  const token = loginToken(services, 'USR001', 'clave123');
  const result = handleGet({ parameter: { accion: 'listarTareasPaciente', token, codigo: 'USR001' } }, services);
  expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
});

it('listarMisActividades permite usuario', () => {
  const services = buildServicesWithUser({
    codigo: 'USR001', password: 'clave123', rol: 'usuario', nombre: 'Paciente',
    extraSheets: { _tareas: [TAREAS_HEADER_R], _tareas_registros: [REGISTROS_HEADER_R] },
  });
  const token = loginToken(services, 'USR001', 'clave123');
  const result = handleGet({ parameter: { accion: 'listarMisActividades', token } }, services);
  expect(bodyOf(result).ok).toBe(true);
  expect(bodyOf(result).tareas).toEqual([]);
});

it('listarMisActividades rechaza psiquiatra', () => {
  const services = buildServicesWithUser({ codigo: 'PSI001', password: 'clave123', rol: 'psiquiatra', nombre: 'Dra. Petra' });
  const token = loginToken(services, 'PSI001', 'clave123');
  const result = handleGet({ parameter: { accion: 'listarMisActividades', token } }, services);
  expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
});

// En describe('handlePost'):
it('asignarTarea permite psiquiatra', () => {
  const services = buildServicesWithUser({
    codigo: 'PSI001', password: 'clave123', rol: 'psiquiatra', nombre: 'Dra. Petra',
    extraSheets: { _tareas: [TAREAS_HEADER_R], _tareas_registros: [REGISTROS_HEADER_R] },
  });
  services.SpreadsheetApp._sheets['_usuarios'].push(['PAC001', 'x', 'x', 'usuario', 'Maria']);
  const token = loginToken(services, 'PSI001', 'clave123');
  const result = handlePost({
    postData: { contents: JSON.stringify({ accion: 'asignarTarea', token, pacienteCodigo: 'PAC001', titulo: 'Meditar', tipo: 'única', fechaInicio: '2026-07-15', fechaFin: '2026-07-15' }) },
  }, services);
  expect(bodyOf(result).ok).toBe(true);
});

it('asignarTarea rechaza usuario', () => {
  const services = buildServicesWithUser({ codigo: 'USR001', password: 'clave123', rol: 'usuario', nombre: 'Paciente' });
  const token = loginToken(services, 'USR001', 'clave123');
  const result = handlePost({
    postData: { contents: JSON.stringify({ accion: 'asignarTarea', token, pacienteCodigo: 'PAC001', titulo: 'X', tipo: 'única', fechaInicio: '2026-07-15', fechaFin: '2026-07-15' }) },
  }, services);
  expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
});

it('completarOcurrencia permite usuario', () => {
  const TAREA_ROW = ['t1', 'USR001', 'Meditar', '', 'única', '', '2026-07-15', '2026-07-15', 'PSI001', '2026-07-14T10:00:00.000Z'];
  const services = buildServicesWithUser({
    codigo: 'USR001', password: 'clave123', rol: 'usuario', nombre: 'Paciente',
    extraSheets: { _tareas: [TAREAS_HEADER_R, TAREA_ROW], _tareas_registros: [REGISTROS_HEADER_R] },
  });
  const token = loginToken(services, 'USR001', 'clave123');
  const result = handlePost({
    postData: { contents: JSON.stringify({ accion: 'completarOcurrencia', token, tareaId: 't1', fechaOcurrencia: '2026-07-15' }) },
  }, services);
  expect(bodyOf(result).ok).toBe(true);
});

it('completarOcurrencia rechaza psiquiatra', () => {
  const services = buildServicesWithUser({ codigo: 'PSI001', password: 'clave123', rol: 'psiquiatra', nombre: 'Dra. Petra' });
  const token = loginToken(services, 'PSI001', 'clave123');
  const result = handlePost({
    postData: { contents: JSON.stringify({ accion: 'completarOcurrencia', token, tareaId: 't1', fechaOcurrencia: '2026-07-15' }) },
  }, services);
  expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
});
```

- [ ] **Step 2: Correr y verificar que los nuevos tests fallan**

```bash
npx vitest run backend/tests/router.test.js
```
Expected: 8 nuevos tests fallan con `Accion no reconocida`

- [ ] **Step 3: Modificar `backend/src/router.js`**

Agregar import al inicio (después del import de escalas):
```js
import { asignarTarea, listarTareasPaciente, listarMisActividades, completarOcurrencia } from './tareas.js';
```

Agregar constante (después de `ROLES_ESCALAS`):
```js
const ROLES_TAREAS = ['psiquiatra'];
```

Agregar en `handleGet` (después del case `'listarMisEscalas'`, antes del `default`):
```js
case 'listarTareasPaciente':
  return json_(
    requireAuth(p, ROLES_TAREAS, () => listarTareasPaciente(p.codigo, services), services),
    services
  );

case 'listarMisActividades':
  return json_(
    requireAuth(p, ['usuario'], (user) => listarMisActividades(user, services), services),
    services
  );
```

Agregar en `handlePost` (después del case `'completarEscala'`, antes del `default`):
```js
case 'asignarTarea':
  return json_(
    requireAuthBody(b.token, ROLES_TAREAS, (user) => asignarTarea(b, user, services), services),
    services
  );

case 'completarOcurrencia':
  return json_(
    requireAuthBody(b.token, ['usuario'], (user) => completarOcurrencia(b, user, services), services),
    services
  );
```

- [ ] **Step 4: Modificar `backend/build.js`**

En el array `FILES`, agregar `'tareas.js'` después de `'escalas.js'`:
```js
const FILES = [
  'hash.js',
  'aes.js',
  'log.js',
  'usuarios.js',
  'horario.js',
  'calendario.js',
  'agenda.js',
  'pacientes.js',
  'historia-clinica.js',
  'prescripciones.js',
  'escalas.js',
  'tareas.js',   // <-- nuevo
  'auth.js',
  'guards.js',
  'http.js',
  'router.js',
  'index.js',
];
```

- [ ] **Step 5: Modificar `backend/src/index.js`**

En el array `SHEETS` de `setupSheets`, agregar antes de `_log`:
```js
{ name: '_tareas', header: ['id', 'pacienteCodigo', 'titulo', 'descripcion', 'tipo', 'frecuencia', 'fechaInicio', 'fechaFin', 'creadoPor', 'fechaCreacion'] },
{ name: '_tareas_registros', header: ['id', 'tareaId', 'fechaOcurrencia', 'nota', 'completadoPor', 'fechaCompletacion'] },
```

- [ ] **Step 6: Correr suite completa y verificar**

```bash
npx vitest run
```
Expected: todos los tests pasan (previos + 8 nuevos router)

- [ ] **Step 7: Verificar build GAS**

```bash
node backend/build.js
```
Expected: `Build OK -> backend/dist/gas-smpdjm.txt (17 archivos)`

- [ ] **Step 8: Commit**

```bash
git add backend/src/router.js backend/src/index.js backend/build.js backend/tests/router.test.js
git commit -m "feat: wire tareas routes in router, add to build and setupSheets"
```

---

### Task 3: Frontend psiquiatra — sección Tareas en `historia-clinica.js` + tests

**Files:**
- Modify: `src/portal/views/historia-clinica.js`
- Modify: `tests/portal/views/historia-clinica.test.js`

**Interfaces:**
- Consumes: `apiGet('listarTareasPaciente', {token, codigo})` → `{ok:true, tareas:[{id, titulo, tipo, frecuencia, fechaInicio, fechaFin, registros:[{fechaOcurrencia}]}]}`; `apiPost({accion:'asignarTarea', token, pacienteCodigo, titulo, descripcion, tipo, frecuencia, fechaInicio, fechaFin})` → `{ok:true, tarea:{...tarea, }}`
- Produce: sección `.view-historia-clinica__tareas` con tabla y formulario toggle en `fichaContainer`

- [ ] **Step 1: Agregar mock de `listarTareasPaciente` en el `beforeEach` del test**

En `tests/portal/views/historia-clinica.test.js`, en el bloque `apiGet.mockImplementation`, agregar:
```js
if (accion === 'listarTareasPaciente') return Promise.resolve({ ok: true, tareas: [] });
```

- [ ] **Step 2: Escribir los nuevos tests**

Agregar al final del `describe('initHistoriaClinicaView', ...)`:

```js
it('renderiza sección Tareas al abrir ficha del paciente', async () => {
  initHistoriaClinicaView(container, { session: SESSION, forced: false });
  await flush();
  container.querySelectorAll('tbody tr')[0].click();
  await flush();
  expect(apiGet).toHaveBeenCalledWith('listarTareasPaciente', { token: 'psi-tok', codigo: '45678912' });
  expect(container.querySelector('.view-historia-clinica__tareas')).not.toBeNull();
});

it('muestra tareas existentes con cumplimiento N/M en la tabla', async () => {
  apiGet.mockImplementation((accion) => {
    if (accion === 'listarFichasPacientes') return Promise.resolve({ ok: true, pacientes: PACIENTES });
    if (accion === 'leerAntecedentes') return Promise.resolve({ ok: true, antecedentes: ANTECEDENTES_MARIA });
    if (accion === 'listarNotasEvolucion') return Promise.resolve({ ok: true, notas: [] });
    if (accion === 'listarPrescripciones') return Promise.resolve({ ok: true, prescripciones: [] });
    if (accion === 'listarEscalasPaciente') return Promise.resolve({ ok: true, escalas: [] });
    if (accion === 'listarTareasPaciente') return Promise.resolve({
      ok: true,
      tareas: [{
        id: 't1', titulo: 'Meditar', tipo: 'única', frecuencia: '',
        fechaInicio: '2024-01-10', fechaFin: '2024-01-10',
        registros: [{ fechaOcurrencia: '2024-01-10' }],
      }],
    });
    return Promise.resolve({ error: 'Accion no reconocida' });
  });
  initHistoriaClinicaView(container, { session: SESSION, forced: false });
  await flush();
  container.querySelectorAll('tbody tr')[0].click();
  await flush();
  const filas = container.querySelectorAll('.view-historia-clinica__tareas-tabla tbody tr');
  expect(filas.length).toBe(1);
  expect(filas[0].textContent).toContain('Meditar');
  expect(filas[0].textContent).toContain('1/1 completadas');
});

it('botón Asignar tarea muestra y oculta el formulario', async () => {
  initHistoriaClinicaView(container, { session: SESSION, forced: false });
  await flush();
  container.querySelectorAll('tbody tr')[0].click();
  await flush();
  const btn = container.querySelector('.view-historia-clinica__tareas-btn-asignar');
  const form = container.querySelector('.view-historia-clinica__tareas-form-asignar');
  expect(form.hidden).toBe(true);
  btn.click();
  expect(form.hidden).toBe(false);
  btn.click();
  expect(form.hidden).toBe(true);
});

it('seleccionar tipo Recurrente muestra campos-recurrente y oculta campos-unica', async () => {
  initHistoriaClinicaView(container, { session: SESSION, forced: false });
  await flush();
  container.querySelectorAll('tbody tr')[0].click();
  await flush();
  container.querySelector('.view-historia-clinica__tareas-btn-asignar').click();
  const radioRecurrente = container.querySelector('.view-historia-clinica__tareas-tipo-recurrente');
  radioRecurrente.checked = true;
  radioRecurrente.dispatchEvent(new Event('change'));
  expect(container.querySelector('.view-historia-clinica__tareas-campos-recurrente').hidden).toBe(false);
  expect(container.querySelector('.view-historia-clinica__tareas-campos-unica').hidden).toBe(true);
});

it('asignar tarea exitosa inserta fila en tabla con 0/1 cumplimiento', async () => {
  apiPost.mockResolvedValue({
    ok: true,
    tarea: { id: 'tnew', titulo: 'Nueva tarea', tipo: 'única', frecuencia: '', fechaInicio: '2024-01-20', fechaFin: '2024-01-20', creadoPor: 'PSI001', fechaCreacion: new Date().toISOString() },
  });
  initHistoriaClinicaView(container, { session: SESSION, forced: false });
  await flush();
  container.querySelectorAll('tbody tr')[0].click();
  await flush();
  container.querySelector('.view-historia-clinica__tareas-btn-asignar').click();
  container.querySelector('.view-historia-clinica__tareas-titulo-input').value = 'Nueva tarea';
  const form = container.querySelector('.view-historia-clinica__tareas-form-asignar');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  const filas = container.querySelectorAll('.view-historia-clinica__tareas-tabla tbody tr');
  expect(filas.length).toBe(1);
  expect(filas[0].textContent).toContain('Nueva tarea');
  expect(filas[0].textContent).toContain('0/1 completadas');
  expect(form.hidden).toBe(true);
});

it('error al asignar tarea muestra mensaje', async () => {
  apiPost.mockResolvedValue({ error: 'Paciente no encontrado' });
  initHistoriaClinicaView(container, { session: SESSION, forced: false });
  await flush();
  container.querySelectorAll('tbody tr')[0].click();
  await flush();
  container.querySelector('.view-historia-clinica__tareas-btn-asignar').click();
  container.querySelector('.view-historia-clinica__tareas-titulo-input').value = 'X';
  container.querySelector('.view-historia-clinica__tareas-form-asignar').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  const err = container.querySelector('.view-historia-clinica__tareas-error');
  expect(err.hidden).toBe(false);
  expect(err.textContent).toBe('Paciente no encontrado');
});
```

- [ ] **Step 3: Correr y verificar que los nuevos tests fallan**

```bash
npx vitest run tests/portal/views/historia-clinica.test.js
```
Expected: 6 nuevos tests fallan

- [ ] **Step 4: Agregar llamada a `renderTareas` en `abrirFicha`**

En `src/portal/views/historia-clinica.js`, al final de la función `abrirFicha`, después de `renderEscalas`:

```js
const tareasResult = await apiGet('listarTareasPaciente', { token: ctx.session.token, codigo: paciente.codigo });
if (tareasResult.error) {
  if (handleAuthError(tareasResult)) return;
  showError(tareasResult.error);
  return;
}
renderTareas(paciente, tareasResult.tareas);
```

- [ ] **Step 5: Agregar función `renderTareas`**

Al final de `src/portal/views/historia-clinica.js`, antes del cierre de `initHistoriaClinicaView`, agregar:

```js
function renderTareas(paciente, tareas) {
  const section = document.createElement('section');
  section.className = 'view-historia-clinica__tareas';

  const titulo = document.createElement('h4');
  titulo.textContent = 'Tareas';
  section.appendChild(titulo);

  const tabla = document.createElement('table');
  tabla.className = 'view-historia-clinica__tareas-tabla';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Título</th><th>Tipo</th><th>Período</th><th>Cumplimiento</th></tr>';
  tabla.appendChild(thead);
  const tbody = document.createElement('tbody');
  tabla.appendChild(tbody);
  section.appendChild(tabla);

  function calcularM(tarea) {
    const hoy = new Date().toISOString().slice(0, 10);
    const fin = tarea.fechaFin < hoy ? tarea.fechaFin : hoy;
    if (fin < tarea.fechaInicio) return 0;
    if (tarea.tipo === 'única') return 1;
    let count = 0;
    let cur = tarea.fechaInicio;
    while (cur <= fin) {
      count++;
      const d = new Date(cur + 'T12:00:00Z');
      if (tarea.frecuencia === 'diaria') d.setUTCDate(d.getUTCDate() + 1);
      else d.setUTCDate(d.getUTCDate() + 7);
      cur = d.toISOString().slice(0, 10);
    }
    return count;
  }

  function renderTablaTareas() {
    tbody.innerHTML = '';
    tareas.forEach((t) => {
      const tr = document.createElement('tr');
      const tipoLabel = t.tipo === 'única' ? 'Única' :
        t.frecuencia === 'diaria' ? 'Recurrente (diaria)' : 'Recurrente (semanal)';
      const periodo = t.tipo === 'única' ? t.fechaInicio : `${t.fechaInicio} — ${t.fechaFin}`;
      const M = calcularM(t);
      const N = t.registros.length;
      const cumplimiento = M === 0 ? '—' : `${N}/${M} completadas`;
      tr.innerHTML = `<td>${t.titulo}</td><td>${tipoLabel}</td><td>${periodo}</td><td>${cumplimiento}</td>`;
      tbody.appendChild(tr);
    });
  }
  renderTablaTareas();

  const btnAsignar = document.createElement('button');
  btnAsignar.type = 'button';
  btnAsignar.className = 'button button--primary view-historia-clinica__tareas-btn-asignar';
  btnAsignar.textContent = 'Asignar tarea';

  const formAsignar = document.createElement('form');
  formAsignar.className = 'view-historia-clinica__tareas-form-asignar';
  formAsignar.hidden = true;

  const tituloLabel = document.createElement('label');
  tituloLabel.textContent = 'Título';
  const tituloInput = document.createElement('input');
  tituloInput.type = 'text';
  tituloInput.className = 'view-historia-clinica__tareas-titulo-input';
  tituloLabel.appendChild(tituloInput);
  formAsignar.appendChild(tituloLabel);

  const descLabel = document.createElement('label');
  descLabel.textContent = 'Descripción (opcional)';
  const descTextarea = document.createElement('textarea');
  descTextarea.className = 'view-historia-clinica__tareas-descripcion-input';
  descLabel.appendChild(descTextarea);
  formAsignar.appendChild(descLabel);

  const tipoDiv = document.createElement('div');
  tipoDiv.className = 'view-historia-clinica__tareas-tipo-group';

  const radioUnica = document.createElement('input');
  radioUnica.type = 'radio';
  radioUnica.name = 'tarea-tipo';
  radioUnica.value = 'única';
  radioUnica.className = 'view-historia-clinica__tareas-tipo-unica';
  radioUnica.checked = true;
  const labelUnica = document.createElement('label');
  labelUnica.textContent = ' Única';
  labelUnica.prepend(radioUnica);

  const radioRecurrente = document.createElement('input');
  radioRecurrente.type = 'radio';
  radioRecurrente.name = 'tarea-tipo';
  radioRecurrente.value = 'recurrente';
  radioRecurrente.className = 'view-historia-clinica__tareas-tipo-recurrente';
  const labelRecurrente = document.createElement('label');
  labelRecurrente.textContent = ' Recurrente';
  labelRecurrente.prepend(radioRecurrente);

  tipoDiv.appendChild(labelUnica);
  tipoDiv.appendChild(labelRecurrente);
  formAsignar.appendChild(tipoDiv);

  const camposUnica = document.createElement('div');
  camposUnica.className = 'view-historia-clinica__tareas-campos-unica';
  const fechaUnicaLabel = document.createElement('label');
  fechaUnicaLabel.textContent = 'Fecha';
  const fechaUnicaInput = document.createElement('input');
  fechaUnicaInput.type = 'date';
  fechaUnicaInput.className = 'view-historia-clinica__tareas-fecha-unica-input';
  fechaUnicaInput.value = new Date().toISOString().slice(0, 10);
  fechaUnicaLabel.appendChild(fechaUnicaInput);
  camposUnica.appendChild(fechaUnicaLabel);
  formAsignar.appendChild(camposUnica);

  const camposRecurrente = document.createElement('div');
  camposRecurrente.className = 'view-historia-clinica__tareas-campos-recurrente';
  camposRecurrente.hidden = true;

  const frecLabel = document.createElement('label');
  frecLabel.textContent = 'Frecuencia';
  const frecSelect = document.createElement('select');
  frecSelect.className = 'view-historia-clinica__tareas-frecuencia-select';
  [['diaria', 'Diaria'], ['semanal', 'Semanal']].forEach(([v, l]) => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = l;
    frecSelect.appendChild(opt);
  });
  frecLabel.appendChild(frecSelect);
  camposRecurrente.appendChild(frecLabel);

  const fechaInicioLabel = document.createElement('label');
  fechaInicioLabel.textContent = 'Fecha inicio';
  const fechaInicioInput = document.createElement('input');
  fechaInicioInput.type = 'date';
  fechaInicioInput.className = 'view-historia-clinica__tareas-fechainicio-input';
  fechaInicioInput.value = new Date().toISOString().slice(0, 10);
  fechaInicioLabel.appendChild(fechaInicioInput);
  camposRecurrente.appendChild(fechaInicioLabel);

  const fechaFinLabel = document.createElement('label');
  fechaFinLabel.textContent = 'Fecha fin';
  const fechaFinInput = document.createElement('input');
  fechaFinInput.type = 'date';
  fechaFinInput.className = 'view-historia-clinica__tareas-fechafin-input';
  fechaFinLabel.appendChild(fechaFinInput);
  camposRecurrente.appendChild(fechaFinLabel);

  formAsignar.appendChild(camposRecurrente);

  radioUnica.addEventListener('change', () => {
    camposUnica.hidden = false;
    camposRecurrente.hidden = true;
  });
  radioRecurrente.addEventListener('change', () => {
    camposUnica.hidden = true;
    camposRecurrente.hidden = false;
  });

  const tareaError = document.createElement('div');
  tareaError.className = 'view-historia-clinica__tareas-error';
  tareaError.hidden = true;
  formAsignar.appendChild(tareaError);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'button button--primary';
  submitBtn.textContent = 'Guardar';
  formAsignar.appendChild(submitBtn);

  btnAsignar.addEventListener('click', () => {
    formAsignar.hidden = !formAsignar.hidden;
    tareaError.hidden = true;
  });

  formAsignar.addEventListener('submit', async (e) => {
    e.preventDefault();
    tareaError.hidden = true;
    const tipo = radioUnica.checked ? 'única' : 'recurrente';
    const payload = {
      accion: 'asignarTarea',
      token: ctx.session.token,
      pacienteCodigo: paciente.codigo,
      titulo: tituloInput.value.trim(),
      descripcion: descTextarea.value.trim(),
      tipo,
    };
    if (tipo === 'única') {
      payload.fechaInicio = fechaUnicaInput.value;
      payload.fechaFin = fechaUnicaInput.value;
    } else {
      payload.frecuencia = frecSelect.value;
      payload.fechaInicio = fechaInicioInput.value;
      payload.fechaFin = fechaFinInput.value;
    }
    const result = await apiPost(payload);
    if (result.error) {
      if (handleAuthError(result)) return;
      tareaError.textContent = result.error;
      tareaError.hidden = false;
      return;
    }
    tareas.unshift({ ...result.tarea, registros: [] });
    renderTablaTareas();
    formAsignar.hidden = true;
    tituloInput.value = '';
    descTextarea.value = '';
    radioUnica.checked = true;
    camposUnica.hidden = false;
    camposRecurrente.hidden = true;
    fechaUnicaInput.value = new Date().toISOString().slice(0, 10);
  });

  section.appendChild(btnAsignar);
  section.appendChild(formAsignar);
  fichaContainer.appendChild(section);
}
```

- [ ] **Step 6: Correr tests y verificar que pasan**

```bash
npx vitest run tests/portal/views/historia-clinica.test.js
```
Expected: todos los tests de historia-clinica pasan

- [ ] **Step 7: Correr suite completa**

```bash
npx vitest run
```
Expected: todos los tests pasan

- [ ] **Step 8: Commit**

```bash
git add src/portal/views/historia-clinica.js tests/portal/views/historia-clinica.test.js
git commit -m "feat: add tareas section to historia-clinica view (psiquiatra)"
```

---

### Task 4: Frontend paciente — `mis-actividades.js` + dashboard + tests

**Files:**
- Create: `src/portal/views/mis-actividades.js`
- Create: `tests/portal/views/mis-actividades.test.js`
- Modify: `src/portal/dashboard.js`

**Interfaces:**
- Consumes: `apiGet('listarMisActividades', {token})` → `{ok:true, tareas:[{id, titulo, tipo, frecuencia, fechaInicio, fechaFin, registros:[{fechaOcurrencia, nota, fechaCompletacion}]}]}`; `apiPost({accion:'completarOcurrencia', token, tareaId, fechaOcurrencia, nota})` → `{ok:true, registro:{...}}`
- Produce: `initMisActividadesView(container, ctx)` exportada; habilitada en `MENUS.usuario` y `VIEWS`

- [ ] **Step 1: Escribir los tests**

Crear `tests/portal/views/mis-actividades.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initMisActividadesView } from '../../../src/portal/views/mis-actividades.js';
import { setSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const SESSION = { token: 'usr-tok', codigo: 'PAC001', rol: 'usuario', nombre: 'Maria', debeCambiarPassword: false };

// Tarea única con fechaInicio en el pasado (siempre será pasado relativo a cualquier fecha razonable)
const TAREA_UNICA = {
  id: 't1', titulo: 'Meditar', tipo: 'única', frecuencia: '',
  fechaInicio: '2020-01-10', fechaFin: '2020-01-10',
  registros: [],
};
const TAREA_COMPLETADA = {
  id: 't2', titulo: 'Caminar', tipo: 'única', frecuencia: '',
  fechaInicio: '2020-01-10', fechaFin: '2020-01-10',
  registros: [{ id: 'r1', fechaOcurrencia: '2020-01-10', nota: 'Bien', fechaCompletacion: '2020-01-10T20:00:00.000Z' }],
};

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initMisActividadesView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockResolvedValue({ ok: true, tareas: [] });
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('llama listarMisActividades con el token de sesión', async () => {
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    expect(apiGet).toHaveBeenCalledWith('listarMisActividades', { token: 'usr-tok' });
  });

  it('muestra "No hay actividades pendientes" cuando no hay tareas', async () => {
    apiGet.mockResolvedValue({ ok: true, tareas: [] });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    expect(container.querySelector('.view-mis-actividades__pendientes-lista').textContent)
      .toContain('No hay actividades pendientes');
  });

  it('muestra ocurrencias pendientes con botón Marcar cumplida', async () => {
    apiGet.mockResolvedValue({ ok: true, tareas: [TAREA_UNICA] });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const btns = container.querySelectorAll('.view-mis-actividades__btn-cumplir');
    expect(btns.length).toBe(1);
    expect(btns[0].dataset.tareaId).toBe('t1');
    expect(btns[0].dataset.fecha).toBe('2020-01-10');
  });

  it('Marcar cumplida expande el formulario inline', async () => {
    apiGet.mockResolvedValue({ ok: true, tareas: [TAREA_UNICA] });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const btn = container.querySelector('.view-mis-actividades__btn-cumplir');
    const form = container.querySelector('.view-mis-actividades__form-cumplir');
    expect(form.hidden).toBe(true);
    btn.click();
    expect(form.hidden).toBe(false);
  });

  it('confirmar llama completarOcurrencia con tareaId y fechaOcurrencia correctos', async () => {
    apiGet.mockResolvedValue({ ok: true, tareas: [TAREA_UNICA] });
    apiPost.mockResolvedValue({
      ok: true,
      registro: { id: 'r1', tareaId: 't1', fechaOcurrencia: '2020-01-10', nota: '', completadoPor: 'PAC001', fechaCompletacion: new Date().toISOString() },
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelector('.view-mis-actividades__btn-cumplir').click();
    container.querySelector('.view-mis-actividades__btn-confirmar').click();
    await flush();
    expect(apiPost).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'completarOcurrencia',
      token: 'usr-tok',
      tareaId: 't1',
      fechaOcurrencia: '2020-01-10',
    }));
  });

  it('confirmar exitoso mueve la ocurrencia a la tabla de completadas', async () => {
    apiGet.mockResolvedValue({ ok: true, tareas: [TAREA_UNICA] });
    apiPost.mockResolvedValue({
      ok: true,
      registro: { id: 'r1', tareaId: 't1', fechaOcurrencia: '2020-01-10', nota: 'Hecha', completadoPor: 'PAC001', fechaCompletacion: '2020-01-10T20:00:00.000Z' },
    });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    container.querySelector('.view-mis-actividades__btn-cumplir').click();
    container.querySelector('.view-mis-actividades__btn-confirmar').click();
    await flush();
    expect(container.querySelector('.view-mis-actividades__pendientes-lista').textContent)
      .toContain('No hay actividades pendientes');
    const filas = container.querySelectorAll('.view-mis-actividades__completadas-tabla tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Meditar');
    expect(filas[0].textContent).toContain('2020-01-10');
  });

  it('muestra tabla de completadas con tareas ya completadas', async () => {
    apiGet.mockResolvedValue({ ok: true, tareas: [TAREA_COMPLETADA] });
    initMisActividadesView(container, { session: SESSION, forced: false });
    await flush();
    const filas = container.querySelectorAll('.view-mis-actividades__completadas-tabla tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Caminar');
    expect(filas[0].textContent).toContain('2020-01-10');
    expect(filas[0].textContent).toContain('Bien');
  });
});
```

- [ ] **Step 2: Correr y verificar que los tests fallan**

```bash
npx vitest run tests/portal/views/mis-actividades.test.js
```
Expected: FAIL — `Cannot find module '../../../src/portal/views/mis-actividades.js'`

- [ ] **Step 3: Crear `src/portal/views/mis-actividades.js`**

```js
import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';

export function initMisActividadesView(container, ctx) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'view-mis-actividades';

  const heading = document.createElement('h2');
  heading.textContent = 'Mis actividades';
  wrapper.appendChild(heading);

  const errorEl = document.createElement('div');
  errorEl.className = 'view-mis-actividades__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const pendientesSection = document.createElement('section');
  pendientesSection.className = 'view-mis-actividades__pendientes';
  const pendientesTitulo = document.createElement('h3');
  pendientesTitulo.textContent = 'Pendientes';
  pendientesSection.appendChild(pendientesTitulo);
  const pendientesList = document.createElement('div');
  pendientesList.className = 'view-mis-actividades__pendientes-lista';
  pendientesSection.appendChild(pendientesList);
  wrapper.appendChild(pendientesSection);

  const completadasSection = document.createElement('section');
  completadasSection.className = 'view-mis-actividades__completadas';
  const completadasTitulo = document.createElement('h3');
  completadasTitulo.textContent = 'Completadas';
  completadasSection.appendChild(completadasTitulo);
  const completadasTabla = document.createElement('table');
  completadasTabla.className = 'view-mis-actividades__completadas-tabla';
  completadasSection.appendChild(completadasTabla);
  wrapper.appendChild(completadasSection);

  container.appendChild(wrapper);

  let tareas = [];

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

  function renderPendientes() {
    pendientesList.innerHTML = '';
    const hayPendientes = tareas.some((t) => {
      const completadasFechas = new Set(t.registros.map((r) => r.fechaOcurrencia));
      return calcularOcurrencias(t).some((o) => !completadasFechas.has(o));
    });

    if (!hayPendientes) {
      pendientesList.textContent = 'No hay actividades pendientes.';
      return;
    }

    tareas.forEach((tarea) => {
      const completadasFechas = new Set(tarea.registros.map((r) => r.fechaOcurrencia));
      const pendientes = calcularOcurrencias(tarea).filter((o) => !completadasFechas.has(o));
      if (pendientes.length === 0) return;

      const grupo = document.createElement('div');
      grupo.className = 'view-mis-actividades__tarea-grupo';

      const tituloEl = document.createElement('div');
      tituloEl.className = 'view-mis-actividades__tarea-titulo';
      tituloEl.textContent = tarea.titulo;
      grupo.appendChild(tituloEl);

      pendientes.forEach((fecha) => {
        const item = document.createElement('div');
        item.className = 'view-mis-actividades__ocurrencia';

        const fechaEl = document.createElement('span');
        fechaEl.className = 'view-mis-actividades__ocurrencia-fecha';
        fechaEl.textContent = fecha;
        item.appendChild(fechaEl);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'button button--primary view-mis-actividades__btn-cumplir';
        btn.textContent = 'Marcar cumplida';
        btn.dataset.tareaId = tarea.id;
        btn.dataset.fecha = fecha;
        item.appendChild(btn);

        const formContainer = document.createElement('div');
        formContainer.className = 'view-mis-actividades__form-cumplir';
        formContainer.hidden = true;

        const notaInput = document.createElement('textarea');
        notaInput.className = 'view-mis-actividades__nota-input';
        notaInput.placeholder = 'Nota opcional...';
        formContainer.appendChild(notaInput);

        const formError = document.createElement('div');
        formError.className = 'view-mis-actividades__cumplir-error';
        formError.hidden = true;
        formContainer.appendChild(formError);

        const confirmarBtn = document.createElement('button');
        confirmarBtn.type = 'button';
        confirmarBtn.className = 'button button--primary view-mis-actividades__btn-confirmar';
        confirmarBtn.textContent = 'Confirmar';
        formContainer.appendChild(confirmarBtn);

        btn.addEventListener('click', () => { formContainer.hidden = !formContainer.hidden; });

        confirmarBtn.addEventListener('click', async () => {
          formError.hidden = true;
          const result = await apiPost({
            accion: 'completarOcurrencia',
            token: ctx.session.token,
            tareaId: tarea.id,
            fechaOcurrencia: fecha,
            nota: notaInput.value.trim(),
          });
          if (result.error) {
            if (handleAuthError(result)) return;
            formError.textContent = result.error;
            formError.hidden = false;
            return;
          }
          const idx = tareas.findIndex((t) => t.id === tarea.id);
          if (idx !== -1) tareas[idx].registros.push(result.registro);
          renderPendientes();
          renderCompletadas();
        });

        item.appendChild(formContainer);
        grupo.appendChild(item);
      });

      pendientesList.appendChild(grupo);
    });
  }

  function renderCompletadas() {
    completadasTabla.innerHTML = '';
    const completadas = [];
    tareas.forEach((t) => {
      t.registros.forEach((r) => completadas.push({ titulo: t.titulo, ...r }));
    });
    completadas.sort((a, b) => b.fechaOcurrencia.localeCompare(a.fechaOcurrencia));

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Tarea</th><th>Fecha</th><th>Nota</th></tr>';
    completadasTabla.appendChild(thead);
    const tbody = document.createElement('tbody');
    completadas.forEach((c) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${c.titulo}</td><td>${c.fechaOcurrencia}</td><td>${c.nota || '—'}</td>`;
      tbody.appendChild(tr);
    });
    completadasTabla.appendChild(tbody);
  }

  async function loadActividades() {
    const result = await apiGet('listarMisActividades', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }
    tareas = result.tareas;
    renderPendientes();
    renderCompletadas();
  }

  loadActividades();
}
```

- [ ] **Step 4: Modificar `src/portal/dashboard.js`**

Agregar import (después del import de `mis-escalas`):
```js
import { initMisActividadesView } from './views/mis-actividades.js';
```

En `MENUS.usuario`, cambiar `mis-actividades` de `enabled: false` a `enabled: true`:
```js
{ id: 'mis-actividades', label: 'Mis actividades', enabled: true },
```

En `VIEWS`, agregar:
```js
'mis-actividades': initMisActividadesView,
```

- [ ] **Step 5: Correr tests y verificar que pasan**

```bash
npx vitest run tests/portal/views/mis-actividades.test.js
```
Expected: 7 tests passing

- [ ] **Step 6: Correr suite completa**

```bash
npx vitest run
```
Expected: todos los tests pasan

- [ ] **Step 7: Commit**

```bash
git add src/portal/views/mis-actividades.js tests/portal/views/mis-actividades.test.js src/portal/dashboard.js
git commit -m "feat: add mis-actividades view for patient portal, enable in dashboard"
```
