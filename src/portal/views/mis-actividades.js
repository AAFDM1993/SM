import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';

export function initMisActividadesView(container, ctx) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'view-mis-actividades';

  const heading = document.createElement('h2');
  heading.textContent = 'Mis actividades';
  wrapper.appendChild(heading);

  const errorEl = document.createElement('div');
  errorEl.className = 'view-mis-actividades__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const pendientesSection = document.createElement('section');
  pendientesSection.className = 'view-mis-actividades__pendientes';
  const pendientesTitulo = document.createElement('h3');
  pendientesTitulo.textContent = 'Pendientes';
  pendientesSection.appendChild(pendientesTitulo);
  const pendientesList = document.createElement('div');
  pendientesList.className = 'view-mis-actividades__pendientes-lista';
  pendientesSection.appendChild(pendientesList);
  wrapper.appendChild(pendientesSection);

  const completadasSection = document.createElement('section');
  completadasSection.className = 'view-mis-actividades__completadas';
  const completadasTitulo = document.createElement('h3');
  completadasTitulo.textContent = 'Completadas';
  completadasSection.appendChild(completadasTitulo);
  const completadasTabla = document.createElement('table');
  completadasTabla.className = 'view-mis-actividades__completadas-tabla';
  completadasSection.appendChild(completadasTabla);
  wrapper.appendChild(completadasSection);

  container.appendChild(wrapper);

  let tareas = [];

  function calcularOcurrencias(tarea) {
    const hoy = new Date().toISOString().slice(0, 10);
    const fin = tarea.fechaFin < hoy ? tarea.fechaFin : hoy;
    const ocurrencias = [];
    let cur = tarea.fechaInicio;
    while (cur <= fin) {
      ocurrencias.push(cur);
      if (tarea.tipo === 'única') break;
      const d = new Date(cur + 'T12:00:00Z');
      if (tarea.frecuencia === 'diaria') d.setUTCDate(d.getUTCDate() + 1);
      else d.setUTCDate(d.getUTCDate() + 7);
      cur = d.toISOString().slice(0, 10);
    }
    return ocurrencias;
  }

  function renderPendientes() {
    pendientesList.innerHTML = '';
    const hayPendientes = tareas.some((t) => {
      const completadasFechas = new Set(t.registros.map((r) => r.fechaOcurrencia));
      return calcularOcurrencias(t).some((o) => !completadasFechas.has(o));
    });

    if (!hayPendientes) {
      pendientesList.textContent = 'No hay actividades pendientes.';
      return;
    }

    tareas.forEach((tarea) => {
      const completadasFechas = new Set(tarea.registros.map((r) => r.fechaOcurrencia));
      const pendientes = calcularOcurrencias(tarea).filter((o) => !completadasFechas.has(o));
      if (pendientes.length === 0) return;

      const grupo = document.createElement('div');
      grupo.className = 'view-mis-actividades__tarea-grupo';

      const tituloEl = document.createElement('div');
      tituloEl.className = 'view-mis-actividades__tarea-titulo';
      tituloEl.textContent = tarea.titulo;
      grupo.appendChild(tituloEl);

      pendientes.forEach((fecha) => {
        const item = document.createElement('div');
        item.className = 'view-mis-actividades__ocurrencia';

        const fechaEl = document.createElement('span');
        fechaEl.className = 'view-mis-actividades__ocurrencia-fecha';
        fechaEl.textContent = fecha;
        item.appendChild(fechaEl);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'button button--primary view-mis-actividades__btn-cumplir';
        btn.textContent = 'Marcar cumplida';
        btn.dataset.tareaId = tarea.id;
        btn.dataset.fecha = fecha;
        item.appendChild(btn);

        const formContainer = document.createElement('div');
        formContainer.className = 'view-mis-actividades__form-cumplir';
        formContainer.hidden = true;

        const notaInput = document.createElement('textarea');
        notaInput.className = 'view-mis-actividades__nota-input';
        notaInput.placeholder = 'Nota opcional...';
        formContainer.appendChild(notaInput);

        const formError = document.createElement('div');
        formError.className = 'view-mis-actividades__cumplir-error';
        formError.hidden = true;
        formContainer.appendChild(formError);

        const confirmarBtn = document.createElement('button');
        confirmarBtn.type = 'button';
        confirmarBtn.className = 'button button--primary view-mis-actividades__btn-confirmar';
        confirmarBtn.textContent = 'Confirmar';
        formContainer.appendChild(confirmarBtn);

        btn.addEventListener('click', () => { formContainer.hidden = !formContainer.hidden; });

        confirmarBtn.addEventListener('click', async () => {
          formError.hidden = true;
          const result = await apiPost({
            accion: 'completarOcurrencia',
            token: ctx.session.token,
            tareaId: tarea.id,
            fechaOcurrencia: fecha,
            nota: notaInput.value.trim(),
          });
          if (result.error) {
            if (handleAuthError(result)) return;
            formError.textContent = result.error;
            formError.hidden = false;
            return;
          }
          const idx = tareas.findIndex((t) => t.id === tarea.id);
          if (idx !== -1) tareas[idx].registros.push(result.registro);
          renderPendientes();
          renderCompletadas();
        });

        item.appendChild(formContainer);
        grupo.appendChild(item);
      });

      pendientesList.appendChild(grupo);
    });
  }

  function renderCompletadas() {
    completadasTabla.innerHTML = '';
    const completadas = [];
    tareas.forEach((t) => {
      t.registros.forEach((r) => completadas.push({ titulo: t.titulo, ...r }));
    });
    completadas.sort((a, b) => b.fechaOcurrencia.localeCompare(a.fechaOcurrencia));

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Tarea</th><th>Fecha</th><th>Nota</th></tr>';
    completadasTabla.appendChild(thead);
    const tbody = document.createElement('tbody');
    completadas.forEach((c) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${c.titulo}</td><td>${c.fechaOcurrencia}</td><td>${c.nota || '—'}</td>`;
      tbody.appendChild(tr);
    });
    completadasTabla.appendChild(tbody);
  }

  async function loadActividades() {
    const result = await apiGet('listarMisActividades', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }
    tareas = result.tareas;
    renderPendientes();
    renderCompletadas();
  }

  loadActividades();
}
