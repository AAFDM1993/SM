import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';

const SEXOS = ['', 'Masculino', 'Femenino', 'Otro'];

export function initPacientesView(container, ctx) {
  container.innerHTML = '';

  let pacientes = [];

  const wrapper = document.createElement('div');
  wrapper.className = 'view-pacientes';

  const heading = document.createElement('h2');
  heading.textContent = 'Pacientes';
  wrapper.appendChild(heading);

  const errorEl = document.createElement('div');
  errorEl.className = 'view-pacientes__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const buscarInput = document.createElement('input');
  buscarInput.type = 'text';
  buscarInput.className = 'view-pacientes__buscar';
  buscarInput.placeholder = 'Buscar por nombre o DNI...';
  buscarInput.addEventListener('input', () => renderTable());
  wrapper.appendChild(buscarInput);

  const nuevoButton = document.createElement('button');
  nuevoButton.type = 'button';
  nuevoButton.className = 'button button--primary view-pacientes__nuevo';
  nuevoButton.textContent = '+ Nuevo paciente';
  nuevoButton.addEventListener('click', () => showForm(null));
  wrapper.appendChild(nuevoButton);

  const formContainer = document.createElement('div');
  formContainer.className = 'view-pacientes__form-container';
  wrapper.appendChild(formContainer);

  const table = document.createElement('table');
  table.className = 'view-pacientes__table';
  wrapper.appendChild(table);

  container.appendChild(wrapper);

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.hidden = true;
  }

  async function loadPacientes() {
    const result = await apiGet('listarFichasPacientes', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    clearError();
    pacientes = result.pacientes;
    renderTable();
  }

  function renderTable() {
    const texto = buscarInput.value.trim().toLowerCase();
    const filtrados = texto
      ? pacientes.filter((p) => p.nombre.toLowerCase().includes(texto) || p.codigo.toLowerCase().includes(texto))
      : pacientes;

    table.innerHTML = '';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>DNI</th><th>Nombre</th><th>Teléfono</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    filtrados.forEach((paciente) => {
      const tr = document.createElement('tr');
      tr.addEventListener('click', () => abrirEdicion(paciente.codigo));

      const tdCodigo = document.createElement('td');
      tdCodigo.textContent = paciente.codigo;
      tr.appendChild(tdCodigo);

      const tdNombre = document.createElement('td');
      tdNombre.textContent = paciente.nombre;
      tr.appendChild(tdNombre);

      const tdTelefono = document.createElement('td');
      tdTelefono.textContent = paciente.telefono;
      tr.appendChild(tdTelefono);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  async function abrirEdicion(codigo) {
    const result = await apiGet('leerFichaPaciente', { token: ctx.session.token, codigo });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    clearError();
    showForm(result.paciente);
  }

  function showForm(paciente) {
    formContainer.innerHTML = '';

    const form = document.createElement('form');
    form.className = 'view-pacientes__form';

    const codigoLabel = document.createElement('label');
    codigoLabel.textContent = 'DNI (código de acceso)';
    const codigoInput = document.createElement('input');
    codigoInput.type = 'text';
    codigoInput.value = paciente ? paciente.codigo : '';
    codigoInput.disabled = !!paciente;
    codigoLabel.appendChild(codigoInput);
    form.appendChild(codigoLabel);

    const nombreLabel = document.createElement('label');
    nombreLabel.textContent = 'Nombre completo';
    const nombreInput = document.createElement('input');
    nombreInput.type = 'text';
    nombreInput.value = paciente ? paciente.nombre : '';
    nombreLabel.appendChild(nombreInput);
    form.appendChild(nombreLabel);

    const fechaNacimientoLabel = document.createElement('label');
    fechaNacimientoLabel.textContent = 'Fecha de nacimiento';
    const fechaNacimientoInput = document.createElement('input');
    fechaNacimientoInput.type = 'date';
    fechaNacimientoInput.value = paciente ? paciente.fechaNacimiento : '';
    fechaNacimientoLabel.appendChild(fechaNacimientoInput);
    form.appendChild(fechaNacimientoLabel);

    const sexoLabel = document.createElement('label');
    sexoLabel.textContent = 'Sexo';
    const sexoSelect = document.createElement('select');
    SEXOS.forEach((sexo) => {
      const option = document.createElement('option');
      option.value = sexo;
      option.textContent = sexo || '(sin especificar)';
      if (paciente && paciente.sexo === sexo) option.selected = true;
      sexoSelect.appendChild(option);
    });
    sexoLabel.appendChild(sexoSelect);
    form.appendChild(sexoLabel);

    const telefonoLabel = document.createElement('label');
    telefonoLabel.textContent = 'Teléfono';
    const telefonoInput = document.createElement('input');
    telefonoInput.type = 'text';
    telefonoInput.value = paciente ? paciente.telefono : '';
    telefonoLabel.appendChild(telefonoInput);
    form.appendChild(telefonoLabel);

    const emailLabel = document.createElement('label');
    emailLabel.textContent = 'Correo electrónico';
    const emailInput = document.createElement('input');
    emailInput.type = 'text';
    emailInput.value = paciente ? paciente.email : '';
    emailLabel.appendChild(emailInput);
    form.appendChild(emailLabel);

    const contactoNombreLabel = document.createElement('label');
    contactoNombreLabel.textContent = 'Contacto de emergencia: nombre';
    const contactoNombreInput = document.createElement('input');
    contactoNombreInput.type = 'text';
    contactoNombreInput.value = paciente ? paciente.contactoEmergenciaNombre : '';
    contactoNombreLabel.appendChild(contactoNombreInput);
    form.appendChild(contactoNombreLabel);

    const contactoTelefonoLabel = document.createElement('label');
    contactoTelefonoLabel.textContent = 'Contacto de emergencia: teléfono';
    const contactoTelefonoInput = document.createElement('input');
    contactoTelefonoInput.type = 'text';
    contactoTelefonoInput.value = paciente ? paciente.contactoEmergenciaTelefono : '';
    contactoTelefonoLabel.appendChild(contactoTelefonoInput);
    form.appendChild(contactoTelefonoLabel);

    const formError = document.createElement('div');
    formError.className = 'view-pacientes__form-error';
    formError.hidden = true;
    form.appendChild(formError);

    const formSuccess = document.createElement('div');
    formSuccess.className = 'view-pacientes__form-success';
    formSuccess.hidden = true;
    form.appendChild(formSuccess);

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'button button--primary';
    saveButton.textContent = 'Guardar';
    form.appendChild(saveButton);

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancelar';
    cancelButton.addEventListener('click', () => {
      formContainer.innerHTML = '';
    });
    form.appendChild(cancelButton);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      formError.hidden = true;
      formSuccess.hidden = true;

      const codigo = codigoInput.value.trim();
      const nombre = nombreInput.value.trim();
      if (!codigo || !nombre) {
        formError.textContent = 'codigo y nombre son requeridos';
        formError.hidden = false;
        return;
      }

      const body = {
        accion: paciente ? 'actualizarPaciente' : 'crearPaciente',
        token: ctx.session.token,
        codigo,
        nombre,
        fechaNacimiento: fechaNacimientoInput.value,
        sexo: sexoSelect.value,
        telefono: telefonoInput.value.trim(),
        email: emailInput.value.trim(),
        contactoEmergenciaNombre: contactoNombreInput.value.trim(),
        contactoEmergenciaTelefono: contactoTelefonoInput.value.trim(),
      };

      const result = await apiPost(body);
      if (result.error) {
        if (handleAuthError(result)) return;
        formError.textContent = result.error;
        formError.hidden = false;
        return;
      }

      if (!paciente) {
        formSuccess.textContent = `Paciente creado. Su cuenta de acceso quedó creada con contraseña inicial igual a su DNI (${codigo}); deberá cambiarla en su primer ingreso.`;
        formSuccess.hidden = false;
      } else {
        formContainer.innerHTML = '';
      }
      await loadPacientes();
    });

    formContainer.appendChild(form);
  }

  loadPacientes();
}
