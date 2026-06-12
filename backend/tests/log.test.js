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
