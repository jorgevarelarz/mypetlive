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
