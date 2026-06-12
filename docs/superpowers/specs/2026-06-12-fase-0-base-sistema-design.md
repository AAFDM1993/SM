# Diseño: SMPDJM — Fase 0: Base del sistema

**Fecha:** 2026-06-12
**Proyecto:** SMPDJM — webapp para "Petra Diana Jara Muñoz - Psiquiatra"

---

## Contexto

SMPDJM es una webapp de gestión clínica para una consulta de psiquiatría (un solo profesional, la Dra. Petra Diana Jara Muñoz). El sistema completo incluye varios módulos:

- Historia clínica
- Agenda de pacientes
- Prescripción de fármacos
- Escalas de salud mental (administradas por el psiquiatra y autoadministradas por el paciente)
- Portal de actividades del paciente (higiene del sueño, recordatorios de medicación, próxima cita, etc.)

Dado el alcance, el proyecto se divide en fases con spec/plan independientes:

| Fase | Contenido |
|---|---|
| **Fase 0** (este documento) | Base del sistema: estructura, autenticación, seguridad, landing pública, portal/dashboard por rol, tema visual |
| Fase 1 | Agenda |
| Fase 2 | Historia clínica |
| Fase 3 | Prescripción de fármacos |
| Fase 4 | Escalas de salud mental |
| Fase 5 | Portal de actividades del paciente |

Este documento cubre **únicamente la Fase 0**.

---

## Arquitectura general

Mismo patrón técnico usado en el proyecto hermano NUEVOCENTYR:

- **Frontend:** Vite + JavaScript vanilla, app multi-página.
- **Backend:** Google Apps Script desplegado como Web App, con Google Sheets como base de datos.
- **Hosting recomendado:** cuenta de **Google Workspace** (no Gmail personal) para alojar el Spreadsheet/Script — mejor control de acceso, 2FA obligatorio y términos de servicio orientados a uso profesional/negocio. Esto es una decisión operativa (no de código) a configurar antes del despliegue.

### Estructura de carpetas

```
SMPDJM/
├── backend/
│   └── gas-smpdjm.txt        # código fuente de Google Apps Script (Web App)
├── src/
│   ├── landing/               # página pública (Fase 0)
│   ├── portal/                # login + dashboard por rol (Fase 0; módulos reales en fases futuras)
│   └── shared/                # tema visual, cliente API, helpers de auth
├── assets/
│   └── logo-diana.jpg
├── docs/
│   └── superpowers/specs/     # documentos de diseño
├── package.json
└── vite.config.js
```

---

## Modelo de datos (Google Sheets)

### Hoja `_usuarios`

| Columna | Campo | Notas |
|---|---|---|
| 0 | `codigo` | Identificador de login. Para rol `usuario` = DNI del paciente; para staff (`administrador`, `psiquiatra`, `recepcion`), código asignado al crear la cuenta |
| 1 | `password` | Hash: `SHA256(password + salt)` |
| 2 | `salt` | String aleatorio generado por usuario |
| 3 | `rol` | `administrador` \| `psiquiatra` \| `recepcion` \| `usuario` |
| 4 | `nombre` | Nombre completo |

### Hoja `_log` (auditoría)

| Columna | Campo |
|---|---|
| 0 | `timestamp` |
| 1 | `codigo` (usuario que realizó la acción) |
| 2 | `rol` |
| 3 | `accion` |
| 4 | `detalle` |

Toda acción sensible (login, cambios sobre `_usuarios`, y en fases futuras: lectura/escritura de historia clínica y prescripciones) se registra aquí.

---

## Autenticación y seguridad

Basado en el patrón de NUEVOCENTYR (`login`, `verifyToken`, `requireAuth`/`requireAuthBody`), con los siguientes refuerzos:

1. **Contraseñas con sal individual**
   - Al crear un usuario se genera un `salt` aleatorio.
   - `password` almacenado = `SHA256(password + salt)`.

2. **Tokens de sesión con expiración**
   - `token = base64(codigo:rol:passwordHash:expiresAt)`.
   - `expiresAt` = timestamp de emisión + 8 horas.
   - `verifyToken` rechaza tokens cuyo `expiresAt` ya pasó, además de revalidar `passwordHash` contra `_usuarios`.

3. **Límite de intentos de login**
   - Usando `CacheService` de Apps Script, se cuentan intentos fallidos de login por `codigo`.
   - Tras 5 intentos fallidos consecutivos, el `codigo` queda bloqueado para login durante 15 minutos.
   - Cada intento (exitoso o fallido) se registra en `_log`.

4. **Cambio de contraseña (`cambiarPassword`)**
   - Disponible para todos los roles autenticados.
   - **Obligatorio en el primer login** para el rol `usuario`: durante `login`, si `rol === 'usuario'` y la contraseña en texto plano recibida es igual al `codigo` (DNI), la respuesta incluye `debeCambiarPassword: true`. El portal detecta este flag y fuerza el flujo de cambio de contraseña antes de mostrar el dashboard. Una vez que el paciente cambia su contraseña, ya no coincidirá con su DNI y el flag no se activará en logins posteriores.

5. **Infraestructura de cifrado (preparada para Fases 2-3)**
   - Funciones `encrypt_(texto)` / `decrypt_(texto)` usando AES, con clave de cifrado guardada en `PropertiesService.getScriptProperties()` (nunca expuesta al cliente).
   - En Fase 0 se deja la utilidad lista y probada; su uso concreto (cifrar notas de historia clínica, prescripciones) se implementa en Fases 2 y 3.

### Permisos por rol (resumen)

| Rol | Alcance en Fase 0 |
|---|---|
| `administrador` | Acceso total al sistema. En Fase 0: gestión de usuarios (CRUD sobre `_usuarios`) + placeholders de todos los módulos futuros |
| `psiquiatra` | Acceso clínico completo (placeholders en Fase 0; funcionalidad real en Fases 1-4) |
| `recepcion` | Gestión de agenda + datos básicos de pacientes (placeholder en Fase 0; funcionalidad real en Fase 1) |
| `usuario` (paciente) | Su propia agenda, escalas y actividades (placeholders en Fase 0; funcionalidad real en Fases 1, 4, 5) |

### Alta de pacientes (referencia para Fase 2, no implementado en Fase 0)

Cuando la psiquiatra registre la **primera atención** de un paciente nuevo (Fase 2 — Historia clínica), el sistema creará automáticamente una fila en `_usuarios` con:
- `codigo` = DNI del paciente
- `password` inicial = DNI (hasheado con su `salt`)
- `rol` = `usuario`
- `nombre` = nombre del paciente

El paciente deberá cambiar su contraseña en el primer login (ver punto 4 arriba). La infraestructura de auth de Fase 0 (hash con sal, cambio de contraseña forzado) ya soporta este flujo; la creación automática del registro se implementa en Fase 2.

---

## Landing pública (`src/landing/`)

Página informativa de acceso público, con las siguientes secciones (contenido placeholder — el contenido real se completará posteriormente fuera de este diseño):

1. **Header/Hero** — logo completo, "Petra Diana Jara M. — Médico Psiquiatra", tagline breve, botón **"Acceder al sistema"**.
2. **Sobre la Dra. Jara** — bio breve + foto (placeholder).
3. **Servicios/Especialidades** — lista de servicios ofrecidos (placeholder).
4. **Horarios de atención** — tabla día/hora (placeholder).
5. **Contacto** — teléfono/WhatsApp, correo, ubicación (placeholder).
6. **Redes sociales** — íconos con enlaces (placeholder).
7. **Footer** — copyright + enlace de acceso al sistema.

El botón "Acceder al sistema" navega a `src/portal/` (pantalla de login).

---

## Portal interno (`src/portal/`)

### Pantalla de login

- Formulario: código/usuario + contraseña.
- Manejo de errores: credenciales incorrectas, cuenta bloqueada por intentos fallidos (con mensaje indicando tiempo restante de bloqueo).
- Si el rol es `usuario` y la contraseña actual = DNI sin cambiar → redirige al flujo de **cambio de contraseña obligatorio** antes de mostrar el dashboard.

### Dashboard / shell por rol

Estructura común:
- **Header:** logo reducido + nombre de usuario + rol + botón "Cerrar sesión".
- **Menú de navegación** (lateral en pantallas grandes, colapsable/inferior en móvil).
- **Área de contenido principal.**

Ítems de menú por rol (✅ = funcional en Fase 0, 🔜 = placeholder "Próximamente" para fases futuras):

| Rol | Ítems de menú |
|---|---|
| `administrador` | ✅ Gestión de usuarios · 🔜 Agenda · 🔜 Historia Clínica · 🔜 Prescripciones · 🔜 Escalas · ✅ Cambiar contraseña |
| `psiquiatra` | 🔜 Agenda · 🔜 Historia Clínica · 🔜 Prescripciones · 🔜 Escalas · ✅ Cambiar contraseña |
| `recepcion` | 🔜 Agenda · ✅ Cambiar contraseña |
| `usuario` | 🔜 Mi agenda · 🔜 Mis escalas · 🔜 Mis actividades · ✅ Cambiar contraseña |

Los ítems 🔜 se muestran deshabilitados o con etiqueta "Próximamente", para dejar la navegación lista para que las fases futuras agreguen su contenido.

### Gestión de usuarios (`administrador`)

- Tabla con todos los usuarios (`codigo`, `nombre`, `rol`).
- Crear usuario nuevo (código, nombre, rol, contraseña inicial → se genera `salt` y hash).
- Editar usuario (nombre, rol; reseteo de contraseña).
- Eliminar usuario.
- Cubre la creación manual de cuentas `psiquiatra` y `recepcion`, y permite crear cuentas `usuario` de prueba mientras la creación automática (Fase 2) no exista.

---

## Tema visual (`src/shared/theme.css`)

Basado en el logo existente (fondo navy, ícono de cerebro turquesa sobre caja en contorno lavanda, nombre en script blanco).

### Paleta de colores (variables CSS)

| Variable | Valor | Uso |
|---|---|---|
| `--color-navy` | `#191935` | Header/nav, footer, botones primarios |
| `--color-turquesa` | `#5ECFCF` | Acentos, estados activos/hover, iconos |
| `--color-lavanda` | `#A8A0D8` | Acentos secundarios, bordes, badges |
| `--color-bg` | `#F7F7FA` | Fondo de áreas de contenido |
| `--color-text` | `#1F1F2E` | Texto principal sobre fondo claro |
| `--color-text-light` | `#FFFFFF` | Texto sobre `--color-navy` |

### Tipografía

- Sans-serif limpia (Poppins o Inter, vía Google Fonts) para toda la interfaz — prioriza legibilidad en formularios clínicos.
- La tipografía script del logo ("Petra Diana Jara M.") no se replica con fuente; se usa la imagen del logo directamente donde se requiera la marca.

### Aplicación

- **Landing:** header navy con logo completo; secciones de contenido sobre `--color-bg`, acentos en turquesa/lavanda.
- **Portal:** barra de navegación navy con logo reducido + nombre/rol; contenido sobre `--color-bg`.
- Estados activos/hover → turquesa; bordes/separadores/badges secundarios → lavanda.

---

## Diseño responsivo

Todo el sistema (landing y portal) debe funcionar correctamente en **PC, tablet y celular**:
- Landing: layout de una columna en móvil, multi-columna en tablet/desktop.
- Portal: menú de navegación lateral en desktop/tablet, colapsable (ej. menú inferior o hamburguesa) en móvil.

---

## Fuera de alcance (Fase 0)

- Funcionalidad real de agenda, historia clínica, prescripciones, escalas y portal de actividades (fases 1-5).
- Contenido real de la landing (bio, servicios, horarios, contacto, redes sociales) — se usan placeholders.
- Integración con Google Calendar y Gmail (Fases 1 y 5).
- Creación automática de cuentas `usuario` desde "primera atención" (Fase 2) — solo se deja lista la infraestructura de auth que la soportará.

---

## Testing

- **Backend (Apps Script):** pruebas manuales de las funciones de auth (`login`, `verifyToken`, `cambiarPassword`, límite de intentos, expiración de token) ejecutadas desde el editor de Apps Script o mediante llamadas HTTP de prueba.
- **Frontend:** verificación manual en navegador (PC, tablet, celular o emulación de viewport) de: landing completa, login (casos éxito/error/bloqueo), cambio de contraseña forzado, navegación del dashboard por cada rol, y CRUD de gestión de usuarios.
