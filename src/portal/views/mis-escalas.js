import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';
import { ESCALAS_CATALOGO, renderPreguntasEscala } from './escalas-catalogo.js';

export function initMisEscalasView(container, ctx) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'view-mis-escalas';

  const heading = document.createElement('h2');
  heading.textContent = 'Mis escalas';
  wrapper.appendChild(heading);

  const errorEl = document.createElement('div');
  errorEl.className = 'view-mis-escalas__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const pendientesSection = document.createElement('section');
  pendientesSection.className = 'view-mis-escalas__pendientes';
  const pendientesTitulo = document.createElement('h3');
  pendientesTitulo.textContent = 'Pendientes';
  pendientesSection.appendChild(pendientesTitulo);
  const pendientesList = document.createElement('div');
  pendientesList.className = 'view-mis-escalas__pendientes-lista';
  pendientesSection.appendChild(pendientesList);
  wrapper.appendChild(pendientesSection);

  const completadasSection = document.createElement('section');
  completadasSection.className = 'view-mis-escalas__completadas';
  const completadasTitulo = document.createElement('h3');
  completadasTitulo.textContent = 'Completadas';
  completadasSection.appendChild(completadasTitulo);
  const completadasTabla = document.createElement('table');
  completadasTabla.className = 'view-mis-escalas__completadas-tabla';
  completadasSection.appendChild(completadasTabla);
  wrapper.appendChild(completadasSection);

  container.appendChild(wrapper);

  let escalas = [];

  function renderPendientes() {
    pendientesList.innerHTML = '';
    const pendientes = escalas.filter((e) => e.estado === 'pendiente');
    if (pendientes.length === 0) {
      pendientesList.textContent = 'No hay escalas pendientes.';
      return;
    }
    pendientes.forEach((escala) => {
      const card = document.createElement('div');
      card.className = 'view-mis-escalas__pendiente-card';

      const nombre = document.createElement('div');
      nombre.className = 'view-mis-escalas__pendiente-nombre';
      nombre.textContent = ESCALAS_CATALOGO[escala.escalaTipo]?.nombre || escala.escalaTipo;
      card.appendChild(nombre);

      const fecha = document.createElement('div');
      fecha.className = 'view-mis-escalas__pendiente-fecha';
      fecha.textContent = `Asignada: ${escala.fechaCreacion.slice(0, 10)}`;
      card.appendChild(fecha);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'button button--primary view-mis-escalas__btn-completar';
      btn.textContent = 'Completar';
      btn.dataset.id = escala.id;
      card.appendChild(btn);

      // formContainer: class includes 'view-mis-escalas__form-completar' so tests can find it
      const formContainer = document.createElement('div');
      formContainer.className = 'view-mis-escalas__form-completar';
      formContainer.hidden = true;
      card.appendChild(formContainer);

      btn.addEventListener('click', () => {
        formContainer.hidden = !formContainer.hidden;
        if (!formContainer.hidden && !formContainer.dataset.initialized) {
          renderFormCompletar(escala, formContainer);
          formContainer.dataset.initialized = 'true';
        }
      });

      pendientesList.appendChild(card);
    });
  }

  function renderFormCompletar(escala, formContainerEl) {
    const form = document.createElement('form');
    form.className = 'view-mis-escalas__completar-form';

    const preguntasDiv = document.createElement('div');
    form.appendChild(preguntasDiv);
    const getResponstas = renderPreguntasEscala(escala.escalaTipo, preguntasDiv, `completar-${escala.id}`);

    const formError = document.createElement('div');
    formError.className = 'view-mis-escalas__completar-error';
    formError.hidden = true;
    form.appendChild(formError);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'button button--primary';
    submitBtn.textContent = 'Enviar respuestas';
    form.appendChild(submitBtn);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      formError.hidden = true;
      const respuestas = getResponstas();
      if (!respuestas) {
        formError.textContent = 'Debe responder todas las preguntas';
        formError.hidden = false;
        return;
      }
      const result = await apiPost({
        accion: 'completarEscala',
        token: ctx.session.token,
        aplicacionId: escala.id,
        respuestas,
      });
      if (result.error) {
        if (handleAuthError(result)) return;
        formError.textContent = result.error;
        formError.hidden = false;
        return;
      }
      const idx = escalas.findIndex((e) => e.id === escala.id);
      if (idx !== -1) {
        escalas[idx] = { ...escalas[idx], estado: 'completada', ...result.aplicacion };
      }
      renderPendientes();
      renderCompletadas();
    });

    formContainerEl.appendChild(form);
  }

  function renderCompletadas() {
    completadasTabla.innerHTML = '';
    const completadas = escalas.filter((e) => e.estado === 'completada');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Tipo</th><th>Modo</th><th>Puntaje</th><th>Part A</th><th>Fecha</th></tr>';
    completadasTabla.appendChild(thead);
    const tbody = document.createElement('tbody');
    completadas.forEach((e) => {
      const tr = document.createElement('tr');
      const modoLabel = e.modo === 'manual' ? 'Aplicada por psiquiatra' : 'Autoaplicada';
      const partA = e.partAPositivo ? 'Positivo' : 'Negativo';
      const fecha = (e.fechaCompletada || e.fechaCreacion || '').slice(0, 10);
      tr.innerHTML = `<td>${ESCALAS_CATALOGO[e.escalaTipo]?.nombre || e.escalaTipo}</td><td>${modoLabel}</td><td>${e.puntajeTotal}</td><td>${partA}</td><td>${fecha}</td>`;
      tbody.appendChild(tr);
    });
    completadasTabla.appendChild(tbody);
  }

  async function loadEscalas() {
    const result = await apiGet('listarMisEscalas', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }
    escalas = result.escalas;
    renderPendientes();
    renderCompletadas();
  }

  loadEscalas();
}
