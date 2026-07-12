import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';
import { ESCALAS_CATALOGO, renderPreguntasEscala } from './escalas-catalogo.js';

const CAMPOS_ANTECEDENTES = [
  { key: 'antecedentesPersonales', label: 'Antecedentes personales' },
  { key: 'antecedentesPsiquiatricos', label: 'Antecedentes psiquiátricos' },
  { key: 'antecedentesFamiliares', label: 'Antecedentes familiares' },
  { key: 'alergias', label: 'Alergias' },
  { key: 'medicacionActual', label: 'Medicación actual' },
];

export function initHistoriaClinicaView(container, ctx) {
  container.innerHTML = '';

  let pacientes = [];

  const wrapper = document.createElement('div');
  wrapper.className = 'view-historia-clinica';

  const heading = document.createElement('h2');
  heading.textContent = 'Historia Clínica';
  wrapper.appendChild(heading);

  const errorEl = document.createElement('div');
  errorEl.className = 'view-historia-clinica__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const listaContainer = document.createElement('div');
  listaContainer.className = 'view-historia-clinica__lista';
  wrapper.appendChild(listaContainer);

  const fichaContainer = document.createElement('div');
  fichaContainer.className = 'view-historia-clinica__ficha';
  fichaContainer.hidden = true;
  wrapper.appendChild(fichaContainer);

  container.appendChild(wrapper);

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.hidden = true;
  }

  const buscarInput = document.createElement('input');
  buscarInput.type = 'text';
  buscarInput.className = 'view-historia-clinica__buscar';
  buscarInput.placeholder = 'Buscar por nombre o DNI...';
  buscarInput.addEventListener('input', () => renderTabla());
  listaContainer.appendChild(buscarInput);

  const table = document.createElement('table');
  table.className = 'view-historia-clinica__table';
  listaContainer.appendChild(table);

  async function loadPacientes() {
    const result = await apiGet('listarFichasPacientes', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    clearError();
    pacientes = result.pacientes;
    renderTabla();
  }

  function renderTabla() {
    const texto = buscarInput.value.trim().toLowerCase();
    const filtrados = texto
      ? pacientes.filter((p) => p.nombre.toLowerCase().includes(texto) || p.codigo.toLowerCase().includes(texto))
      : pacientes;

    table.innerHTML = '';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>DNI</th><th>Nombre</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    filtrados.forEach((paciente) => {
      const tr = document.createElement('tr');
      tr.addEventListener('click', () => abrirFicha(paciente));

      const tdCodigo = document.createElement('td');
      tdCodigo.textContent = paciente.codigo;
      tr.appendChild(tdCodigo);

      const tdNombre = document.createElement('td');
      tdNombre.textContent = paciente.nombre;
      tr.appendChild(tdNombre);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function volverALista() {
    fichaContainer.hidden = true;
    fichaContainer.innerHTML = '';
    listaContainer.hidden = false;
    clearError();
  }

  async function abrirFicha(paciente) {
    listaContainer.hidden = true;
    fichaContainer.hidden = false;
    fichaContainer.innerHTML = '';
    clearError();

    const volverButton = document.createElement('button');
    volverButton.type = 'button';
    volverButton.className = 'view-historia-clinica__volver';
    volverButton.textContent = 'Volver a la lista';
    volverButton.addEventListener('click', volverALista);
    fichaContainer.appendChild(volverButton);

    const header = document.createElement('h3');
    header.textContent = `${paciente.nombre} (${paciente.codigo})`;
    fichaContainer.appendChild(header);

    const antecedentesResult = await apiGet('leerAntecedentes', { token: ctx.session.token, codigo: paciente.codigo });
    if (antecedentesResult.error) {
      if (handleAuthError(antecedentesResult)) return;
      showError(antecedentesResult.error);
      return;
    }
    renderAntecedentes(paciente, antecedentesResult.antecedentes);

    const notasResult = await apiGet('listarNotasEvolucion', { token: ctx.session.token, codigo: paciente.codigo });
    if (notasResult.error) {
      if (handleAuthError(notasResult)) return;
      showError(notasResult.error);
      return;
    }
    renderNotas(paciente, notasResult.notas);

    const prescripcionesResult = await apiGet('listarPrescripciones', { token: ctx.session.token, codigo: paciente.codigo });
    if (prescripcionesResult.error) {
      if (handleAuthError(prescripcionesResult)) return;
      showError(prescripcionesResult.error);
      return;
    }
    renderPrescripciones(paciente, prescripcionesResult.prescripciones);

    const escalasResult = await apiGet('listarEscalasPaciente', { token: ctx.session.token, codigo: paciente.codigo });
    if (escalasResult.error) {
      if (handleAuthError(escalasResult)) return;
      showError(escalasResult.error);
      return;
    }
    renderEscalas(paciente, escalasResult.escalas);
  }

  function renderAntecedentes(paciente, antecedentes) {
    const section = document.createElement('section');
    section.className = 'view-historia-clinica__antecedentes';

    const titulo = document.createElement('h4');
    titulo.textContent = 'Antecedentes médicos';
    section.appendChild(titulo);

    const form = document.createElement('form');
    form.className = 'view-historia-clinica__antecedentes-form';

    const textareas = {};
    CAMPOS_ANTECEDENTES.forEach(({ key, label }) => {
      const fieldLabel = document.createElement('label');
      fieldLabel.textContent = label;
      const textarea = document.createElement('textarea');
      textarea.className = `view-historia-clinica__campo-${key}`;
      textarea.value = antecedentes[key] || '';
      fieldLabel.appendChild(textarea);
      form.appendChild(fieldLabel);
      textareas[key] = textarea;
    });

    const formError = document.createElement('div');
    formError.className = 'view-historia-clinica__antecedentes-error';
    formError.hidden = true;
    form.appendChild(formError);

    const formSuccess = document.createElement('div');
    formSuccess.className = 'view-historia-clinica__antecedentes-success';
    formSuccess.hidden = true;
    form.appendChild(formSuccess);

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'button button--primary';
    saveButton.textContent = 'Guardar antecedentes';
    form.appendChild(saveButton);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      formError.hidden = true;
      formSuccess.hidden = true;

      const result = await apiPost({
        accion: 'actualizarAntecedentes',
        token: ctx.session.token,
        codigo: paciente.codigo,
        antecedentesPersonales: textareas.antecedentesPersonales.value,
        antecedentesPsiquiatricos: textareas.antecedentesPsiquiatricos.value,
        antecedentesFamiliares: textareas.antecedentesFamiliares.value,
        alergias: textareas.alergias.value,
        medicacionActual: textareas.medicacionActual.value,
      });

      if (result.error) {
        if (handleAuthError(result)) return;
        formError.textContent = result.error;
        formError.hidden = false;
        return;
      }

      formSuccess.textContent = 'Antecedentes guardados correctamente.';
      formSuccess.hidden = false;
    });

    section.appendChild(form);
    fichaContainer.appendChild(section);
  }

  function renderNotas(paciente, notas) {
    const section = document.createElement('section');
    section.className = 'view-historia-clinica__notas';

    const titulo = document.createElement('h4');
    titulo.textContent = 'Notas de evolución';
    section.appendChild(titulo);

    const lista = document.createElement('ul');
    lista.className = 'view-historia-clinica__notas-lista';
    section.appendChild(lista);

    function renderListaNotas() {
      lista.innerHTML = '';
      notas.forEach((nota) => {
        const item = document.createElement('li');
        item.className = 'view-historia-clinica__nota';

        const fecha = document.createElement('div');
        fecha.className = 'view-historia-clinica__nota-fecha';
        fecha.textContent = nota.fecha;
        item.appendChild(fecha);

        if (nota.motivoConsulta) {
          const motivo = document.createElement('div');
          motivo.className = 'view-historia-clinica__nota-motivo';
          motivo.textContent = `Motivo: ${nota.motivoConsulta}`;
          item.appendChild(motivo);
        }

        const cuerpo = document.createElement('div');
        cuerpo.className = 'view-historia-clinica__nota-texto';
        cuerpo.textContent = nota.notas;
        item.appendChild(cuerpo);

        if (nota.diagnostico) {
          const diagnostico = document.createElement('div');
          diagnostico.className = 'view-historia-clinica__nota-diagnostico';
          diagnostico.textContent = `Diagnóstico: ${nota.diagnostico}`;
          item.appendChild(diagnostico);
        }

        lista.appendChild(item);
      });
    }

    renderListaNotas();

    const form = document.createElement('form');
    form.className = 'view-historia-clinica__nota-form';

    const fechaLabel = document.createElement('label');
    fechaLabel.textContent = 'Fecha';
    const fechaInput = document.createElement('input');
    fechaInput.type = 'date';
    fechaInput.className = 'view-historia-clinica__nota-fecha-input';
    fechaInput.value = new Date().toISOString().slice(0, 10);
    fechaLabel.appendChild(fechaInput);
    form.appendChild(fechaLabel);

    const motivoLabel = document.createElement('label');
    motivoLabel.textContent = 'Motivo de consulta';
    const motivoInput = document.createElement('input');
    motivoInput.type = 'text';
    motivoInput.className = 'view-historia-clinica__nota-motivo-input';
    motivoLabel.appendChild(motivoInput);
    form.appendChild(motivoLabel);

    const notasLabel = document.createElement('label');
    notasLabel.textContent = 'Notas';
    const notasTextarea = document.createElement('textarea');
    notasTextarea.className = 'view-historia-clinica__nota-notas-input';
    notasLabel.appendChild(notasTextarea);
    form.appendChild(notasLabel);

    const diagnosticoLabel = document.createElement('label');
    diagnosticoLabel.textContent = 'Diagnóstico';
    const diagnosticoInput = document.createElement('input');
    diagnosticoInput.type = 'text';
    diagnosticoInput.className = 'view-historia-clinica__nota-diagnostico-input';
    diagnosticoLabel.appendChild(diagnosticoInput);
    form.appendChild(diagnosticoLabel);

    const formError = document.createElement('div');
    formError.className = 'view-historia-clinica__nota-form-error';
    formError.hidden = true;
    form.appendChild(formError);

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'button button--primary';
    saveButton.textContent = 'Guardar nota';
    form.appendChild(saveButton);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      formError.hidden = true;

      const notasValue = notasTextarea.value.trim();
      if (!notasValue) {
        formError.textContent = 'notas es requerido';
        formError.hidden = false;
        return;
      }

      const result = await apiPost({
        accion: 'crearNotaEvolucion',
        token: ctx.session.token,
        codigo: paciente.codigo,
        fecha: fechaInput.value,
        motivoConsulta: motivoInput.value.trim(),
        notas: notasValue,
        diagnostico: diagnosticoInput.value.trim(),
      });

      if (result.error) {
        if (handleAuthError(result)) return;
        formError.textContent = result.error;
        formError.hidden = false;
        return;
      }

      notas.unshift(result.nota);
      renderListaNotas();

      fechaInput.value = new Date().toISOString().slice(0, 10);
      motivoInput.value = '';
      notasTextarea.value = '';
      diagnosticoInput.value = '';
    });

    section.appendChild(form);
    fichaContainer.appendChild(section);
  }

  function renderPrescripciones(paciente, prescripciones) {
    const section = document.createElement('section');
    section.className = 'view-historia-clinica__prescripciones';

    const titulo = document.createElement('h4');
    titulo.textContent = 'Prescripciones';
    section.appendChild(titulo);

    const lista = document.createElement('ul');
    lista.className = 'view-historia-clinica__prescripciones-lista';
    section.appendChild(lista);

    function renderListaPrescripciones() {
      lista.innerHTML = '';
      prescripciones.forEach((p) => {
        const item = document.createElement('li');
        item.className = 'view-historia-clinica__prescripcion';
        const fin = p.fechaFin ? p.fechaFin : '(sin fecha fin)';
        item.textContent = `${p.medicamento} — ${p.dosis} — ${p.frecuencia} — ${p.fechaInicio} → ${fin}`;
        lista.appendChild(item);
      });
    }

    renderListaPrescripciones();

    const form = document.createElement('form');
    form.className = 'view-historia-clinica__prescripcion-form';

    const medLabel = document.createElement('label');
    medLabel.textContent = 'Medicamento';
    const medInput = document.createElement('input');
    medInput.type = 'text';
    medInput.className = 'view-historia-clinica__prescripcion-medicamento-input';
    medLabel.appendChild(medInput);
    form.appendChild(medLabel);

    const dosisLabel = document.createElement('label');
    dosisLabel.textContent = 'Dosis';
    const dosisInput = document.createElement('input');
    dosisInput.type = 'text';
    dosisInput.className = 'view-historia-clinica__prescripcion-dosis-input';
    dosisLabel.appendChild(dosisInput);
    form.appendChild(dosisLabel);

    const frecLabel = document.createElement('label');
    frecLabel.textContent = 'Frecuencia';
    const frecInput = document.createElement('input');
    frecInput.type = 'text';
    frecInput.className = 'view-historia-clinica__prescripcion-frecuencia-input';
    frecLabel.appendChild(frecInput);
    form.appendChild(frecLabel);

    const fechaInicioLabel = document.createElement('label');
    fechaInicioLabel.textContent = 'Fecha inicio';
    const fechaInicioInput = document.createElement('input');
    fechaInicioInput.type = 'date';
    fechaInicioInput.className = 'view-historia-clinica__prescripcion-fechainicio-input';
    fechaInicioInput.value = new Date().toISOString().slice(0, 10);
    fechaInicioLabel.appendChild(fechaInicioInput);
    form.appendChild(fechaInicioLabel);

    const fechaFinLabel = document.createElement('label');
    fechaFinLabel.textContent = 'Fecha fin (opcional)';
    const fechaFinInput = document.createElement('input');
    fechaFinInput.type = 'date';
    fechaFinInput.className = 'view-historia-clinica__prescripcion-fechafin-input';
    fechaFinLabel.appendChild(fechaFinInput);
    form.appendChild(fechaFinLabel);

    const formError = document.createElement('div');
    formError.className = 'view-historia-clinica__prescripcion-form-error';
    formError.hidden = true;
    form.appendChild(formError);

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'button button--primary';
    saveButton.textContent = 'Guardar prescripción';
    form.appendChild(saveButton);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      formError.hidden = true;

      const medicamento = medInput.value.trim();
      const dosis = dosisInput.value.trim();
      const frecuencia = frecInput.value.trim();
      const fechaInicio = fechaInicioInput.value;
      if (!medicamento || !dosis || !frecuencia || !fechaInicio) {
        formError.textContent = 'medicamento, dosis, frecuencia y fechaInicio son requeridos';
        formError.hidden = false;
        return;
      }

      const result = await apiPost({
        accion: 'crearPrescripcion',
        token: ctx.session.token,
        codigo: paciente.codigo,
        medicamento,
        dosis,
        frecuencia,
        fechaInicio,
        fechaFin: fechaFinInput.value,
      });

      if (result.error) {
        if (handleAuthError(result)) return;
        formError.textContent = result.error;
        formError.hidden = false;
        return;
      }

      prescripciones.unshift(result.prescripcion);
      renderListaPrescripciones();

      medInput.value = '';
      dosisInput.value = '';
      frecInput.value = '';
      fechaInicioInput.value = new Date().toISOString().slice(0, 10);
      fechaFinInput.value = '';
    });

    section.appendChild(form);
    fichaContainer.appendChild(section);
  }

  function renderEscalas(paciente, escalas) {
    const section = document.createElement('section');
    section.className = 'view-historia-clinica__escalas';

    const titulo = document.createElement('h4');
    titulo.textContent = 'Escalas de evaluación';
    section.appendChild(titulo);

    const tabla = document.createElement('table');
    tabla.className = 'view-historia-clinica__escalas-tabla';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Tipo</th><th>Modo</th><th>Estado</th><th>Puntaje</th><th>Part A</th><th>Fecha</th></tr>';
    tabla.appendChild(thead);
    const tbody = document.createElement('tbody');
    tabla.appendChild(tbody);
    section.appendChild(tabla);

    function renderTablaEscalas() {
      tbody.innerHTML = '';
      escalas.forEach((e) => {
        const tr = document.createElement('tr');
        const modoLabel = e.modo === 'manual' ? 'Aplicada' : e.estado === 'pendiente' ? 'Pendiente (paciente)' : 'Autoaplicada';
        const puntaje = e.estado === 'completada' ? e.puntajeTotal : '—';
        const partA = e.estado === 'completada' ? (e.partAPositivo ? 'Positivo' : 'Negativo') : '—';
        const fecha = (e.fechaCompletada || e.fechaCreacion || '').slice(0, 10);
        tr.innerHTML = `<td>${ESCALAS_CATALOGO[e.escalaTipo]?.nombre || e.escalaTipo}</td><td>${modoLabel}</td><td>${e.estado}</td><td>${puntaje}</td><td>${partA}</td><td>${fecha}</td>`;
        tbody.appendChild(tr);
      });
    }
    renderTablaEscalas();

    const acciones = document.createElement('div');
    acciones.className = 'view-historia-clinica__escalas-acciones';

    // --- Formulario Aplicar ---
    const btnAplicar = document.createElement('button');
    btnAplicar.type = 'button';
    btnAplicar.className = 'button button--primary view-historia-clinica__escalas-btn-aplicar';
    btnAplicar.textContent = 'Aplicar escala ahora';

    const formAplicar = document.createElement('form');
    formAplicar.className = 'view-historia-clinica__escalas-form-aplicar';
    formAplicar.hidden = true;

    const selectAplicarLabel = document.createElement('label');
    selectAplicarLabel.textContent = 'Escala';
    const selectAplicar = document.createElement('select');
    selectAplicar.className = 'view-historia-clinica__escalas-select';
    Object.entries(ESCALAS_CATALOGO).forEach(([tipo, escala]) => {
      const opt = document.createElement('option');
      opt.value = tipo;
      opt.textContent = escala.nombre;
      selectAplicar.appendChild(opt);
    });
    selectAplicarLabel.appendChild(selectAplicar);
    formAplicar.appendChild(selectAplicarLabel);

    const preguntasAplicar = document.createElement('div');
    formAplicar.appendChild(preguntasAplicar);
    let getResponstas = renderPreguntasEscala(selectAplicar.value, preguntasAplicar, 'aplicar');

    const aplicarError = document.createElement('div');
    aplicarError.className = 'view-historia-clinica__escalas-aplicar-error';
    aplicarError.hidden = true;
    formAplicar.appendChild(aplicarError);

    const submitAplicar = document.createElement('button');
    submitAplicar.type = 'submit';
    submitAplicar.className = 'button button--primary';
    submitAplicar.textContent = 'Guardar resultado';
    formAplicar.appendChild(submitAplicar);

    btnAplicar.addEventListener('click', () => {
      formAplicar.hidden = !formAplicar.hidden;
      formEnviar.hidden = true;
      aplicarError.hidden = true;
    });

    formAplicar.addEventListener('submit', async (e) => {
      e.preventDefault();
      aplicarError.hidden = true;
      const respuestas = getResponstas();
      if (!respuestas) {
        aplicarError.textContent = 'Debe responder todas las preguntas';
        aplicarError.hidden = false;
        return;
      }
      const result = await apiPost({
        accion: 'aplicarEscala',
        token: ctx.session.token,
        pacienteCodigo: paciente.codigo,
        escalaTipo: selectAplicar.value,
        respuestas,
      });
      if (result.error) {
        if (handleAuthError(result)) return;
        aplicarError.textContent = result.error;
        aplicarError.hidden = false;
        return;
      }
      escalas.unshift(result.aplicacion);
      renderTablaEscalas();
      formAplicar.hidden = true;
      preguntasAplicar.querySelectorAll('input[type="radio"]').forEach((r) => { r.checked = false; });
    });

    // --- Formulario Enviar ---
    const btnEnviar = document.createElement('button');
    btnEnviar.type = 'button';
    btnEnviar.className = 'button button--primary view-historia-clinica__escalas-btn-enviar';
    btnEnviar.textContent = 'Enviar al paciente';

    const formEnviar = document.createElement('form');
    formEnviar.className = 'view-historia-clinica__escalas-form-enviar';
    formEnviar.hidden = true;

    const selectEnviarLabel = document.createElement('label');
    selectEnviarLabel.textContent = 'Escala';
    const selectEnviar = document.createElement('select');
    selectEnviar.className = 'view-historia-clinica__escalas-select-enviar';
    Object.entries(ESCALAS_CATALOGO).forEach(([tipo, escala]) => {
      const opt = document.createElement('option');
      opt.value = tipo;
      opt.textContent = escala.nombre;
      selectEnviar.appendChild(opt);
    });
    selectEnviarLabel.appendChild(selectEnviar);
    formEnviar.appendChild(selectEnviarLabel);

    const enviarError = document.createElement('div');
    enviarError.className = 'view-historia-clinica__escalas-enviar-error';
    enviarError.hidden = true;
    formEnviar.appendChild(enviarError);

    const submitEnviar = document.createElement('button');
    submitEnviar.type = 'submit';
    submitEnviar.className = 'button button--primary';
    submitEnviar.textContent = 'Enviar';
    formEnviar.appendChild(submitEnviar);

    const enviarSuccess = document.createElement('div');
    enviarSuccess.className = 'view-historia-clinica__escalas-enviar-success';
    enviarSuccess.hidden = true;

    btnEnviar.addEventListener('click', () => {
      formEnviar.hidden = !formEnviar.hidden;
      formAplicar.hidden = true;
      enviarError.hidden = true;
      enviarSuccess.hidden = true;
    });

    formEnviar.addEventListener('submit', async (e) => {
      e.preventDefault();
      enviarError.hidden = true;
      enviarSuccess.hidden = true;
      const result = await apiPost({
        accion: 'asignarEscala',
        token: ctx.session.token,
        pacienteCodigo: paciente.codigo,
        escalaTipo: selectEnviar.value,
      });
      if (result.error) {
        if (handleAuthError(result)) return;
        enviarError.textContent = result.error;
        enviarError.hidden = false;
        return;
      }
      escalas.unshift({
        id: result.aplicacionId,
        pacienteCodigo: paciente.codigo,
        escalaTipo: selectEnviar.value,
        modo: 'autoaplicada',
        estado: 'pendiente',
        puntajeTotal: null,
        partAPositivo: null,
        creadoPor: ctx.session.codigo,
        fechaCreacion: new Date().toISOString(),
        completadoPor: '',
        fechaCompletada: '',
      });
      renderTablaEscalas();
      enviarSuccess.textContent = 'Email enviado al paciente.';
      enviarSuccess.hidden = false;
      formEnviar.hidden = true;
    });

    acciones.appendChild(btnAplicar);
    acciones.appendChild(formAplicar);
    acciones.appendChild(btnEnviar);
    acciones.appendChild(formEnviar);
    acciones.appendChild(enviarSuccess);
    section.appendChild(acciones);
    fichaContainer.appendChild(section);
  }

  loadPacientes();
}
