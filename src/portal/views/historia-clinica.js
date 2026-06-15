import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';

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

  loadPacientes();
}
