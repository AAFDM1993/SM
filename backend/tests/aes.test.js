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
