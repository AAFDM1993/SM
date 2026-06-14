import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDashboard, MENUS } from '../../src/portal/dashboard.js';
import { setSession, getSession } from '../../src/portal/session.js';
import { initInicioView } from '../../src/portal/views/inicio.js';
import { initUsuariosView } from '../../src/portal/views/usuarios.js';
import { initCambiarPasswordView } from '../../src/portal/views/cambiar-password.js';
import { initAgendaView } from '../../src/portal/views/agenda.js';
import { initMiAgendaView } from '../../src/portal/views/mi-agenda.js';

vi.mock('../../src/portal/views/inicio.js', () => ({ initInicioView: vi.fn() }));
vi.mock('../../src/portal/views/usuarios.js', () => ({ initUsuariosView: vi.fn() }));
vi.mock('../../src/portal/views/cambiar-password.js', () => ({ initCambiarPasswordView: vi.fn() }));
vi.mock('../../src/portal/views/agenda.js', () => ({ initAgendaView: vi.fn() }));
vi.mock('../../src/portal/views/mi-agenda.js', () => ({ initMiAgendaView: vi.fn() }));

function renderDashboardPage() {
  document.body.innerHTML = `
    <header>
      <span id="user-nombre"></span>
      <span id="user-rol"></span>
      <button id="nav-toggle" aria-expanded="false"></button>
      <button id="logout-button"></button>
    </header>
    <nav id="nav-menu"></nav>
    <main id="dashboard-main"></main>
  `;
}

const ADMIN_SESSION = {
  token: 'tok',
  codigo: 'admin',
  rol: 'administrador',
  nombre: 'Admin',
  debeCambiarPassword: false,
};

describe('initDashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    renderDashboardPage();
    vi.stubGlobal('location', { href: '', search: '' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('redirige al login si no hay sesion', () => {
    initDashboard();

    expect(window.location.href).toBe('/portal/');
  });

  it('renderiza el nombre y rol del usuario en el header', () => {
    setSession(ADMIN_SESSION);

    initDashboard();

    expect(document.getElementById('user-nombre').textContent).toBe('Admin');
    expect(document.getElementById('user-rol').textContent).toBe('administrador');
  });

  it('cierra sesion y redirige al login al hacer click en Cerrar sesion', () => {
    setSession(ADMIN_SESSION);

    initDashboard();
    document.getElementById('logout-button').click();

    expect(getSession()).toBeNull();
    expect(window.location.href).toBe('/portal/');
  });

  it('muestra la vista inicio por defecto', () => {
    setSession(ADMIN_SESSION);

    initDashboard();

    expect(initInicioView).toHaveBeenCalledWith(document.getElementById('dashboard-main'), {
      session: ADMIN_SESSION,
      forced: false,
    });
  });

  describe('menu por rol', () => {
    Object.entries(MENUS).forEach(([rol, items]) => {
      it(`renderiza los items correctos para el rol ${rol}`, () => {
        setSession({ token: 'tok', codigo: '1', rol, nombre: 'Test', debeCambiarPassword: false });

        initDashboard();

        const rendered = document.querySelectorAll('#nav-menu .dashboard-nav__item');
        expect(rendered.length).toBe(items.length);

        items.forEach((item, index) => {
          const button = rendered[index];
          expect(button.dataset.view).toBe(item.id);
          expect(button.disabled).toBe(!item.enabled);
          expect(button.textContent).toBe(item.enabled ? item.label : `${item.label} (Próximamente)`);
        });
      });
    });
  });

  it('cambia de vista al hacer click en un item habilitado', () => {
    setSession(ADMIN_SESSION);

    initDashboard();
    document.querySelector('#nav-menu .dashboard-nav__item[data-view="usuarios"]').click();

    expect(initUsuariosView).toHaveBeenCalledWith(document.getElementById('dashboard-main'), {
      session: ADMIN_SESSION,
      forced: false,
    });
  });

  it('cambia a la vista agenda al hacer click en el item Agenda para administrador', () => {
    setSession(ADMIN_SESSION);

    initDashboard();
    document.querySelector('#nav-menu .dashboard-nav__item[data-view="agenda"]').click();

    expect(initAgendaView).toHaveBeenCalledWith(document.getElementById('dashboard-main'), {
      session: ADMIN_SESSION,
      forced: false,
    });
  });

  it('cambia a la vista mi-agenda al hacer click en el item Mi agenda para usuario', () => {
    const session = { token: 'tok', codigo: 'PAC001', rol: 'usuario', nombre: 'Paciente', debeCambiarPassword: false };
    setSession(session);

    initDashboard();
    document.querySelector('#nav-menu .dashboard-nav__item[data-view="mi-agenda"]').click();

    expect(initMiAgendaView).toHaveBeenCalledWith(document.getElementById('dashboard-main'), {
      session,
      forced: false,
    });
  });

  it('fuerza la vista de cambiar contrasena y deshabilita el resto del menu si debeCambiarPassword es true', () => {
    const session = { ...ADMIN_SESSION, debeCambiarPassword: true };
    setSession(session);

    initDashboard();

    expect(initCambiarPasswordView).toHaveBeenCalledWith(document.getElementById('dashboard-main'), {
      session,
      forced: true,
    });
    expect(initInicioView).not.toHaveBeenCalled();

    const items = document.querySelectorAll('#nav-menu .dashboard-nav__item');
    items.forEach((item) => {
      if (item.dataset.view === 'cambiar-password') {
        expect(item.disabled).toBe(false);
      } else {
        expect(item.disabled).toBe(true);
      }
    });
  });
});
