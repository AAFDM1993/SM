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

  const prescripcionesSection = document.createElement('section');
  prescripcionesSection.className = 'view-mis-actividades__prescripciones';
  const prescripcionesTitulo = document.createElement('h3');
  prescripcionesTitulo.textContent = 'Mis prescripciones';
  prescripcionesSection.appendChild(prescripcionesTitulo);
  const prescripcionesActivasList = document.createElement('div');
  prescripcionesActivasList.className = 'view-mis-actividades__prescripciones-activas';
  prescripcionesSection.appendChild(prescripcionesActivasList);
  wrapper.appendChild(prescripcionesSection);

  const tomasHistorialSection = document.createElement('section');
  tomasHistorialSection.className = 'view-mis-actividades__tomas-historial';
  const tomasHistorialTitulo = document.createElement('h3');
  tomasHistorialTitulo.textContent = 'Historial de tomas';
  tomasHistorialSection.appendChild(tomasHistorialTitulo);
  const tomasTabla = document.createElement('table');
  tomasTabla.className = 'view-mis-actividades__tomas-tabla';
  tomasHistorialSection.appendChild(tomasTabla);
  wrapper.appendChild(tomasHistorialSection);

  const sintomasSection = document.createElement('section');
  sintomasSection.className = 'view-mis-actividades__sintomas';
  const sintomasTitulo = document.createElement('h3');
  sintomasTitulo.textContent = 'Mis síntomas';
  sintomasSection.appendChild(sintomasTitulo);

  const sintomasTipo = document.createElement('select');
  sintomasTipo.className = 'view-mis-actividades__sintoma-tipo';
  ['Ánimo', 'Ansiedad', 'Sueño', 'Energía', 'Irritabilidad'].forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    sintomasTipo.appendChild(opt);
  });
  sintomasSection.appendChild(sintomasTipo);

  const sintomasIntensidad = document.createElement('select');
  sintomasIntensidad.className = 'view-mis-actividades__sintoma-intensidad';
  [1, 2, 3, 4, 5].forEach((n) => {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = String(n);
    sintomasIntensidad.appendChild(opt);
  });
  sintomasSection.appendChild(sintomasIntensidad);

  const sintomasNota = document.createElement('textarea');
  sintomasNota.className = 'view-mis-actividades__sintoma-nota';
  sintomasNota.placeholder = 'Nota opcional...';
  sintomasSection.appendChild(sintomasNota);

  const sintomasFormError = document.createElement('div');
  sintomasFormError.className = 'view-mis-actividades__sintoma-form-error';
  sintomasFormError.hidden = true;
  sintomasSection.appendChild(sintomasFormError);

  const sintomasBtn = document.createElement('button');
  sintomasBtn.type = 'button';
  sintomasBtn.className = 'button button--primary view-mis-actividades__btn-registrar-sintoma';
  sintomasBtn.textContent = 'Registrar síntoma';
  sintomasSection.appendChild(sintomasBtn);
  wrapper.appendChild(sintomasSection);

  const sintomasHistorialSection = document.createElement('section');
  sintomasHistorialSection.className = 'view-mis-actividades__sintomas-historial';
  const sintomasHistorialTitulo = document.createElement('h3');
  sintomasHistorialTitulo.textContent = 'Historial de síntomas';
  sintomasHistorialSection.appendChild(sintomasHistorialTitulo);
  const sintomasTabla = document.createElement('table');
  sintomasTabla.className = 'view-mis-actividades__sintomas-tabla';
  sintomasHistorialSection.appendChild(sintomasTabla);
  wrapper.appendChild(sintomasHistorialSection);

  container.appendChild(wrapper);

  let tareas = [];
  let prescripciones = [];
  let sintomas = [];

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

  function esActiva(p) {
    const hoy = new Date().toISOString().slice(0, 10);
    return p.fechaInicio <= hoy && (p.fechaFin === '' || p.fechaFin >= hoy);
  }

  function renderPrescripcionesActivas() {
    prescripcionesActivasList.innerHTML = '';
    const activas = prescripciones.filter(esActiva);
    if (activas.length === 0) {
      prescripcionesActivasList.textContent = 'No hay prescripciones activas.';
      return;
    }
    activas.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'view-mis-actividades__prescripcion-item';

      const nombre = document.createElement('div');
      nombre.className = 'view-mis-actividades__prescripcion-nombre';
      nombre.textContent = `${p.medicamento} — ${p.dosis} (${p.frecuencia})`;
      item.appendChild(nombre);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'button button--primary view-mis-actividades__btn-toma';
      btn.textContent = 'Tomé ahora';
      item.appendChild(btn);

      const formContainer = document.createElement('div');
      formContainer.className = 'view-mis-actividades__form-toma';
      formContainer.hidden = true;

      const notaInput = document.createElement('textarea');
      notaInput.className = 'view-mis-actividades__toma-nota';
      notaInput.placeholder = 'Nota opcional...';
      formContainer.appendChild(notaInput);

      const formError = document.createElement('div');
      formError.className = 'view-mis-actividades__toma-error';
      formError.hidden = true;
      formContainer.appendChild(formError);

      const confirmarBtn = document.createElement('button');
      confirmarBtn.type = 'button';
      confirmarBtn.className = 'button button--primary view-mis-actividades__btn-confirmar-toma';
      confirmarBtn.textContent = 'Confirmar toma';
      formContainer.appendChild(confirmarBtn);

      btn.addEventListener('click', () => { formContainer.hidden = !formContainer.hidden; });

      confirmarBtn.addEventListener('click', async () => {
        formError.hidden = true;
        const result = await apiPost({
          accion: 'registrarToma',
          token: ctx.session.token,
          prescripcionId: p.id,
          nota: notaInput.value.trim(),
        });
        if (result.error) {
          if (handleAuthError(result)) return;
          formError.textContent = result.error;
          formError.hidden = false;
          return;
        }
        const idx = prescripciones.findIndex((pr) => pr.id === p.id);
        if (idx !== -1) prescripciones[idx].tomas.unshift(result.toma);
        renderTomasHistorial();
        formContainer.hidden = true;
        notaInput.value = '';
      });

      item.appendChild(formContainer);
      prescripcionesActivasList.appendChild(item);
    });
  }

  function renderTomasHistorial() {
    tomasTabla.innerHTML = '';
    const todasTomas = [];
    prescripciones.forEach((p) => {
      p.tomas.forEach((t) => todasTomas.push({ medicamento: p.medicamento, ...t }));
    });
    todasTomas.sort((a, b) => b.fechaHora.localeCompare(a.fechaHora));

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Medicamento</th><th>Fecha/Hora</th><th>Nota</th></tr>';
    tomasTabla.appendChild(thead);
    const tbody = document.createElement('tbody');
    todasTomas.forEach((t) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${t.medicamento}</td><td>${t.fechaHora.slice(0, 16).replace('T', ' ')}</td><td>${t.nota || '—'}</td>`;
      tbody.appendChild(tr);
    });
    tomasTabla.appendChild(tbody);
  }

  function renderSintomasHistorial() {
    sintomasTabla.innerHTML = '';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Fecha/Hora</th><th>Tipo</th><th>Intensidad</th><th>Nota</th></tr>';
    sintomasTabla.appendChild(thead);
    const tbody = document.createElement('tbody');
    sintomas.forEach((s) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${s.fechaHora.slice(0, 16).replace('T', ' ')}</td><td>${s.tipo}</td><td>${s.intensidad}</td><td>${s.nota || '—'}</td>`;
      tbody.appendChild(tr);
    });
    sintomasTabla.appendChild(tbody);
  }

  sintomasBtn.addEventListener('click', async () => {
    sintomasFormError.hidden = true;
    const result = await apiPost({
      accion: 'registrarSintoma',
      token: ctx.session.token,
      tipo: sintomasTipo.value,
      intensidad: Number(sintomasIntensidad.value),
      nota: sintomasNota.value.trim(),
    });
    if (result.error) {
      if (handleAuthError(result)) return;
      sintomasFormError.textContent = result.error;
      sintomasFormError.hidden = false;
      return;
    }
    sintomas.unshift(result.sintoma);
    renderSintomasHistorial();
    sintomasTipo.selectedIndex = 0;
    sintomasIntensidad.selectedIndex = 0;
    sintomasNota.value = '';
  });

  async function loadActividades() {
    const [actividadesResult, prescripcionesResult, sintomasResult] = await Promise.all([
      apiGet('listarMisActividades', { token: ctx.session.token }),
      apiGet('listarMisPrescripciones', { token: ctx.session.token }),
      apiGet('listarMisSintomas', { token: ctx.session.token }),
    ]);
    if (actividadesResult.error) {
      if (handleAuthError(actividadesResult)) return;
      errorEl.textContent = actividadesResult.error;
      errorEl.hidden = false;
      return;
    }
    if (prescripcionesResult.error) {
      if (handleAuthError(prescripcionesResult)) return;
      errorEl.textContent = prescripcionesResult.error;
      errorEl.hidden = false;
      return;
    }
    if (sintomasResult.error) {
      if (handleAuthError(sintomasResult)) return;
      errorEl.textContent = sintomasResult.error;
      errorEl.hidden = false;
      return;
    }
    tareas = actividadesResult.tareas;
    prescripciones = prescripcionesResult.prescripciones;
    sintomas = sintomasResult.sintomas;
    renderPendientes();
    renderCompletadas();
    renderPrescripcionesActivas();
    renderTomasHistorial();
    renderSintomasHistorial();
  }

  loadActividades();
}
