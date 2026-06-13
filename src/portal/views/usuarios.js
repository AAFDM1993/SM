import { apiGet, apiPost } from '../api.js';
import { handleAuthError } from '../session.js';

const ROLES = ['administrador', 'psiquiatra', 'recepcion', 'usuario'];

export function initUsuariosView(container, ctx) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'view-usuarios';

  const heading = document.createElement('h2');
  heading.textContent = 'Gestión de usuarios';
  wrapper.appendChild(heading);

  const errorEl = document.createElement('div');
  errorEl.className = 'view-usuarios__error';
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.className = 'button button--primary';
  createButton.textContent = 'Crear usuario';
  createButton.addEventListener('click', () => showForm(null));
  wrapper.appendChild(createButton);

  const formContainer = document.createElement('div');
  formContainer.className = 'view-usuarios__form-container';
  wrapper.appendChild(formContainer);

  const table = document.createElement('table');
  table.className = 'view-usuarios__table';
  wrapper.appendChild(table);

  container.appendChild(wrapper);

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.hidden = true;
  }

  async function loadUsuarios() {
    const result = await apiGet('listarUsuarios', { token: ctx.session.token });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    clearError();
    renderTable(result.usuarios);
  }

  function renderTable(usuarios) {
    table.innerHTML = '';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Código</th><th>Nombre</th><th>Rol</th><th>Acciones</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    usuarios.forEach((usuario) => {
      const tr = document.createElement('tr');

      const tdCodigo = document.createElement('td');
      tdCodigo.textContent = usuario.codigo;
      tr.appendChild(tdCodigo);

      const tdNombre = document.createElement('td');
      tdNombre.textContent = usuario.nombre;
      tr.appendChild(tdNombre);

      const tdRol = document.createElement('td');
      tdRol.textContent = usuario.rol;
      tr.appendChild(tdRol);

      const tdAcciones = document.createElement('td');

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.textContent = 'Editar';
      editButton.addEventListener('click', () => showForm(usuario));
      tdAcciones.appendChild(editButton);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.textContent = 'Eliminar';
      deleteButton.addEventListener('click', () => handleDelete(usuario.codigo));
      tdAcciones.appendChild(deleteButton);

      tr.appendChild(tdAcciones);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function showForm(usuario) {
    formContainer.innerHTML = '';

    const form = document.createElement('form');
    form.className = 'view-usuarios__form';

    const codigoLabel = document.createElement('label');
    codigoLabel.textContent = 'Código';
    const codigoInput = document.createElement('input');
    codigoInput.type = 'text';
    codigoInput.value = usuario ? usuario.codigo : '';
    codigoInput.disabled = !!usuario;
    codigoLabel.appendChild(codigoInput);
    form.appendChild(codigoLabel);

    const nombreLabel = document.createElement('label');
    nombreLabel.textContent = 'Nombre';
    const nombreInput = document.createElement('input');
    nombreInput.type = 'text';
    nombreInput.value = usuario ? usuario.nombre : '';
    nombreLabel.appendChild(nombreInput);
    form.appendChild(nombreLabel);

    const rolLabel = document.createElement('label');
    rolLabel.textContent = 'Rol';
    const rolSelect = document.createElement('select');
    ROLES.forEach((rol) => {
      const option = document.createElement('option');
      option.value = rol;
      option.textContent = rol;
      if (usuario && usuario.rol === rol) option.selected = true;
      rolSelect.appendChild(option);
    });
    rolLabel.appendChild(rolSelect);
    form.appendChild(rolLabel);

    const passwordLabel = document.createElement('label');
    passwordLabel.textContent = usuario
      ? 'Nueva contraseña (dejar en blanco para no cambiarla)'
      : 'Contraseña inicial';
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordLabel.appendChild(passwordInput);
    form.appendChild(passwordLabel);

    const formError = document.createElement('div');
    formError.className = 'view-usuarios__form-error';
    formError.hidden = true;
    form.appendChild(formError);

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

      const body = {
        accion: 'guardarUsuario',
        token: ctx.session.token,
        codigo: codigoInput.value.trim(),
        nombre: nombreInput.value.trim(),
        rol: rolSelect.value,
      };
      if (passwordInput.value) {
        body.password = passwordInput.value;
      }

      const result = await apiPost(body);
      if (result.error) {
        if (handleAuthError(result)) return;
        formError.textContent = result.error;
        formError.hidden = false;
        return;
      }

      formContainer.innerHTML = '';
      await loadUsuarios();
    });

    formContainer.appendChild(form);
  }

  async function handleDelete(codigo) {
    if (!window.confirm(`¿Eliminar el usuario ${codigo}?`)) return;

    const result = await apiPost({ accion: 'eliminarUsuario', token: ctx.session.token, codigo });
    if (result.error) {
      if (handleAuthError(result)) return;
      showError(result.error);
      return;
    }
    clearError();
    await loadUsuarios();
  }

  loadUsuarios();
}
