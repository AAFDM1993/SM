export function initInicioView(container, ctx) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'view-inicio';

  const heading = document.createElement('h2');
  heading.textContent = `Bienvenido/a, ${ctx.session.nombre}`;
  wrapper.appendChild(heading);

  const rolText = document.createElement('p');
  rolText.textContent = `Rol: ${ctx.session.rol}`;
  wrapper.appendChild(rolText);

  container.appendChild(wrapper);
}
