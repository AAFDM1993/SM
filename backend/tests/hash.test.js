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
