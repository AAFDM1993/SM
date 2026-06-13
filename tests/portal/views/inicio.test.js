import { describe, it, expect, beforeEach } from 'vitest';
import { initInicioView } from '../../../src/portal/views/inicio.js';

describe('initInicioView', () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = '<main id="main"></main>';
    container = document.getElementById('main');
  });

  it('muestra el nombre y el rol del usuario en sesion', () => {
    const ctx = {
      session: { token: 'tok', codigo: '1', rol: 'administrador', nombre: 'Ana', debeCambiarPassword: false },
      forced: false,
    };

    initInicioView(container, ctx);

    expect(container.querySelector('h2').textContent).toBe('Bienvenido/a, Ana');
    expect(container.querySelector('p').textContent).toBe('Rol: administrador');
  });

  it('escapa el nombre del usuario para evitar XSS', () => {
    const ctx = {
      session: {
        token: 'tok',
        codigo: '1',
        rol: 'usuario',
        nombre: '<script>alert(1)</script>',
        debeCambiarPassword: false,
      },
      forced: false,
    };

    initInicioView(container, ctx);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('h2').textContent).toBe('Bienvenido/a, <script>alert(1)</script>');
  });

  it('reemplaza el contenido anterior al volver a renderizar', () => {
    const ctx = {
      session: { token: 'tok', codigo: '1', rol: 'administrador', nombre: 'Ana', debeCambiarPassword: false },
      forced: false,
    };

    initInicioView(container, ctx);
    initInicioView(container, ctx);

    expect(container.querySelectorAll('h2').length).toBe(1);
  });
});
