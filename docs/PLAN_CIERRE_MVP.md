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

### Protocolo de no colisión

- El estado de una tarea será `PENDIENTE`, `EN CURSO`, `LISTA PARA REVISIÓN` o `INTEGRADA`.
- Solo `EN CURSO` reserva archivos; las reservas se anotan arriba antes de editar.
- Si aparece un archivo compartido con Claude, Codex pausa ese cambio y lo deja documentado.
- Codex entrega rama, commits, tests y nota de changelog; Claude revisa, integra y despliega.
- No se ejecutará ningún cambio directo en producción desde las ramas de Codex.
