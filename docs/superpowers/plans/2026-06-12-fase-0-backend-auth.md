# Fase 0 — Plan 2: Backend Auth (Google Apps Script) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SMPDJM backend authentication/security layer (login con sal + expiración de token, límite de intentos, cambio de contraseña, auditoría en `_log`, infraestructura AES, y CRUD de `_usuarios` para `administrador`), como módulos ES testeables con Vitest, más un script de build que concatena esos módulos en `backend/dist/gas-smpdjm.txt` para pegar en el editor de Apps Script.

**Architecture:** Cada función de backend recibe un objeto `services` inyectado (`{ Utilities, SpreadsheetApp, CacheService, PropertiesService, ContentService }`). En producción (Apps Script), `backend/src/index.js` pasa los globals reales de GAS. En tests, `backend/mocks/gas-services.js` provee implementaciones en memoria de esos mismos servicios, permitiendo probar toda la lógica de auth/seguridad con Vitest sin desplegar nada. `backend/build.js` concatena los módulos de `backend/src/` (quitando `import`/`export`) en un único archivo de texto listo para copiar al editor de Apps Script.

**Tech Stack:** Vitest (ya configurado en el proyecto), Node ESM, Google Apps Script V8 runtime (destino de despliegue).

---

## Contexto de seguridad (resumen del spec, para referencia rápida del implementador)

- `_usuarios`: col0 `codigo`, col1 `password` = `SHA256(password + salt)`, col2 `salt`, col3 `rol` (`administrador|psiquiatra|recepcion|usuario`), col4 `nombre`.
- `_log`: col0 `timestamp`, col1 `codigo`, col2 `rol`, col3 `accion`, col4 `detalle`.
- Token = `base64(codigo:rol:passwordHash:expiresAt)`, `expiresAt` = `Date.now() + 8h` (epoch ms). `verifyToken` rechaza tokens expirados y revalida `passwordHash` contra `_usuarios`.
- Login: tras 5 fallos consecutivos por `codigo`, bloqueo de 15 minutos vía `CacheService`. Todo intento (éxito/fallo/bloqueo) se registra en `_log`.
- `cambiarPassword`: disponible para todos los roles autenticados. Si `rol === 'usuario'` y la contraseña en texto plano enviada en `login` es igual al `codigo` (DNI), `login` devuelve `debeCambiarPassword: true`.
- `encrypt_`/`decrypt_`: AES-128-CBC con clave en `PropertiesService.getScriptProperties().getProperty('AES_KEY')` (hex de 32 caracteres = 16 bytes). Listo y probado en Fase 0; uso real en Fases 2-3.

---

## Estructura de archivos

```
backend/
├── mocks/
│   └── gas-services.js     # Mocks en memoria de Utilities, SpreadsheetApp, CacheService, PropertiesService, ContentService
├── src/
│   ├── hash.js              # generarHashSHA256, generarSalt
│   ├── aes.js                # AES-128-CBC (S-box, key schedule, CBC) + encrypt_/decrypt_
│   ├── log.js                 # registrarLog -> hoja _log
│   ├── usuarios.js             # findUser, listarUsuarios, guardarUsuario, eliminarUsuario -> hoja _usuarios
│   ├── auth.js                  # login, verifyToken (token+expiry, debeCambiarPassword, throttling)
│   ├── guards.js                 # requireAuth, requireAuthBody, cambiarPassword
│   ├── http.js                    # json_
│   ├── router.js                   # handleGet, handlePost (dispatch de acciones)
│   └── index.js                     # entry point GAS: doGet/doPost reales
├── tests/
│   ├── hash.test.js
│   ├── aes.test.js
│   ├── log.test.js
│   ├── usuarios.test.js
│   ├── auth.test.js
│   ├── guards.test.js
│   ├── router.test.js
│   └── build.test.js
└── build.js                          # concatena src/*.js -> backend/dist/gas-smpdjm.txt
```

`backend/dist/` queda cubierto por la regla existente `dist/` en `.gitignore` (artefacto generado, no se versiona).

---

### Task 1: Setup backend — mocks de servicios GAS + utilidades de hash

**Files:**
- Create: `backend/mocks/gas-services.js`
- Create: `backend/src/hash.js`
- Test: `backend/tests/hash.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// backend/tests/hash.test.js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { generarHashSHA256, generarSalt } from '../src/hash.js';

describe('generarHashSHA256', () => {
  it('genera el hash SHA-256 conocido para "hola"', () => {
    const services = createMockServices();
    const hash = generarHashSHA256('hola', services);
    expect(hash).toBe('b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79');
  });

  it('genera hashes distintos para entradas distintas', () => {
    const services = createMockServices();
    expect(generarHashSHA256('a', services)).not.toBe(generarHashSHA256('b', services));
  });

  it('es determinista para la misma entrada', () => {
    const services = createMockServices();
    expect(generarHashSHA256('clave123', services)).toBe(generarHashSHA256('clave123', services));
  });
});

describe('generarSalt', () => {
  it('genera un salt de 32 caracteres hexadecimales', () => {
    const services = createMockServices();
    const salt = generarSalt(services);
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it('genera salts distintos en llamadas sucesivas', () => {
    const services = createMockServices();
    const a = generarSalt(services);
    const b = generarSalt(services);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/hash.test.js`
Expected: FAIL — no se puede resolver `../mocks/gas-services.js` ni `../src/hash.js` (no existen todavía).

- [ ] **Step 3: Create the mock GAS services module**

```javascript
// backend/mocks/gas-services.js
import { createHash, randomUUID } from 'node:crypto';

export function createMockUtilities() {
  return {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest(_algorithm, input) {
      const digest = createHash('sha256').update(input, 'utf8').digest();
      return Array.from(digest).map((b) => (b > 127 ? b - 256 : b));
    },
    getUuid() {
      return randomUUID();
    },
    base64Encode(input) {
      return Buffer.from(input, 'utf8').toString('base64');
    },
    base64Decode(input) {
      const buf = Buffer.from(input, 'base64');
      return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
    },
    newBlob(byteArray) {
      return {
        getDataAsString() {
          return Buffer.from(byteArray.map((b) => (b < 0 ? b + 256 : b))).toString('utf8');
        },
      };
    },
  };
}

export function createMockSpreadsheet(initialData = {}) {
  const sheets = {};
  for (const [name, rows] of Object.entries(initialData)) {
    sheets[name] = rows.map((row) => [...row]);
  }

  function buildSheet(name) {
    return {
      getName: () => name,
      getLastRow: () => sheets[name].length,
      getLastColumn: () => (sheets[name][0] ? sheets[name][0].length : 0),
      getRange(row, col, numRows = 1, numCols = 1) {
        return {
          getValues() {
            const result = [];
            for (let r = 0; r < numRows; r++) {
              const sourceRow = sheets[name][row - 1 + r] || [];
              const rowResult = [];
              for (let c = 0; c < numCols; c++) {
                const value = sourceRow[col - 1 + c];
                rowResult.push(value === undefined ? '' : value);
              }
              result.push(rowResult);
            }
            return result;
          },
          setValues(values) {
            values.forEach((rowValues, r) => {
              const targetRow = row - 1 + r;
              while (sheets[name].length <= targetRow) sheets[name].push([]);
              rowValues.forEach((value, c) => {
                sheets[name][targetRow][col - 1 + c] = value;
              });
            });
          },
          setValue(value) {
            const targetRow = row - 1;
            while (sheets[name].length <= targetRow) sheets[name].push([]);
            sheets[name][targetRow][col - 1] = value;
          },
        };
      },
      appendRow(rowValues) {
        sheets[name].push([...rowValues]);
      },
      deleteRow(rowNumber) {
        sheets[name].splice(rowNumber - 1, 1);
      },
    };
  }

  return {
    getActiveSpreadsheet() {
      return {
        getSheetByName(name) {
          return sheets[name] ? buildSheet(name) : null;
        },
      };
    },
    _sheets: sheets,
  };
}

export function createMockCacheService() {
  const store = new Map();
  return {
    getScriptCache() {
      return {
        get: (key) => {
          const entry = store.get(key);
          if (!entry) return null;
          if (entry.expiresAt && Date.now() > entry.expiresAt) {
            store.delete(key);
            return null;
          }
          return entry.value;
        },
        put: (key, value, expirationInSeconds) => {
          const expiresAt = expirationInSeconds ? Date.now() + expirationInSeconds * 1000 : null;
          store.set(key, { value, expiresAt });
        },
        remove: (key) => {
          store.delete(key);
        },
      };
    },
    _store: store,
  };
}

export function createMockPropertiesService(initialProperties = {}) {
  const store = new Map(Object.entries(initialProperties));
  return {
    getScriptProperties() {
      return {
        getProperty: (key) => (store.has(key) ? store.get(key) : null),
        setProperty: (key, value) => {
          store.set(key, value);
        },
      };
    },
  };
}

export function createMockContentService() {
  return {
    MimeType: { JSON: 'application/json' },
    createTextOutput(text) {
      return {
        _text: text,
        _mimeType: null,
        setMimeType(mime) {
          this._mimeType = mime;
          return this;
        },
      };
    },
  };
}

export function createMockServices(initialData = {}) {
  return {
    Utilities: createMockUtilities(),
    SpreadsheetApp: createMockSpreadsheet(initialData.sheets || {}),
    CacheService: createMockCacheService(),
    PropertiesService: createMockPropertiesService(initialData.properties || {}),
    ContentService: createMockContentService(),
  };
}
```

- [ ] **Step 4: Create the hash utilities module**

```javascript
// backend/src/hash.js
export function generarHashSHA256(input, services) {
  const rawHash = services.Utilities.computeDigest(services.Utilities.DigestAlgorithm.SHA_256, input);
  let txtHash = '';
  for (let i = 0; i < rawHash.length; i++) {
    let hashVal = rawHash[i];
    if (hashVal < 0) hashVal += 256;
    if (hashVal.toString(16).length === 1) txtHash += '0';
    txtHash += hashVal.toString(16);
  }
  return txtHash;
}

export function generarSalt(services) {
  return services.Utilities.getUuid().replace(/-/g, '');
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- backend/tests/hash.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/mocks/gas-services.js backend/src/hash.js backend/tests/hash.test.js
git commit -m "feat(backend): add GAS service mocks and SHA-256 hash/salt utilities"
```

### Task 2: Infraestructura de cifrado AES (`backend/src/aes.js`)

**Files:**
- Create: `backend/src/aes.js`
- Test: `backend/tests/aes.test.js`

Apps Script no expone un cifrador AES nativo, así que se implementa AES-128 en modo CBC en JS puro (S-box, expansión de claves, rondas). La corrección del núcleo se valida contra el vector de prueba oficial **FIPS-197 Apéndice B**.

- [ ] **Step 1: Write the failing test**

```javascript
// backend/tests/aes.test.js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { keyExpansion, encryptBlock, decryptBlock, encrypt_, decrypt_ } from '../src/aes.js';

describe('AES-128 core (FIPS-197 Apendice B)', () => {
  const key = [0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0x0c,0x0d,0x0e,0x0f];
  const plaintext = [0x00,0x11,0x22,0x33,0x44,0x55,0x66,0x77,0x88,0x99,0xaa,0xbb,0xcc,0xdd,0xee,0xff];
  const ciphertext = [0x69,0xc4,0xe0,0xd8,0x6a,0x7b,0x04,0x30,0xd8,0xcd,0xb7,0x80,0x70,0xb4,0xc5,0x5a];

  it('encryptBlock coincide con el vector de prueba oficial', () => {
    const w = keyExpansion(key);
    expect(encryptBlock(plaintext, w)).toEqual(ciphertext);
  });

  it('decryptBlock revierte encryptBlock', () => {
    const w = keyExpansion(key);
    expect(decryptBlock(ciphertext, w)).toEqual(plaintext);
  });
});

describe('encrypt_/decrypt_', () => {
  const AES_KEY = '000102030405060708090a0b0c0d0e0f';

  it('hace round-trip de un texto con acentos', () => {
    const services = createMockServices({ properties: { AES_KEY } });
    const original = 'Nota clinica confidencial: paciente refiere animo estable, sin ideas de dano. ñáéíóú';
    const cifrado = encrypt_(original, services);
    expect(decrypt_(cifrado, services)).toBe(original);
  });

  it('produce salidas distintas para la misma entrada (IV aleatorio)', () => {
    const services = createMockServices({ properties: { AES_KEY } });
    const a = encrypt_('mismo texto', services);
    const b = encrypt_('mismo texto', services);
    expect(a).not.toBe(b);
  });

  it('lanza un error si AES_KEY no esta configurada', () => {
    const services = createMockServices();
    expect(() => encrypt_('texto', services)).toThrow('AES_KEY');
  });

  it('lanza un error en decrypt_ si AES_KEY no esta configurada', () => {
    const services = createMockServices();
    expect(() => decrypt_('YQ==', services)).toThrow('AES_KEY');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/aes.test.js`
Expected: FAIL — `../src/aes.js` no existe todavía.

- [ ] **Step 3: Create the AES module**

```javascript
// backend/src/aes.js
//
// Implementacion autocontenida de AES-128 en modo CBC con padding PKCS#7,
// mas helpers de hex/base64/UTF-8 y los wrappers encrypt_/decrypt_ que usan
// la clave guardada en PropertiesService (Script Property AES_KEY, hex de 32
// caracteres = 16 bytes). Google Apps Script no expone un cifrador AES nativo,
// por eso se implementa aqui en JS puro. El nucleo (encryptBlock/decryptBlock)
// se valida contra el vector de prueba oficial de FIPS-197 Apendice B en
// aes.test.js.

const SBOX = [
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
];

const INV_SBOX = [
  0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,
  0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,
  0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,
  0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,
  0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,
  0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,
  0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,
  0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,
  0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,
  0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,
  0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,
  0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,
  0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,
  0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,
  0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,
  0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d,
];

const RCON = [0x00,0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36];

// Multiplicacion en GF(2^8) modulo el polinomio AES (x^8 + x^4 + x^3 + x + 1).
function gmul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hiBitSet = a & 0x80;
    a = (a << 1) & 0xFF;
    if (hiBitSet) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

// AES-128: 4 palabras de clave (Nk=4), 10 rondas (Nr=10), 44 palabras de expansion.
export function keyExpansion(key) {
  const Nk = 4;
  const Nr = 10;
  const w = [];
  for (let i = 0; i < Nk; i++) {
    w.push([key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]);
  }
  for (let i = Nk; i < 4 * (Nr + 1); i++) {
    let temp = w[i - 1].slice();
    if (i % Nk === 0) {
      temp = [temp[1], temp[2], temp[3], temp[0]]; // RotWord
      temp = temp.map((b) => SBOX[b]); // SubWord
      temp[0] ^= RCON[i / Nk];
    }
    w.push(w[i - Nk].map((b, idx) => b ^ temp[idx]));
  }
  return w;
}

function addRoundKey(s, w, round) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      s[c * 4 + r] ^= w[round * 4 + c][r];
    }
  }
}

function subBytes(s) {
  for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
}

function invSubBytes(s) {
  for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]];
}

function shiftRows(s) {
  const t = s.slice();
  for (let r = 1; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      s[c * 4 + r] = t[((c + r) % 4) * 4 + r];
    }
  }
}

function invShiftRows(s) {
  const t = s.slice();
  for (let r = 1; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      s[c * 4 + r] = t[((c - r + 4) % 4) * 4 + r];
    }
  }
}

function mixColumns(s) {
  for (let c = 0; c < 4; c++) {
    const a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
    s[c * 4]     = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
    s[c * 4 + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
    s[c * 4 + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
    s[c * 4 + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
  }
}

function invMixColumns(s) {
  for (let c = 0; c < 4; c++) {
    const a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
    s[c * 4]     = gmul(a0, 0x0e) ^ gmul(a1, 0x0b) ^ gmul(a2, 0x0d) ^ gmul(a3, 0x09);
    s[c * 4 + 1] = gmul(a0, 0x09) ^ gmul(a1, 0x0e) ^ gmul(a2, 0x0b) ^ gmul(a3, 0x0d);
    s[c * 4 + 2] = gmul(a0, 0x0d) ^ gmul(a1, 0x09) ^ gmul(a2, 0x0e) ^ gmul(a3, 0x0b);
    s[c * 4 + 3] = gmul(a0, 0x0b) ^ gmul(a1, 0x0d) ^ gmul(a2, 0x09) ^ gmul(a3, 0x0e);
  }
}

export function encryptBlock(input, w) {
  const s = input.slice();
  addRoundKey(s, w, 0);
  for (let round = 1; round <= 9; round++) {
    subBytes(s);
    shiftRows(s);
    mixColumns(s);
    addRoundKey(s, w, round);
  }
  subBytes(s);
  shiftRows(s);
  addRoundKey(s, w, 10);
  return s;
}

export function decryptBlock(input, w) {
  const s = input.slice();
  addRoundKey(s, w, 10);
  for (let round = 9; round >= 1; round--) {
    invShiftRows(s);
    invSubBytes(s);
    addRoundKey(s, w, round);
    invMixColumns(s);
  }
  invShiftRows(s);
  invSubBytes(s);
  addRoundKey(s, w, 0);
  return s;
}

function pkcs7Pad(bytes) {
  const padLen = 16 - (bytes.length % 16);
  const result = bytes.slice();
  for (let i = 0; i < padLen; i++) result.push(padLen);
  return result;
}

function pkcs7Unpad(bytes) {
  const padLen = bytes[bytes.length - 1];
  if (padLen < 1 || padLen > 16 || padLen > bytes.length) {
    throw new Error('Padding invalido');
  }
  return bytes.slice(0, bytes.length - padLen);
}

function aesEncryptCbc(plainBytes, keyBytes, ivBytes) {
  const w = keyExpansion(keyBytes);
  const padded = pkcs7Pad(plainBytes);
  const out = [];
  let prev = ivBytes.slice();
  for (let i = 0; i < padded.length; i += 16) {
    const block = padded.slice(i, i + 16).map((b, idx) => b ^ prev[idx]);
    const enc = encryptBlock(block, w);
    out.push(...enc);
    prev = enc;
  }
  return out;
}

function aesDecryptCbc(cipherBytes, keyBytes, ivBytes) {
  const w = keyExpansion(keyBytes);
  const out = [];
  let prev = ivBytes.slice();
  for (let i = 0; i < cipherBytes.length; i += 16) {
    const block = cipherBytes.slice(i, i + 16);
    const dec = decryptBlock(block, w);
    const xored = dec.map((b, idx) => b ^ prev[idx]);
    out.push(...xored);
    prev = block;
  }
  return pkcs7Unpad(out);
}

// Helpers de codificacion en JS puro (sin dependencias de Node ni de Apps
// Script), para que el mismo codigo funcione en Vitest y en el runtime de GAS.
function utf8ToBytes(str) {
  const utf8 = unescape(encodeURIComponent(str));
  const bytes = [];
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i) & 0xFF);
  return bytes;
}

function bytesToUtf8(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return decodeURIComponent(escape(binary));
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const triple = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    result += B64_CHARS[(triple >> 18) & 0x3F];
    result += B64_CHARS[(triple >> 12) & 0x3F];
    result += b1 !== undefined ? B64_CHARS[(triple >> 6) & 0x3F] : '=';
    result += b2 !== undefined ? B64_CHARS[triple & 0x3F] : '=';
  }
  return result;
}

function base64ToBytes(b64) {
  const clean = b64.replace(/=+$/, '');
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | B64_CHARS.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xFF);
    }
  }
  return bytes;
}

function hexToBytes(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
  return bytes;
}

function randomBytes(n, services) {
  const bytes = [];
  while (bytes.length < n) {
    const uuid = services.Utilities.getUuid().replace(/-/g, '');
    for (let i = 0; i < uuid.length && bytes.length < n; i += 2) {
      bytes.push(parseInt(uuid.substr(i, 2), 16));
    }
  }
  return bytes;
}

function getAesKey(services) {
  const keyHex = services.PropertiesService.getScriptProperties().getProperty('AES_KEY');
  if (!keyHex) throw new Error('AES_KEY no configurada en PropertiesService');
  return hexToBytes(keyHex);
}

// Cifra texto -> base64(IV de 16 bytes || ciphertext). IV aleatorio por llamada.
export function encrypt_(texto, services) {
  const key = getAesKey(services);
  const iv = randomBytes(16, services);
  const plainBytes = utf8ToBytes(texto);
  const cipherBytes = aesEncryptCbc(plainBytes, key, iv);
  return bytesToBase64(iv.concat(cipherBytes));
}

// Descifra base64(IV de 16 bytes || ciphertext) -> texto original.
export function decrypt_(textoCifrado, services) {
  const key = getAesKey(services);
  const allBytes = base64ToBytes(textoCifrado);
  const iv = allBytes.slice(0, 16);
  const cipherBytes = allBytes.slice(16);
  const plainBytes = aesDecryptCbc(cipherBytes, key, iv);
  return bytesToUtf8(plainBytes);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/tests/aes.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/aes.js backend/tests/aes.test.js
git commit -m "feat(backend): add self-contained AES-128-CBC encrypt_/decrypt_ utilities"
```

### Task 3: Auditoría — registro en `_log` (`backend/src/log.js`)

**Files:**
- Create: `backend/src/log.js`
- Test: `backend/tests/log.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// backend/tests/log.test.js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { registrarLog } from '../src/log.js';

describe('registrarLog', () => {
  it('agrega una fila a _log con timestamp, codigo, rol, accion y detalle', () => {
    const services = createMockServices({ sheets: { _log: [['timestamp', 'codigo', 'rol', 'accion', 'detalle']] } });
    registrarLog(services, 'ABC123', 'administrador', 'login_exitoso', '');
    const rows = services.SpreadsheetApp._sheets['_log'];
    expect(rows).toHaveLength(2);
    const [timestamp, codigo, rol, accion, detalle] = rows[1];
    expect(timestamp).toBeInstanceOf(Date);
    expect(codigo).toBe('ABC123');
    expect(rol).toBe('administrador');
    expect(accion).toBe('login_exitoso');
    expect(detalle).toBe('');
  });

  it('usa "" cuando no se pasa detalle', () => {
    const services = createMockServices({ sheets: { _log: [['timestamp', 'codigo', 'rol', 'accion', 'detalle']] } });
    registrarLog(services, 'ABC123', 'administrador', 'login_exitoso');
    const rows = services.SpreadsheetApp._sheets['_log'];
    expect(rows[1][4]).toBe('');
  });

  it('no lanza error si la hoja _log no existe', () => {
    const services = createMockServices();
    expect(() => registrarLog(services, 'ABC123', 'administrador', 'login_exitoso', 'detalle')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/log.test.js`
Expected: FAIL — `../src/log.js` no existe todavía.

- [ ] **Step 3: Create the log module**

```javascript
// backend/src/log.js
const SHEET_LOG = '_log';

export function registrarLog(services, codigo, rol, accion, detalle) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LOG);
  if (!sheet) return;
  sheet.appendRow([new Date(), codigo, rol, accion, detalle || '']);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/tests/log.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/log.js backend/tests/log.test.js
git commit -m "feat(backend): add audit log writer for the _log sheet"
```

---

### Task 4: Gestión de usuarios — hoja `_usuarios` (`backend/src/usuarios.js`)

**Files:**
- Create: `backend/src/usuarios.js`
- Test: `backend/tests/usuarios.test.js`

Implementa `findUser`, `listarUsuarios`, `guardarUsuario` (crear/actualizar) y `eliminarUsuario` sobre la hoja `_usuarios` (columnas: `codigo`, `password`, `salt`, `rol`, `nombre`). Usa `generarHashSHA256`/`generarSalt` de `backend/src/hash.js` (Task 1) para que las contraseñas nuevas queden hasheadas con sal individual.

- [ ] **Step 1: Write the failing test**

```javascript
// backend/tests/usuarios.test.js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { generarHashSHA256 } from '../src/hash.js';
import { findUser, listarUsuarios, guardarUsuario, eliminarUsuario } from '../src/usuarios.js';

const HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];

function buildServices(rows = []) {
  return createMockServices({ sheets: { _usuarios: [HEADER, ...rows] } });
}

describe('findUser', () => {
  it('encuentra un usuario por codigo (sin distinguir mayusculas)', () => {
    const services = buildServices([['ABC123', 'hash1', 'salt1', 'administrador', 'Ana']]);
    expect(findUser('abc123', services)).toEqual({
      codigo: 'ABC123', password: 'hash1', salt: 'salt1', rol: 'administrador', nombre: 'Ana',
    });
  });

  it('devuelve null si no existe', () => {
    const services = buildServices([['ABC123', 'hash1', 'salt1', 'administrador', 'Ana']]);
    expect(findUser('zzz999', services)).toBeNull();
  });

  it('devuelve null si la hoja _usuarios no existe', () => {
    const services = createMockServices();
    expect(findUser('ABC123', services)).toBeNull();
  });
});

describe('listarUsuarios', () => {
  it('lista codigo, rol y nombre sin exponer password ni salt', () => {
    const services = buildServices([
      ['ABC123', 'hash1', 'salt1', 'administrador', 'Ana'],
      ['XYZ987', 'hash2', 'salt2', 'usuario', 'Beto'],
    ]);
    expect(listarUsuarios(services)).toEqual({
      ok: true,
      usuarios: [
        { codigo: 'ABC123', rol: 'administrador', nombre: 'Ana' },
        { codigo: 'XYZ987', rol: 'usuario', nombre: 'Beto' },
      ],
    });
  });

  it('devuelve lista vacia si no hay usuarios', () => {
    const services = buildServices([]);
    expect(listarUsuarios(services)).toEqual({ ok: true, usuarios: [] });
  });
});

describe('guardarUsuario', () => {
  it('crea un usuario nuevo con hash y salt consistentes', () => {
    const services = buildServices([]);
    const result = guardarUsuario({ codigo: 'NEW001', password: 'inicial123', rol: 'recepcion', nombre: 'Carla' }, services);
    expect(result).toEqual({ ok: true, accion: 'creado' });

    const user = findUser('NEW001', services);
    expect(user.rol).toBe('recepcion');
    expect(user.nombre).toBe('Carla');
    expect(user.password).toBe(generarHashSHA256('inicial123' + user.salt, services));
  });

  it('rechaza crear un usuario sin password', () => {
    const services = buildServices([]);
    const result = guardarUsuario({ codigo: 'NEW002', rol: 'recepcion', nombre: 'Dani' }, services);
    expect(result).toEqual({ error: 'password requerido para usuarios nuevos' });
  });

  it('rechaza un rol invalido', () => {
    const services = buildServices([]);
    const result = guardarUsuario({ codigo: 'NEW003', password: 'abc123', rol: 'superadmin', nombre: 'Eva' }, services);
    expect(result).toEqual({ error: 'Rol invalido' });
  });

  it('actualiza nombre y rol sin tocar password si no se envia una nueva', () => {
    const services = buildServices([['ABC123', 'hashOriginal', 'saltOriginal', 'recepcion', 'Ana']]);
    const result = guardarUsuario({ codigo: 'ABC123', rol: 'psiquiatra', nombre: 'Ana Maria' }, services);
    expect(result).toEqual({ ok: true, accion: 'actualizado' });

    expect(findUser('ABC123', services)).toEqual({
      codigo: 'ABC123', password: 'hashOriginal', salt: 'saltOriginal', rol: 'psiquiatra', nombre: 'Ana Maria',
    });
  });

  it('actualiza el password (nuevo hash y salt) cuando se envia uno', () => {
    const services = buildServices([['ABC123', 'hashOriginal', 'saltOriginal', 'recepcion', 'Ana']]);
    guardarUsuario({ codigo: 'ABC123', password: 'nuevoPass123', rol: 'recepcion', nombre: 'Ana' }, services);

    const user = findUser('ABC123', services);
    expect(user.password).not.toBe('hashOriginal');
    expect(user.salt).not.toBe('saltOriginal');
    expect(user.password).toBe(generarHashSHA256('nuevoPass123' + user.salt, services));
  });
});

describe('eliminarUsuario', () => {
  it('elimina un usuario existente', () => {
    const services = buildServices([
      ['ABC123', 'hash1', 'salt1', 'administrador', 'Ana'],
      ['XYZ987', 'hash2', 'salt2', 'usuario', 'Beto'],
    ]);
    expect(eliminarUsuario('abc123', services)).toEqual({ ok: true });
    expect(findUser('ABC123', services)).toBeNull();
    expect(findUser('XYZ987', services)).not.toBeNull();
  });

  it('devuelve error si el usuario no existe', () => {
    const services = buildServices([['ABC123', 'hash1', 'salt1', 'administrador', 'Ana']]);
    expect(eliminarUsuario('zzz999', services)).toEqual({ error: 'No encontrado' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/usuarios.test.js`
Expected: FAIL — `../src/usuarios.js` no existe todavía.

- [ ] **Step 3: Create the usuarios module**

```javascript
// backend/src/usuarios.js
import { generarHashSHA256, generarSalt } from './hash.js';

const SHEET_USUARIOS = '_usuarios';
const ROLES_VALIDOS = ['administrador', 'psiquiatra', 'recepcion', 'usuario'];

export function findUser(codigo, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  if (!sheet) return null;
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const rows = sheet.getRange(2, 1, last - 1, 5).getValues();
  const needle = String(codigo).trim().toLowerCase();
  for (const row of rows) {
    if (String(row[0]).trim().toLowerCase() === needle) {
      return {
        codigo: String(row[0]).trim(),
        password: String(row[1]),
        salt: String(row[2]),
        rol: String(row[3]).trim().toLowerCase(),
        nombre: String(row[4]),
      };
    }
  }
  return null;
}

export function listarUsuarios(services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  if (!sheet) return { ok: true, usuarios: [] };
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true, usuarios: [] };
  const rows = sheet.getRange(2, 1, last - 1, 5).getValues();
  const usuarios = rows
    .filter((r) => String(r[0]).trim() !== '')
    .map((r) => ({ codigo: String(r[0]).trim(), rol: String(r[3]).trim(), nombre: String(r[4]) }));
  return { ok: true, usuarios };
}

export function guardarUsuario(b, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  if (!sheet) return { error: 'Hoja de usuarios no encontrada' };

  const codigo = String(b.codigo || '').trim();
  const rol = String(b.rol || '').trim().toLowerCase();
  const nombre = String(b.nombre || '').trim();
  if (!codigo || !rol || !nombre) return { error: 'codigo, rol y nombre son requeridos' };
  if (ROLES_VALIDOS.indexOf(rol) === -1) return { error: 'Rol invalido' };

  const last = sheet.getLastRow();
  const needle = codigo.toLowerCase();
  let filaExistente = -1;
  if (last >= 2) {
    const col1 = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < col1.length; i++) {
      if (String(col1[i][0]).trim().toLowerCase() === needle) {
        filaExistente = i + 2;
        break;
      }
    }
  }

  if (filaExistente > 0) {
    if (b.password) {
      const salt = generarSalt(services);
      const passwordHash = generarHashSHA256(String(b.password) + salt, services);
      sheet.getRange(filaExistente, 1, 1, 5).setValues([[codigo, passwordHash, salt, rol, nombre]]);
    } else {
      const filaActual = sheet.getRange(filaExistente, 1, 1, 5).getValues()[0];
      sheet.getRange(filaExistente, 1, 1, 5).setValues([[codigo, filaActual[1], filaActual[2], rol, nombre]]);
    }
    return { ok: true, accion: 'actualizado' };
  }

  if (!b.password) return { error: 'password requerido para usuarios nuevos' };
  const salt = generarSalt(services);
  const passwordHash = generarHashSHA256(String(b.password) + salt, services);
  sheet.appendRow([codigo, passwordHash, salt, rol, nombre]);
  return { ok: true, accion: 'creado' };
}

export function eliminarUsuario(codigo, services) {
  const sheet = services.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USUARIOS);
  if (!sheet) return { error: 'Hoja de usuarios no encontrada' };
  const last = sheet.getLastRow();
  if (last < 2) return { error: 'No encontrado' };
  const col1 = sheet.getRange(2, 1, last - 1, 1).getValues();
  const needle = String(codigo).trim().toLowerCase();
  for (let i = 0; i < col1.length; i++) {
    if (String(col1[i][0]).trim().toLowerCase() === needle) {
      sheet.deleteRow(i + 2);
      return { ok: true };
    }
  }
  return { error: 'No encontrado' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/tests/usuarios.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/usuarios.js backend/tests/usuarios.test.js
git commit -m "feat(backend): add _usuarios CRUD (findUser, listarUsuarios, guardarUsuario, eliminarUsuario)"
```

### Task 5: Login y verificación de token (`backend/src/auth.js`)

**Files:**
- Create: `backend/src/auth.js`
- Test: `backend/tests/auth.test.js`

Implementa `login` (verifica hash salteado, emite token `base64(codigo:rol:passwordHash:expiresAt)` con `expiresAt` = ahora + 8h, marca `debeCambiarPassword` si `rol==='usuario'` y la contraseña en texto plano = `codigo`, y registra en `_log`) y `verifyToken` (decodifica, rechaza tokens expirados, revalida `passwordHash` contra `_usuarios`). El límite de intentos (throttling) se agrega en la Task 6.

- [ ] **Step 1: Write the failing test**

```javascript
// backend/tests/auth.test.js
import { describe, it, expect, vi } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { generarHashSHA256, generarSalt } from '../src/hash.js';
import { login, verifyToken } from '../src/auth.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];

function buildServicesWithUser({ codigo, password, rol, nombre }) {
  const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER] } });
  const salt = generarSalt(services);
  const passwordHash = generarHashSHA256(password + salt, services);
  services.SpreadsheetApp._sheets['_usuarios'].push([codigo, passwordHash, salt, rol, nombre]);
  return services;
}

describe('login', () => {
  it('devuelve token y datos de usuario con credenciales correctas', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const result = login('ADM001', 'secreta123', services);
    expect(result.ok).toBe(true);
    expect(result.rol).toBe('administrador');
    expect(result.nombre).toBe('Admin');
    expect(result.codigo).toBe('ADM001');
    expect(typeof result.token).toBe('string');
    expect(result.debeCambiarPassword).toBeUndefined();
  });

  it('registra login_exitoso en _log', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    login('ADM001', 'secreta123', services);
    const logRows = services.SpreadsheetApp._sheets['_log'];
    expect(logRows[1]).toEqual([expect.any(Date), 'ADM001', 'administrador', 'login_exitoso', '']);
  });

  it('rechaza contrasena incorrecta', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    expect(login('ADM001', 'incorrecta', services)).toEqual({ error: 'Usuario o contraseña incorrectos' });
  });

  it('registra login_fallido si la contrasena es incorrecta', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    login('ADM001', 'incorrecta', services);
    const logRows = services.SpreadsheetApp._sheets['_log'];
    expect(logRows[1][3]).toBe('login_fallido');
  });

  it('rechaza un codigo que no existe', () => {
    const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER] } });
    expect(login('NOEXISTE', 'cualquier', services)).toEqual({ error: 'Usuario o contraseña incorrectos' });
  });

  it('marca debeCambiarPassword cuando rol=usuario y password=codigo (DNI)', () => {
    const services = buildServicesWithUser({ codigo: '12345678', password: '12345678', rol: 'usuario', nombre: 'Paciente' });
    const result = login('12345678', '12345678', services);
    expect(result.ok).toBe(true);
    expect(result.debeCambiarPassword).toBe(true);
  });

  it('no marca debeCambiarPassword si el paciente ya cambio su password', () => {
    const services = buildServicesWithUser({ codigo: '12345678', password: 'otraClave1', rol: 'usuario', nombre: 'Paciente' });
    const result = login('12345678', 'otraClave1', services);
    expect(result.debeCambiarPassword).toBeUndefined();
  });

  it('requiere codigo y password', () => {
    const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER] } });
    expect(login('', '', services)).toEqual({ error: 'Codigo y contrasena requeridos' });
  });
});

describe('verifyToken', () => {
  it('devuelve el usuario para un token valido', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const { token } = login('ADM001', 'secreta123', services);
    const user = verifyToken(token, services);
    expect(user.codigo).toBe('ADM001');
    expect(user.rol).toBe('administrador');
  });

  it('devuelve null para un token vacio o invalido', () => {
    const services = createMockServices();
    expect(verifyToken('', services)).toBeNull();
    expect(verifyToken('no-es-base64-valido!!', services)).toBeNull();
  });

  it('devuelve null si el token expiro (mas de 8 horas)', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const { token } = login('ADM001', 'secreta123', services);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 60 * 60 * 1000 + 1000);
    expect(verifyToken(token, services)).toBeNull();
    vi.useRealTimers();
  });

  it('devuelve null si la contrasena del usuario cambio despues de emitir el token', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const { token } = login('ADM001', 'secreta123', services);

    services.SpreadsheetApp._sheets['_usuarios'][1][1] = 'otroHashDistinto';

    expect(verifyToken(token, services)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/auth.test.js`
Expected: FAIL — `../src/auth.js` no existe todavía.

- [ ] **Step 3: Create the auth module**

```javascript
// backend/src/auth.js
import { generarHashSHA256 } from './hash.js';
import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const TOKEN_DURATION_MS = 8 * 60 * 60 * 1000; // 8 horas

export function login(codigo, password, services) {
  if (!codigo || !password) return { error: 'Codigo y contrasena requeridos' };

  const user = findUser(codigo, services);
  if (!user) {
    registrarLog(services, codigo, '-', 'login_fallido', 'Usuario no encontrado');
    return { error: 'Usuario o contraseña incorrectos' };
  }

  const hashIngresado = generarHashSHA256(String(password) + user.salt, services);
  if (String(user.password) !== hashIngresado) {
    registrarLog(services, user.codigo, user.rol, 'login_fallido', 'Contraseña incorrecta');
    return { error: 'Usuario o contraseña incorrectos' };
  }

  const expiresAt = Date.now() + TOKEN_DURATION_MS;
  const token = services.Utilities.base64Encode(`${user.codigo}:${user.rol}:${user.password}:${expiresAt}`);

  const result = { ok: true, token, rol: user.rol, nombre: user.nombre, codigo: user.codigo };
  if (user.rol === 'usuario' && String(password) === user.codigo) {
    result.debeCambiarPassword = true;
  }

  registrarLog(services, user.codigo, user.rol, 'login_exitoso', '');
  return result;
}

export function verifyToken(token, services) {
  if (!token) return null;
  try {
    const bytes = services.Utilities.base64Decode(token);
    const decoded = services.Utilities.newBlob(bytes).getDataAsString();
    const parts = decoded.split(':');
    if (parts.length < 4) return null;

    const [codigo, , passwordHash, expiresAtStr] = parts;
    const expiresAt = Number(expiresAtStr);
    if (!expiresAt || Date.now() > expiresAt) return null;

    const user = findUser(codigo, services);
    if (!user) return null;
    if (String(user.password) !== String(passwordHash)) return null;
    return user;
  } catch (e) {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/tests/auth.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth.js backend/tests/auth.test.js
git commit -m "feat(backend): add login with salted hashes and verifyToken with 8h expiry"
```

### Task 6: Límite de intentos de login (throttling)

**Files:**
- Modify: `backend/src/auth.js`
- Modify: `backend/tests/auth.test.js`

Extiende `login` para bloquear un `codigo` durante 15 minutos tras 5 intentos fallidos consecutivos, usando `CacheService`. Un login exitoso reinicia el contador. Los bloqueos se registran en `_log` con la acción `login_bloqueado`.

- [ ] **Step 1: Write the failing tests**

Add the following `describe` block to `backend/tests/auth.test.js`, after the existing `describe('login', ...)` block (and before `describe('verifyToken', ...)`):

```javascript
describe('login - limite de intentos', () => {
  it('bloquea el login tras 5 intentos fallidos consecutivos', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });

    for (let i = 0; i < 5; i++) {
      expect(login('ADM001', 'incorrecta', services)).toEqual({ error: 'Usuario o contraseña incorrectos' });
    }

    const result = login('ADM001', 'secreta123', services);
    expect(result).toEqual({ error: 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.' });
  });

  it('registra login_bloqueado en _log cuando se excede el limite', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });

    for (let i = 0; i < 5; i++) {
      login('ADM001', 'incorrecta', services);
    }
    login('ADM001', 'secreta123', services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    const lastRow = logRows[logRows.length - 1];
    expect(lastRow[3]).toBe('login_bloqueado');
  });

  it('un login exitoso reinicia el contador de intentos fallidos', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });

    for (let i = 0; i < 4; i++) {
      login('ADM001', 'incorrecta', services);
    }
    login('ADM001', 'secreta123', services);

    for (let i = 0; i < 4; i++) {
      expect(login('ADM001', 'incorrecta', services)).toEqual({ error: 'Usuario o contraseña incorrectos' });
    }
  });

  it('el bloqueo se libera despues de 15 minutos', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });

    vi.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) {
        login('ADM001', 'incorrecta', services);
      }
      expect(login('ADM001', 'secreta123', services).error).toBeDefined();

      vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

      const result = login('ADM001', 'secreta123', services);
      expect(result.ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/auth.test.js`
Expected: FAIL — el 6º intento (con contraseña correcta) actualmente devuelve `{ ok: true, ... }` en lugar del error de bloqueo.

- [ ] **Step 3: Extend the auth module with throttling**

Replace the full contents of `backend/src/auth.js` with:

```javascript
// backend/src/auth.js
import { generarHashSHA256 } from './hash.js';
import { findUser } from './usuarios.js';
import { registrarLog } from './log.js';

const TOKEN_DURATION_MS = 8 * 60 * 60 * 1000; // 8 horas
const MAX_INTENTOS = 5;
const BLOQUEO_SEGUNDOS = 15 * 60; // 15 minutos

function throttleKey(codigo) {
  return 'login_fail_' + String(codigo).toLowerCase();
}

function estaBloqueado(codigo, services) {
  const cache = services.CacheService.getScriptCache();
  const value = cache.get(throttleKey(codigo));
  return value !== null && Number(value) >= MAX_INTENTOS;
}

function registrarIntentoFallido(codigo, services) {
  const cache = services.CacheService.getScriptCache();
  const key = throttleKey(codigo);
  const actual = Number(cache.get(key) || '0');
  cache.put(key, String(actual + 1), BLOQUEO_SEGUNDOS);
}

function limpiarIntentosFallidos(codigo, services) {
  services.CacheService.getScriptCache().remove(throttleKey(codigo));
}

export function login(codigo, password, services) {
  if (!codigo || !password) return { error: 'Codigo y contrasena requeridos' };

  if (estaBloqueado(codigo, services)) {
    registrarLog(services, codigo, '-', 'login_bloqueado', 'Demasiados intentos fallidos');
    return { error: 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.' };
  }

  const user = findUser(codigo, services);
  if (!user) {
    registrarIntentoFallido(codigo, services);
    registrarLog(services, codigo, '-', 'login_fallido', 'Usuario no encontrado');
    return { error: 'Usuario o contraseña incorrectos' };
  }

  const hashIngresado = generarHashSHA256(String(password) + user.salt, services);
  if (String(user.password) !== hashIngresado) {
    registrarIntentoFallido(user.codigo, services);
    registrarLog(services, user.codigo, user.rol, 'login_fallido', 'Contraseña incorrecta');
    return { error: 'Usuario o contraseña incorrectos' };
  }

  limpiarIntentosFallidos(user.codigo, services);

  const expiresAt = Date.now() + TOKEN_DURATION_MS;
  const token = services.Utilities.base64Encode(`${user.codigo}:${user.rol}:${user.password}:${expiresAt}`);

  const result = { ok: true, token, rol: user.rol, nombre: user.nombre, codigo: user.codigo };
  if (user.rol === 'usuario' && String(password) === user.codigo) {
    result.debeCambiarPassword = true;
  }

  registrarLog(services, user.codigo, user.rol, 'login_exitoso', '');
  return result;
}

export function verifyToken(token, services) {
  if (!token) return null;
  try {
    const bytes = services.Utilities.base64Decode(token);
    const decoded = services.Utilities.newBlob(bytes).getDataAsString();
    const parts = decoded.split(':');
    if (parts.length < 4) return null;

    const [codigo, , passwordHash, expiresAtStr] = parts;
    const expiresAt = Number(expiresAtStr);
    if (!expiresAt || Date.now() > expiresAt) return null;

    const user = findUser(codigo, services);
    if (!user) return null;
    if (String(user.password) !== String(passwordHash)) return null;
    return user;
  } catch (e) {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/tests/auth.test.js`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth.js backend/tests/auth.test.js
git commit -m "feat(backend): add 15-minute login lockout after 5 failed attempts"
```

### Task 7: Guards de autorización y cambio de contraseña (`backend/src/guards.js`)

**Files:**
- Create: `backend/src/guards.js`
- Test: `backend/tests/guards.test.js`

Implementa `requireAuth` (para `doGet`, donde `p = e.parameter` incluye `token`), `requireAuthBody` (para `doPost`, donde el token ya fue extraído del body), y `cambiarPassword` (disponible para cualquier rol autenticado; exige conocer la contraseña actual y una contraseña nueva de al menos 6 caracteres).

- [ ] **Step 1: Write the failing test**

```javascript
// backend/tests/guards.test.js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { generarHashSHA256, generarSalt } from '../src/hash.js';
import { login } from '../src/auth.js';
import { requireAuth, requireAuthBody, cambiarPassword } from '../src/guards.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];

function buildServicesWithUser({ codigo, password, rol, nombre }) {
  const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER] } });
  const salt = generarSalt(services);
  const passwordHash = generarHashSHA256(password + salt, services);
  services.SpreadsheetApp._sheets['_usuarios'].push([codigo, passwordHash, salt, rol, nombre]);
  return services;
}

function userFromRow(row) {
  return { codigo: row[0], password: row[1], salt: row[2], rol: row[3], nombre: row[4] };
}

describe('requireAuth', () => {
  it('devuelve error No autorizado si el token es invalido', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const result = requireAuth({ token: 'invalido' }, [], () => ({ ok: true }), services);
    expect(result).toEqual({ error: 'No autorizado' });
  });

  it('devuelve error Permiso denegado si el rol no esta autorizado', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const { token } = login('REC001', 'secreta123', services);

    const result = requireAuth({ token }, ['administrador'], () => ({ ok: true }), services);
    expect(result).toEqual({ error: 'Permiso denegado' });
  });

  it('llama a fn con el usuario cuando el token es valido y el rol esta autorizado', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const { token } = login('ADM001', 'secreta123', services);

    const result = requireAuth({ token }, ['administrador'], (user) => ({ ok: true, codigo: user.codigo }), services);
    expect(result).toEqual({ ok: true, codigo: 'ADM001' });
  });

  it('permite cualquier rol autenticado cuando la lista de roles esta vacia', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const { token } = login('REC001', 'secreta123', services);

    const result = requireAuth({ token }, [], (user) => ({ ok: true, rol: user.rol }), services);
    expect(result).toEqual({ ok: true, rol: 'recepcion' });
  });
});

describe('requireAuthBody', () => {
  it('devuelve error No autorizado si el token es invalido', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const result = requireAuthBody('invalido', [], () => ({ ok: true }), services);
    expect(result).toEqual({ error: 'No autorizado' });
  });

  it('llama a fn con el usuario cuando el token es valido', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const { token } = login('ADM001', 'secreta123', services);

    const result = requireAuthBody(token, ['administrador'], (user) => ({ ok: true, codigo: user.codigo }), services);
    expect(result).toEqual({ ok: true, codigo: 'ADM001' });
  });
});

describe('cambiarPassword', () => {
  it('cambia la contrasena cuando la actual es correcta y la nueva es valida', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'claveVieja', rol: 'usuario', nombre: 'Paciente' });
    const user = userFromRow(services.SpreadsheetApp._sheets['_usuarios'][1]);

    const result = cambiarPassword({ passwordActual: 'claveVieja', passwordNueva: 'claveNueva123' }, user, services);
    expect(result).toEqual({ ok: true });

    const loginConNueva = login('USR001', 'claveNueva123', services);
    expect(loginConNueva.ok).toBe(true);
  });

  it('registra cambio_password en _log', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'claveVieja', rol: 'usuario', nombre: 'Paciente' });
    const user = userFromRow(services.SpreadsheetApp._sheets['_usuarios'][1]);

    cambiarPassword({ passwordActual: 'claveVieja', passwordNueva: 'claveNueva123' }, user, services);

    const logRows = services.SpreadsheetApp._sheets['_log'];
    expect(logRows[logRows.length - 1][3]).toBe('cambio_password');
  });

  it('rechaza si la contrasena actual es incorrecta', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'claveVieja', rol: 'usuario', nombre: 'Paciente' });
    const user = userFromRow(services.SpreadsheetApp._sheets['_usuarios'][1]);

    const result = cambiarPassword({ passwordActual: 'incorrecta', passwordNueva: 'claveNueva123' }, user, services);
    expect(result).toEqual({ error: 'La contraseña actual es incorrecta' });
  });

  it('rechaza una contrasena nueva menor a 6 caracteres', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'claveVieja', rol: 'usuario', nombre: 'Paciente' });
    const user = userFromRow(services.SpreadsheetApp._sheets['_usuarios'][1]);

    const result = cambiarPassword({ passwordActual: 'claveVieja', passwordNueva: 'abc12' }, user, services);
    expect(result).toEqual({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  });

  it('requiere ambas contrasenas', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'claveVieja', rol: 'usuario', nombre: 'Paciente' });
    const user = userFromRow(services.SpreadsheetApp._sheets['_usuarios'][1]);

    expect(cambiarPassword({}, user, services)).toEqual({ error: 'Contrasena actual y nueva son requeridas' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/guards.test.js`
Expected: FAIL — `../src/guards.js` no existe todavía.

- [ ] **Step 3: Create the guards module**

```javascript
// backend/src/guards.js
import { verifyToken } from './auth.js';
import { generarHashSHA256 } from './hash.js';
import { guardarUsuario } from './usuarios.js';
import { registrarLog } from './log.js';

const PASSWORD_MIN_LENGTH = 6;

export function requireAuth(p, roles, fn, services) {
  const user = verifyToken(p && p.token, services);
  if (!user) return { error: 'No autorizado' };
  if (roles.length > 0 && roles.indexOf(user.rol) === -1) return { error: 'Permiso denegado' };
  return fn(user);
}

export function requireAuthBody(token, roles, fn, services) {
  const user = verifyToken(token, services);
  if (!user) return { error: 'No autorizado' };
  if (roles.length > 0 && roles.indexOf(user.rol) === -1) return { error: 'Permiso denegado' };
  return fn(user);
}

export function cambiarPassword(b, usuarioAutenticado, services) {
  const passwordActual = b && b.passwordActual;
  const passwordNueva = b && b.passwordNueva;

  if (!passwordActual || !passwordNueva) {
    return { error: 'Contrasena actual y nueva son requeridas' };
  }
  if (String(passwordNueva).length < PASSWORD_MIN_LENGTH) {
    return { error: `La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres` };
  }

  const hashActual = generarHashSHA256(String(passwordActual) + usuarioAutenticado.salt, services);
  if (String(usuarioAutenticado.password) !== hashActual) {
    return { error: 'La contraseña actual es incorrecta' };
  }

  guardarUsuario(
    {
      codigo: usuarioAutenticado.codigo,
      rol: usuarioAutenticado.rol,
      nombre: usuarioAutenticado.nombre,
      password: passwordNueva,
    },
    services
  );

  registrarLog(services, usuarioAutenticado.codigo, usuarioAutenticado.rol, 'cambio_password', '');
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- backend/tests/guards.test.js`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/guards.js backend/tests/guards.test.js
git commit -m "feat(backend): add requireAuth/requireAuthBody guards and cambiarPassword"
```

### Task 8: Respuestas HTTP y enrutador (`backend/src/http.js`, `backend/src/router.js`)

**Files:**
- Create: `backend/src/http.js`
- Create: `backend/src/router.js`
- Test: `backend/tests/router.test.js`

`json_` envuelve cualquier objeto JS en una respuesta `ContentService` con MIME `application/json`. `handleGet`/`handlePost` despachan las acciones soportadas (`ping`, `login`, `listarUsuarios`, `guardarUsuario`, `eliminarUsuario`, `cambiarPassword`), aplicando `requireAuth`/`requireAuthBody` donde corresponde. `requireAuth`/`requireAuthBody` siempre devuelven objetos JS planos (nunca el resultado de `json_`); el router es responsable de envolver el resultado final con `json_` exactamente una vez.

- [ ] **Step 1: Write the failing test**

```javascript
// backend/tests/router.test.js
import { describe, it, expect } from 'vitest';
import { createMockServices } from '../mocks/gas-services.js';
import { generarHashSHA256, generarSalt } from '../src/hash.js';
import { handleGet, handlePost } from '../src/router.js';

const USUARIOS_HEADER = ['codigo', 'password', 'salt', 'rol', 'nombre'];
const LOG_HEADER = ['timestamp', 'codigo', 'rol', 'accion', 'detalle'];

function buildServicesWithUser({ codigo, password, rol, nombre }) {
  const services = createMockServices({ sheets: { _usuarios: [USUARIOS_HEADER], _log: [LOG_HEADER] } });
  const salt = generarSalt(services);
  const passwordHash = generarHashSHA256(password + salt, services);
  services.SpreadsheetApp._sheets['_usuarios'].push([codigo, passwordHash, salt, rol, nombre]);
  return services;
}

function bodyOf(output) {
  return JSON.parse(output._text);
}

function loginToken(services, codigo, password) {
  const result = handlePost(
    { postData: { contents: JSON.stringify({ accion: 'login', codigo, password }) } },
    services
  );
  return bodyOf(result).token;
}

describe('handleGet', () => {
  it('responde ping con ok:true', () => {
    const services = createMockServices();
    const result = handleGet({ parameter: { accion: 'ping' } }, services);
    expect(bodyOf(result)).toEqual({ ok: true });
    expect(result._mimeType).toBe('application/json');
  });

  it('devuelve error para una accion no reconocida', () => {
    const services = createMockServices();
    const result = handleGet({ parameter: { accion: 'inexistente' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Accion no reconocida' });
  });

  it('listarUsuarios requiere rol administrador', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarUsuarios', token } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('listarUsuarios devuelve la lista de usuarios para un administrador', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handleGet({ parameter: { accion: 'listarUsuarios', token } }, services);
    expect(bodyOf(result)).toEqual({ ok: true, usuarios: [{ codigo: 'ADM001', rol: 'administrador', nombre: 'Admin' }] });
  });
});

describe('handlePost', () => {
  it('login devuelve un token con credenciales correctas', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'login', codigo: 'ADM001', password: 'secreta123' }) } },
      services
    );
    expect(bodyOf(result).ok).toBe(true);
    expect(typeof bodyOf(result).token).toBe('string');
  });

  it('devuelve error JSON invalido si el body no es JSON', () => {
    const services = createMockServices();
    const result = handlePost({ postData: { contents: 'no-es-json' } }, services);
    expect(bodyOf(result)).toEqual({ error: 'JSON invalido' });
  });

  it('devuelve error para una accion no reconocida', () => {
    const services = createMockServices();
    const result = handlePost({ postData: { contents: JSON.stringify({ accion: 'inexistente' }) } }, services);
    expect(bodyOf(result)).toEqual({ error: 'Accion no reconocida' });
  });

  it('guardarUsuario requiere rol administrador', () => {
    const services = buildServicesWithUser({ codigo: 'REC001', password: 'secreta123', rol: 'recepcion', nombre: 'Recepcion' });
    const token = loginToken(services, 'REC001', 'secreta123');

    const result = handlePost(
      {
        postData: {
          contents: JSON.stringify({ accion: 'guardarUsuario', token, codigo: 'NUE001', rol: 'usuario', nombre: 'Nuevo', password: 'clave123' }),
        },
      },
      services
    );
    expect(bodyOf(result)).toEqual({ error: 'Permiso denegado' });
  });

  it('guardarUsuario crea un usuario nuevo para un administrador', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handlePost(
      {
        postData: {
          contents: JSON.stringify({ accion: 'guardarUsuario', token, codigo: 'NUE001', rol: 'usuario', nombre: 'Nuevo', password: 'clave123' }),
        },
      },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true, accion: 'creado' });
  });

  it('eliminarUsuario elimina un usuario para un administrador', () => {
    const services = buildServicesWithUser({ codigo: 'ADM001', password: 'secreta123', rol: 'administrador', nombre: 'Admin' });
    services.SpreadsheetApp._sheets['_usuarios'].push(['NUE001', 'hash', 'salt', 'usuario', 'Nuevo']);
    const token = loginToken(services, 'ADM001', 'secreta123');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'eliminarUsuario', token, codigo: 'NUE001' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });

  it('cambiarPassword esta disponible para cualquier rol autenticado', () => {
    const services = buildServicesWithUser({ codigo: 'USR001', password: 'claveVieja', rol: 'usuario', nombre: 'Paciente' });
    const token = loginToken(services, 'USR001', 'claveVieja');

    const result = handlePost(
      { postData: { contents: JSON.stringify({ accion: 'cambiarPassword', token, passwordActual: 'claveVieja', passwordNueva: 'claveNueva123' }) } },
      services
    );
    expect(bodyOf(result)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/router.test.js`
Expected: FAIL — `../src/http.js` y `../src/router.js` no existen todavía.

- [ ] **Step 3: Create the HTTP helper module**

```javascript
// backend/src/http.js
export function json_(data, services) {
  return services.ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    services.ContentService.MimeType.JSON
  );
}
```

- [ ] **Step 4: Create the router module**

```javascript
// backend/src/router.js
import { json_ } from './http.js';
import { login } from './auth.js';
import { listarUsuarios, guardarUsuario, eliminarUsuario } from './usuarios.js';
import { requireAuth, requireAuthBody, cambiarPassword } from './guards.js';

export function handleGet(e, services) {
  const p = (e && e.parameter) || {};

  switch (p.accion) {
    case 'ping':
      return json_({ ok: true }, services);

    case 'listarUsuarios':
      return json_(requireAuth(p, ['administrador'], () => listarUsuarios(services), services), services);

    default:
      return json_({ error: 'Accion no reconocida' }, services);
  }
}

export function handlePost(e, services) {
  let b = {};
  try {
    b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ error: 'JSON invalido' }, services);
  }

  switch (b.accion) {
    case 'login':
      return json_(login(b.codigo, b.password, services), services);

    case 'guardarUsuario':
      return json_(
        requireAuthBody(b.token, ['administrador'], () => guardarUsuario(b, services), services),
        services
      );

    case 'eliminarUsuario':
      return json_(
        requireAuthBody(b.token, ['administrador'], () => eliminarUsuario(b.codigo, services), services),
        services
      );

    case 'cambiarPassword':
      return json_(
        requireAuthBody(b.token, [], (user) => cambiarPassword(b, user, services), services),
        services
      );

    default:
      return json_({ error: 'Accion no reconocida' }, services);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- backend/tests/router.test.js`
Expected: PASS (11 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/http.js backend/src/router.js backend/tests/router.test.js
git commit -m "feat(backend): add JSON response helper and HTTP router for doGet/doPost"
```

### Task 9: Entry point GAS y script de build (`backend/src/index.js`, `backend/build.js`)

**Files:**
- Create: `backend/src/index.js`
- Create: `backend/build.js`
- Modify: `package.json`
- Test: `backend/tests/build.test.js`

`backend/src/index.js` define `doGet`/`doPost`, los puntos de entrada reales de Apps Script, conectando el router con los servicios globales de GAS (`Utilities`, `SpreadsheetApp`, `CacheService`, `PropertiesService`, `ContentService` — disponibles como identificadores globales en el runtime de Apps Script). `backend/build.js` concatena todos los módulos de `backend/src/` (en el orden `hash.js, aes.js, log.js, usuarios.js, auth.js, guards.js, http.js, router.js, index.js`), elimina las líneas `import` y la palabra clave `export`, y escribe el resultado en `backend/dist/gas-smpdjm.txt` (carpeta ya cubierta por la regla `dist/` de `.gitignore`), listo para copiar y pegar en el editor de Apps Script.

- [ ] **Step 1: Write the failing test**

```javascript
// backend/tests/build.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createMockServices } from '../mocks/gas-services.js';

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- backend/tests/build.test.js`
Expected: FAIL — `backend/build.js` no existe todavía (`execFileSync` falla con "Cannot find module").

- [ ] **Step 3: Create the GAS entry point**

```javascript
// backend/src/index.js
import { handleGet, handlePost } from './router.js';

const gasServices = {
  Utilities,
  SpreadsheetApp,
  CacheService,
  PropertiesService,
  ContentService,
};

function doGet(e) {
  return handleGet(e, gasServices);
}

function doPost(e) {
  return handlePost(e, gasServices);
}
```

- [ ] **Step 4: Create the build script**

```javascript
// backend/build.js
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FILES = [
  'hash.js',
  'aes.js',
  'log.js',
  'usuarios.js',
  'auth.js',
  'guards.js',
  'http.js',
  'router.js',
  'index.js',
];

function stripImportsExports(source) {
  return source
    .split('\n')
    .filter((line) => !/^\s*import\s.+from\s+['"].*['"];?\s*$/.test(line))
    .map((line) => line.replace(/^export\s+(function|const|class|let|var)\s+/, '$1 '))
    .join('\n');
}

const srcDir = join(__dirname, 'src');
const distDir = join(__dirname, 'dist');
mkdirSync(distDir, { recursive: true });

const parts = FILES.map((filename) => {
  const source = readFileSync(join(srcDir, filename), 'utf8');
  return `// ===== ${filename} =====\n${stripImportsExports(source)}`;
});

writeFileSync(join(distDir, 'gas-smpdjm.txt'), parts.join('\n\n'), 'utf8');
console.log(`Build OK -> backend/dist/gas-smpdjm.txt (${FILES.length} archivos)`);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- backend/tests/build.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Add the build:backend script to package.json**

In `package.json`, add `"build:backend"` to the `scripts` section:

```json
{
  "name": "smpdjm",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:backend": "node backend/build.js",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS — todos los tests del proyecto (landing + backend) pasan.

- [ ] **Step 8: Commit**

```bash
git add backend/src/index.js backend/build.js backend/tests/build.test.js package.json
git commit -m "feat(backend): add GAS entry point and build script for gas-smpdjm.txt"
```

