# Plan de cierre del MVP — sprint intensivo (22 jul 2026)

> Reparto de trabajo entre **Claude** (integra, revisa y despliega) y **Codex**.
> Cada feature va completa (back+front+tests) en su propia rama. Base: `rentalapp1.2`.

## Convenciones (obligatorias para ambos)

- **Rama base:** `rentalapp1.2`. Crear rama `feat/...` o `test/...` desde ella.
- **Remoto:** `mypetlive` (git@github.com:jorgevarelarz/mypetlive.git). **NUNCA pushear a `origin`** (es el RentalApp original).
- **Rutas backend:** se montan en `src/app.ts` (`src/routes/index.ts` es código muerto, no tocarlo).
- **Tests:** los de MyPetLive viven en `src/__tests__/` y deben quedar en verde
  (`npx jest src/__tests__`). Las suites legacy de `tests/` fallan de antes: ignorarlas, no arreglarlas.
- **Emails:** best-effort vía Brevo, siguiendo el patrón de los existentes (nunca romper el flujo si el email falla).
- **UI:** React CRA + Tailwind + sistema de diseño propio `styles/mypetlive`. Textos en español.
- **No tocar:** `docker-compose.deploy.yml`, `scripts/deploy.sh`, config del VPS. El deploy lo hace solo Claude.
- **Merge:** nadie mergea a `rentalapp1.2` directamente; Claude revisa e integra.

## Reparto

| # | Feature | Rama | Quién |
|---|---------|------|-------|
| F1 | Vista semanal/horaria del calendario del vet + reprogramar desde el calendario | `feat/calendario-semanal` | **Codex** |
| F2 | Comisiones fase 2: extracto mensual de liquidación del partner | `feat/liquidacion-partner` | **Claude** |
| F3 | KPIs internos de plataforma en el panel admin | `feat/kpis-admin` | **Claude** |
| F4 | Tests ampliados del pasaporte digital | `test/pasaporte` | **Codex** |
| F5 | Ofertas segmentadas por items comprados (2ª mitad de comisiones fase 2) | `feat/ofertas-por-items` | quien quede libre |

---

## F1 (Codex) — Calendario semanal del vet

**Contexto:** hoy `/citas` tiene un calendario mensual donde el vet gestiona sus citas
(`VetAppointment`), y adoptante/protectora solo ven. Roadmap 5.3.

**Alcance:**
- Añadir vista **semanal con franjas horarias** (toggle mes/semana) al calendario de `/citas`.
- Las citas se pintan en su franja según `date`; mantener los mismos estados/colores que la vista mensual.
- **Reprogramar desde el calendario**: el vet arrastra o abre la cita y elige nueva fecha/hora
  → reutilizar el endpoint de reprogramación existente del panel de lista (no crear uno nuevo
  salvo que falte algo). Debe disparar el mismo email de cambio de estado.
- Adoptante/protectora: la vista semanal es solo lectura, igual que la mensual.

**No tocar:** modelo `VetAppointment`, feed iCal (`vetCalendarFeed`), catálogo de servicios.

**Tests:** si se añade/cambia algún endpoint, test en `src/__tests__/`. Para UI pura no hacen falta.

## F2 (Claude) — Extracto mensual de liquidación del partner

**Contexto:** el modelo `Sale` ya tiene `settlementStatus`. El partner registra ventas con
comisión (snapshot de %). Falta el ciclo de liquidación mensual.

**Alcance:**
- Extracto mensual por partner: ventas del mes, base, comisión, estado de liquidación.
- Endpoints admin (generar/consultar/marcar liquidado) + endpoint del partner (ver sus extractos).
- CSV exportable. UI mínima en panel admin y en PatitasPartnerPanel.
- Tests en `src/__tests__/`.

## F3 (Claude) — KPIs internos admin

**Contexto:** P2 nº6 del gap dossier. Base para decidir cuándo activar cada línea de ingreso.

**Alcance:**
- `GET /api/admin/metrics`: solicitudes, adopciones, conversión, cupones usados, GMV
  (ventas + donaciones), Patitas emitidas/canjeadas, por mes y total.
- Card/sección en el panel admin con export CSV (patrón de `metrics.controller.ts`).
- Tests.

## F4 (Codex) — Tests ampliados del pasaporte

**Contexto:** roadmap 5.4 — el pasaporte público `/p/:code` y el matching de ofertas tienen
pocos tests dedicados.

**Alcance (todo en `src/__tests__/`, sin tocar código de producción salvo bug real):**
- Pasaporte público: animal existente/inexistente, animal no publicado, **que nunca se filtren
  datos del dueño** (nombre, email, ids).
- Matching de ofertas (`matchOffersForAnimal`): por especie, edad, tamaño, ciudad, código exacto,
  oferta caducada/inactiva, combinaciones sin match.
- Linaje/timeline: orden de eventos y tipos (`created/published/adopted/vet/health`).
- QR/OG: `/og/p/:code` responde y contiene los meta tags esperados.
- Si un test destapa un bug real, arreglarlo en commit separado y documentarlo en la descripción.

## F5 (libre) — Ofertas segmentadas por items comprados

Matching de ofertas usando las líneas del ticket (`Sale.items`) además de los criterios
actuales (especie/edad/tamaño/ciudad). Se especifica cuando alguien quede libre.

---

## Definición de "hecho" (cada feature)

1. Tests de MyPetLive en verde (`npx jest src/__tests__`).
2. Rama pusheada a `mypetlive`.
3. Nota breve de qué se hizo (para el changelog de `ESTADO_Y_ROADMAP.md`).
4. Claude revisa, mergea a `rentalapp1.2` y despliega.

---

## Registro de coordinación — Codex (22 jul 2026)

### Estado que he leído y reglas que asumo

- Checkout compartido localizado en `/Users/jorge/Projects/animal-app`.
- El worktree compartido está actualmente en `feat/liquidacion-partner`, limpio y
  sincronizado con `mypetlive/feat/liquidacion-partner`. Es trabajo de Claude: **Codex no
  cambiará esa rama ni tocará código fuente en ese worktree**.
- La única excepción en el worktree compartido es esta nota de coordinación, añadida a
  petición de Jorge.
- Para F1 y F4, Codex trabajará en un **worktree Git independiente**, siempre desde
  `rentalapp1.2`, y solo pusheará al remoto `mypetlive`.
- Codex no tocará F2, F3, `src/routes/index.ts`, Docker, configuración del VPS, integración,
  merge ni despliegue.

### Orden de trabajo de Codex

1. **F4 — tests ampliados del pasaporte**, rama `test/pasaporte`.
   - Empezar por tests para reducir el riesgo de colisión con el frontend que pueda estar
     integrando Claude.
   - Archivos reservados mientras F4 esté en curso:
     `src/__tests__/animal.passport.test.ts` y, si conviene separar el matching,
     `src/__tests__/offers.matching.test.ts` (nuevo).
   - `src/controllers/animal.controller.ts`, `src/controllers/offers.controller.ts` y
     `src/routes/seo.routes.ts` serán inicialmente **solo lectura**. Si un test descubre un
     bug real, se avisará aquí antes de editar y el arreglo irá en un commit separado.
   - Verificación: test focal, después `npx jest src/__tests__`.

2. **F1 — calendario semanal del veterinario**, rama `feat/calendario-semanal`, después de F4.
   - Archivos previstos: `frontend/src/components/vet/AppointmentsCalendar.tsx`,
     `frontend/src/pages/vet/AppointmentsPage.tsx` y, solo si hace falta reutilizar la
     mutación existente, `frontend/src/components/vet/VetAppointmentsPanel.tsx` y
     `frontend/src/api/vetAppointments.ts`.
   - No se tocarán `src/models/vetAppointment.model.ts`, el feed iCal ni el catálogo.
   - Antes de iniciar F1 se actualizará esta sección con los archivos definitivamente
     reservados, para que Claude pueda evitar esos mismos puntos.

3. **F5 queda libre**. Codex no lo iniciará sin una asignación explícita en este documento.

### Actualización de ejecución F4 — Codex

- Estado: **INTEGRADA** por Claude en `rentalapp1.2` (`fbd10cc`). Rama de entrega:
  `mypetlive/test/pasaporte`.
- Tests ampliados en `src/__tests__/animal.passport.test.ts`: visibilidad y
  privacidad del pasaporte, segmentación de ofertas, orden completo del timeline y meta tags
  Open Graph de `/og/p/:code`.
- Commits: `5461222` (tests) y `2552226` (bug real separado: el pasaporte público devolvía
  HTTP 200 para animales en estado `borrador`; ahora devuelve 404).
- Impacto GitNexus antes de editar: **LOW** para `getPassport` (0 dependientes internos),
  `buildTimeline` (2 consumidores directos) y `matchOffersForAnimal` (2 consumidores
  directos). No se editarán los dos últimos.
- Verificación focal: **14/14 tests en verde**. Verificación completa:
  **21/24 suites y 117/127 tests en verde**; las tres suites fallidas (`security.test.ts`,
  `api.test.ts`, `rbac.test.ts`) son legado inmobiliario que espera rutas retiradas y falla
  también fuera del alcance de F4. No se han modificado.
- Archivos F4 liberados; Claude puede revisar/mergear la rama.

### Relectura de Claude y ejecución F1 — Codex

- Relectura final: Claude ya ha integrado F2, F0, F3 y F4; `rentalapp1.2` queda en
  `084e3d4`. Ninguna de esas integraciones colisiona con los dos archivos de F1.
- F1 queda **LISTA PARA REVISIÓN** en `mypetlive/feat/calendario-semanal`, commit
  `a73c8f5`.
- Implementado toggle mes/semana; rejilla semanal por horas (08:00–20:00 por defecto,
  ampliación automática si hay citas fuera del horario), navegación semanal y citas con los
  mismos colores/estados. El veterinario abre una cita activa y elige nueva fecha/hora.
- La página reutiliza `updateVetAppointmentStatus` con estado `rescheduled`: no se ha creado
  ni modificado ningún endpoint y se conserva el email best-effort del backend. Para
  adoptante/protectora no se entrega callback de mutación y ambas vistas son solo lectura.
- Archivos modificados y ya liberados:
  `frontend/src/components/vet/AppointmentsCalendar.tsx` y
  `frontend/src/pages/vet/AppointmentsPage.tsx`. No se tocaron
  `VetAppointmentsPanel.tsx`, `frontend/src/api/vetAppointments.ts`, modelo, iCal ni
  catálogo.
- Impacto GitNexus: **MEDIUM**, un único flujo UI afectado (`AppointmentsCalendar → Fmt`).
  Verificación: build de producción correcto (solo warnings previos de sourcemaps),
  `vet.appointments.test.ts` **13/13 en verde** y prueba visual/interactiva en Chrome con
  fixtures de los cinco estados. La prueba visual detectó y corrigió que la semana abría a
  medianoche mostrando demasiadas horas vacías.

### Hallazgos de la revisión inicial de Codex

Estos puntos se han comprobado en producción y, cuando se indica, también contra
`rentalapp1.2`. **No forman parte de F1/F4 y Codex no los corregirá por su cuenta**, para no
invadir el trabajo de Claude. Conviene tratarlos como un bloque F0 de seguridad/cierre:

- **Crítico — roles profesionales autoasignables:** `rentalapp1.2` permite registrar por API
  los roles `protectora`, `vet` y `store`. Además, el despliegue usa
  `NODE_ENV=development` y `ALLOW_UNVERIFIED=true`, y mantiene `/api/verification/dev/verify`.
  La combinación permite que una cuenta profesional eleve capacidades sin el alta manual
  que promete la interfaz. Requiere decisión y rama de seguridad separada.
- **Dependencias:** el lockfile devuelve 87 avisos con `npm audit --omit=dev` (3 críticos,
  34 altos, 37 moderados y 13 bajos). Parte procede de la cadena CRA, pero también aparecen
  dependencias directas de ejecución (Axios, Express, Mongoose, Nodemailer,
  Express Validator y Multer). Debe separarse actualización de runtime y migración del
  toolchain; no mezclarla con F1/F4.
- **Trazabilidad del despliegue:** `/opt/mypetlive` no conserva metadatos Git y todavía se
  identifica en varios puntos como RentalApp. El checkout correcto sí está en este Mac y el
  remoto correcto es `mypetlive`; el despliegue debería quedar ligado a un commit/tag.
- **Producción web:** el bundle principal se sirve sin compresión ni política de caché
  (`~817 KB` transferidos). Faltan cabeceras web como HSTS/CSP en los estáticos.
- **Producto/legal:** WhatsApp profesional sigue en `https://wa.me/XXXXXXXXXX`; el registro
  no presenta términos/privacidad y admite contraseña mínima de seis caracteres; las cifras
  de impacto de la portada están hardcodeadas y no coinciden con los datos visibles.
- **SEO/UX:** `<html lang="en">`, ausencia de canonical, rutas inexistentes con HTTP 200,
  textos `cat/dog/anio/anios` y un pequeño desbordamiento horizontal a 390 px.
- **Operación validada:** HTTPS correcto, contenedores sin reinicios ni errores recientes,
  puertos 3000/8080 bloqueados externamente, health/Mongo correctos y backup diario válido
  en prueba seca. Falta confirmar una copia fuera del propio VPS.

### Seguridad F0.2 — Codex

- Estado: **INTEGRADA** en `rentalapp1.2` mediante `8be2fa9` (rama de origen
  `mypetlive/security/harden-auth`, commit `0495656`). Integración asumida por Codex tras el
  relevo de Claude; **desplegada y verificada en producción** desde `2950c6f`.
- El registro público solo crea adoptantes (`tenant`) y rechaza expresamente los roles
  `protectora/landlord`, `vet`, `store`, `pro` y `admin`; se eliminó también el atajo de
  roles privilegiados en tests. Las fixtures antiguas crean esos roles directamente en BD.
- Contraseñas nuevas y restablecidas: mínimo 12 caracteres y máximo real de 72 bytes por
  el límite de bcrypt. Las cuentas antiguas con claves más cortas siguen pudiendo entrar.
  Login, registro y recuperación tienen límites específicos de intentos.
- `APP_ENV=production` activa ahora CSP/HSTS, CORS sin fallback local, validación estricta
  de entorno y salida ante excepción no capturada aunque `NODE_ENV=development`. La
  interfaz elimina el alta directa de protectoras y sustituye el WhatsApp ficticio por
  `soporte@mypetlive.es`.
- Pruebas: `auth.hardening.test.ts` **14/14 en verde**; build backend correcto; build
  frontend correcto con los avisos previos de sourcemaps. Suite completa: las únicas tres
  suites que fallan siguen siendo las heredadas `api.test.ts`, `security.test.ts` y
  `rbac.test.ts`, por rutas inmobiliarias retiradas; las dos primeras ya no dependen del
  registro público inseguro. Impacto GitNexus: **MEDIUM** (índice advertido como atrasado).
- Archivos liberados:
  `src/controllers/auth.controller.ts`, `src/routes/auth.routes.ts`, `src/app.ts`,
  `src/config/env.ts`, `src/__tests__/auth.hardening.test.ts` (nuevo),
  `src/__tests__/api.test.ts`, `src/__tests__/security.test.ts`,
  `frontend/src/api/auth.ts`, `frontend/src/components/auth/AuthModal.tsx`,
  `frontend/src/pages/auth/RegisterPage.tsx`, `frontend/src/pages/auth/LoginPage.tsx`,
  `frontend/src/pages/auth/ResetPassword.tsx`, `frontend/src/pages/Login.tsx` y
  `frontend/src/pages/home/Landing.tsx`.

### Seguridad F0.3 — dependencias runtime (Codex)

- Estado: **INTEGRADA** en `rentalapp1.2` mediante `5d223d1` (rama de origen
  `mypetlive/security/runtime-dependencies`, commit `70c2adc`). Integración asumida por
  Codex tras el relevo de Claude; **desplegada y verificada en producción** desde
  `2950c6f`.
- Actualizadas dependencias directas de ejecución con corrección disponible: AWS SDK S3 y
  Secrets Manager, Express 4, Express Validator 7, Mongoose 7, Morgan, Nodemailer 9, Axios,
  React Router 7 y PostCSS. Se conservaron los majors de Express y Mongoose para reducir el
  riesgo; el salto mayor de Nodemailer quedó validado por compilación y pruebas.
- `npm audit --omit=dev`: de **87** avisos (3 críticos, 34 altos, 37 moderados, 13 bajos) a
  **29** (0 críticos, 13 altos, 7 moderados, 9 bajos). El residual procede de
  `react-scripts@5`/Create React App y sus transitivas; resolverlo requiere migrar el
  toolchain. No se usó `npm audit fix --force`, que propone cambios incompatibles.
- Verificación conjunta tras integrar: instalación limpia, build backend y build frontend
  en verde (solo los avisos previos de sourcemaps de `html5-qrcode`). Suite completa:
  **26/29 suites y 154/164 tests en verde**; solo fallan las tres suites legacy `api.test.ts`,
  `security.test.ts` y `rbac.test.ts` por rutas inmobiliarias retiradas, igual que antes.
  Prueba real en Chrome: portada y navegación cliente a `/animals` correctas, sin rotura de
  React. GitNexus no cubre manifiestos/lockfile y avisó de índice atrasado.
- Archivos liberados: `package.json`, `package-lock.json` y `frontend/package.json`.

### Relevo operativo — Codex

- Jorge comunica el 22 jul 2026 que Claude se retira del cierre y que **Codex asume desde
  este punto revisión, integración, despliegue y documentación**.
- Base integrada y publicada: `mypetlive/rentalapp1.2` en `2950c6f`; auditoría runtime
  final: 29 avisos (0 críticos, 13 altos, 7 moderados y 9 bajos), pendientes de la migración
  de CRA. Multer 1 queda identificado como el siguiente bloque de dependencias de seguridad.
- **Despliegue completado** en el VPS desde el worktree limpio del commit
  `2950c6f6049d093fed16756e0df34e4334d41962`. El backend usa la imagen nueva
  `sha256:2666eda33eb5...`; `/opt/mypetlive/DEPLOYED_COMMIT` fija la versión desplegada.
- Reversión preparada en
  `/opt/mypetlive/deploy-backups/2026-07-22-pre-2950c6f/` (API y docroot web) y en la imagen
  Docker `mypetlive-api:rollback-2950c6f`. La copia diaria de Mongo del 22 jul sigue
  presente y no se modificó la base de datos.
- Verificación en vivo: web, `/health` y `/api/animals` responden HTTP 200;
  `APP_ENV=production`; CSP, HSTS, `nosniff` y protección de frames presentes. En Chrome
  cargan portada, adopciones, registro y login sin errores de consola; el registro exige 12
  caracteres y no ofrece alta directa de protectoras.

### Seguridad F0.4 — estáticos HTTP (Codex)

- Estado: **EN CURSO** en `security/static-http-hardening`, desde `rentalapp1.2` (`d132213`).
- Hallazgo confirmado tras F0.2/F0.3: Apache sirve la portada y el bundle sin HSTS/CSP,
  cabeceras defensivas, compresión ni política de caché; Helmet sólo protege la API.
- Archivo reservado: `frontend/public/.htaccess`. Alcance: cabeceras equivalentes a la API,
  desactivar listado, compresión de texto y caché larga sólo para artefactos versionados.
- Se validará la configuración en Apache, el build y las rutas reales en Chrome antes de
  integrar y desplegar; existe copia completa del docroot para reversión.

### Registro de coordinación — Claude

- **F2 extracto de liquidación**: `INTEGRADA` en `rentalapp1.2` (22 jul, rama `feat/liquidacion-partner`
  (pusheada; 10 tests en verde). Archivos tocados: `src/utils/settlement.ts`,
  `src/routes/admin.sales.routes.ts`, `src/controllers/patitas.controller.ts`,
  `src/routes/patitas.routes.ts`, `frontend/src/api/{patitas,settlements}.ts`,
  `frontend/src/pages/admin/{AdminSettlementsPage,AdminHome}.tsx`,
  `frontend/src/AppRoutes.tsx`, `PatitasPartnerPanel.tsx`.
- **F0 (hallazgo crítico de Codex)**: `INTEGRADA Y DESPLEGADA` en `rentalapp1.2` (rama
  `security/f0-produccion`). El VPS ya ejecuta `APP_ENV=production`.
  Verificado en el VPS: prod corre `NODE_ENV=development` + `ALLOW_UNVERIFIED=true`, con
  `/api/verification/dev/verify` abierto (cualquier cuenta podía autoverificarse y p. ej.
  publicar animales). Fix: `APP_ENV=production` como señal explícita (`utils/env.ts`,
  `isProduction()`), aplicada en `requireVerified` y `dev/verify`; compose del repo
  actualizado y replicado en el compose del VPS.
  El auto-registro de roles vet/store y el resto de hallazgos de Codex (deps, headers,
  legal/SEO) quedan PENDIENTES de decisión de Jorge — no se tocan sin asignación aquí.
- **F5 ofertas por items**: `INTEGRADA` en `rentalapp1.2` (rama `feat/ofertas-por-items`).
  Archivos liberados. Coupon.targetItems casado contra Sale.items (caja: solo historial en
  ese partner; for-me: todo el historial; pasaporte público: nunca).
- **F3 KPIs admin**: `INTEGRADA` en `rentalapp1.2` (rama `feat/kpis-admin`). Tocado: `src/controllers/metrics.controller.ts`
  (o `admin.metrics` nuevo), `src/routes/admin.routes.ts` o montaje en `app.ts`,
  `frontend/src/pages/admin/` (card/página KPIs), tests `admin.metrics.test.ts`.

### Protocolo de no colisión

- El estado de una tarea será `PENDIENTE`, `EN CURSO`, `LISTA PARA REVISIÓN` o `INTEGRADA`.
- Solo `EN CURSO` reserva archivos; las reservas se anotan arriba antes de editar.
- El registro histórico de Claude se conserva como trazabilidad; ya no reserva archivos.
- Codex trabaja con ramas, commits, pruebas y nota de changelog antes de integrar o desplegar.
- Producción sólo recibe commits integrados en `rentalapp1.2`, con comprobaciones previas y
  copia recuperable.
