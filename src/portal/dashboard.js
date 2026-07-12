import './dashboard.css';
import './views.css';
import { getSession, isAuthenticated, clearSession, redirectTo } from './session.js';
import { initMobileMenu } from './nav.js';
import { initInicioView } from './views/inicio.js';
import { initUsuariosView } from './views/usuarios.js';
import { initCambiarPasswordView } from './views/cambiar-password.js';
import { initAgendaView } from './views/agenda.js';
import { initMiAgendaView } from './views/mi-agenda.js';
import { initPacientesView } from './views/pacientes.js';
import { initHistoriaClinicaView } from './views/historia-clinica.js';
import { initMisEscalasView } from './views/mis-escalas.js';

export const MENUS = {
  administrador: [
    { id: 'usuarios', label: 'Gestión de usuarios', enabled: true },
    { id: 'agenda', label: 'Agenda', enabled: true },
    { id: 'pacientes', label: 'Pacientes', enabled: true },
    { id: 'prescripciones', label: 'Prescripciones', enabled: false },
    { id: 'escalas', label: 'Escalas', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
  psiquiatra: [
    { id: 'agenda', label: 'Agenda', enabled: true },
    { id: 'pacientes', label: 'Pacientes', enabled: true },
    { id: 'historia-clinica', label: 'Historia Clínica', enabled: true },
    { id: 'prescripciones', label: 'Prescripciones', enabled: false },
    { id: 'escalas', label: 'Escalas', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
  recepcion: [
    { id: 'agenda', label: 'Agenda', enabled: true },
    { id: 'pacientes', label: 'Pacientes', enabled: true },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
  usuario: [
    { id: 'mi-agenda', label: 'Mi agenda', enabled: true },
    { id: 'mis-escalas', label: 'Mis escalas', enabled: true },
    { id: 'mis-actividades', label: 'Mis actividades', enabled: false },
    { id: 'cambiar-password', label: 'Cambiar contraseña', enabled: true },
  ],
};

export const VIEWS = {
  inicio: initInicioView,
  usuarios: initUsuariosView,
  'cambiar-password': initCambiarPasswordView,
  agenda: initAgendaView,
  'mi-agenda': initMiAgendaView,
  pacientes: initPacientesView,
  'historia-clinica': initHistoriaClinicaView,
  'mis-escalas': initMisEscalasView,
};

export function initDashboard() {
  if (!isAuthenticated()) {
    redirectTo('/portal/');
    return;
  }

  const session = getSession();
  const ctx = { session, forced: session.debeCambiarPassword === true };

  renderHeader(session);
  renderNav(session.rol, ctx);
  initMobileMenu();

  const main = document.getElementById('dashboard-main');
  if (ctx.forced) {
    initCambiarPasswordView(main, ctx);
  } else {
    initInicioView(main, ctx);
  }
}

function renderHeader(session) {
  document.getElementById('user-nombre').textContent = session.nombre;
  document.getElementById('user-rol').textContent = session.rol;

  document.getElementById('logout-button').addEventListener('click', () => {
    clearSession();
    redirectTo('/portal/');
  });
}

function renderNav(rol, ctx) {
  const nav = document.getElementById('nav-menu');
  nav.innerHTML = '';

  const items = MENUS[rol] || [];
  items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.view = item.id;
    button.className = 'dashboard-nav__item';

    const disabled = !item.enabled || (ctx.forced && item.id !== 'cambiar-password');

    if (disabled) {
      button.disabled = true;
      button.classList.add('dashboard-nav__item--disabled');
      button.textContent = item.enabled ? item.label : `${item.label} (Próximamente)`;
    } else {
      button.textContent = item.label;
      button.addEventListener('click', () => {
        const main = document.getElementById('dashboard-main');
        VIEWS[item.id](main, ctx);
      });
    }

    nav.appendChild(button);
  });
}
