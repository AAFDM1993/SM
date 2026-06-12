import { describe, it, expect, beforeEach } from 'vitest';
import { initMobileMenu } from '../../src/landing/nav.js';

describe('initMobileMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="nav-toggle" aria-expanded="false">Menu</button>
      <nav id="nav-menu">
        <a href="#sobre">Sobre</a>
        <a href="#servicios">Servicios</a>
      </nav>
    `;
  });

  it('abre el menu al hacer click en el boton toggle', () => {
    initMobileMenu();
    const toggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('nav-menu');

    toggle.click();

    expect(nav.classList.contains('is-open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('cierra el menu si se hace click de nuevo en el boton toggle', () => {
    initMobileMenu();
    const toggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('nav-menu');

    toggle.click();
    toggle.click();

    expect(nav.classList.contains('is-open')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('cierra el menu al hacer click en un enlace de navegacion', () => {
    initMobileMenu();
    const toggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('nav-menu');
    const link = nav.querySelector('a');

    toggle.click();
    expect(nav.classList.contains('is-open')).toBe(true);

    link.click();

    expect(nav.classList.contains('is-open')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
