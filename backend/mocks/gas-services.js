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

export function createMockCalendarApp() {
  const calendars = new Map();
  let nextCalendarId = 1;
  let nextEventId = 1;

  function buildCalendar(id, name) {
    const events = new Map();
    return {
      getId: () => id,
      getName: () => name,
      createEvent(title, start, end, options) {
        const eventId = `event-${nextEventId++}`;
        const event = {
          getId: () => eventId,
          getTitle: () => title,
          deleteEvent: () => events.delete(eventId),
        };
        events.set(eventId, event);
        return event;
      },
      getEventById: (eventId) => events.get(eventId) || null,
    };
  }

  return {
    getCalendarsByName(name) {
      return [...calendars.values()].filter((cal) => cal.getName() === name);
    },
    createCalendar(name) {
      const id = `calendar-${nextCalendarId++}`;
      const calendar = buildCalendar(id, name);
      calendars.set(id, calendar);
      return calendar;
    },
    getCalendarById(id) {
      return calendars.get(id) || null;
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
    CalendarApp: createMockCalendarApp(),
  };
}
