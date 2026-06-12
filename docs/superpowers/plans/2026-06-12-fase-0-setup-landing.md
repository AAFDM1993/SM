# SMPDJM Fase 0 — Plan 1: Setup + Tema + Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the SMPDJM Vite project and build the public landing page (`Petra Diana Jara M. - Médico Psiquiatra`) with the brand theme, responsive layout (PC/tablet/móvil), and placeholder content for all sections defined in the Fase 0 spec.

**Architecture:** A Vite multi-page app. This plan creates the root `index.html` (landing) plus `src/shared/theme.css` (brand CSS variables, shared by landing and the future portal) and `src/landing/` (landing-specific CSS/JS). The "Acceder al sistema" links point to `/portal/`, which doesn't exist yet — it will be built in Plan 3. Vitest + jsdom are configured for unit-testing interactive JS (the mobile nav toggle).

**Tech Stack:** Vite 5, vanilla JS (ES modules), plain CSS with custom properties, Vitest + jsdom for unit tests.

---

## File structure

```
SMPDJM/
├── package.json
├── vite.config.js
├── .gitignore
├── index.html                  # landing page (Vite entry point)
├── public/
│   └── assets/
│       └── logo-diana.jpg       # brand logo (copied from Downloads)
├── src/
│   ├── shared/
│   │   └── theme.css            # brand CSS variables (colors, fonts, spacing)
│   └── landing/
│       ├── landing.css          # landing page styles (imports theme.css)
│       ├── main.js               # entry script (imports CSS, inits nav)
│       └── nav.js                 # mobile nav toggle logic
└── tests/
    └── landing/
        └── nav.test.js
```

---

## Task 1: Inicializar el proyecto (Vite + Vitest)

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `.gitignore`
- Create: `index.html`

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "smpdjm",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Crear `vite.config.js`**

```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
```

- [ ] **Step 3: Crear `.gitignore`**

```
node_modules/
dist/
.vite/
```

- [ ] **Step 4: Crear `index.html` (mínimo, se reemplaza en Task 3)**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Petra Diana Jara M. - Médico Psiquiatra</title>
  </head>
  <body>
    <h1>SMPDJM</h1>
  </body>
</html>
```

- [ ] **Step 5: Instalar dependencias**

Run: `npm install`
Expected: instala `vite`, `vitest`, `jsdom` sin errores y crea `node_modules/` + `package-lock.json`.

- [ ] **Step 6: Verificar que el build funciona**

Run: `npm run build`
Expected: salida termina con `✓ built in <tiempo>` y se crea `dist/index.html`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.js .gitignore index.html
git commit -m "chore: scaffold Vite project for SMPDJM"
```

---

## Task 2: Copiar el logo y crear el tema visual compartido

**Files:**
- Create: `public/assets/logo-diana.jpg`
- Create: `src/shared/theme.css`

- [ ] **Step 1: Crear la carpeta `public/assets/` y copiar el logo**

Run (PowerShell):
```powershell
New-Item -ItemType Directory -Force -Path public/assets
Copy-Item "C:\Users\AlejandroFDM\Downloads\logo diana.jpg" "public/assets/logo-diana.jpg"
```

Expected: `public/assets/logo-diana.jpg` existe (~43 KB).

- [ ] **Step 2: Crear `src/shared/theme.css`**

```css
:root {
  /* Colores de marca */
  --color-navy: #191935;
  --color-turquesa: #5ECFCF;
  --color-lavanda: #A8A0D8;
  --color-bg: #F7F7FA;
  --color-text: #1F1F2E;
  --color-text-light: #FFFFFF;

  /* Tipografia */
  --font-base: 'Poppins', sans-serif;

  /* Espaciado */
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 2rem;
  --spacing-xl: 4rem;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-base);
  color: var(--color-text);
  background-color: var(--color-bg);
  line-height: 1.5;
}

a {
  color: inherit;
  text-decoration: none;
}
```

- [ ] **Step 3: Commit**

```bash
git add public/assets/logo-diana.jpg src/shared/theme.css
git commit -m "feat: add brand logo and shared theme variables"
```

---

## Task 3: Construir el HTML y los estilos de la landing

**Files:**
- Modify: `index.html`
- Create: `src/landing/landing.css`
- Create: `src/landing/main.js`

- [ ] **Step 1: Reemplazar `index.html` con la estructura completa de la landing**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Petra Diana Jara M. - Médico Psiquiatra</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <header class="site-header">
      <div class="container site-header__inner">
        <a href="#hero" class="brand">
          <img
            src="/assets/logo-diana.jpg"
            alt="Logo Petra Diana Jara M. - Médico Psiquiatra"
            class="brand__logo"
          />
        </a>
        <button
          id="nav-toggle"
          class="nav-toggle"
          aria-expanded="false"
          aria-controls="nav-menu"
          aria-label="Abrir menú"
        >
          <span class="nav-toggle__bar"></span>
          <span class="nav-toggle__bar"></span>
          <span class="nav-toggle__bar"></span>
        </button>
        <nav id="nav-menu" class="nav-menu">
          <a href="#sobre">Sobre la Dra.</a>
          <a href="#servicios">Servicios</a>
          <a href="#horarios">Horarios</a>
          <a href="#contacto">Contacto</a>
          <a href="/portal/" class="nav-menu__cta">Acceder al sistema</a>
        </nav>
      </div>
    </header>

    <main>
      <section id="hero" class="hero">
        <div class="container hero__inner">
          <h1 class="hero__title">Petra Diana Jara M.</h1>
          <p class="hero__subtitle">Médico Psiquiatra</p>
          <p class="hero__tagline">
            Atención psiquiátrica profesional, cercana y confidencial.
          </p>
          <a href="/portal/" class="button button--primary">Acceder al sistema</a>
        </div>
      </section>

      <section id="sobre" class="section sobre">
        <div class="container">
          <h2 class="section__title">Sobre la Dra. Jara</h2>
          <div class="sobre__content">
            <div class="sobre__photo" aria-hidden="true"></div>
            <p class="sobre__bio">
              La Dra. Petra Diana Jara Muñoz es médica psiquiatra especializada en el
              diagnóstico y tratamiento de trastornos del estado de ánimo, ansiedad y
              otras condiciones de salud mental. Con un enfoque humano y profesional,
              acompaña a cada paciente en su proceso de bienestar emocional.
            </p>
          </div>
        </div>
      </section>

      <section id="servicios" class="section servicios">
        <div class="container">
          <h2 class="section__title">Servicios</h2>
          <ul class="servicios__list">
            <li class="servicios__item">Consulta psiquiátrica inicial</li>
            <li class="servicios__item">Seguimiento y control</li>
            <li class="servicios__item">Evaluación de salud mental</li>
            <li class="servicios__item">Terapia individual</li>
            <li class="servicios__item">Manejo farmacológico</li>
            <li class="servicios__item">Orientación a familiares</li>
          </ul>
        </div>
      </section>

      <section id="horarios" class="section horarios">
        <div class="container">
          <h2 class="section__title">Horarios de atención</h2>
          <table class="horarios__table">
            <tbody>
              <tr>
                <th>Lunes a viernes</th>
                <td>9:00 - 17:00</td>
              </tr>
              <tr>
                <th>Sábado</th>
                <td>9:00 - 13:00</td>
              </tr>
              <tr>
                <th>Domingo</th>
                <td>Cerrado</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="contacto" class="section contacto">
        <div class="container">
          <h2 class="section__title">Contacto</h2>
          <ul class="contacto__list">
            <li>
              <span class="contacto__label">WhatsApp:</span>
              <a href="https://wa.me/593999999999">+593 99 999 9999</a>
            </li>
            <li>
              <span class="contacto__label">Correo:</span>
              <a href="mailto:contacto@petradianajara.com">contacto@petradianajara.com</a>
            </li>
            <li>
              <span class="contacto__label">Ubicación:</span>
              Consultorio Principal, Av. Ejemplo 123, Ciudad
            </li>
          </ul>
          <div class="contacto__redes">
            <a href="#" class="pill">Instagram</a>
            <a href="#" class="pill">Facebook</a>
          </div>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <div class="container site-footer__inner">
        <p>&copy; 2026 Petra Diana Jara Muñoz - Médico Psiquiatra. Todos los derechos reservados.</p>
        <a href="/portal/" class="site-footer__link">Acceder al sistema</a>
      </div>
    </footer>

    <script type="module" src="/src/landing/main.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Crear `src/landing/landing.css`**

```css
@import '../shared/theme.css';

.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 var(--spacing-md);
}

/* Header */
.site-header {
  background-color: var(--color-navy);
  position: sticky;
  top: 0;
  z-index: 10;
}

.site-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
}

.brand__logo {
  height: 48px;
  display: block;
}

/* Nav toggle (hamburger) */
.nav-toggle {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.nav-toggle__bar {
  display: block;
  height: 2px;
  width: 100%;
  background-color: var(--color-text-light);
}

/* Nav menu */
.nav-menu {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background-color: var(--color-navy);
  padding: var(--spacing-md);
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.nav-menu.is-open {
  max-height: 400px;
}

.nav-menu a {
  color: var(--color-text-light);
  font-weight: 500;
}

.nav-menu a:hover {
  color: var(--color-turquesa);
}

.nav-menu a.nav-menu__cta {
  background-color: var(--color-turquesa);
  color: var(--color-navy);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: 999px;
  text-align: center;
  font-weight: 600;
}

/* Hero */
.hero {
  background-color: var(--color-navy);
  color: var(--color-text-light);
  text-align: center;
  padding: var(--spacing-xl) var(--spacing-md);
}

.hero__title {
  font-size: 2.5rem;
  margin-bottom: var(--spacing-sm);
}

.hero__subtitle {
  color: var(--color-lavanda);
  font-size: 1.25rem;
  margin-bottom: var(--spacing-md);
}

.hero__tagline {
  max-width: 40ch;
  margin: 0 auto var(--spacing-lg);
}

/* Buttons */
.button {
  display: inline-block;
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: 999px;
  font-weight: 600;
}

.button--primary {
  background-color: var(--color-turquesa);
  color: var(--color-navy);
}

/* Sections */
.section {
  padding: var(--spacing-xl) 0;
}

.section__title {
  font-size: 1.75rem;
  margin-bottom: var(--spacing-lg);
  color: var(--color-navy);
}

/* Sobre */
.sobre__content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  align-items: center;
  text-align: center;
}

.sobre__photo {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background-color: var(--color-lavanda);
  flex-shrink: 0;
}

.sobre__bio {
  max-width: 60ch;
}

/* Servicios */
.servicios__list {
  list-style: none;
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--spacing-md);
}

.servicios__item {
  background-color: white;
  border-left: 4px solid var(--color-turquesa);
  padding: var(--spacing-md);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* Horarios */
.horarios__table {
  width: 100%;
  max-width: 480px;
  border-collapse: collapse;
}

.horarios__table th,
.horarios__table td {
  text-align: left;
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--color-lavanda);
}

/* Contacto */
.contacto__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}

.contacto__label {
  font-weight: 600;
  margin-right: var(--spacing-sm);
}

.contacto__redes {
  display: flex;
  gap: var(--spacing-sm);
}

.pill {
  display: inline-block;
  border: 1px solid var(--color-navy);
  border-radius: 999px;
  padding: var(--spacing-sm) var(--spacing-lg);
  font-weight: 500;
}

.pill:hover {
  background-color: var(--color-navy);
  color: var(--color-text-light);
}

/* Footer */
.site-footer {
  background-color: var(--color-navy);
  color: var(--color-text-light);
  padding: var(--spacing-lg) 0;
}

.site-footer__inner {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  align-items: center;
  text-align: center;
}

.site-footer__link {
  color: var(--color-turquesa);
  font-weight: 600;
}

/* Tablet and up */
@media (min-width: 768px) {
  .nav-toggle {
    display: none;
  }

  .nav-menu {
    position: static;
    flex-direction: row;
    align-items: center;
    max-height: none;
    overflow: visible;
    background-color: transparent;
    padding: 0;
  }

  .sobre__content {
    flex-direction: row;
    text-align: left;
  }

  .servicios__list {
    grid-template-columns: repeat(2, 1fr);
  }

  .site-footer__inner {
    flex-direction: row;
    justify-content: space-between;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .servicios__list {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

- [ ] **Step 3: Crear `src/landing/main.js`**

```javascript
import './landing.css';
```

- [ ] **Step 4: Verificar que el build funciona**

Run: `npm run build`
Expected: termina con `✓ built in <tiempo>`, sin errores de CSS ni de módulos.

- [ ] **Step 5: Commit**

```bash
git add index.html src/landing/landing.css src/landing/main.js
git commit -m "feat: build landing page markup and styles"
```

---

## Task 4: Menú de navegación responsive (TDD)

**Files:**
- Create: `src/landing/nav.js`
- Modify: `src/landing/main.js`
- Test: `tests/landing/nav.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

```javascript
// tests/landing/nav.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { initMobileMenu } from '../../src/landing/nav.js';

describe('initMobileMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="nav-toggle" aria-expanded="false">Menu</button>
      <nav id="nav-menu">
        <a href="#sobre">Sobre</a>
        <a href="#servicios">Servicios</a>
      </nav>
    `;
  });

  it('abre el menu al hacer click en el boton toggle', () => {
    initMobileMenu();
    const toggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('nav-menu');

    toggle.click();

    expect(nav.classList.contains('is-open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('cierra el menu si se hace click de nuevo en el boton toggle', () => {
    initMobileMenu();
    const toggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('nav-menu');

    toggle.click();
    toggle.click();

    expect(nav.classList.contains('is-open')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('cierra el menu al hacer click en un enlace de navegacion', () => {
    initMobileMenu();
    const toggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('nav-menu');
    const link = nav.querySelector('a');

    toggle.click();
    expect(nav.classList.contains('is-open')).toBe(true);

    link.click();

    expect(nav.classList.contains('is-open')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `npm test`
Expected: FAIL — `tests/landing/nav.test.js` no puede resolver `../../src/landing/nav.js` (el archivo no existe).

- [ ] **Step 3: Implementar `src/landing/nav.js`**

```javascript
export function initMobileMenu() {
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('nav-menu');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `npm test`
Expected: PASS — los 3 tests de `nav.test.js` pasan.

- [ ] **Step 5: Conectar `initMobileMenu` en `main.js`**

```javascript
// src/landing/main.js
import './landing.css';
import { initMobileMenu } from './nav.js';

initMobileMenu();
```

- [ ] **Step 6: Verificar que el build sigue funcionando**

Run: `npm run build`
Expected: termina con `✓ built in <tiempo>`, sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/landing/nav.js src/landing/main.js tests/landing/nav.test.js
git commit -m "feat: add responsive mobile nav toggle with tests"
```

---

## Task 5: Verificación responsive final (PC, tablet, celular)

**Files:** ninguno (verificación manual, sin cambios de código salvo ajustes menores si algo falla)

- [ ] **Step 1: Levantar el servidor de desarrollo**

Run: `npm run dev` (en background o en una terminal separada)
Expected: Vite imprime una URL local, ej. `http://localhost:5173/`.

- [ ] **Step 2: Verificar en viewport móvil (~375px)**

Abrir `http://localhost:5173/` con el viewport del navegador en ~375px de ancho (DevTools → modo responsive). Checklist:
- El header muestra el logo y el botón hamburguesa (☰); el menú de navegación está oculto.
- Al hacer click en el botón hamburguesa, el menú se despliega con los 5 enlaces (Sobre la Dra., Servicios, Horarios, Contacto, Acceder al sistema).
- Al hacer click en un enlace del menú, el menú se cierra y la página hace scroll a la sección correspondiente.
- Todas las secciones (Hero, Sobre, Servicios, Horarios, Contacto, Footer) son legibles en una sola columna, sin overflow horizontal.

- [ ] **Step 3: Verificar en viewport tablet (~768px)**

Cambiar el viewport a ~768px. Checklist:
- El botón hamburguesa desaparece; el menú de navegación se muestra horizontal en el header.
- La sección "Sobre la Dra." muestra la foto y el texto en fila (lado a lado).
- La sección "Servicios" muestra los items en 2 columnas.

- [ ] **Step 4: Verificar en viewport desktop (~1280px)**

Cambiar el viewport a ~1280px. Checklist:
- El layout general está centrado con márgenes laterales (no se estira a todo el ancho de la pantalla).
- La sección "Servicios" muestra los items en 3 columnas.
- El footer muestra el copyright y el enlace "Acceder al sistema" en una sola fila.

- [ ] **Step 5: Detener el servidor de desarrollo**

Detener el proceso de `npm run dev` (Ctrl+C o terminar el proceso en background).

---

## Self-review notes

- **Cobertura del spec:** esta plan cubre la sección "Landing pública" y "Tema visual" del spec de Fase 0 (todas las secciones, paleta de colores, tipografía, responsive PC/tablet/celular). El portal (`src/portal/`) y el backend GAS son los Planes 2 y 3.
- **Enlaces a `/portal/`:** tanto el CTA del header como el del hero y el footer apuntan a `/portal/`, que no existirá hasta el Plan 3 — es esperado que esa ruta dé 404 hasta entonces.
- **Consistencia de nombres:** `initMobileMenu`, `#nav-toggle`, `#nav-menu`, clase `is-open` son consistentes entre `index.html`, `nav.js` y `nav.test.js`.
