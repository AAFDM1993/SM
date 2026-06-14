import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createMockServices } from '../mocks/gas-services.js';
import { generarHashSHA256, generarSalt } from '../src/hash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = join(__dirname, '..');
const OUTPUT_PATH = join(BACKEND_DIR, 'dist', 'gas-smpdjm.txt');

describe('build.js', () => {
  beforeAll(() => {
    execFileSync('node', [join(BACKEND_DIR, 'build.js')]);
  });

  it('genera backend/dist/gas-smpdjm.txt', () => {
    expect(existsSync(OUTPUT_PATH)).toBe(true);
  });

  it('no contiene declaraciones import ni export', () => {
    const output = readFileSync(OUTPUT_PATH, 'utf8');
    expect(output).not.toMatch(/^\s*import\s/m);
    expect(output).not.toMatch(/^\s*export\s/m);
  });

  it('define doGet y doPost funcionales tras la concatenacion', () => {
    const output = readFileSync(OUTPUT_PATH, 'utf8');
    const services = createMockServices({
      sheets: {
        _usuarios: [['codigo', 'password', 'salt', 'rol', 'nombre']],
        _log: [['timestamp', 'codigo', 'rol', 'accion', 'detalle']],
      },
    });

    globalThis.Utilities = services.Utilities;
    globalThis.SpreadsheetApp = services.SpreadsheetApp;
    globalThis.CacheService = services.CacheService;
    globalThis.PropertiesService = services.PropertiesService;
    globalThis.ContentService = services.ContentService;

    try {
      const factory = new Function(`${output}\nreturn { doGet, doPost };`);
      const { doGet, doPost } = factory();

      const pingResult = doGet({ parameter: { accion: 'ping' } });
      expect(JSON.parse(pingResult._text)).toEqual({ ok: true });

      const accionResult = doPost({
        postData: { contents: JSON.stringify({ accion: 'inexistente' }) },
      });
      expect(JSON.parse(accionResult._text)).toEqual({ error: 'Accion no reconocida' });
    } finally {
      delete globalThis.Utilities;
      delete globalThis.SpreadsheetApp;
      delete globalThis.CacheService;
      delete globalThis.PropertiesService;
      delete globalThis.ContentService;
    }
  });

  it('incluye las acciones de agenda/horario (leerHorarioConfig no lanza ReferenceError)', () => {
    const output = readFileSync(OUTPUT_PATH, 'utf8');

    // Asegura que el bundle contiene las definiciones de agenda.js y horario.js,
    // no solo las llamadas en router.js.
    expect(output).toMatch(/function\s+leerHorarioConfig/);
    expect(output).toMatch(/function\s+leerAgenda/);

    const services = createMockServices({
      sheets: {
        _usuarios: [['codigo', 'password', 'salt', 'rol', 'nombre']],
        _log: [['timestamp', 'codigo', 'rol', 'accion', 'detalle']],
        _horario_config: [['diaSemana', 'activo', 'horaInicio', 'horaFin', 'duracionSlotMin']],
      },
    });

    // Crea un usuario de recepcion (rol con permiso para leerHorarioConfig) con
    // contrasena hasheada igual que en backend/src/usuarios.js / auth.js.
    const salt = generarSalt(services);
    const passwordHash = generarHashSHA256('secreta123' + salt, services);
    services.SpreadsheetApp._sheets['_usuarios'].push(['REC001', passwordHash, salt, 'recepcion', 'Recepcion']);

    globalThis.Utilities = services.Utilities;
    globalThis.SpreadsheetApp = services.SpreadsheetApp;
    globalThis.CacheService = services.CacheService;
    globalThis.PropertiesService = services.PropertiesService;
    globalThis.ContentService = services.ContentService;

    try {
      const factory = new Function(`${output}\nreturn { doGet, doPost };`);
      const { doGet, doPost } = factory();

      const loginResult = doPost({
        postData: { contents: JSON.stringify({ accion: 'login', codigo: 'REC001', password: 'secreta123' }) },
      });
      const loginBody = JSON.parse(loginResult._text);
      expect(loginBody.ok).toBe(true);
      const { token } = loginBody;

      const horarioResult = doGet({ parameter: { accion: 'leerHorarioConfig', token } });
      const horarioBody = JSON.parse(horarioResult._text);

      // La aserción clave: la funcion existe y se ejecuta en el bundle, sin
      // ReferenceError por una dependencia faltante en build.js.
      expect(horarioBody.error || '').not.toMatch(/is not defined/);
      expect(horarioBody).toEqual({ ok: true, horario: [] });
    } finally {
      delete globalThis.Utilities;
      delete globalThis.SpreadsheetApp;
      delete globalThis.CacheService;
      delete globalThis.PropertiesService;
      delete globalThis.ContentService;
    }
  });
});
