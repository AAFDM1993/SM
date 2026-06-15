# Ficha y alta de pacientes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Pacientes" section to the portal (administrador/psiquiatra/recepcion) for creating and editing patient records, with automatic creation of the patient's login account on first save.

**Architecture:** New backend module `backend/src/pacientes.js` exposes `crearPaciente`, `actualizarPaciente`, `leerFichaPaciente`, `listarFichasPacientes`, operating on a new `_pacientes` sheet (separate from `_usuarios`, which stays auth-only). `crearPaciente` writes both a `_usuarios` row (`rol: 'usuario'`, password = hash(DNI)) and a `_pacientes` row, reusing `generarSalt`/`generarHashSHA256` from `hash.js` — same pattern as `guardarUsuario`. `backend/src/router.js` exposes the four functions behind a new `ROLES_PACIENTES` constant. The portal gets a new view `src/portal/views/pacientes.js` (list + search + create/edit form, following `views/usuarios.js` and the search pattern from `views/agenda.js`), then `src/portal/dashboard.js` wires it into `MENUS`/`VIEWS`.

**Tech Stack:** Vanilla JS (Google Apps Script backend), Vitest for tests, in-memory mocked sheets via `createMockServices` (`backend/mocks/gas-services.js`), vanilla DOM for the portal frontend.

**Reference spec:** `docs/superpowers/specs/2026-06-15-fase-2-ficha-pacientes-design.md`

---

### Task 1: `crearPaciente`

**Files:**
- Create: `backend/src/pacientes.js`
- Test: `backend/tests/pacientes.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/pacientes.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { generarHashSHA256 } from '../src/hash.js';
import { findUser } from '../src/usuarios.js';
import { crearPaciente } from '../src/pacientes.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const PACIENTES_HEADER = ['codigo', 'fechaNacimiento', 'sexo', 'telefono', 'email', 'contactoEmergenciaNombre', 'contactoEmergenciaTelefono', 'fechaAlta', 'creadoPor'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];

const ADMIN = { codigo: 'ADM001', rol: 'administrador' };

function buildServices({ usuarios = [], pacientes = [] } = {}) {
  return createMockServices({
    sheets: {
      _usuarios: [USUARIOS_HEADER, ...usuarios],
      _pacientes: [PACIENTES_HEADER, ...pacientes],
      _log: [LOG_HEADER],
    },
  });
}

describe('crearPaciente', () => {
  it('crea filas en _usuarios y _pacientes con los valores correctos', () => {
    const services = buildServices();

    const result = crearPaciente({
      codigo: '45678912',
      nombre: 'Maria Lopez',
      fechaNacimiento: '1990-05-10',
      sexo: 'Femenino',
      telefono: '987654321',
      email: 'maria@example.com',
      contactoEmergenciaNombre: 'Juan Lopez',
      contactoEmergenciaTelefono: '999888777',
    }, ADMIN, services);

    expect(result).toEqual({
      ok: true,
      paciente: {
        codigo: '45678912',
        nombre: 'Maria Lopez',
        fechaNacimiento: '1990-05-10',
        sexo: 'Femenino',
        telefono: '987654321',
        email: 'maria@example.com',
        contactoEmergenciaNombre: 'Juan Lopez',
        contactoEmergenciaTelefono: '999888777',
      },
    });

    const usuario = findUser('45678912', services);
    expect(usuario.rol).toBe('usuario');
    expect(usuario.nombre).toBe('Maria Lopez');
    expect(usuario.password).toBe(generarHashSHA256('45678912' + usuario.salt, services));

    const pacienteRow = services.SpreadsheetApp._sheets['_pacientes'][1];
    expect(pacienteRow[0]).toBe('45678912');
    expect(pacienteRow[1]).toBe('1990-05-10');
    expect(pacienteRow[2]).toBe('Femenino');
    expect(pacienteRow[3]).toBe('987654321');
    expect(pacienteRow[4]).toBe('maria@example.com');
    expect(pacienteRow[5]).toBe('Juan Lopez');
    expect(pacienteRow[6]).toBe('999888777');
    expect(pacienteRow[8]).toBe('ADM001');
  });

  it('rechaza un DNI duplicado sin escribir nada', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'administrador', 'Otro']] });

    const result = crearPaciente({ codigo: '45678912', nombre: 'Maria Lopez' }, ADMIN, services);

    expect(result).toEqual({ error: 'Ya existe un usuario con ese código' });
    expect(services.SpreadsheetApp._sheets['_pacientes']).toHaveLength(1); // solo header
  });

  it('rechaza nombre vacio', () => {
    const services = buildServices();
    const result = crearPaciente({ codigo: '45678912', nombre: '' }, ADMIN, services);
    expect(result).toEqual({ error: 'codigo y nombre son requeridos' });
  });

  it('rechaza si falta la hoja _pacientes', () => {
    const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER] } });
    const result = crearPaciente({ codigo: '45678912', nombre: 'Maria Lopez' }, ADMIN, services);
    expect(result).toEqual({ error: 'Hoja de pacientes no encontrada' });
  });

  it('registra paciente_creado en _log', () => {
    const services = buildServices();

    crearPaciente({ codigo: '45678912', nombre: 'Maria Lopez' }, ADMIN, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'paciente_creado');
    expect(logEntry).toBeDefined();
    expect(logEntry[1]).toBe('ADM001');
    expect(logEntry[2]).toBe('administrador');
    expect(logEntry[4]).toBe('45678912 Maria Lopez');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run backend/tests/pacientes.test.js`
Expected: FAIL — `backend/src/pacientes.js` does not exist yet, so the import fails to resolve and the whole file errors out (e.g. "Failed to resolve import \"../src/pacientes.js\"").

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/pacientes.js`:

```js
import { generarSalt, generarHashSHA256 } from './hash.js';
import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const SHEET_USUARIOS = '_usuarios';
const SHEET_PACIENTES = '_pacientes';

export function crearPaciente(b, user, services) {
  const codigo = String(b.codigo || '').trim();
  const nombre = String(b.nombre || '').trim();
  if (!codigo || !nombre) return { error: 'codigo y nombre son requeridos' };

  const sheetPacientes = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PACIENTES);
  if (!sheetPacientes) return { error: 'Hoja de pacientes no encontrada' };

  if (findUser(codigo, services)) return { error: 'Ya existe un usuario con ese código' };

  const fechaNacimiento = String(b.fechaNacimiento || '');
  const sexo = String(b.sexo || '');
  const telefono = String(b.telefono || '');
  const email = String(b.email || '');
  const contactoEmergenciaNombre = String(b.contactoEmergenciaNombre || '');
  const contactoEmergenciaTelefono = String(b.contactoEmergenciaTelefono || '');

  const salt = generarSalt(services);
  const passwordHash = generarHashSHA256(codigo + salt, services);
  const sheetUsuarios = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  sheetUsuarios.appendRow([codigo, passwordHash, salt, 'usuario', nombre]);

  sheetPacientes.appendRow([
    codigo, fechaNacimiento, sexo, telefono, email,
    contactoEmergenciaNombre, contactoEmergenciaTelefono, new Date(), user.codigo,
  ]);

  registrarLog(services, user.codigo, user.rol, 'paciente_creado', `${codigo} ${nombre}`);

  return {
    ok: true,
    paciente: {
      codigo, nombre, fechaNacimiento, sexo, telefono, email,
      contactoEmergenciaNombre, contactoEmergenciaTelefono,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run backend/tests/pacientes.test.js`
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/pacientes.js backend/tests/pacientes.test.js
git commit -m "feat(pacientes): add crearPaciente"
```

---

### Task 2: `actualizarPaciente`

**Files:**
- Modify: `backend/src/pacientes.js`
- Test: `backend/tests/pacientes.test.js`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/pacientes.test.js`, add the import of `actualizarPaciente` to the existing import line:

```js
import { crearPaciente, actualizarPaciente } from '../src/pacientes.js';
```

Then add a new `describe('actualizarPaciente', ...)` block after the closing `});` of `describe('crearPaciente', ...)`:

```js
describe('actualizarPaciente', () => {
  it('actualiza ficha y nombre de un paciente existente', () => {
    const services = buildServices({
      usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']],
      pacientes: [['45678912', '1990-05-10', 'Femenino', '987654321', 'maria@example.com', 'Juan Lopez', '999888777', new Date(), 'ADM001']],
    });

    const result = actualizarPaciente({
      codigo: '45678912',
      nombre: 'Maria Lopez Garcia',
      fechaNacimiento: '1990-05-11',
      sexo: 'Femenino',
      telefono: '111222333',
      email: 'maria2@example.com',
      contactoEmergenciaNombre: 'Pedro Lopez',
      contactoEmergenciaTelefono: '444555666',
    }, ADMIN, services);

    expect(result).toEqual({ ok: true });
    expect(findUser('45678912', services).nombre).toBe('Maria Lopez Garcia');

    const pacienteRow = services.SpreadsheetApp._sheets['_pacientes'][1];
    expect(pacienteRow[1]).toBe('1990-05-11');
    expect(pacienteRow[3]).toBe('111222333');
    expect(pacienteRow[4]).toBe('maria2@example.com');
    expect(pacienteRow[5]).toBe('Pedro Lopez');
    expect(pacienteRow[6]).toBe('444555666');
  });

  it('hace upsert para un paciente legacy sin fila en _pacientes', () => {
    const services = buildServices({
      usuarios: [['78945612', 'h', 's', 'usuario', 'Carlos Ruiz']],
    });

    const result = actualizarPaciente({ codigo: '78945612', nombre: 'Carlos Ruiz', telefono: '912345678' }, ADMIN, services);

    expect(result).toEqual({ ok: true });
    const pacienteRow = services.SpreadsheetApp._sheets['_pacientes'][1];
    expect(pacienteRow[0]).toBe('78945612');
    expect(pacienteRow[3]).toBe('912345678');
    expect(pacienteRow[8]).toBe('ADM001');
  });

  it('rechaza un codigo que no existe en _usuarios', () => {
    const services = buildServices();
    const result = actualizarPaciente({ codigo: 'NOPE', nombre: 'Alguien' }, ADMIN, services);
    expect(result).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza un codigo que existe pero no tiene rol usuario', () => {
    const services = buildServices({ usuarios: [['ADM002', 'h', 's', 'administrador', 'Otro Admin']] });
    const result = actualizarPaciente({ codigo: 'ADM002', nombre: 'Otro Admin' }, ADMIN, services);
    expect(result).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza nombre vacio', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    const result = actualizarPaciente({ codigo: '45678912', nombre: '' }, ADMIN, services);
    expect(result).toEqual({ error: 'codigo y nombre son requeridos' });
  });

  it('rechaza si falta la hoja _pacientes', () => {
    const services = createMockServices({
      sheets: { _usuarios: [USUARIOS_HEADER, ['45678912', 'h', 's', 'usuario', 'Maria Lopez']], _log: [LOG_HEADER] },
    });
    const result = actualizarPaciente({ codigo: '45678912', nombre: 'Maria Lopez' }, ADMIN, services);
    expect(result).toEqual({ error: 'Hoja de pacientes no encontrada' });
  });

  it('registra paciente_actualizado en _log', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });

    actualizarPaciente({ codigo: '45678912', nombre: 'Maria Lopez' }, ADMIN, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'paciente_actualizado');
    expect(logEntry).toBeDefined();
    expect(logEntry[1]).toBe('ADM001');
    expect(logEntry[2]).toBe('administrador');
    expect(logEntry[4]).toBe('45678912');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run backend/tests/pacientes.test.js`
Expected: FAIL — `actualizarPaciente` is not exported from `backend/src/pacientes.js`, so the import returns `undefined` and every test in `describe('actualizarPaciente', ...)` fails with a TypeError (`actualizarPaciente is not a function`). The 5 `describe('crearPaciente', ...)` tests still pass.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/pacientes.js`, add two local helper functions after the constants (after `const SHEET_PACIENTES = '_pacientes';`):

```js
function findUsuarioRow(codigo, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  if (!sheet) return null;
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const rows = sheet.getRange(2, 1, last - 1, 5).getValues();
  const needle = String(codigo).trim().toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === needle) {
      return { fila: i + 2, row: rows[i] };
    }
  }
  return null;
}

function findPacienteRow(codigo, sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const rows = sheet.getRange(2, 1, last - 1, 9).getValues();
  const needle = String(codigo).trim().toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === needle) {
      return { fila: i + 2, row: rows[i] };
    }
  }
  return null;
}
```

Then add `actualizarPaciente` at the end of the file:

```js
export function actualizarPaciente(b, user, services) {
  const codigo = String(b.codigo || '').trim();
  const nombre = String(b.nombre || '').trim();
  if (!codigo || !nombre) return { error: 'codigo y nombre son requeridos' };

  const usuarioRow = findUsuarioRow(codigo, services);
  if (!usuarioRow || String(usuarioRow.row[3]).trim().toLowerCase() !== 'usuario') {
    return { error: 'Paciente no encontrado' };
  }

  const sheetPacientes = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PACIENTES);
  if (!sheetPacientes) return { error: 'Hoja de pacientes no encontrada' };

  if (String(usuarioRow.row[4]) !== nombre) {
    const sheetUsuarios = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
    sheetUsuarios.getRange(usuarioRow.fila, 5, 1, 1).setValue(nombre);
  }

  const fechaNacimiento = String(b.fechaNacimiento || '');
  const sexo = String(b.sexo || '');
  const telefono = String(b.telefono || '');
  const email = String(b.email || '');
  const contactoEmergenciaNombre = String(b.contactoEmergenciaNombre || '');
  const contactoEmergenciaTelefono = String(b.contactoEmergenciaTelefono || '');
  const valores = [fechaNacimiento, sexo, telefono, email, contactoEmergenciaNombre, contactoEmergenciaTelefono];

  const pacienteRow = findPacienteRow(codigo, sheetPacientes);
  if (pacienteRow) {
    sheetPacientes.getRange(pacienteRow.fila, 2, 1, 6).setValues([valores]);
  } else {
    sheetPacientes.appendRow([codigo, ...valores, new Date(), user.codigo]);
  }

  registrarLog(services, user.codigo, user.rol, 'paciente_actualizado', codigo);

  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run backend/tests/pacientes.test.js`
Expected: PASS — all 12 tests pass (5 from Task 1 + 7 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/pacientes.js backend/tests/pacientes.test.js
git commit -m "feat(pacientes): add actualizarPaciente"
```

---

### Task 3: `leerFichaPaciente` and `listarFichasPacientes`

**Files:**
- Modify: `backend/src/pacientes.js`
- Test: `backend/tests/pacientes.test.js`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/pacientes.test.js`, update the import line to include the two new functions:

```js
import { crearPaciente, actualizarPaciente, leerFichaPaciente, listarFichasPacientes } from '../src/pacientes.js';
```

Then add two new `describe` blocks at the end of the file, after the closing `});` of `describe('actualizarPaciente', ...)`:

```js
describe('leerFichaPaciente', () => {
  it('devuelve la ficha completa para un paciente con fila en _pacientes', () => {
    const services = buildServices({
      usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']],
      pacientes: [['45678912', '1990-05-10', 'Femenino', '987654321', 'maria@example.com', 'Juan Lopez', '999888777', new Date(), 'ADM001']],
    });

    expect(leerFichaPaciente('45678912', services)).toEqual({
      ok: true,
      paciente: {
        codigo: '45678912',
        nombre: 'Maria Lopez',
        fechaNacimiento: '1990-05-10',
        sexo: 'Femenino',
        telefono: '987654321',
        email: 'maria@example.com',
        contactoEmergenciaNombre: 'Juan Lopez',
        contactoEmergenciaTelefono: '999888777',
      },
    });
  });

  it('devuelve campos de ficha vacios para un paciente legacy sin fila en _pacientes', () => {
    const services = buildServices({ usuarios: [['78945612', 'h', 's', 'usuario', 'Carlos Ruiz']] });

    expect(leerFichaPaciente('78945612', services)).toEqual({
      ok: true,
      paciente: {
        codigo: '78945612',
        nombre: 'Carlos Ruiz',
        fechaNacimiento: '',
        sexo: '',
        telefono: '',
        email: '',
        contactoEmergenciaNombre: '',
        contactoEmergenciaTelefono: '',
      },
    });
  });

  it('devuelve error si el codigo no existe como paciente', () => {
    const services = buildServices();
    expect(leerFichaPaciente('NOPE', services)).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza si falta la hoja _pacientes', () => {
    const services = createMockServices({
      sheets: { _usuarios: [USUARIOS_HEADER, ['45678912', 'h', 's', 'usuario', 'Maria Lopez']], _log: [LOG_HEADER] },
    });
    expect(leerFichaPaciente('45678912', services)).toEqual({ error: 'Hoja de pacientes no encontrada' });
  });
});

describe('listarFichasPacientes', () => {
  it('devuelve la lista de pacientes enriquecida con telefono y email', () => {
    const services = buildServices({
      usuarios: [
        ['ADM001', 'h', 's', 'administrador', 'Admin'],
        ['45678912', 'h', 's', 'usuario', 'Maria Lopez'],
        ['78945612', 'h', 's', 'usuario', 'Carlos Ruiz'],
      ],
      pacientes: [
        ['45678912', '1990-05-10', 'Femenino', '987654321', 'maria@example.com', 'Juan Lopez', '999888777', new Date(), 'ADM001'],
      ],
    });

    expect(listarFichasPacientes(services)).toEqual({
      ok: true,
      pacientes: [
        { codigo: '45678912', nombre: 'Maria Lopez', telefono: '987654321', email: 'maria@example.com' },
        { codigo: '78945612', nombre: 'Carlos Ruiz', telefono: '', email: '' },
      ],
    });
  });

  it('rechaza si falta la hoja _pacientes', () => {
    const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER] } });
    expect(listarFichasPacientes(services)).toEqual({ error: 'Hoja de pacientes no encontrada' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run backend/tests/pacientes.test.js`
Expected: FAIL — `leerFichaPaciente` and `listarFichasPacientes` are not exported from `backend/src/pacientes.js`, so all 6 new tests fail with a TypeError (`leerFichaPaciente is not a function` / `listarFichasPacientes is not a function`). The 12 existing tests still pass.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/pacientes.js`, add both functions at the end of the file:

```js
export function leerFichaPaciente(codigo, services) {
  const usuarioRow = findUsuarioRow(codigo, services);
  if (!usuarioRow || String(usuarioRow.row[3]).trim().toLowerCase() !== 'usuario') {
    return { error: 'Paciente no encontrado' };
  }

  const sheetPacientes = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PACIENTES);
  if (!sheetPacientes) return { error: 'Hoja de pacientes no encontrada' };

  const codigoNormalizado = String(usuarioRow.row[0]).trim();
  const nombre = String(usuarioRow.row[4]);
  const pacienteRow = findPacienteRow(codigoNormalizado, sheetPacientes);
  const ficha = pacienteRow ? pacienteRow.row : ['', '', '', '', '', '', '', '', ''];

  return {
    ok: true,
    paciente: {
      codigo: codigoNormalizado,
      nombre,
      fechaNacimiento: String(ficha[1]),
      sexo: String(ficha[2]),
      telefono: String(ficha[3]),
      email: String(ficha[4]),
      contactoEmergenciaNombre: String(ficha[5]),
      contactoEmergenciaTelefono: String(ficha[6]),
    },
  };
}

export function listarFichasPacientes(services) {
  const sheetPacientes = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PACIENTES);
  if (!sheetPacientes) return { error: 'Hoja de pacientes no encontrada' };

  const sheetUsuarios = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  const last = sheetUsuarios.getLastRow();
  const usuarios = last < 2 ? [] : sheetUsuarios.getRange(2, 1, last - 1, 5).getValues();

  const pacientes = usuarios
    .filter((r) => String(r[0]).trim() !== '' && String(r[3]).trim().toLowerCase() === 'usuario')
    .map((r) => {
      const codigo = String(r[0]).trim();
      const pacienteRow = findPacienteRow(codigo, sheetPacientes);
      return {
        codigo,
        nombre: String(r[4]),
        telefono: pacienteRow ? String(pacienteRow.row[3]) : '',
        email: pacienteRow ? String(pacienteRow.row[4]) : '',
      };
    });

  return { ok: true, pacientes };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run backend/tests/pacientes.test.js`
Expected: PASS — all 18 tests pass (12 from Tasks 1-2 + 6 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/pacientes.js backend/tests/pacientes.test.js
git commit -m "feat(pacientes): add leerFichaPaciente and listarFichasPacientes"
```

---

### Task 4: Router integration

**Files:**
- Modify: `backend/src/router.js`
- Test: `backend/tests/router.test.js`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/router.test.js`, add a new header constant after line 10 (`CITAS_HEADER`):

```js
const PACIENTES_HEADER = ['codigo', 'fechaNacimiento', 'sexo', 'telefono', 'email', 'contactoEmergenciaNombre', 'contactoEmergenciaTelefono', 'fechaAlta', 'creadoPor'];
```

Then add these tests inside `describe('handleGet', ...)`, after the `'listarPacientes devuelve los pacientes para recepcion'` test (the last test before the closing `});` of `describe('handleGet', ...)`):

```js
  it('leerFichaPaciente requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerFichaPaciente', token, codigo: 'USR001' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('leerFichaPaciente devuelve la ficha del paciente para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _pacientes: [PACIENTES_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerFichaPaciente', token, codigo: '45678912' } }, services);
    expect(bodyOf(result)).toEqual({
      ok: true,
      paciente: {
        codigo: '45678912', nombre: 'Maria Lopez', fechaNacimiento: '', sexo: '',
        telefono: '', email: '', contactoEmergenciaNombre: '', contactoEmergenciaTelefono: '',
      },
    });
  });

  it('listarFichasPacientes requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarFichasPacientes', token } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('listarFichasPacientes devuelve la lista de fichas para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _pacientes: [PACIENTES_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarFichasPacientes', token } }, services);
    expect(bodyOf(result)).toEqual({ ok: true, pacientes: [{ codigo: '45678912', nombre: 'Maria Lopez', telefono: '', email: '' }] });
  });
```

Then add these tests inside `describe('handlePost', ...)`, after the `'eliminarBloqueo elimina un bloqueo para administrador'` test (the last test before the closing `});` of `describe('handlePost', ...)`):

```js
  it('crearPaciente requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearPaciente', token, codigo: '45678912', nombre: 'Maria Lopez' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('crearPaciente crea un paciente nuevo para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _pacientes: [PACIENTES_HEADER] },
    });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearPaciente', token, codigo: '45678912', nombre: 'Maria Lopez' }) } },
      services
    );
    const body = bodyOf(result);
    expect(body.ok).toBe(true);
    expect(body.paciente).toMatchObject({ codigo: '45678912', nombre: 'Maria Lopez' });
  });

  it('actualizarPaciente requiere rol administrador, psiquiatra o recepcion', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'secreta123', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'actualizarPaciente', token, codigo: 'USR001', nombre: 'Paciente' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('actualizarPaciente actualiza la ficha de un paciente para recepcion', () => {
    const services = buildServicesWithUser({
      codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion',
      extraSheets: { _pacientes: [PACIENTES_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'actualizarPaciente', token, codigo: '45678912', nombre: 'Maria Lopez', telefono: '987654321' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run backend/tests/router.test.js`
Expected: FAIL — all 8 new tests fail because `router.js` does not yet recognize the `leerFichaPaciente`, `listarFichasPacientes`, `crearPaciente`, and `actualizarPaciente` actions, returning `{ error: 'Accion no reconocida' }` instead of the expected response in each case. The 33 existing tests still pass.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/router.js`, add a new import after line 6 (the `horario.js` import):

```js
import { crearPaciente, actualizarPaciente, leerFichaPaciente, listarFichasPacientes } from './pacientes.js';
```

Add a new constant after line 9 (`ROLES_HORARIO`):

```js
const ROLES_PACIENTES = ['administrador', 'psiquiatra', 'recepcion'];
```

In `handleGet`, add two new cases after `case 'listarPacientes':` (lines 39-40) and before `default:`:

```js
    case 'leerFichaPaciente':
      return json_(
        requireAuth(p, ROLES_PACIENTES, () => leerFichaPaciente(p.codigo, services), services),
        services
      );

    case 'listarFichasPacientes':
      return json_(requireAuth(p, ROLES_PACIENTES, () => listarFichasPacientes(services), services), services);

```

In `handlePost`, add two new cases after `case 'eliminarBloqueo':` (lines 107-111) and before `default:`:

```js
    case 'crearPaciente':
      return json_(
        requireAuthBody(b.token, ROLES_PACIENTES, (user) => crearPaciente(b, user, services), services),
        services
      );

    case 'actualizarPaciente':
      return json_(
        requireAuthBody(b.token, ROLES_PACIENTES, (user) => actualizarPaciente(b, user, services), services),
        services
      );

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run backend/tests/router.test.js`
Expected: PASS — all 41 tests pass (33 existing + 8 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/router.js backend/tests/router.test.js
git commit -m "feat(router): expose crearPaciente, actualizarPaciente, leerFichaPaciente, listarFichasPacientes"
```

---

### Task 5: Vista "Pacientes" (lista + ficha de alta/edición)

**Files:**
- Create: `src/portal/views/pacientes.js`
- Test: `tests/portal/views/pacientes.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `tests/portal/views/pacientes.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initPacientesView } from '../../../src/portal/views/pacientes.js';
import { setSession, getSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const SESSION = { token: 'rec-tok', codigo: 'REC001', rol: 'recepcion', nombre: 'Recepcion', debeCambiarPassword: false };

const PACIENTES = [
  { codigo: '45678912', nombre: 'Maria Lopez', telefono: '987654321', email: 'maria@example.com' },
  { codigo: '78945612', nombre: 'Carlos Ruiz', telefono: '912345678', email: '' },
];

const FICHA_CARLOS = {
  codigo: '78945612', nombre: 'Carlos Ruiz', fechaNacimiento: '1985-03-14', sexo: 'Masculino',
  telefono: '912345678', email: '', contactoEmergenciaNombre: 'Lucia Ruiz', contactoEmergenciaTelefono: '911223344',
};

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initPacientesView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarFichasPacientes') return Promise.resolve({ ok: true, pacientes: PACIENTES });
      if (accion === 'leerFichaPaciente') return Promise.resolve({ ok: true, paciente: FICHA_CARLOS });
      return Promise.resolve({ error: 'Accion no reconocida' });
    });
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('carga y muestra la lista de pacientes', async () => {
    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    expect(apiGet).toHaveBeenCalledWith('listarFichasPacientes', { token: 'rec-tok' });
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('45678912');
    expect(rows[0].textContent).toContain('Maria Lopez');
    expect(rows[0].textContent).toContain('987654321');
  });

  it('filtra la lista por nombre o DNI', async () => {
    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    const buscarInput = container.querySelector('.view-pacientes__buscar');
    buscarInput.value = 'carlos';
    buscarInput.dispatchEvent(new Event('input'));

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Carlos Ruiz');
  });

  it('crea un paciente nuevo con los datos del formulario', async () => {
    apiPost.mockResolvedValue({ ok: true, paciente: { codigo: '11223344', nombre: 'Nuevo Paciente' } });

    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelector('.view-pacientes__nuevo').click();

    const form = container.querySelector('.view-pacientes__form');
    const inputs = form.querySelectorAll('input');
    inputs[0].value = '11223344';
    inputs[1].value = 'Nuevo Paciente';
    inputs[2].value = '1995-01-20';
    form.querySelector('select').value = 'Masculino';
    inputs[3].value = '900111222';
    inputs[4].value = 'nuevo@example.com';
    inputs[5].value = 'Contacto Emergencia';
    inputs[6].value = '900333444';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'crearPaciente',
      token: 'rec-tok',
      codigo: '11223344',
      nombre: 'Nuevo Paciente',
      fechaNacimiento: '1995-01-20',
      sexo: 'Masculino',
      telefono: '900111222',
      email: 'nuevo@example.com',
      contactoEmergenciaNombre: 'Contacto Emergencia',
      contactoEmergenciaTelefono: '900333444',
    });

    const formSuccess = container.querySelector('.view-pacientes__form-success');
    expect(formSuccess.hidden).toBe(false);
    expect(formSuccess.textContent).toContain('11223344');
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it('abre el formulario de edicion precargado al hacer click en una fila', async () => {
    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    const rows = container.querySelectorAll('tbody tr');
    rows[1].click(); // fila de Carlos Ruiz
    await flush();

    expect(apiGet).toHaveBeenCalledWith('leerFichaPaciente', { token: 'rec-tok', codigo: '78945612' });

    const form = container.querySelector('.view-pacientes__form');
    const inputs = form.querySelectorAll('input');
    expect(inputs[0].value).toBe('78945612');
    expect(inputs[0].disabled).toBe(true);
    expect(inputs[1].value).toBe('Carlos Ruiz');
    expect(inputs[2].value).toBe('1985-03-14');
    expect(form.querySelector('select').value).toBe('Masculino');
    expect(inputs[5].value).toBe('Lucia Ruiz');
    expect(inputs[6].value).toBe('911223344');
  });

  it('actualiza un paciente existente', async () => {
    apiPost.mockResolvedValue({ ok: true });

    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    const rows = container.querySelectorAll('tbody tr');
    rows[1].click();
    await flush();

    const form = container.querySelector('.view-pacientes__form');
    form.querySelectorAll('input')[1].value = 'Carlos Ruiz Garcia';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'actualizarPaciente',
      token: 'rec-tok',
      codigo: '78945612',
      nombre: 'Carlos Ruiz Garcia',
      fechaNacimiento: '1985-03-14',
      sexo: 'Masculino',
      telefono: '912345678',
      email: '',
      contactoEmergenciaNombre: 'Lucia Ruiz',
      contactoEmergenciaTelefono: '911223344',
    });
    expect(apiGet).toHaveBeenCalledTimes(3); // listar inicial + leerFicha + listar tras guardar
  });

  it('muestra el error del backend si la creacion falla', async () => {
    apiPost.mockResolvedValue({ error: 'Ya existe un usuario con ese código' });

    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelector('.view-pacientes__nuevo').click();
    const form = container.querySelector('.view-pacientes__form');
    form.querySelectorAll('input')[0].value = '45678912';
    form.querySelectorAll('input')[1].value = 'Alguien';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    const formError = container.querySelector('.view-pacientes__form-error');
    expect(formError.textContent).toBe('Ya existe un usuario con ese código');
    expect(formError.hidden).toBe(false);
  });

  it('valida campos obligatorios en el cliente antes de enviar', async () => {
    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelector('.view-pacientes__nuevo').click();
    const form = container.querySelector('.view-pacientes__form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    const formError = container.querySelector('.view-pacientes__form-error');
    expect(formError.textContent).toBe('codigo y nombre son requeridos');
    expect(formError.hidden).toBe(false);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('redirige al login si listarFichasPacientes devuelve No autorizado', async () => {
    apiGet.mockResolvedValue({ error: 'No autorizado' });

    initPacientesView(container, { session: SESSION, forced: false });
    await flush();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/portal/views/pacientes.test.js`
Expected: FAIL — `src/portal/views/pacientes.js` does not exist yet, so the import fails to resolve and the whole file errors out (e.g. "Failed to resolve import \"../../../src/portal/views/pacientes.js\"").

- [ ] **Step 3: Write minimal implementation**

Create `src/portal/views/pacientes.js`:

```js
import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';

const SEXOS = ['', 'Masculino', 'Femenino', 'Otro'];

export function initPacientesView(container, ctx) {
  container.innerHTML = '';

  let pacientes = [];

  const wrapper = document.createElement('div');
  wrapper.className = 'view-pacientes';

  const heading = document.createElement('h2');
  heading.textContent = 'Pacientes';
  wrapper.appendChild(heading);

  const errorEl = document.createElement('div');
  errorEl.className = 'view-pacientes__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const buscarInput = document.createElement('input');
  buscarInput.type = 'text';
  buscarInput.className = 'view-pacientes__buscar';
  buscarInput.placeholder = 'Buscar por nombre o DNI...';
  buscarInput.addEventListener('input', () => renderTable());
  wrapper.appendChild(buscarInput);

  const nuevoButton = document.createElement('button');
  nuevoButton.type = 'button';
  nuevoButton.className = 'button button--primary view-pacientes__nuevo';
  nuevoButton.textContent = '+ Nuevo paciente';
  nuevoButton.addEventListener('click', () => showForm(null));
  wrapper.appendChild(nuevoButton);

  const formContainer = document.createElement('div');
  formContainer.className = 'view-pacientes__form-container';
  wrapper.appendChild(formContainer);

  const table = document.createElement('table');
  table.className = 'view-pacientes__table';
  wrapper.appendChild(table);

  container.appendChild(wrapper);

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.hidden = true;
  }

  async function loadPacientes() {
    const result = await apiGet('listarFichasPacientes', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    clearError();
    pacientes = result.pacientes;
    renderTable();
  }

  function renderTable() {
    const texto = buscarInput.value.trim().toLowerCase();
    const filtrados = texto
      ? pacientes.filter((p) => p.nombre.toLowerCase().includes(texto) || p.codigo.toLowerCase().includes(texto))
      : pacientes;

    table.innerHTML = '';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>DNI</th><th>Nombre</th><th>Teléfono</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    filtrados.forEach((paciente) => {
      const tr = document.createElement('tr');
      tr.addEventListener('click', () => abrirEdicion(paciente.codigo));

      const tdCodigo = document.createElement('td');
      tdCodigo.textContent = paciente.codigo;
      tr.appendChild(tdCodigo);

      const tdNombre = document.createElement('td');
      tdNombre.textContent = paciente.nombre;
      tr.appendChild(tdNombre);

      const tdTelefono = document.createElement('td');
      tdTelefono.textContent = paciente.telefono;
      tr.appendChild(tdTelefono);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  async function abrirEdicion(codigo) {
    const result = await apiGet('leerFichaPaciente', { token: ctx.session.token, codigo });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    clearError();
    showForm(result.paciente);
  }

  function showForm(paciente) {
    formContainer.innerHTML = '';

    const form = document.createElement('form');
    form.className = 'view-pacientes__form';

    const codigoLabel = document.createElement('label');
    codigoLabel.textContent = 'DNI (código de acceso)';
    const codigoInput = document.createElement('input');
    codigoInput.type = 'text';
    codigoInput.value = paciente ? paciente.codigo : '';
    codigoInput.disabled = !!paciente;
    codigoLabel.appendChild(codigoInput);
    form.appendChild(codigoLabel);

    const nombreLabel = document.createElement('label');
    nombreLabel.textContent = 'Nombre completo';
    const nombreInput = document.createElement('input');
    nombreInput.type = 'text';
    nombreInput.value = paciente ? paciente.nombre : '';
    nombreLabel.appendChild(nombreInput);
    form.appendChild(nombreLabel);

    const fechaNacimientoLabel = document.createElement('label');
    fechaNacimientoLabel.textContent = 'Fecha de nacimiento';
    const fechaNacimientoInput = document.createElement('input');
    fechaNacimientoInput.type = 'date';
    fechaNacimientoInput.value = paciente ? paciente.fechaNacimiento : '';
    fechaNacimientoLabel.appendChild(fechaNacimientoInput);
    form.appendChild(fechaNacimientoLabel);

    const sexoLabel = document.createElement('label');
    sexoLabel.textContent = 'Sexo';
    const sexoSelect = document.createElement('select');
    SEXOS.forEach((sexo) => {
      const option = document.createElement('option');
      option.value = sexo;
      option.textContent = sexo || '(sin especificar)';
      if (paciente && paciente.sexo === sexo) option.selected = true;
      sexoSelect.appendChild(option);
    });
    sexoLabel.appendChild(sexoSelect);
    form.appendChild(sexoLabel);

    const telefonoLabel = document.createElement('label');
    telefonoLabel.textContent = 'Teléfono';
    const telefonoInput = document.createElement('input');
    telefonoInput.type = 'text';
    telefonoInput.value = paciente ? paciente.telefono : '';
    telefonoLabel.appendChild(telefonoInput);
    form.appendChild(telefonoLabel);

    const emailLabel = document.createElement('label');
    emailLabel.textContent = 'Correo electrónico';
    const emailInput = document.createElement('input');
    emailInput.type = 'text';
    emailInput.value = paciente ? paciente.email : '';
    emailLabel.appendChild(emailInput);
    form.appendChild(emailLabel);

    const contactoNombreLabel = document.createElement('label');
    contactoNombreLabel.textContent = 'Contacto de emergencia: nombre';
    const contactoNombreInput = document.createElement('input');
    contactoNombreInput.type = 'text';
    contactoNombreInput.value = paciente ? paciente.contactoEmergenciaNombre : '';
    contactoNombreLabel.appendChild(contactoNombreInput);
    form.appendChild(contactoNombreLabel);

    const contactoTelefonoLabel = document.createElement('label');
    contactoTelefonoLabel.textContent = 'Contacto de emergencia: teléfono';
    const contactoTelefonoInput = document.createElement('input');
    contactoTelefonoInput.type = 'text';
    contactoTelefonoInput.value = paciente ? paciente.contactoEmergenciaTelefono : '';
    contactoTelefonoLabel.appendChild(contactoTelefonoInput);
    form.appendChild(contactoTelefonoLabel);

    const formError = document.createElement('div');
    formError.className = 'view-pacientes__form-error';
    formError.hidden = true;
    form.appendChild(formError);

    const formSuccess = document.createElement('div');
    formSuccess.className = 'view-pacientes__form-success';
    formSuccess.hidden = true;
    form.appendChild(formSuccess);

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'button button--primary';
    saveButton.textContent = 'Guardar';
    form.appendChild(saveButton);

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancelar';
    cancelButton.addEventListener('click', () => {
      formContainer.innerHTML = '';
    });
    form.appendChild(cancelButton);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      formError.hidden = true;
      formSuccess.hidden = true;

      const codigo = codigoInput.value.trim();
      const nombre = nombreInput.value.trim();
      if (!codigo || !nombre) {
        formError.textContent = 'codigo y nombre son requeridos';
        formError.hidden = false;
        return;
      }

      const body = {
        accion: paciente ? 'actualizarPaciente' : 'crearPaciente',
        token: ctx.session.token,
        codigo,
        nombre,
        fechaNacimiento: fechaNacimientoInput.value,
        sexo: sexoSelect.value,
        telefono: telefonoInput.value.trim(),
        email: emailInput.value.trim(),
        contactoEmergenciaNombre: contactoNombreInput.value.trim(),
        contactoEmergenciaTelefono: contactoTelefonoInput.value.trim(),
      };

      const result = await apiPost(body);
      if (result.error) {
        if (handleAuthError(result)) return;
        formError.textContent = result.error;
        formError.hidden = false;
        return;
      }

      if (!paciente) {
        formSuccess.textContent = `Paciente creado. Su cuenta de acceso quedó creada con contraseña inicial igual a su DNI (${codigo}); deberá cambiarla en su primer ingreso.`;
        formSuccess.hidden = false;
      } else {
        formContainer.innerHTML = '';
      }
      await loadPacientes();
    });

    formContainer.appendChild(form);
  }

  loadPacientes();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/portal/views/pacientes.test.js`
Expected: PASS — all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/portal/views/pacientes.js tests/portal/views/pacientes.test.js
git commit -m "feat(portal): add Pacientes view (list, search, create/edit)"
```

---

### Task 6: Dashboard menu and view registration

**Files:**
- Modify: `src/portal/dashboard.js`
- Test: `tests/portal/dashboard.test.js`

- [ ] **Step 1: Write the failing test**

In `tests/portal/dashboard.test.js`, add a new import after line 8 (`initMiAgendaView` import):

```js
import { initPacientesView } from '../../src/portal/views/pacientes.js';
```

Add a new `vi.mock` after line 14 (the `mi-agenda.js` mock):

```js
vi.mock('../../src/portal/views/pacientes.js', () => ({ initPacientesView: vi.fn() }));
```

Then add a new test after the `'cambia a la vista agenda al hacer click en el item Agenda para administrador'` test (lines 117-127), before `'cambia a la vista mi-agenda al hacer click en el item Mi agenda para usuario'`:

```js
  it('cambia a la vista pacientes al hacer click en el item Pacientes para administrador', () => {
    setSession(ADMIN_SESSION);

    initDashboard();
    document.querySelector('#nav-menu .dashboard-nav__item[data-view="pacientes"]').click();

    expect(initPacientesView).toHaveBeenCalledWith(document.getElementById('dashboard-main'), {
      session: ADMIN_SESSION,
      forced: false,
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/portal/dashboard.test.js`
Expected: FAIL — the new "cambia a la vista pacientes..." test fails with a TypeError (`Cannot read properties of null (reading 'click')`), because `MENUS.administrador` does not yet have a `pacientes` item, so `document.querySelector('#nav-menu .dashboard-nav__item[data-view="pacientes"]')` returns `null`. All 12 existing tests still pass (the parametrized "menu por rol" tests iterate over the current `MENUS`, which hasn't changed yet).

- [ ] **Step 3: Write minimal implementation**

In `src/portal/dashboard.js`, add a new import after line 8 (`initMiAgendaView` import):

```js
import { initPacientesView } from './views/pacientes.js';
```

Add `{ id: 'pacientes', label: 'Pacientes', enabled: true }` right after the `'agenda'` item in `MENUS.administrador`, `MENUS.psiquiatra`, and `MENUS.recepcion`:

```js
export const MENUS = {
  administrador: [
    { id: 'usuarios', label: 'Gestión de usuarios', enabled: true },
    { id: 'agenda', label: 'Agenda', enabled: true },
    { id: 'pacientes', label: 'Pacientes', enabled: true },
    { id: 'historia-clinica', label: 'Historia Clínica', enabled: false },
    { id: 'prescripciones', label: 'Prescripciones', enabled: false },
    { id: 'escalas', label: 'Escalas', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
  psiquiatra: [
    { id: 'agenda', label: 'Agenda', enabled: true },
    { id: 'pacientes', label: 'Pacientes', enabled: true },
    { id: 'historia-clinica', label: 'Historia Clínica', enabled: false },
    { id: 'prescripciones', label: 'Prescripciones', enabled: false },
    { id: 'escalas', label: 'Escalas', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
  recepcion: [
    { id: 'agenda', label: 'Agenda', enabled: true },
    { id: 'pacientes', label: 'Pacientes', enabled: true },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
  usuario: [
    { id: 'mi-agenda', label: 'Mi agenda', enabled: true },
    { id: 'mis-escalas', label: 'Mis escalas', enabled: false },
    { id: 'mis-actividades', label: 'Mis actividades', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
};
```

Add `pacientes: initPacientesView` to `VIEWS`:

```js
export const VIEWS = {
  inicio: initInicioView,
  usuarios: initUsuariosView,
  'cambiar-password': initCambiarPasswordView,
  agenda: initAgendaView,
  'mi-agenda': initMiAgendaView,
  pacientes: initPacientesView,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/portal/dashboard.test.js`
Expected: PASS — all 13 tests pass (12 existing + 1 new). The parametrized "menu por rol" tests now also validate the new `pacientes` item for administrador, psiquiatra, and recepcion.

Then run the full suite: `npx vitest run`
Expected: PASS — 25 test files, 296 tests, 0 failures (261 existing + 18 in `backend/tests/pacientes.test.js` + 8 in `backend/tests/router.test.js` + 8 in `tests/portal/views/pacientes.test.js` + 1 in `tests/portal/dashboard.test.js`).

- [ ] **Step 5: Commit**

```bash
git add src/portal/dashboard.js tests/portal/dashboard.test.js
git commit -m "feat(portal): add Pacientes to dashboard menu and view registry"
```

---

### Deployment note (not a code task)

Per the spec's "Checklist de despliegue": before this feature works against the real Google Spreadsheet, add a new sheet named `_pacientes` with this header row (in order):

```
codigo, fechaNacimiento, sexo, telefono, email, contactoEmergenciaNombre, contactoEmergenciaTelefono, fechaAlta, creadoPor
```

This is a manual one-time step in the production Spreadsheet (not part of the automated test suite) and can happen any time before deploying this feature.
