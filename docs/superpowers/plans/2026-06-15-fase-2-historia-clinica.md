# Historia Clínica — Notas de Evolución y Antecedentes Médicos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Historia Clínica" module restricted to the `psiquiatra` role, covering encrypted patient medical history (antecedentes) and an append-only log of evolution notes (notas de evolución).

**Architecture:** A new backend module `backend/src/historia-clinica.js` exposes four functions (`leerAntecedentes`, `actualizarAntecedentes`, `crearNotaEvolucion`, `listarNotasEvolucion`) that read/write two new sheets (`_antecedentes`, `_notas_evolucion`), encrypting sensitive free-text fields with the existing AES helpers. The router (`backend/src/router.js`) wires these behind a new `ROLES_HISTORIA_CLINICA = ['psiquiatra']` guard. The portal gets a new view `src/portal/views/historia-clinica.js` with a two-level UI (patient list → patient record with antecedentes form + notas de evolución list/form), wired into the dashboard menu for `psiquiatra` only (removed from `administrador`).

**Tech Stack:** Google Apps Script backend (mocked via `backend/mocks/gas-services.js`), Vitest for tests, vanilla JS/DOM for the portal frontend.

**Reference spec:** `docs/superpowers/specs/2026-06-15-fase-2-historia-clinica-design.md`

**Baseline before this plan:** 25 test files, 296 tests, 0 failures (`npx vitest run` from repo root).

---

### Task 1: `leerAntecedentes` y `actualizarAntecedentes`

**Files:**
- Create: `backend/src/historia-clinica.js`
- Create: `backend/tests/historia-clinica.test.js`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/historia-clinica.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { encrypt_, decrypt_ } from '../src/aes.js';
import { leerAntecedentes, actualizarAntecedentes } from '../src/historia-clinica.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const ANTECEDENTES_HEADER = ['codigo', 'antecedentesPersonales', 'antecedentesPsiquiatricos', 'antecedentesFamiliares', 'alergias', 'medicacionActual', 'fechaActualizacion', 'actualizadoPor'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];
const AES_KEY = '000102030405060708090a0b0c0d0e0f';

const PSIQUIATRA = { codigo: 'PSI001', rol: 'psiquiatra' };

function buildServices({ usuarios = [], antecedentes = [] } = {}) {
  return createMockServices({
    sheets: {
      _usuarios: [USUARIOS_HEADER, ...usuarios],
      _antecedentes: [ANTECEDENTES_HEADER, ...antecedentes],
      _log: [LOG_HEADER],
    },
    properties: { AES_KEY },
  });
}

describe('leerAntecedentes', () => {
  it('devuelve los antecedentes descifrados para un paciente con fila existente', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    services.SpreadsheetApp._sheets['_antecedentes'].push([
      '45678912',
      encrypt_('Hipertension', services),
      encrypt_('Trastorno de ansiedad', services),
      encrypt_('Madre con depresion', services),
      encrypt_('Penicilina', services),
      encrypt_('Sertralina 50mg', services),
      '2026-06-01T10:00:00.000Z',
      'PSI001',
    ]);

    const result = leerAntecedentes('45678912', services);

    expect(result).toEqual({
      ok: true,
      antecedentes: {
        codigo: '45678912',
        antecedentesPersonales: 'Hipertension',
        antecedentesPsiquiatricos: 'Trastorno de ansiedad',
        antecedentesFamiliares: 'Madre con depresion',
        alergias: 'Penicilina',
        medicacionActual: 'Sertralina 50mg',
        fechaActualizacion: '2026-06-01T10:00:00.000Z',
      },
    });
  });

  it('devuelve campos vacios si el paciente no tiene fila en _antecedentes', () => {
    const services = buildServices({ usuarios: [['78945612', 'h', 's', 'usuario', 'Carlos Ruiz']] });

    const result = leerAntecedentes('78945612', services);

    expect(result).toEqual({
      ok: true,
      antecedentes: {
        codigo: '78945612',
        antecedentesPersonales: '',
        antecedentesPsiquiatricos: '',
        antecedentesFamiliares: '',
        alergias: '',
        medicacionActual: '',
        fechaActualizacion: '',
      },
    });
  });

  it('devuelve error si el codigo no existe como paciente', () => {
    const services = buildServices();
    expect(leerAntecedentes('NOPE', services)).toEqual({ error: 'Paciente no encontrado' });
  });

  it('devuelve error si el codigo existe pero no tiene rol usuario', () => {
    const services = buildServices({ usuarios: [['PSI002', 'h', 's', 'psiquiatra', 'Otro Psiquiatra']] });
    expect(leerAntecedentes('PSI002', services)).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza si falta la hoja _antecedentes', () => {
    const services = createMockServices({
      sheets: {
        _usuarios: [USUARIOS_HEADER, ['45678912', 'h', 's', 'usuario', 'Maria Lopez']],
        _log: [LOG_HEADER],
      },
      properties: { AES_KEY },
    });
    expect(leerAntecedentes('45678912', services)).toEqual({ error: 'Hoja de antecedentes no encontrada' });
  });
});

describe('actualizarAntecedentes', () => {
  it('crea una fila nueva en _antecedentes cifrando los campos', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });

    const result = actualizarAntecedentes({
      codigo: '45678912',
      antecedentesPersonales: 'Hipertension',
      antecedentesPsiquiatricos: 'Trastorno de ansiedad',
      antecedentesFamiliares: 'Madre con depresion',
      alergias: 'Penicilina',
      medicacionActual: 'Sertralina 50mg',
    }, PSIQUIATRA, services);

    expect(result).toEqual({ ok: true });

    const row = services.SpreadsheetApp._sheets['_antecedentes'][1];
    expect(row[0]).toBe('45678912');
    expect(decrypt_(row[1], services)).toBe('Hipertension');
    expect(decrypt_(row[2], services)).toBe('Trastorno de ansiedad');
    expect(decrypt_(row[3], services)).toBe('Madre con depresion');
    expect(decrypt_(row[4], services)).toBe('Penicilina');
    expect(decrypt_(row[5], services)).toBe('Sertralina 50mg');
    expect(row[6]).toBeInstanceOf(Date);
    expect(row[7]).toBe('PSI001');
  });

  it('hace upsert sobre una fila existente sin duplicarla', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    services.SpreadsheetApp._sheets['_antecedentes'].push([
      '45678912',
      encrypt_('Antiguo', services),
      encrypt_('Antiguo', services),
      encrypt_('Antiguo', services),
      encrypt_('Antiguo', services),
      encrypt_('Antiguo', services),
      '2026-01-01T00:00:00.000Z',
      'PSI002',
    ]);

    const result = actualizarAntecedentes({
      codigo: '45678912',
      antecedentesPersonales: 'Hipertension',
      antecedentesPsiquiatricos: '',
      antecedentesFamiliares: '',
      alergias: '',
      medicacionActual: '',
    }, PSIQUIATRA, services);

    expect(result).toEqual({ ok: true });
    expect(services.SpreadsheetApp._sheets['_antecedentes']).toHaveLength(2); // header + 1 fila
    const row = services.SpreadsheetApp._sheets['_antecedentes'][1];
    expect(decrypt_(row[1], services)).toBe('Hipertension');
    expect(row[7]).toBe('PSI001');
  });

  it('cifra los campos aunque vengan vacios', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });

    actualizarAntecedentes({
      codigo: '45678912',
      antecedentesPersonales: '',
      antecedentesPsiquiatricos: '',
      antecedentesFamiliares: '',
      alergias: '',
      medicacionActual: '',
    }, PSIQUIATRA, services);

    const row = services.SpreadsheetApp._sheets['_antecedentes'][1];
    expect(row[1]).not.toBe('');
    expect(decrypt_(row[1], services)).toBe('');
  });

  it('devuelve error si el codigo no existe como paciente', () => {
    const services = buildServices();
    const result = actualizarAntecedentes({ codigo: 'NOPE' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza si falta la hoja _antecedentes', () => {
    const services = createMockServices({
      sheets: {
        _usuarios: [USUARIOS_HEADER, ['45678912', 'h', 's', 'usuario', 'Maria Lopez']],
        _log: [LOG_HEADER],
      },
      properties: { AES_KEY },
    });
    const result = actualizarAntecedentes({ codigo: '45678912' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'Hoja de antecedentes no encontrada' });
  });

  it('registra antecedentes_actualizados en _log', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });

    actualizarAntecedentes({ codigo: '45678912' }, PSIQUIATRA, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'antecedentes_actualizados');
    expect(logEntry).toBeDefined();
    expect(logEntry[1]).toBe('PSI001');
    expect(logEntry[2]).toBe('psiquiatra');
    expect(logEntry[4]).toBe('45678912');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run backend/tests/historia-clinica.test.js`
Expected: FAIL — `backend/src/historia-clinica.js` does not exist (`Cannot find module`).

- [ ] **Step 3: Write the implementation**

Create `backend/src/historia-clinica.js`:

```js
import { encrypt_, decrypt_ } from './aes.js';
import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const SHEET_ANTECEDENTES = '_antecedentes';

function findAntecedentesRow(codigo, sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const rows = sheet.getRange(2, 1, last - 1, 8).getValues();
  const needle = String(codigo).trim().toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === needle) {
      return { fila: i + 2, row: rows[i] };
    }
  }
  return null;
}

function validarPaciente(codigo, services) {
  const usuario = findUser(codigo, services);
  if (!usuario || usuario.rol !== 'usuario') return null;
  return usuario;
}

export function leerAntecedentes(codigo, services) {
  const usuario = validarPaciente(codigo, services);
  if (!usuario) return { error: 'Paciente no encontrado' };

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ANTECEDENTES);
  if (!sheet) return { error: 'Hoja de antecedentes no encontrada' };

  const antecedentesRow = findAntecedentesRow(usuario.codigo, sheet);
  if (!antecedentesRow) {
    return {
      ok: true,
      antecedentes: {
        codigo: usuario.codigo,
        antecedentesPersonales: '',
        antecedentesPsiquiatricos: '',
        antecedentesFamiliares: '',
        alergias: '',
        medicacionActual: '',
        fechaActualizacion: '',
      },
    };
  }

  const row = antecedentesRow.row;
  return {
    ok: true,
    antecedentes: {
      codigo: usuario.codigo,
      antecedentesPersonales: decrypt_(row[1], services),
      antecedentesPsiquiatricos: decrypt_(row[2], services),
      antecedentesFamiliares: decrypt_(row[3], services),
      alergias: decrypt_(row[4], services),
      medicacionActual: decrypt_(row[5], services),
      fechaActualizacion: String(row[6]),
    },
  };
}

export function actualizarAntecedentes(b, user, services) {
  const codigo = String(b.codigo || '').trim();
  const usuario = validarPaciente(codigo, services);
  if (!usuario) return { error: 'Paciente no encontrado' };

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ANTECEDENTES);
  if (!sheet) return { error: 'Hoja de antecedentes no encontrada' };

  const antecedentesPersonales = encrypt_(String(b.antecedentesPersonales || ''), services);
  const antecedentesPsiquiatricos = encrypt_(String(b.antecedentesPsiquiatricos || ''), services);
  const antecedentesFamiliares = encrypt_(String(b.antecedentesFamiliares || ''), services);
  const alergias = encrypt_(String(b.alergias || ''), services);
  const medicacionActual = encrypt_(String(b.medicacionActual || ''), services);
  const valores = [antecedentesPersonales, antecedentesPsiquiatricos, antecedentesFamiliares, alergias, medicacionActual, new Date(), user.codigo];

  const antecedentesRow = findAntecedentesRow(usuario.codigo, sheet);
  if (antecedentesRow) {
    sheet.getRange(antecedentesRow.fila, 2, 1, 7).setValues([valores]);
  } else {
    sheet.appendRow([usuario.codigo, ...valores]);
  }

  registrarLog(services, user.codigo, user.rol, 'antecedentes_actualizados', usuario.codigo);

  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run backend/tests/historia-clinica.test.js`
Expected: PASS — 11 tests passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/historia-clinica.js backend/tests/historia-clinica.test.js
git commit -m "feat(historia-clinica): add leerAntecedentes y actualizarAntecedentes"
```

---

### Task 2: `crearNotaEvolucion` y `listarNotasEvolucion`

**Files:**
- Modify: `backend/src/historia-clinica.js`
- Modify: `backend/tests/historia-clinica.test.js`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/historia-clinica.test.js`, update the import line at the top of the file from:

```js
import { leerAntecedentes, actualizarAntecedentes } from '../src/historia-clinica.js';
```

to:

```js
import { leerAntecedentes, actualizarAntecedentes, crearNotaEvolucion, listarNotasEvolucion } from '../src/historia-clinica.js';
```

Add a new constant right after `ANTECEDENTES_HEADER`:

```js
const NOTAS_HEADER = ['id', 'pacienteCodigo', 'fecha', 'motivoConsulta', 'notas', 'diagnostico', 'creadoPor', 'fechaCreacion'];
```

Replace the `buildServices` helper with this version that also seeds `_notas_evolucion`:

```js
function buildServices({ usuarios = [], antecedentes = [], notas = [] } = {}) {
  return createMockServices({
    sheets: {
      _usuarios: [USUARIOS_HEADER, ...usuarios],
      _antecedentes: [ANTECEDENTES_HEADER, ...antecedentes],
      _notas_evolucion: [NOTAS_HEADER, ...notas],
      _log: [LOG_HEADER],
    },
    properties: { AES_KEY },
  });
}
```

Append these two `describe` blocks to the end of the file:

```js
describe('crearNotaEvolucion', () => {
  it('crea una nota de evolucion cifrando motivo, notas y diagnostico', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });

    const result = crearNotaEvolucion({
      codigo: '45678912',
      fecha: '2026-06-15',
      motivoConsulta: 'Control mensual',
      notas: 'Paciente refiere animo estable',
      diagnostico: 'Trastorno depresivo recurrente',
    }, PSIQUIATRA, services);

    expect(result.ok).toBe(true);
    expect(result.nota).toMatchObject({
      pacienteCodigo: '45678912',
      fecha: '2026-06-15',
      motivoConsulta: 'Control mensual',
      notas: 'Paciente refiere animo estable',
      diagnostico: 'Trastorno depresivo recurrente',
      creadoPor: 'PSI001',
    });
    expect(typeof result.nota.id).toBe('string');
    expect(result.nota.fechaCreacion).toBeInstanceOf(Date);

    const row = services.SpreadsheetApp._sheets['_notas_evolucion'][1];
    expect(row[0]).toBe(result.nota.id);
    expect(row[1]).toBe('45678912');
    expect(row[2]).toBe('2026-06-15');
    expect(decrypt_(row[3], services)).toBe('Control mensual');
    expect(decrypt_(row[4], services)).toBe('Paciente refiere animo estable');
    expect(decrypt_(row[5], services)).toBe('Trastorno depresivo recurrente');
    expect(row[6]).toBe('PSI001');
    expect(row[7]).toBeInstanceOf(Date);
  });

  it('permite motivoConsulta y diagnostico vacios', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });

    const result = crearNotaEvolucion({
      codigo: '45678912',
      fecha: '2026-06-15',
      notas: 'Sesion de seguimiento',
    }, PSIQUIATRA, services);

    expect(result.ok).toBe(true);
    expect(result.nota.motivoConsulta).toBe('');
    expect(result.nota.diagnostico).toBe('');

    const row = services.SpreadsheetApp._sheets['_notas_evolucion'][1];
    expect(decrypt_(row[3], services)).toBe('');
    expect(decrypt_(row[5], services)).toBe('');
  });

  it('rechaza si falta codigo', () => {
    const services = buildServices();
    const result = crearNotaEvolucion({ fecha: '2026-06-15', notas: 'texto' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'codigo, fecha y notas son requeridos' });
  });

  it('rechaza si falta fecha', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    const result = crearNotaEvolucion({ codigo: '45678912', notas: 'texto' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'codigo, fecha y notas son requeridos' });
  });

  it('rechaza si falta notas', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    const result = crearNotaEvolucion({ codigo: '45678912', fecha: '2026-06-15', notas: '  ' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'codigo, fecha y notas son requeridos' });
  });

  it('devuelve error si el codigo no existe como paciente', () => {
    const services = buildServices();
    const result = crearNotaEvolucion({ codigo: 'NOPE', fecha: '2026-06-15', notas: 'texto' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza si falta la hoja _notas_evolucion', () => {
    const services = createMockServices({
      sheets: {
        _usuarios: [USUARIOS_HEADER, ['45678912', 'h', 's', 'usuario', 'Maria Lopez']],
        _log: [LOG_HEADER],
      },
      properties: { AES_KEY },
    });
    const result = crearNotaEvolucion({ codigo: '45678912', fecha: '2026-06-15', notas: 'texto' }, PSIQUIATRA, services);
    expect(result).toEqual({ error: 'Hoja de notas de evolución no encontrada' });
  });

  it('registra nota_evolucion_creada en _log', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });

    const result = crearNotaEvolucion({ codigo: '45678912', fecha: '2026-06-15', notas: 'texto' }, PSIQUIATRA, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const logEntry = logRows.find((r) => r[3] === 'nota_evolucion_creada');
    expect(logEntry).toBeDefined();
    expect(logEntry[1]).toBe('PSI001');
    expect(logEntry[2]).toBe('psiquiatra');
    expect(logEntry[4]).toBe(`${result.nota.id} paciente=45678912 2026-06-15`);
  });
});

describe('listarNotasEvolucion', () => {
  it('devuelve las notas ordenadas por fecha descendente', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    const notasSheet = services.SpreadsheetApp._sheets['_notas_evolucion'];
    notasSheet.push(['n1', '45678912', '2026-06-01', encrypt_('Motivo 1', services), encrypt_('Primera', services), encrypt_('Diagnostico 1', services), 'PSI001', new Date('2026-06-01T10:00:00Z')]);
    notasSheet.push(['n2', '45678912', '2026-06-10', encrypt_('Motivo 2', services), encrypt_('Segunda', services), encrypt_('Diagnostico 2', services), 'PSI001', new Date('2026-06-10T10:00:00Z')]);

    const result = listarNotasEvolucion('45678912', services);

    expect(result.ok).toBe(true);
    expect(result.notas).toEqual([
      { id: 'n2', fecha: '2026-06-10', motivoConsulta: 'Motivo 2', notas: 'Segunda', diagnostico: 'Diagnostico 2', creadoPor: 'PSI001', fechaCreacion: new Date('2026-06-10T10:00:00Z') },
      { id: 'n1', fecha: '2026-06-01', motivoConsulta: 'Motivo 1', notas: 'Primera', diagnostico: 'Diagnostico 1', creadoPor: 'PSI001', fechaCreacion: new Date('2026-06-01T10:00:00Z') },
    ]);
  });

  it('usa fechaCreacion como criterio de desempate cuando la fecha es igual', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    const notasSheet = services.SpreadsheetApp._sheets['_notas_evolucion'];
    notasSheet.push(['n1', '45678912', '2026-06-01', encrypt_('', services), encrypt_('Primera', services), encrypt_('', services), 'PSI001', new Date('2026-06-01T08:00:00Z')]);
    notasSheet.push(['n2', '45678912', '2026-06-01', encrypt_('', services), encrypt_('Segunda', services), encrypt_('', services), 'PSI001', new Date('2026-06-01T10:00:00Z')]);

    const result = listarNotasEvolucion('45678912', services);

    expect(result.notas.map((n) => n.notas)).toEqual(['Segunda', 'Primera']);
  });

  it('devuelve notas vacio si el paciente no tiene notas', () => {
    const services = buildServices({ usuarios: [['45678912', 'h', 's', 'usuario', 'Maria Lopez']] });
    expect(listarNotasEvolucion('45678912', services)).toEqual({ ok: true, notas: [] });
  });

  it('filtra las notas por paciente', () => {
    const services = buildServices({
      usuarios: [
        ['45678912', 'h', 's', 'usuario', 'Maria Lopez'],
        ['78945612', 'h', 's', 'usuario', 'Carlos Ruiz'],
      ],
    });
    const notasSheet = services.SpreadsheetApp._sheets['_notas_evolucion'];
    notasSheet.push(['n1', '45678912', '2026-06-01', encrypt_('', services), encrypt_('De Maria', services), encrypt_('', services), 'PSI001', new Date()]);
    notasSheet.push(['n2', '78945612', '2026-06-02', encrypt_('', services), encrypt_('De Carlos', services), encrypt_('', services), 'PSI001', new Date()]);

    const result = listarNotasEvolucion('45678912', services);

    expect(result.notas).toHaveLength(1);
    expect(result.notas[0].notas).toBe('De Maria');
  });

  it('devuelve error si el codigo no existe como paciente', () => {
    const services = buildServices();
    expect(listarNotasEvolucion('NOPE', services)).toEqual({ error: 'Paciente no encontrado' });
  });

  it('rechaza si falta la hoja _notas_evolucion', () => {
    const services = createMockServices({
      sheets: {
        _usuarios: [USUARIOS_HEADER, ['45678912', 'h', 's', 'usuario', 'Maria Lopez']],
        _log: [LOG_HEADER],
      },
      properties: { AES_KEY },
    });
    expect(listarNotasEvolucion('45678912', services)).toEqual({ error: 'Hoja de notas de evolución no encontrada' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run backend/tests/historia-clinica.test.js`
Expected: FAIL — `crearNotaEvolucion`/`listarNotasEvolucion` are not exported by `backend/src/historia-clinica.js`.

- [ ] **Step 3: Write the implementation**

In `backend/src/historia-clinica.js`, add a new constant after `SHEET_ANTECEDENTES`:

```js
const SHEET_NOTAS = '_notas_evolucion';
```

Append these two functions at the end of the file:

```js
export function crearNotaEvolucion(b, user, services) {
  const codigo = String(b.codigo || '').trim();
  const fecha = String(b.fecha || '').trim();
  const notas = String(b.notas || '').trim();
  if (!codigo || !fecha || !notas) return { error: 'codigo, fecha y notas son requeridos' };

  const usuario = validarPaciente(codigo, services);
  if (!usuario) return { error: 'Paciente no encontrado' };

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTAS);
  if (!sheet) return { error: 'Hoja de notas de evolución no encontrada' };

  const motivoConsulta = String(b.motivoConsulta || '').trim();
  const diagnostico = String(b.diagnostico || '').trim();

  const id = services.Utilities.getUuid();
  const fechaCreacion = new Date();

  sheet.appendRow([
    id,
    usuario.codigo,
    fecha,
    encrypt_(motivoConsulta, services),
    encrypt_(notas, services),
    encrypt_(diagnostico, services),
    user.codigo,
    fechaCreacion,
  ]);

  registrarLog(services, user.codigo, user.rol, 'nota_evolucion_creada', `${id} paciente=${usuario.codigo} ${fecha}`);

  return {
    ok: true,
    nota: { id, pacienteCodigo: usuario.codigo, fecha, motivoConsulta, notas, diagnostico, creadoPor: user.codigo, fechaCreacion },
  };
}

export function listarNotasEvolucion(codigo, services) {
  const usuario = validarPaciente(codigo, services);
  if (!usuario) return { error: 'Paciente no encontrado' };

  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTAS);
  if (!sheet) return { error: 'Hoja de notas de evolución no encontrada' };

  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 8).getValues();

  const notas = rows
    .filter((row) => String(row[1]).trim().toLowerCase() === usuario.codigo.toLowerCase())
    .map((row) => ({
      id: String(row[0]),
      fecha: String(row[2]),
      motivoConsulta: decrypt_(row[3], services),
      notas: decrypt_(row[4], services),
      diagnostico: decrypt_(row[5], services),
      creadoPor: String(row[6]),
      fechaCreacion: row[7],
    }))
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
      return new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime();
    });

  return { ok: true, notas };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run backend/tests/historia-clinica.test.js`
Expected: PASS — 25 tests passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/historia-clinica.js backend/tests/historia-clinica.test.js
git commit -m "feat(historia-clinica): add crearNotaEvolucion y listarNotasEvolucion"
```

---

### Task 3: Router wiring

**Files:**
- Modify: `backend/src/router.js`
- Modify: `backend/tests/router.test.js`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/router.test.js`, add new constants right after `PACIENTES_HEADER`:

```js
const ANTECEDENTES_HEADER = ['codigo', 'antecedentesPersonales', 'antecedentesPsiquiatricos', 'antecedentesFamiliares', 'alergias', 'medicacionActual', 'fechaActualizacion', 'actualizadoPor'];
const NOTAS_HEADER = ['id', 'pacienteCodigo', 'fecha', 'motivoConsulta', 'notas', 'diagnostico', 'creadoPor', 'fechaCreacion'];
const AES_KEY = '000102030405060708090a0b0c0d0e0f';
```

Append these tests to the end of the `describe('handleGet', ...)` block (immediately before its closing `});` on line 221):

```js
  it('leerAntecedentes requiere rol psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin',
      extraSheets: { _antecedentes: [ANTECEDENTES_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerAntecedentes', token, codigo: '45678912' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('leerAntecedentes devuelve los antecedentes para psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'PSI001', password: 'secreta123', rol: 'psiquiatra', nombre: 'Dra. Petra',
      extraSheets: { _antecedentes: [ANTECEDENTES_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'PSI001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'leerAntecedentes', token, codigo: '45678912' } }, services);
    expect(bodyOf(result)).toEqual({
      ok: true,
      antecedentes: {
        codigo: '45678912', antecedentesPersonales: '', antecedentesPsiquiatricos: '',
        antecedentesFamiliares: '', alergias: '', medicacionActual: '', fechaActualizacion: '',
      },
    });
  });

  it('listarNotasEvolucion requiere rol psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin',
      extraSheets: { _notas_evolucion: [NOTAS_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarNotasEvolucion', token, codigo: '45678912' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('listarNotasEvolucion devuelve las notas para psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'PSI001', password: 'secreta123', rol: 'psiquiatra', nombre: 'Dra. Petra',
      extraSheets: { _notas_evolucion: [NOTAS_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'PSI001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarNotasEvolucion', token, codigo: '45678912' } }, services);
    expect(bodyOf(result)).toEqual({ ok: true, notas: [] });
  });
```

Append these tests to the end of the `describe('handlePost', ...)` block (immediately before its closing `});` on line 510):

```js
  it('actualizarAntecedentes requiere rol psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin',
      extraSheets: { _antecedentes: [ANTECEDENTES_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'actualizarAntecedentes', token, codigo: '45678912' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('actualizarAntecedentes actualiza los antecedentes para psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'PSI001', password: 'secreta123', rol: 'psiquiatra', nombre: 'Dra. Petra',
      extraSheets: { _antecedentes: [ANTECEDENTES_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    services.PropertiesService.getScriptProperties().setProperty('AES_KEY', AES_KEY);
    const token = loginToken(services, 'PSI001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({
        accion: 'actualizarAntecedentes', token, codigo: '45678912',
        antecedentesPersonales: 'Hipertension', alergias: 'Penicilina',
      }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });

  it('crearNotaEvolucion requiere rol psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin',
      extraSheets: { _notas_evolucion: [NOTAS_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearNotaEvolucion', token, codigo: '45678912', fecha: '2026-06-15', notas: 'texto' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('crearNotaEvolucion crea una nota para psiquiatra', () => {
    const services = buildServicesWithUser({
      codigo: 'PSI001', password: 'secreta123', rol: 'psiquiatra', nombre: 'Dra. Petra',
      extraSheets: { _notas_evolucion: [NOTAS_HEADER] },
    });
    services.SpreadsheetApp._sheets['_usuarios'].push(['45678912', 'hash', 'salt', 'usuario', 'Maria Lopez']);
    services.PropertiesService.getScriptProperties().setProperty('AES_KEY', AES_KEY);
    const token = loginToken(services, 'PSI001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'crearNotaEvolucion', token, codigo: '45678912', fecha: '2026-06-15', notas: 'Paciente estable' }) } },
      services
    );
    const body = bodyOf(result);
    expect(body.ok).toBe(true);
    expect(body.nota).toMatchObject({ pacienteCodigo: '45678912', fecha: '2026-06-15', notas: 'Paciente estable' });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run backend/tests/router.test.js`
Expected: FAIL — all 8 new tests fail with `{ error: 'Accion no reconocida' }` instead of the expected results, because `router.js` doesn't yet recognize these `accion` values.

- [ ] **Step 3: Write the implementation**

In `backend/src/router.js`, locate the import line for `pacientes.js`:

```js
import { crearPaciente, actualizarPaciente, leerFichaPaciente, listarFichasPacientes } from './pacientes.js';
```

Add a new import line right after it (no change needed to the line above):

```js
import { leerAntecedentes, actualizarAntecedentes, crearNotaEvolucion, listarNotasEvolucion } from './historia-clinica.js';
```

Add a new constant right after `ROLES_PACIENTES`:

```js
const ROLES_HISTORIA_CLINICA = ['psiquiatra'];
```

In `handleGet`, add these two cases right after the `listarFichasPacientes` case (before `default:`):

```js
    case 'leerAntecedentes':
      return json_(
        requireAuth(p, ROLES_HISTORIA_CLINICA, () => leerAntecedentes(p.codigo, services), services),
        services
      );

    case 'listarNotasEvolucion':
      return json_(
        requireAuth(p, ROLES_HISTORIA_CLINICA, () => listarNotasEvolucion(p.codigo, services), services),
        services
      );
```

In `handlePost`, add these two cases right after the `actualizarPaciente` case (before `default:`):

```js
    case 'actualizarAntecedentes':
      return json_(
        requireAuthBody(b.token, ROLES_HISTORIA_CLINICA, (user) => actualizarAntecedentes(b, user, services), services),
        services
      );

    case 'crearNotaEvolucion':
      return json_(
        requireAuthBody(b.token, ROLES_HISTORIA_CLINICA, (user) => crearNotaEvolucion(b, user, services), services),
        services
      );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run backend/tests/router.test.js`
Expected: PASS — 49 tests passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/router.js backend/tests/router.test.js
git commit -m "feat(router): wire historia clinica endpoints for psiquiatra"
```

---

### Task 4: Vista Historia Clínica

**Files:**
- Create: `src/portal/views/historia-clinica.js`
- Create: `tests/portal/views/historia-clinica.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/portal/views/historia-clinica.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiGet, apiPost } from '../../../src/portal/api.js';
import { initHistoriaClinicaView } from '../../../src/portal/views/historia-clinica.js';
import { setSession, getSession } from '../../../src/portal/session.js';

vi.mock('../../../src/portal/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const SESSION = { token: 'psi-tok', codigo: 'PSI001', rol: 'psiquiatra', nombre: 'Dra. Petra', debeCambiarPassword: false };

const PACIENTES = [
  { codigo: '45678912', nombre: 'Maria Lopez', telefono: '987654321', email: 'maria@example.com' },
  { codigo: '78945612', nombre: 'Carlos Ruiz', telefono: '912345678', email: '' },
];

const ANTECEDENTES_MARIA = {
  codigo: '45678912',
  antecedentesPersonales: 'Hipertension',
  antecedentesPsiquiatricos: 'Trastorno de ansiedad',
  antecedentesFamiliares: 'Madre con depresion',
  alergias: 'Penicilina',
  medicacionActual: 'Sertralina 50mg',
  fechaActualizacion: '2026-06-01T10:00:00.000Z',
};

const NOTAS_MARIA = [
  { id: 'n2', fecha: '2026-06-10', motivoConsulta: 'Control', notas: 'Segunda nota', diagnostico: 'Estable', creadoPor: 'PSI001', fechaCreacion: new Date('2026-06-10T10:00:00Z') },
  { id: 'n1', fecha: '2026-06-01', motivoConsulta: 'Primera consulta', notas: 'Primera nota', diagnostico: '', creadoPor: 'PSI001', fechaCreacion: new Date('2026-06-01T10:00:00Z') },
];

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('initHistoriaClinicaView', () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
    setSession(SESSION);
    vi.stubGlobal('location', { href: '', search: '' });
    apiGet.mockImplementation((accion) => {
      if (accion === 'listarFichasPacientes') return Promise.resolve({ ok: true, pacientes: PACIENTES });
      if (accion === 'leerAntecedentes') return Promise.resolve({ ok: true, antecedentes: ANTECEDENTES_MARIA });
      if (accion === 'listarNotasEvolucion') return Promise.resolve({ ok: true, notas: NOTAS_MARIA });
      return Promise.resolve({ error: 'Accion no reconocida' });
    });
    apiPost.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('carga y muestra la lista de pacientes', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    expect(apiGet).toHaveBeenCalledWith('listarFichasPacientes', { token: 'psi-tok' });
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('45678912');
    expect(rows[0].textContent).toContain('Maria Lopez');
  });

  it('filtra la lista por nombre o DNI', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    const buscarInput = container.querySelector('.view-historia-clinica__buscar');
    buscarInput.value = 'carlos';
    buscarInput.dispatchEvent(new Event('input'));

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Carlos Ruiz');
  });

  it('abre la ficha de un paciente al hacer click en una fila', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    const rows = container.querySelectorAll('tbody tr');
    rows[0].click();
    await flush();

    expect(apiGet).toHaveBeenCalledWith('leerAntecedentes', { token: 'psi-tok', codigo: '45678912' });
    expect(apiGet).toHaveBeenCalledWith('listarNotasEvolucion', { token: 'psi-tok', codigo: '45678912' });

    expect(container.querySelector('.view-historia-clinica__lista').hidden).toBe(true);
    expect(container.querySelector('.view-historia-clinica__ficha').hidden).toBe(false);
    expect(container.querySelector('.view-historia-clinica__ficha h3').textContent).toContain('Maria Lopez');
  });

  it('precarga el formulario de antecedentes con los datos existentes', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    expect(container.querySelector('.view-historia-clinica__campo-antecedentesPersonales').value).toBe('Hipertension');
    expect(container.querySelector('.view-historia-clinica__campo-alergias').value).toBe('Penicilina');
  });

  it('guarda los antecedentes y muestra mensaje de exito', async () => {
    apiPost.mockResolvedValue({ ok: true });

    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const textarea = container.querySelector('.view-historia-clinica__campo-antecedentesPersonales');
    textarea.value = 'Hipertension controlada';

    const form = container.querySelector('.view-historia-clinica__antecedentes-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(apiPost).toHaveBeenCalledWith({
      accion: 'actualizarAntecedentes',
      token: 'psi-tok',
      codigo: '45678912',
      antecedentesPersonales: 'Hipertension controlada',
      antecedentesPsiquiatricos: 'Trastorno de ansiedad',
      antecedentesFamiliares: 'Madre con depresion',
      alergias: 'Penicilina',
      medicacionActual: 'Sertralina 50mg',
    });

    const success = container.querySelector('.view-historia-clinica__antecedentes-success');
    expect(success.hidden).toBe(false);
  });

  it('muestra el error del backend si falla guardar antecedentes', async () => {
    apiPost.mockResolvedValue({ error: 'Hoja de antecedentes no encontrada' });

    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const form = container.querySelector('.view-historia-clinica__antecedentes-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    const formError = container.querySelector('.view-historia-clinica__antecedentes-error');
    expect(formError.textContent).toBe('Hoja de antecedentes no encontrada');
    expect(formError.hidden).toBe(false);
  });

  it('muestra las notas de evolucion ordenadas, la mas reciente primero', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const items = container.querySelectorAll('.view-historia-clinica__nota');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Segunda nota');
    expect(items[0].textContent).toContain('Control');
    expect(items[1].textContent).toContain('Primera nota');
  });

  it('crea una nueva nota de evolucion y la antepone a la lista', async () => {
    const nuevaNota = { id: 'n3', pacienteCodigo: '45678912', fecha: '2026-06-15', motivoConsulta: 'Seguimiento', notas: 'Tercera nota', diagnostico: 'Mejoria', creadoPor: 'PSI001', fechaCreacion: new Date('2026-06-15T10:00:00Z') };
    apiPost.mockResolvedValue({ ok: true, nota: nuevaNota });

    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const form = container.querySelector('.view-historia-clinica__nota-form');
    form.querySelector('.view-historia-clinica__nota-motivo-input').value = 'Seguimiento';
    form.querySelector('.view-historia-clinica__nota-notas-input').value = 'Tercera nota';
    form.querySelector('.view-historia-clinica__nota-diagnostico-input').value = 'Mejoria';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    expect(apiPost).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'crearNotaEvolucion',
      token: 'psi-tok',
      codigo: '45678912',
      motivoConsulta: 'Seguimiento',
      notas: 'Tercera nota',
      diagnostico: 'Mejoria',
    }));

    const items = container.querySelectorAll('.view-historia-clinica__nota');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('Tercera nota');

    expect(form.querySelector('.view-historia-clinica__nota-notas-input').value).toBe('');
  });

  it('valida que notas no este vacio antes de enviar', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    const form = container.querySelector('.view-historia-clinica__nota-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    const formError = container.querySelector('.view-historia-clinica__nota-form-error');
    expect(formError.textContent).toBe('notas es requerido');
    expect(formError.hidden).toBe(false);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('vuelve a la lista al hacer click en Volver a la lista', async () => {
    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    container.querySelectorAll('tbody tr')[0].click();
    await flush();

    container.querySelector('.view-historia-clinica__volver').click();

    expect(container.querySelector('.view-historia-clinica__lista').hidden).toBe(false);
    expect(container.querySelector('.view-historia-clinica__ficha').hidden).toBe(true);
  });

  it('redirige al login si listarFichasPacientes devuelve No autorizado', async () => {
    apiGet.mockResolvedValue({ error: 'No autorizado' });

    initHistoriaClinicaView(container, { session: SESSION, forced: false });
    await flush();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/?expired=1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/portal/views/historia-clinica.test.js`
Expected: FAIL — `src/portal/views/historia-clinica.js` does not exist (`Cannot find module`).

- [ ] **Step 3: Write the implementation**

Create `src/portal/views/historia-clinica.js`:

```js
import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';

const CAMPOS_ANTECEDENTES = [
  { key: 'antecedentesPersonales', label: 'Antecedentes personales' },
  { key: 'antecedentesPsiquiatricos', label: 'Antecedentes psiquiátricos' },
  { key: 'antecedentesFamiliares', label: 'Antecedentes familiares' },
  { key: 'alergias', label: 'Alergias' },
  { key: 'medicacionActual', label: 'Medicación actual' },
];

export function initHistoriaClinicaView(container, ctx) {
  container.innerHTML = '';

  let pacientes = [];

  const wrapper = document.createElement('div');
  wrapper.className = 'view-historia-clinica';

  const heading = document.createElement('h2');
  heading.textContent = 'Historia Clínica';
  wrapper.appendChild(heading);

  const errorEl = document.createElement('div');
  errorEl.className = 'view-historia-clinica__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const listaContainer = document.createElement('div');
  listaContainer.className = 'view-historia-clinica__lista';
  wrapper.appendChild(listaContainer);

  const fichaContainer = document.createElement('div');
  fichaContainer.className = 'view-historia-clinica__ficha';
  fichaContainer.hidden = true;
  wrapper.appendChild(fichaContainer);

  container.appendChild(wrapper);

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.hidden = true;
  }

  const buscarInput = document.createElement('input');
  buscarInput.type = 'text';
  buscarInput.className = 'view-historia-clinica__buscar';
  buscarInput.placeholder = 'Buscar por nombre o DNI...';
  buscarInput.addEventListener('input', () => renderTabla());
  listaContainer.appendChild(buscarInput);

  const table = document.createElement('table');
  table.className = 'view-historia-clinica__table';
  listaContainer.appendChild(table);

  async function loadPacientes() {
    const result = await apiGet('listarFichasPacientes', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    clearError();
    pacientes = result.pacientes;
    renderTabla();
  }

  function renderTabla() {
    const texto = buscarInput.value.trim().toLowerCase();
    const filtrados = texto
      ? pacientes.filter((p) => p.nombre.toLowerCase().includes(texto) || p.codigo.toLowerCase().includes(texto))
      : pacientes;

    table.innerHTML = '';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>DNI</th><th>Nombre</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    filtrados.forEach((paciente) => {
      const tr = document.createElement('tr');
      tr.addEventListener('click', () => abrirFicha(paciente));

      const tdCodigo = document.createElement('td');
      tdCodigo.textContent = paciente.codigo;
      tr.appendChild(tdCodigo);

      const tdNombre = document.createElement('td');
      tdNombre.textContent = paciente.nombre;
      tr.appendChild(tdNombre);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function volverALista() {
    fichaContainer.hidden = true;
    fichaContainer.innerHTML = '';
    listaContainer.hidden = false;
    clearError();
  }

  async function abrirFicha(paciente) {
    listaContainer.hidden = true;
    fichaContainer.hidden = false;
    fichaContainer.innerHTML = '';
    clearError();

    const volverButton = document.createElement('button');
    volverButton.type = 'button';
    volverButton.className = 'view-historia-clinica__volver';
    volverButton.textContent = 'Volver a la lista';
    volverButton.addEventListener('click', volverALista);
    fichaContainer.appendChild(volverButton);

    const header = document.createElement('h3');
    header.textContent = `${paciente.nombre} (${paciente.codigo})`;
    fichaContainer.appendChild(header);

    const antecedentesResult = await apiGet('leerAntecedentes', { token: ctx.session.token, codigo: paciente.codigo });
    if (antecedentesResult.error) {
      if (handleAuthError(antecedentesResult)) return;
      showError(antecedentesResult.error);
      return;
    }
    renderAntecedentes(paciente, antecedentesResult.antecedentes);

    const notasResult = await apiGet('listarNotasEvolucion', { token: ctx.session.token, codigo: paciente.codigo });
    if (notasResult.error) {
      if (handleAuthError(notasResult)) return;
      showError(notasResult.error);
      return;
    }
    renderNotas(paciente, notasResult.notas);
  }

  function renderAntecedentes(paciente, antecedentes) {
    const section = document.createElement('section');
    section.className = 'view-historia-clinica__antecedentes';

    const titulo = document.createElement('h4');
    titulo.textContent = 'Antecedentes médicos';
    section.appendChild(titulo);

    const form = document.createElement('form');
    form.className = 'view-historia-clinica__antecedentes-form';

    const textareas = {};
    CAMPOS_ANTECEDENTES.forEach(({ key, label }) => {
      const fieldLabel = document.createElement('label');
      fieldLabel.textContent = label;
      const textarea = document.createElement('textarea');
      textarea.className = `view-historia-clinica__campo-${key}`;
      textarea.value = antecedentes[key] || '';
      fieldLabel.appendChild(textarea);
      form.appendChild(fieldLabel);
      textareas[key] = textarea;
    });

    const formError = document.createElement('div');
    formError.className = 'view-historia-clinica__antecedentes-error';
    formError.hidden = true;
    form.appendChild(formError);

    const formSuccess = document.createElement('div');
    formSuccess.className = 'view-historia-clinica__antecedentes-success';
    formSuccess.hidden = true;
    form.appendChild(formSuccess);

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'button button--primary';
    saveButton.textContent = 'Guardar antecedentes';
    form.appendChild(saveButton);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      formError.hidden = true;
      formSuccess.hidden = true;

      const result = await apiPost({
        accion: 'actualizarAntecedentes',
        token: ctx.session.token,
        codigo: paciente.codigo,
        antecedentesPersonales: textareas.antecedentesPersonales.value,
        antecedentesPsiquiatricos: textareas.antecedentesPsiquiatricos.value,
        antecedentesFamiliares: textareas.antecedentesFamiliares.value,
        alergias: textareas.alergias.value,
        medicacionActual: textareas.medicacionActual.value,
      });

      if (result.error) {
        if (handleAuthError(result)) return;
        formError.textContent = result.error;
        formError.hidden = false;
        return;
      }

      formSuccess.textContent = 'Antecedentes guardados correctamente.';
      formSuccess.hidden = false;
    });

    section.appendChild(form);
    fichaContainer.appendChild(section);
  }

  function renderNotas(paciente, notas) {
    const section = document.createElement('section');
    section.className = 'view-historia-clinica__notas';

    const titulo = document.createElement('h4');
    titulo.textContent = 'Notas de evolución';
    section.appendChild(titulo);

    const lista = document.createElement('ul');
    lista.className = 'view-historia-clinica__notas-lista';
    section.appendChild(lista);

    function renderListaNotas() {
      lista.innerHTML = '';
      notas.forEach((nota) => {
        const item = document.createElement('li');
        item.className = 'view-historia-clinica__nota';

        const fecha = document.createElement('div');
        fecha.className = 'view-historia-clinica__nota-fecha';
        fecha.textContent = nota.fecha;
        item.appendChild(fecha);

        if (nota.motivoConsulta) {
          const motivo = document.createElement('div');
          motivo.className = 'view-historia-clinica__nota-motivo';
          motivo.textContent = `Motivo: ${nota.motivoConsulta}`;
          item.appendChild(motivo);
        }

        const cuerpo = document.createElement('div');
        cuerpo.className = 'view-historia-clinica__nota-texto';
        cuerpo.textContent = nota.notas;
        item.appendChild(cuerpo);

        if (nota.diagnostico) {
          const diagnostico = document.createElement('div');
          diagnostico.className = 'view-historia-clinica__nota-diagnostico';
          diagnostico.textContent = `Diagnóstico: ${nota.diagnostico}`;
          item.appendChild(diagnostico);
        }

        lista.appendChild(item);
      });
    }

    renderListaNotas();

    const form = document.createElement('form');
    form.className = 'view-historia-clinica__nota-form';

    const fechaLabel = document.createElement('label');
    fechaLabel.textContent = 'Fecha';
    const fechaInput = document.createElement('input');
    fechaInput.type = 'date';
    fechaInput.className = 'view-historia-clinica__nota-fecha-input';
    fechaInput.value = new Date().toISOString().slice(0, 10);
    fechaLabel.appendChild(fechaInput);
    form.appendChild(fechaLabel);

    const motivoLabel = document.createElement('label');
    motivoLabel.textContent = 'Motivo de consulta';
    const motivoInput = document.createElement('input');
    motivoInput.type = 'text';
    motivoInput.className = 'view-historia-clinica__nota-motivo-input';
    motivoLabel.appendChild(motivoInput);
    form.appendChild(motivoLabel);

    const notasLabel = document.createElement('label');
    notasLabel.textContent = 'Notas';
    const notasTextarea = document.createElement('textarea');
    notasTextarea.className = 'view-historia-clinica__nota-notas-input';
    notasLabel.appendChild(notasTextarea);
    form.appendChild(notasLabel);

    const diagnosticoLabel = document.createElement('label');
    diagnosticoLabel.textContent = 'Diagnóstico';
    const diagnosticoInput = document.createElement('input');
    diagnosticoInput.type = 'text';
    diagnosticoInput.className = 'view-historia-clinica__nota-diagnostico-input';
    diagnosticoLabel.appendChild(diagnosticoInput);
    form.appendChild(diagnosticoLabel);

    const formError = document.createElement('div');
    formError.className = 'view-historia-clinica__nota-form-error';
    formError.hidden = true;
    form.appendChild(formError);

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'button button--primary';
    saveButton.textContent = 'Guardar nota';
    form.appendChild(saveButton);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      formError.hidden = true;

      const notasValue = notasTextarea.value.trim();
      if (!notasValue) {
        formError.textContent = 'notas es requerido';
        formError.hidden = false;
        return;
      }

      const result = await apiPost({
        accion: 'crearNotaEvolucion',
        token: ctx.session.token,
        codigo: paciente.codigo,
        fecha: fechaInput.value,
        motivoConsulta: motivoInput.value.trim(),
        notas: notasValue,
        diagnostico: diagnosticoInput.value.trim(),
      });

      if (result.error) {
        if (handleAuthError(result)) return;
        formError.textContent = result.error;
        formError.hidden = false;
        return;
      }

      notas.unshift(result.nota);
      renderListaNotas();

      fechaInput.value = new Date().toISOString().slice(0, 10);
      motivoInput.value = '';
      notasTextarea.value = '';
      diagnosticoInput.value = '';
    });

    section.appendChild(form);
    fichaContainer.appendChild(section);
  }

  loadPacientes();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/portal/views/historia-clinica.test.js`
Expected: PASS — 11 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/portal/views/historia-clinica.js tests/portal/views/historia-clinica.test.js
git commit -m "feat(portal): add vista historia clinica"
```

---

### Task 5: Dashboard wiring

**Files:**
- Modify: `src/portal/dashboard.js`
- Modify: `tests/portal/dashboard.test.js`

- [ ] **Step 1: Write the failing test**

In `tests/portal/dashboard.test.js`, add a new import line right after the `pacientes.js` import:

```js
import { initHistoriaClinicaView } from '../../src/portal/views/historia-clinica.js';
```

Add a new mock right after the `pacientes.js` mock:

```js
vi.mock('../../src/portal/views/historia-clinica.js', () => ({ initHistoriaClinicaView: vi.fn() }));
```

Append this test to the end of the `describe('initDashboard', ...)` block (immediately before its closing `});`):

```js
  it('cambia a la vista historia-clinica al hacer click en el item Historia Clínica para psiquiatra', () => {
    const session = { token: 'tok', codigo: 'PSI001', rol: 'psiquiatra', nombre: 'Dra. Petra', debeCambiarPassword: false };
    setSession(session);

    initDashboard();
    document.querySelector('#nav-menu .dashboard-nav__item[data-view="historia-clinica"]').click();

    expect(initHistoriaClinicaView).toHaveBeenCalledWith(document.getElementById('dashboard-main'), {
      session,
      forced: false,
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/portal/dashboard.test.js`
Expected: FAIL — the new test fails because the `historia-clinica` item for `psiquiatra` is `disabled` (still `enabled: false` in `MENUS`), so clicking it never calls `initHistoriaClinicaView`.

- [ ] **Step 3: Write the implementation**

In `src/portal/dashboard.js`, add a new import line right after the `pacientes.js` import:

```js
import { initHistoriaClinicaView } from './views/historia-clinica.js';
```

Replace the `administrador` entry in `MENUS` (remove the `historia-clinica` item entirely):

```js
  administrador: [
    { id: 'usuarios', label: 'Gestión de usuarios', enabled: true },
    { id: 'agenda', label: 'Agenda', enabled: true },
    { id: 'pacientes', label: 'Pacientes', enabled: true },
    { id: 'prescripciones', label: 'Prescripciones', enabled: false },
    { id: 'escalas', label: 'Escalas', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
```

Replace the `psiquiatra` entry in `MENUS` (enable `historia-clinica`):

```js
  psiquiatra: [
    { id: 'agenda', label: 'Agenda', enabled: true },
    { id: 'pacientes', label: 'Pacientes', enabled: true },
    { id: 'historia-clinica', label: 'Historia Clínica', enabled: true },
    { id: 'prescripciones', label: 'Prescripciones', enabled: false },
    { id: 'escalas', label: 'Escalas', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
```

Add `historia-clinica` to `VIEWS`:

```js
export const VIEWS = {
  inicio: initInicioView,
  usuarios: initUsuariosView,
  'cambiar-password': initCambiarPasswordView,
  agenda: initAgendaView,
  'mi-agenda': initMiAgendaView,
  pacientes: initPacientesView,
  'historia-clinica': initHistoriaClinicaView,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/portal/dashboard.test.js`
Expected: PASS — 14 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/portal/dashboard.js tests/portal/dashboard.test.js
git commit -m "feat(portal): wire historia clinica menu item for psiquiatra"
```

---

### Final verification

- [ ] **Run the full test suite**

Run: `npx vitest run`
Expected: PASS — 27 test files, 341 tests, 0 failures.

---

### Deployment note (not a code task)

Before this feature works against the real Google Sheets backend, manually apply the checklist from Section 7 of `docs/superpowers/specs/2026-06-15-fase-2-historia-clinica-design.md`:

1. Add a new sheet `_antecedentes` with header row: `codigo, antecedentesPersonales, antecedentesPsiquiatricos, antecedentesFamiliares, alergias, medicacionActual, fechaActualizacion, actualizadoPor`.
2. Add a new sheet `_notas_evolucion` with header row: `id, pacienteCodigo, fecha, motivoConsulta, notas, diagnostico, creadoPor, fechaCreacion`.
3. Verify `AES_KEY` is configured in `PropertiesService` (Script Properties) on the production Apps Script project — both new functions throw if it's missing.
