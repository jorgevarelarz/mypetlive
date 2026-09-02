# MyPetLive — Estado de la aplicación y roadmap

> Documento de situación a **2 de julio de 2026**. Resume qué hace la plataforma hoy
> y qué queda pendiente. Generado a partir del estado real del código y el despliegue.

---

## 1. Visión

**MyPetLive** es una plataforma de **adopción responsable de mascotas + ecosistema pet**
(protectoras, adoptantes, partners tienda/veterinario, cupones, moneda de impacto "Patitas",
donaciones, pasaporte digital del animal y panel de administración).

Está construida sobre el código de RentalApp (fork en migración): el legado de alquiler
está **congelado/oculto**, no borrado.

---

## 2. Stack y arquitectura

- **Backend:** Node + Express + TypeScript, MongoDB/Mongoose.
- **Frontend:** React (CRA) + Tailwind + estilos inline (sistema de diseño propio `styles/mypetlive`).
- **Pagos:** Stripe (Checkout, Connect, transfers). Hoy en **modo TEST** en staging.
- **Email:** Brevo (SMTP relay, puerto 587; el VPS bloquea el 25 saliente).
- **Rutas backend:** se montan en `src/app.ts` (NO en `src/routes/index.ts`, que es código muerto).

### Despliegue
- **VPS Valeris** (AlmaLinux 9 + Plesk/Apache). Dominio en vivo: **https://mypetlive.es** (+ www).
- `test.valerisstudio.es` → redirect 301 a mypetlive.es (excepto `/panel`).
- **Docker** en `/opt/mypetlive`: contenedores `mypetlive_mongo`, `mypetlive_api` (Node:3000), `mypetlive_web` (obsoleto).
- El **frontend público se sirve desde el docroot de Plesk** (build compilado), no desde el contenedor web.
- Apache hace proxy de `/api`, `/uploads`, `/health`, `/sitemap.xml` y render para bots sociales (`/og/...`).
- **Repo git:** `git@github.com:jorgevarelarz/mypetlive.git` (remoto `mypetlive`, rama `main`). NUNCA pushear a `origin` (es RentalApp).
- **Deploy backend:** `rsync src/ → /opt/mypetlive/src/` + `docker compose build api && up -d --force-recreate api`.
- **Deploy frontend:** `npm run build` + `rsync --delete build/ → docroot` + `chown mypetlive:psaserv`.

### Roles
`tenant` (adoptante), `landlord` (protectora), `vet` (veterinario), `store` (tienda),
`admin`, `pro` (legado). Auto-registro solo para roles pet.

---

## 3. Funcionalidades actuales (qué hace hoy)

### 3.1 Adopción y animales
- Catálogo público con filtros (especie, tamaño, sexo, ciudad, texto), paginación y visibilidad por rol.
- Estados del animal: borrador / publicado / reservado / preadoptado / adoptado / no_disponible / archivado.
- Máquina de estados de adopción completa (recibida → cuestionario → revisión → cita → preaprobada → aprobada/rechazada) con historial.
- Panel de protectora: dashboard, gestión de animales, solicitudes de adopción, cuestionario.
- Mascotas personales del adoptante (registro propio) + cuidado diario (comida/arena).
- Favoritos y alertas de búsqueda.

### 3.2 Pasaporte digital del animal (código único, ej. `LUNA-715`)
- **Linaje:** ledger de eventos (`AnimalEvent`: created/published/reserved/adopted/returned/vet/health) + timeline.
- **Pasaporte público** `/p/:code`: perfil + procedencia (protectora) + salud + ofertas + QR, **sin datos del dueño**.
- **Ofertas personalizadas** por animal (matching por especie/edad/tamaño/ciudad o código exacto).
- Botones "Ver/compartir pasaporte" en la ficha de mascota y en el detalle de animal.
- SEO: tarjeta Open Graph dinámica al compartir (`/og/p/:code`), sitemap.

### 3.3 Patitas (moneda de impacto)
- Cadena: **usuario genera → dona a protectora → protectora canjea en partner → la plataforma paga € real al partner** (modelo RSC).
- 1 Patita = 0,10 €. Ledger único `PatitaTxn` (earn/donate/redeem).
- Generación por cupón o por visita a tienda; donación manual o automática.
- Canje con QR/código corto; pago al partner vía Stripe transfer (gateado).
- Legado `echoPatita`/`spendPatitas` coexiste (pendiente de retirar).

### 3.4 Cupones y ofertas
- Cupones por partner (tienda/vet) creados por admin, con **segmentación** (especie/edad/tamaño/ciudad) y placement **destacado (sponsored)**.
- Monetización del placement sponsored vía Stripe Checkout (gateado).
- **Vets crean sus propias ofertas de servicio** (con `serviceType` + targeting), que aparecen en el pasaporte de mascotas que encajan.

### 3.5 Donaciones
- Donación en € directa a la protectora vía Stripe (destination charge), la plataforma retiene comisión de gestión.
- Genera Patitas de impacto a la protectora del animal.

### 3.6 Usuario veterinario (completo)
- **Historial clínico:** el vet añade visitas/vacunas/hitos de salud a un animal por su código → alimenta el pasaporte.
- **Perfil/onboarding:** nº de colegiado, especialidades, servicios, horario, urgencias 24h + checklist de onboarding.
- **Agenda de citas** (modelo `VetAppointment`): el dueño solicita, el vet confirma/reprograma/completa/cancela.
  - Directorio público de veterinarios (`/api/vets`).
  - **Calendario mensual** dedicado en `/citas` (vet gestiona; adoptante/protectora solo ven).
  - Emails en cambios de estado (best-effort).
  - Al completar, el vet puede volcar la cita al historial clínico del animal.
- **Ofertas de servicio propias** (ver 3.4).
- **Catálogo de servicios con precio** (`profile.vet.serviceCatalog`): cada servicio con nombre, precio € y tipo **fijo** o **presupuesto**; el vet lo edita en su perfil y se muestra como "Tarifas" al pedir cita y en `/api/vets`. Solo informativo (Fase 1, sin cobro online).
- **Cita vinculada a servicio:** al pedir cita se puede elegir un servicio del catálogo → se valida en servidor y se guarda como **snapshot** en la cita (`VetAppointment.service`), visible en las tarjetas y en el email al vet. Si agenda una protectora con servicio de precio fijo, se **sugiere el coste en Patitas** (€/0,10; editable).

### 3.7 Protectora paga citas con Patitas
- La protectora agenda cita con un vet y compromete un coste en **Patitas**.
- Al completar la cita: débito atómico de la protectora + canje (`PatitaTxn` redeem) al vet + Stripe transfer (gateado).

### 3.8 Cuenta, auth y comunicaciones
- Registro/login por rol; recuperación de contraseña por email (Brevo, dominio autenticado con DKIM/DMARC).
- Perfil enriquecido por rol (persona / organización / veterinario).
- SEO: render dinámico para bots sociales (animales y pasaportes), sitemap, robots.txt.

### 3.9 Administración
- Gestión de usuarios, animales, adopciones, cupones (con segmentación), reportes y ajustes.

---

## 4. Estado de Stripe (importante)
- **Staging en modo TEST** (claves `sk_test_`, webhook de test creado).
- Los flujos de pago (donaciones, canje de Patitas, sponsored, pago de citas) se ejecutan en test, **sin dinero real**.
- **Para producción real falta:** activar la cuenta `sk_live_` del todo (charges_enabled: KYC + datos de negocio + banco), recrear el webhook en modo live, poner claves live y **rotar la `sk_live_` que se expuso**.

---

## 5. Roadmap / mejoras pendientes

### 5.1 Bloqueado por Stripe / legal (para cobrar de verdad)
- [ ] Activar cuenta Stripe live (charges_enabled) + webhook live + rotar clave expuesta.
- [ ] Onboarding Connect real de cada protectora/partner/vet (KYC + banco).
- [ ] Parte fiscal/legal para cobros: facturación con IVA (la emite el profesional), reembolsos/disputas, T&Cs, derecho de desistimiento.

### 5.2 Servicios de pago del veterinario (idea valorada, en fases) — ver nota dedicada
- [x] **Fase 1 (barata, sin pagos):** hecho (2 jul 2026). Nuevo `profile.vet.serviceCatalog` [{name, priceEur, pricingType fijo|variable}] con saneado en `sanitizeProfile`, editor en ProfilePage, tarifas en BookVetAppointment y en `/api/vets`. Las etiquetas `services` se mantienen (chips/checklist).
- [ ] **Fase 2 (gateada por Stripe live + fiscal):** pago en € con **comisión de plataforma** (destination charge, patrón de donaciones); pago "después" por defecto y "antes/señal" solo en precio fijo; **Patitas como descuento** sobre el € (un solo riel); política de cancelación/reembolso.
- Valoración: buena dirección (mejor monetización del lado vet); lo flojo es "pago por adelantado con precio fijo" tal cual.

### 5.3 Mejoras de citas veterinarias
- [x] Vincular la cita a mascotas propias (selector limitado a mascotas del dueño / animales de la protectora).
- [x] Recordatorios automáticos previos a la cita (18 jul 2026): `jobs/reminders.ts`, pasada cada 15 min desde el arranque, email a dueño y vet 24h antes (confirmadas/reprogramadas), idempotente vía `reminder24SentAt`.
- [ ] Vista semanal/horaria del calendario.
- [ ] Reprogramar desde el propio calendario (hoy se hace en el panel de lista).
- [x] Precio en Patitas sugerido por servicio: se deriva automáticamente del precio € del catálogo del vet al elegir servicio (2 jul 2026); la protectora puede ajustarlo.

### 5.4 Pasaporte / ofertas
- [ ] Inputs de targeting de ofertas ya están; faltan **tests** dedicados de pasaporte ampliados a más casos.
- [x] Botón UI para que el partner lance el pago del placement sponsored.
- [ ] Facturación del placement sponsored (futuro, junto con Stripe live).

### 5.5 Deuda técnica
- [x] Retirar el legado `echoPatita`/`spendPatitas` (commits jun 2026).
- [x] Tests de `patitas.test.ts` en verde tras retirar el legado (14/14 el 2 jul 2026).
- [ ] Unificar de verdad el vocabulario de especie en origen (hoy hay un setter que normaliza + datos migrados; queda como parche/normalización).
- [ ] Limpieza definitiva del código de alquiler congelado.
- [ ] Drift docroot ↔ git: el frontend se sube compilado; cuidar que no se reconstruya el contenedor web obsoleto.

### 5.6 Producto / fase 2 (no MVP)
- [ ] Marketplace pet (catálogo/checkout de productos).
- [ ] Suscripciones de partner (planes 29/49/79 €).
- [x] Acciones reales en paneles admin (aprobar/rechazar adopciones, cambiar estado de animal desde admin).
- [ ] Pasar `NODE_ENV` a producción real cuando haya proveedores reales (hoy development + mocks por decisión).
- [ ] Contrastar con el Dossier Maestro para detectar features que falten.

---

## 5.7 Hecho el 2 jul 2026 (sesión de mejoras)
- [x] Gap analysis del Dossier Maestro → `docs/GAP_DOSSIER.md` (cierra el pendiente de 5.6).
- [x] Email a la protectora al recibir una solicitud nueva (los demás emails de adopción ya existían).
- [x] **BUGFIX alertas de búsqueda:** el filtro de especie de la alerta (`gato`) nunca casaba con la especie canonizada del animal (`cat`) → las alertas no notificaban ni contaban coincidencias. Arreglado con `speciesVariants` en `matchesAlert` y `buildFilter`. Tests en `adoption.emails.test.ts`.
- [x] `scripts/deploy.sh` (api|web|all) con validación de `.env.production` y smoke final.
- [x] Backup diario de Mongo en el VPS (cron 03:30, rotación 7 días, `/opt/mypetlive/backups`) verificado restaurable.
- [x] **Copia off-site** (9 jul 2026): LaunchAgent `es.mypetlive.offsite-backup` en el Mac de Jorge (10:30 diario, o al despertar) ejecuta `~/Scripts/mypetlive-offsite-backup.sh` → rsync del VPS a `~/Backups/mypetlive/archives` (retención 30 días, sin `--delete` para sobrevivir a un borrado en el VPS, verifica gzip del último archivo; log en `offsite.log`).
- [x] Uptime check cada 5 min con alerta email vía Brevo al caer/recuperarse (`/opt/mypetlive/scripts/uptime-check.sh`).

## 5.8 Hecho el 3 jul 2026
- [x] **Ventas de partner con comisión (fase 1):** el partner registra la venta al pasar el código del cliente (importe + líneas del ticket para ofertas personalizadas futuras). Modelo `Sale` (snapshot de % comisión, `PLATFORM_SALE_COMMISSION_PCT` default 5%, override por partner en `profile.commissionPct`), Patitas proporcionales al importe (`PATITAS_PER_EUR`, default 1/€, source `purchase`). Identificaciones persistidas (`PartnerIdentification`) → informe de fugas `/api/admin/sales/leaks` (identificación sin venta = venta no declarada), `/api/admin/sales` y `/by-user` con totales, `/api/patitas/sales/mine` para el partner. UI en PatitasPartnerPanel. Tests en `sales.test.ts`. Pendiente fase 2: extracto mensual de liquidación (settlementStatus ya en el modelo) y ofertas segmentadas por items comprados.
- [x] **Similares al rechazar (P1 gap analysis):** el email de rechazo al adoptante incluye hasta 3 animales publicados parecidos (misma especie; prioriza tamaño y ciudad) con enlace a su ficha, vía `findSimilarAnimals` en `adoption.controller`. Test en `adoption.emails.test.ts`.
- [x] **Conectar calendario del vet (feed iCal):** cada vet tiene una URL secreta `.ics` (`/api/vets/calendar/:token.ics`, token con `select:false`) que suscribe desde Google/Apple/Outlook con el botón "Conectar calendario" de su panel de citas. Estados TENTATIVE/CONFIRMED/CANCELLED para que el proveedor sincronice cambios y cancelaciones; enlace regenerable (invalida el anterior). Tests en `vetCalendarFeed.test.ts`. Nota: las suites legacy de RentalApp (`tests/`) fallan de antes, no por esto.

## 5.9 Hecho el 9 jul 2026
- [x] Trabajo del 7-8 jul commiteado en 8 commits temáticos y pusheado a `mypetlive` (`main` y `rentalapp1.2`): verificación de protectoras (gatea donaciones), API TPV de partner (claves API, idempotencia, docs), notificaciones push web (VAPID), proyectos Capacitor Android/iOS + iconos/PWA, mejoras del chat de adopción, hardening del API (`/health/ready`, caché uploads/CORS, morgan solo en dev).
- [x] **Móvil:** botón "Menú" sustituido por hamburguesa + drawer lateral con los mismos iconos que el menú web (NavRow), e icono QR en el header que abre el código Patitas del usuario (QR + código manual + regenerar). Gotcha: los overlays `position:fixed` deben ir fuera del `<header>` (su `backdrop-blur` crea un containing block). **Desplegado (deploy.sh all, smoke en verde).**
- [x] Auditoría de la `sk_live_` expuesta: NO está en el historial de git, ni en `.env` local, ni en el VPS (solo `sk_test_`). La exposición fue fuera del código; sigue pendiente rotarla en el dashboard de Stripe.
- [x] **Volumen de uploads arreglado (9 jul):** el compose no montaba `/app/uploads` y las fotos subidas se perderían al recrear el contenedor. Añadido `./uploads:/app/uploads` (repo + VPS, backup del compose anterior en `docker-compose.deploy.yml.bak-2026-07-09`), montaje verificado con docker inspect. De paso el compose del repo se sincronizó con el del VPS (VAPID + Stripe/Patitas).

## 5.10 Hecho el 18 jul 2026
- [x] **Plan de bienvenida post-adopción (P1 gap analysis):** al aprobar una adopción se crea un `WelcomePlan` (checklist de 5 primeros pasos, un plan por mascota+dueño, idempotente) y el adoptante recibe email brandeado con la guía y hasta 3 ofertas de bienvenida segmentadas (reutiliza `matchOffersForAnimal`). Endpoints `GET/POST /api/welcome/:animalId[/tasks/:key]` (dueño o admin). En PetPage, card con barra de progreso y checklist marcable solo para mascotas adoptadas. Tests en `welcome.plan.test.ts`.
- [x] **Recordatorios programados (cron in-process):** `jobs/reminders.ts` con pasada cada 15 min (patrón `setInterval` del arranque, gateado a `NODE_ENV !== 'test'`): (a) recordatorio de cita veterinaria 24h antes a dueño y vet, idempotente con `reminder24SentAt` en la cita; (b) empujón único del plan de bienvenida a los 3 días si quedan pasos sin marcar (`reminderSentAt` en el plan; los completos se marcan sin email). Tests en `reminders.test.ts`.

- [x] **Métricas P2 del gap analysis (protectora y partner):** `GET /api/protectoras/me/metrics` (adopciones mes/total, conversión solicitud→adopción sobre cerradas, días medios de proceso, donaciones €, Patitas recibidas/canjeadas; `?format=csv` con BOM para Excel) y `GET /api/partners/me/metrics` (cupones usados, clientes únicos vía identificaciones∪ventas∪cupones, Patitas cobradas con su €, ventas y comisión mes/total). Controller `metrics.controller.ts`, rutas en `patitas.routes.ts`. UI: sección "Finanzas e impacto" con export CSV en ProtectoraDashboard y card "Tu actividad en MyPetLive" en PatitasPartnerPanel. Tests en `metrics.test.ts`.

## 5.11 Hecho el 22 jul 2026
- [x] **Extracto mensual de liquidación del partner (comisiones fase 2, 1ª mitad):** el extracto
  se deriva de `Sale` agrupada por mes natural UTC (sin modelo nuevo; estado en
  `Sale.settlementStatus` pending→invoiced→paid, helpers en `utils/settlement.ts`).
  Partner: `GET /api/patitas/sales/statements[?format=csv]` + card "Extracto de liquidación"
  en PatitasPartnerPanel. Admin: `GET /api/admin/sales/settlements?period=YYYY-MM[&format=csv]`
  y `POST /api/admin/sales/settlements/:partnerId/:period` (action invoice|pay, idempotente,
  con invoiceRef) + página `/admin/settlements` (selector de mes, facturar/marcar pagado, CSV).
  Tests en `settlements.test.ts` (10). Queda la 2ª mitad: ofertas segmentadas por items (F5 del
  `docs/PLAN_CIERRE_MVP.md`).
- [x] **F0 seguridad (hallazgo de Codex):** producción corre `NODE_ENV=development` (mocks), así
  que los candados `NODE_ENV !== 'production'` no cerraban nada: `/api/verification/dev/verify`
  estaba vivo en prod (cualquier cuenta podía autoverificarse) y el bypass de `requireVerified`
  activo. Nuevo `isProduction()` (`utils/env.ts`) que también mira `APP_ENV=production` (añadido
  al compose del repo; **replicar a mano en el compose del VPS al desplegar**). Tests en
  `verification.hardening.test.ts`. Pendiente de decisión: auto-registro de roles vet/store,
  deps con CVEs, headers/compresión, legal/SEO (lista completa en el plan).
- [x] **KPIs internos de plataforma (P2 nº6, F3):** `GET /api/admin/metrics` (+CSV) — usuarios
  por rol, animales, solicitudes con conversión y días medios, cupones, GMV ventas+donaciones
  con comisión, Patitas. Sección "KPIs de plataforma" en `/admin/reports` con agregados exactos
  del servidor. Tests en `admin.metrics.test.ts`.
- [x] **Ofertas segmentadas por items comprados (F5):** cierra comisiones fase 2.
  `Coupon.targetItems` (palabras clave, form admin) casadas contra `Sale.items.name`
  (`utils/purchases.ts`, matching sin acentos y por subcadena). En la caja del partner solo
  cuenta el historial del cliente en ese partner; en `/api/offers/for-me` todo su historial
  (con `matchedItems`); el pasaporte público nunca las evalúa. Tests `offers.byItems.test.ts`.
- [x] **Tests ampliados del pasaporte (F4, Codex):** privacidad (nunca datos del dueño),
  matching de ofertas por todos los criterios, timeline y OG. Destapó y arregló un bug real:
  el pasaporte público devolvía 200 para animales en `borrador` (ahora 404). Cierra el
  pendiente de 5.4.

## 5.12 Hecho el 29 jul 2026 (rama `pulido/paneles-roles`, **desplegado y pusheado**)
- [x] **Reserva de Patitas en citas del vet:** comprometer Patitas al pedir la cita las
  **bloquea** en el acto (`User.patitasLocked`, helpers `lockPatitas`/`releasePatitas`/
  `consumeLockedPatitas` en `utils/patitas.ts`). Antes solo se comprobaba el saldo al pedir
  la cita y se debitaba al completarla: si se gastaba entre medias, el vet no cobraba y solo
  quedaba un `logger.warn`. El resto de salidas de saldo miran ya el **disponible**
  (canje en partner, QR del wallet, `transferPatitas`). Las citas anteriores al mecanismo
  (`patitasReserved: false`) siguen con el débito directo y su fallo viaja al cliente en
  `patitasSettlementFailed`. Tests en `vet.appointments.test.ts`.
- [x] **Máquina de estados de la adopción (`utils/adoptionTransitions.ts`):** `setStatus`
  no validaba transiciones, así que una adopción **aprobada** se podía pasar a `rechazada`
  sin revertir el traspaso del animal. Ahora una transición ilegal responde **409**; los
  estados finales no tienen salida y el admin no está exento. Las tres pantallas
  (protectora, admin, `AdoptionDetail`) comparten el mapa. Tests en `adoption.transitions.test.ts`.
  **Resuelto el 29 jul (ver 5.13):** deshacer una aprobación ya existe, como función aparte.
- [x] **Topes de importe (`utils/limits.ts`):** las donaciones no tenían tope y las ventas
  cortaban en 100.000 €. Defaults 1 €–2.000 € por donación y 3.000 € por venta,
  configurables (`DONATION_MIN_EUR`, `DONATION_MAX_EUR`, `SALE_MAX_EUR`, añadidas al
  `docker-compose.deploy.yml` — **replicar en el compose del VPS**). Validado en las dos
  puertas de venta (caja web y TPV). Tests en `sales.test.ts`, `pos.test.ts` y
  `donations.limits.test.ts`.
- [x] **Cambio de email con doble opt-in:** el PATCH del perfil escribía `user.email` sin
  más, así que una sesión abierta movía la cuenta a otro buzón en silencio y desde ahí se
  usaba "he olvidado mi contraseña". Ahora `pendingEmail` + token de 24 h, enlace a la
  dirección nueva (`POST /api/users/email/confirm`, público a propósito) y aviso a la
  antigua en los dos momentos. Página `/perfil/confirmar-email`. Tests en `email.change.test.ts`.
  Ojo al gotcha que destapó: `select:false` no filtra los campos escritos en memoria, así
  que el token volvía en la respuesta del PATCH.
- [x] **Deuda técnica de paneles:** borrados `Layout.tsx`/`Sidebar.tsx` (código muerto);
  `rbac.ui.test.tsx` reescrito contra la navegación viva (regla extraída a
  `layout/navItems.ts`, que ahora comparten menú lateral y drawer); **aprobar cierra las
  candidaturas hermanas** del mismo animal avisando por correo; `skipErrorToast` aplicado a
  los endpoints de estos flujos y el 409 traducido.
- **Rojo preexistente, ajeno a esto:** `rbac.test.ts`, `api.test.ts` y `security.test.ts`
  (10 tests) fallan igual antes de estos cambios. El resto: 199 en verde.

### Deploy del 29 jul 2026 (tarde) — `deploy.sh api` + `deploy.sh web`
Antes de desplegar se auditó el VPS fichero a fichero (hash git de los 214 de
`/opt/mypetlive/src`): **cero ediciones a mano**, el servidor era un subconjunto estricto
de la rama. Lo que corría era el deploy de las 02:41 de esa madrugada, hecho **desde el
árbol sucio** con la reserva de Patitas sin commitear — por eso le faltaba `a71d092`
(commiteado a las 03:12, media hora después). El deploy de la tarde añadió ese fix más los
cinco bloques de arriba.

- `.env` del VPS: añadidos `DONATION_MIN_EUR=1`, `DONATION_MAX_EUR=2000`, `SALE_MAX_EUR=3000`
  (backup `.env.bak-2026-07-29`). Sin ellos el código cae a esos mismos defaults, pero
  explícitos evitan los warnings de interpolación de compose.
- `docker-compose.deploy.yml` del VPS sincronizado con el del repo (solo añadía esas tres
  variables; backup `.bak-2026-07-29-limits`).
- Verificado en vivo: `/api/animals?q=(perro` responde 200 (antes 500) y
  `POST /api/donations/checkout-session` devuelve `amount_too_large`/`amount_too_small`
  con `min:1, max:2000`. `src/` del VPS y docroot idénticos a `HEAD` y al build local.
- **`DEPLOYED_COMMIT` estaba obsoleto** (decía `1dce308`, 20 commits atrás): `deploy.sh` no
  lo escribe, se puso a mano. Si vuelve a desfasarse, no fiarse de él: la comprobación buena
  es `rsync -azn -ii --delete src/ valeris-vps:/opt/mypetlive/src/`.

## 5.13 Deshacer una aprobación de adopción (29 jul 2026)
`POST /api/adoptions/:id/undo-approval` — **no es una transición**: `aprobada` sigue siendo
terminal en `adoptionTransitions.ts`. Revierte los cinco efectos de aprobar: traspaso del
animal (vuelve a la protectora en `reservado`, no en `publicado`), evento de linaje
(`returned` compensatorio, **el `adopted` no se borra**), plan de bienvenida (se elimina),
candidaturas hermanas (se reabren al estado exacto, guardado en `previousStatus` al
cerrarlas) y correo al adoptante.

- **Ventana:** 72 h para la protectora, configurable con `ADOPTION_UNDO_WINDOW_HOURS`; el
  admin no tiene límite. Pasado el plazo → 403 `undo_window_expired`. La idea: a las dos
  horas es un error de clic, a las tres semanas es una devolución, que es otro proceso.
- **Motivo obligatorio** (mínimo 3 caracteres), queda en el historial con `action:
  'undo_approval'`, quién lo hizo y cuántas horas habían pasado.
- **409 `animal_moved_on`** si el animal ya cambió de manos después de la adopción.
- **UI:** solo en `AdoptionDetail.tsx`, en el hueco donde antes se leía "este proceso está
  cerrado", con modal que enumera las consecuencias (el nº de candidaturas a reabrir sale de
  `closedSiblings`, que devuelve `getById`). **No está en los paneles de lista a propósito**:
  ahí los botones se apilan por filas y un clic de más revertiría la propiedad de un animal.
- Tests en `adoption.undo.test.ts` (11). `utils/adoptionUndo.ts` aísla ventana, timestamp de
  aprobación y reconstrucción del estado previo de las hermanas.
- **DESPLEGADO el 29 jul 2026** (`deploy.sh api` + `web`, smoke verde). Verificado en vivo:
  la ruta responde 404 `not_found` a una adopción inexistente con token de protectora, 403
  con rol adoptante y 401 sin token; el bundle desplegado contiene el modal. `src/` del VPS y
  docroot idénticos a `HEAD`. No hizo falta tocar el `.env`: sin
  `ADOPTION_UNDO_WINDOW_HOURS` la ventana son 72 h.

## 5.14 Cuidado diario con registro de verdad (29 jul 2026)
Hasta ahora "marcar comida" escribía `animal.lastFeeding = new Date()` **encima del valor
anterior**: dos comidas en un día eran una, no se sabía quién la había puesto y no había
dónde guardar un detalle. Nace `CareLog` (`models/careLog.model.ts`), una entrada por gesto,
con quién lo marcó congelado en el registro (importa con voluntarios turnándose).

- **Paseo, el simétrico del arenero.** `POST /api/animals/:id/care/walk` con
  `kind` (suave · largo · corriendo · senderismo, único obligatorio), `minutes`,
  `distanceKm` y `place`. Antes al dueño de un perro simplemente le faltaba el botón de la
  arena: no tenía sustituto.
- **Comida** admite hasta dos productos; **arena**, el tipo usado.
- **Despensa por mascota** (`animal.carePantry`): lo que se escribe una vez vuelve como chip
  para marcarlo de un toque. Máximo 8 por tipo, sin duplicados ignorando mayúsculas. Sin
  catálogo global que nadie mantendría.
- **Resumen semanal** en `GET /api/animals/:id/care`: comidas, paseos, km y minutos de los
  últimos 7 días, más las 20 últimas entradas. Es lo que da sentido a apuntar distancia.
- **Especies:** el servidor solo bloquea lo seguro (`litter_not_applicable` para perros,
  `walk_not_applicable` para gatos); un conejo sí puede usar arenero. La UI ofrece paseo solo
  a perros, arena solo a gatos y comida a todos.
- `animal.lastWalk` se suma a `lastFeeding`/`lastLitterChange` como **caché** para que la
  ficha y la home sigan resolviéndose con una lectura.
- UI: `components/pet/DailyCareCard.tsx` (ficha) y `components/pet/WalkSheet.tsx`, compartida
  con la home para que las dos pantallas no diverjan. La home sigue siendo la superficie
  rápida (comida y arena de un toque); el paseo abre la hoja porque exige tipo.
- Tests: `animalCare.test.ts` (15) y `DailyCareCard.test.tsx` (6).

### Existencias: para cuántas comidas queda
La despensa deja de ser una lista de nombres. Cada producto admite **tamaño del paquete** y
**ración por uso** (`utils/supplies.ts`), y cada marca de comida o arena **descuenta una
ración** de lo que queda. `PUT /api/animals/:id/care/supplies` da de alta, edita, repone
(`refill: true` → vuelve al paquete entero) y quita (`remove: true`).

- **Unidades:** se guarda todo en la unidad base de su familia (g, ml, ud) para que "saco de
  6 kg" y "ración de 80 g" puedan restarse. Mezclar magnitudes → 400 `unit_mismatch`.
- **Días restantes sin preguntar nada:** el ritmo sale del propio `CareLog` (usos de ese
  producto en la semana ÷ 7). Sin ritmo conocido, `daysLeft: null` y la tarjeta calla en vez
  de inventar. Aviso `runningLow` con ≤3 usos o ≤2 días.
- **Todo opcional:** un producto sin ración configurada sigue siendo solo un nombre para
  marcarlo de un toque, que es como nació la despensa.
- Gotcha que destapó un test: `!remaining` daba "no llevo la cuenta" justo con el saco a
  cero, que es cuando el número importa. Se compara contra `undefined`/`null`, no por
  falsedad.
- UI: `components/pet/SupplyList.tsx` bajo los botones de cuidado (la pregunta "¿queda
  pienso?" aparece justo al ir a dar de comer) y lo que queda también en el propio chip del
  modal de comida, que es donde se decide qué darle.
- Tests: 8 más en `animalCare.test.ts` y 4 en `DailyCareCard.test.tsx`.

## 5.15 Aviso de "se acaba" y primer peldaño del marketplace (29 jul 2026)
`jobs/supplyAlerts.ts`, enganchado a la pasada de `startReminderJobs` (cada 15 min).

- **Umbral en días, no en raciones** (`ALERT_DAYS = 3`): avisar cuando quedan dos comidas no
  da tiempo a comprar nada, que es el único objetivo del aviso. Solo sin ritmo conocido se
  cae a contar usos (`ALERT_USES = 3`).
- **Idempotente** por `carePantry.*.lowNotifiedAt`; **se rearma al reponer** o al subir a mano
  lo que queda. Sin eso se avisaría una vez en la vida del producto — o cada 15 minutos.
- Email brandeado (Brevo) + push web (VAPID), al dueño o, si el animal sigue a cargo de la
  protectora, a la protectora.
- Gotcha caro que costó un rato: en `upsertSupply`, `next` y `existing` son **el mismo
  objeto**, así que comparar contra `existing.remaining` después de escribir `next.remaining`
  compara un valor contra sí mismo. Se guarda `previousRemaining` antes de tocar nada. Y el
  `lowNotifiedAt` hay que **borrarlo con `delete`**: mongoose conserva el valor anterior de
  una clave presente-pero-`undefined` al recastear el array.

### Dónde comprarlo (`utils/shopping.ts`, `/api/shop`)
Antes de montar marketplace, carrito, pagos y logística, **medir si alguien pincha**.

- Los partners salen del catálogo que **ya** cargan para su TPV (`profile.itemCatalog`), con
  precio y ciudad; casado laxo reutilizando `normalizeItemText` de las ofertas por items. Sin
  catálogo global que mantener: si una tienda no lo cuida, no aparece.
- `GET /api/shop/where-to-buy?product=` para la UI y `GET /api/shop/click/:partnerId` que
  registra un `ShopClick` (usuario, producto, origen: email/ficha) y redirige a `/comprar`.
  Nunca falla hacia el usuario: si el registro peta, redirige igual.
- El aviso por correo lleva ese bloque con enlaces medidos; la ficha ofrece "Dónde comprarlo"
  solo en los productos que se están acabando.
- **La página `/comprar` es una lista a propósito**, no un carrito. La decisión de negocio
  (comisión con Stripe Connect vs sobrecoste revendiendo) está en el chat del 29 jul: la
  recomendación es comisión, porque el sobrecoste convierte a MyPetLive en vendedor con todo
  lo que implica (facturación con Veri*factu, desistimiento a 14 días, garantía).
- Tests: `supplyAlerts.test.ts` (9) y uno más en `DailyCareCard.test.tsx`.
- **DESPLEGADO el 29 jul 2026** junto con paseos y existencias (`deploy.sh api` + `web`).
  Verificado en vivo: `where-to-buy` responde 200 con lista vacía (ninguna tienda tiene
  catálogo todavía) y 400 `product_required` sin producto; el redirector devuelve 302 a
  `/comprar`; la página carga; sin errores en el log del arranque del cron. El clic de prueba
  se borró de `shopclicks` para no ensuciar la métrica.
- **Ojo con el dato que se va a mirar:** hoy `profile.itemCatalog` está vacío en producción,
  así que "dónde comprarlo" no puede mostrar nada. Antes de concluir que la gente no pincha,
  hay que conseguir que al menos una tienda cargue su catálogo.

## 5.16 Favicon y restos de RentalApp en la marca (29 jul 2026)
La pestaña del navegador salía sin icono desde siempre: `index.html` enlazaba `/favicon.svg`
y `/favicon.ico` y **ninguno de los dos existía en el repo**, así que el `FallbackResource`
del vhost devolvía `index.html` con `content-type: text/html` donde el navegador esperaba una
imagen.

- Creados `favicon.svg` (huella dibujada con la geometría medida sobre `apple-touch-icon.png`),
  `favicon.ico` real multi-tamaño (16/32/48/64) y `favicon-32.png`.
- `logo192.png` y `logo512.png` **eran el logo de RentalApp** (resto del fork) y se servían en
  producción; sustituidos por la huella. `NavBar.tsx` (código muerto, nadie lo importaba) y los
  `rental-{logo,favicon}.png` que solo él usaba, borrados.
- `og:image` apuntaba a un SVG: X y WhatsApp no lo renderizan, así que la tarjeta salía sin
  imagen. Ahora es `logo512.png` con sus dimensiones.
- `<html lang="en">` en una web íntegramente en español → `lang="es"`.
- `manifest.json` apuntaba a `../icons/...` (sale fuera del docroot) y declaraba `image/png`
  para ficheros `.webp`.

**GOTCHA DEL SERVIDOR, vale para cualquier proyecto en este VPS:** `/icons/` es una ruta
**reservada por Apache** en AlmaLinux — `/etc/httpd/conf.d/autoindex.conf` trae
`Alias /icons/ "/usr/share/httpd/icons/"`. Cualquier fichero propio bajo `/icons/` es
invisible: el alias manda, no existe allí y cae al `FallbackResource`. Los iconos de la PWA
llevaban así desde que se subieron. Renombrado a `/pwa-icons/`. Verificado en vivo: sirve
`image/webp`.

## 5.17 Marketplace con envío (30 jul 2026)
Segundo peldaño después de "dónde comprarlo" (5.15): catálogo propio, carrito, cobro y
logística. **Conviven dos modos que no se mezclan nunca en un mismo pedido**, porque no son
lo mismo ni fiscal ni legalmente (`utils/marketplace.ts`):

- **`partner`** — lista una tienda con su precio. **Vende ella**: el cobro va a su cuenta por
  destination charge y retenemos comisión (8% por defecto, o el `commissionPct` del partner).
  Factura la tienda al cliente; nosotros le facturamos la comisión.
- **`platform`** — lo listamos nosotros con sobrecoste sobre el precio de proveedor (15% por
  defecto). Aquí **el vendedor somos nosotros**: factura con IVA, desistimiento a 14 días y
  garantía. Solo el admin puede dar de alta en este modo.

El `listedBy` viaja **congelado en cada pedido**, igual que el nombre y precio de cada línea y
el % de comisión: cambiar el modo de un producto mañana no puede reescribir lo que pasó ayer.

**Un pedido, un vendedor** (`mixed_sellers`, y la misma regla en el carrito del navegador). No
es una limitación técnica: con envío, dos tiendas son dos paquetes, dos portes y dos
responsables, y juntarlos solo sirve para que nadie sepa a quién reclamar.

### Decisiones que no son obvias
- **Comisión sobre el producto, nunca sobre el envío.** El porte es del transportista, no
  margen de la tienda; cobrar comisión sobre él sería cobrar por su trabajo.
- **Se puede comprar sin cuenta.** Obligar a registrarse para gastar dinero es la forma más
  rápida de perder un pedido ya decidido. El invitado recibe un `guestToken` que es su única
  credencial para ver el pedido después (`select: false`, y nunca se devuelve en la respuesta).
- **Si la tienda no puede cobrar, no se cobra** (409 `seller_payouts_not_ready`, mismo criterio
  que las donaciones): sin `stripeAccountId` con `charges_enabled` el pago entraría íntegro en
  nuestra cuenta por una venta que no es nuestra, y quedaríamos debiéndole el importe sin
  rastro de cuánto. Por eso `store` tiene ya entrada a **Perfil** en su menú: es donde conecta
  Stripe.
- **Los portes se ven en la ficha**, no solo al final: enterarse del envío en el último paso es
  la primera causa de carrito abandonado.
- **Sin Stripe configurado el pedido queda creado** y devuelve 503 con su `orderId`: es
  preferible a fingir que no ha pasado nada cuando alguien ya ha rellenado su dirección. La
  UI le lleva a su pedido en vez de perder los datos.
- **Un producto vendido no se borra, se retira** (`active: false`): un hueco en la base
  convierte un pedido antiguo en un misterio.
- Referencia legible `MP-260729-4821`, porque un `_id` de Mongo no se puede dictar por
  teléfono y un pedido con envío se acaba hablando por teléfono.

### Gotchas que costaron un rato
- **El JWT solo lleva `_id` y `role`**: fiarse de `req.user.email` daba `email_required` a un
  comprador con sesión. El email y el nombre se leen de la cuenta (y no del body, que
  permitiría poner el pedido de otro a nombre propio).
- **`sanitizeProfile` es lista blanca**: sin añadir el bloque `marketplace`, los portes de la
  tienda se perdían en silencio al guardar el perfil.
- **Líneas repetidas**: comprobar el stock línea a línea dejaba pasar 2×8 unidades de un
  producto con 10 en almacén… y con 8. Se agrupan por producto antes de mirar nada.
- **`normalizeSpecies` devuelve `undefined`** con entrada vacía: metía huecos en el array de
  especies y `{species: undefined}` en el filtro. El catálogo filtra por `speciesVariants`
  (casa `cat`/`gato`, como el alta histórica) y respeta lo genérico (`species: []`).
- **Stripe redirige antes de que llegue su propio webhook**: sin refresco automático el pedido
  se queda en "pendiente de pago" a la vista de quien acaba de pagar. `/pedido/:id` repregunta
  cada 3 s mientras siga pendiente.

### Qué hay
- Backend: `models/product.model.ts`, `models/order.model.ts`, `utils/marketplace.ts`,
  `controllers/marketplace.controller.ts`, `routes/marketplace.routes.ts` (montado en
  `/api/marketplace`, con `checkoutLimiter` de 30/15min por IP solo sobre el cobro, que es lo
  único que puede pedir un anónimo). `fulfillPaidOrder` engancha en la rama
  `marketplaceOrderId` de `checkout.session.completed` y es **idempotente**: Stripe reintenta,
  y descontar el stock dos veces deja sin producto a alguien que sí lo tenía.
- Frontend: `/tienda`, `/tienda/:id`, `/carrito`, `/pedido/:id`, `/mis-pedidos`;
  `/partner/productos` y `/partner/pedidos` para la tienda; `/admin/productos` y
  `/admin/pedidos` (misma pantalla, más el coste de proveedor). Carrito en `utils/cart.ts` +
  `hooks/useCart.ts`, en localStorage porque un carrito de invitado necesitaría una sesión
  anónima que no existe.
- Env vars (todas con default, ninguna obligatoria): `MARKETPLACE_COMMISSION_PCT` (8),
  `MARKETPLACE_MARKUP_PCT` (15), `MARKETPLACE_SHIPPING_EUR` (4,9),
  `MARKETPLACE_FREE_SHIPPING_FROM_EUR` (49), `MARKETPLACE_ORDER_MAX_EUR` (1500).
  **NO hace falta tocar el compose del VPS**, y conviene no hacerlo: el compose declara las
  env vars como `"${VAR}"`, así que una que no esté en el `.env` llega **vacía**, no ausente.
  Aquí el 0 es un valor legítimo (portes gratis, comisión 0% en promoción), así que el truco de
  `utils/limits.ts` (exigir `> 0`) no sirve; `envNumber` corta explícitamente en cadena vacía.
  Sin eso, declararlas en el compose sin ponerlas en el `.env` habría dejado la comisión y los
  portes a cero y el tope por pedido en 0 €, que **rechaza cualquier compra** — y sin un solo
  error en el log. Cubierto por `__tests__/utils/marketplaceEnv.test.ts` (6).
- Tests: `marketplace.test.ts` (30), `utils/__tests__/cart.test.ts` (10) y
  `pages/shop/__tests__/CartPage.test.tsx` (5).

### "Dónde comprarlo" pasa a mirar el catálogo real
El termómetro de 5.15 nunca se metió en el agua. Comprobado en producción el 30 jul:
**1 tienda, 1 vet, 0 con `itemCatalog` cargado y 0 `ShopClick`**. Con la única fuente vacía, el
aviso siempre mostraba "todavía ninguna tienda tiene ese producto", así que el cero no
significaba "no interesa" sino "nunca se mostró nada que pinchar".

`findWhereToBuy` tiene ahora **dos fuentes** (`utils/shopping.ts`):

- `marketplace` — productos de `products`, activos y con stock: se pueden **comprar ya**.
- `catalog` — `profile.itemCatalog`, que solo dice "esto lo tengo". Ni stock ni compra.

Lo comprable va primero **aunque sea más caro**. No es un favor a nuestro marketplace: el
producto se acaba hoy, y una lista de tiendas que quizá lo tengan es peor respuesta que un
botón que lo trae a casa. Las opciones de catálogo siguen debajo — es lo que cubre a la tienda
de barrio que no vende online. Y una tienda que lo tiene en los dos sitios sale **una sola vez**.

- **Bug de rol arreglado:** la consulta miraba `store` y `pro` (rol legado de RentalApp) pero
  **no `vet`**, mientras el editor del perfil sí le ofrecía cargar el catálogo a la clínica. Una
  clínica que lo rellenara no aparecía nunca. Ahora `store`, `vet` y `pro`.
- **Clic de producto medido aparte:** `GET /api/shop/click/product/:productId` guarda
  `ShopClick.productId` (y el `partnerId` del vendedor, que sirve para las dos preguntas) y
  redirige a `/tienda/:id`. Vale más como señal que el clic a una lista: es intención de compra,
  no curiosidad. `partnerId` dejó de ser obligatorio en `ShopClick` porque un producto nuestro
  no tiene tienda detrás.
- **El destino se construye en el servidor** a partir del id, nunca se acepta una URL por query:
  este enlace viaja en correos, y un redirector que obedece al parámetro que le manden es un
  redirect abierto con nuestro dominio delante.
- El correo del aviso enlaza a la ficha y lo anuncia ("se envía a casa"); `/comprar` separa las
  dos secciones.
- Tests: `supplyAlerts.test.ts` pasa de 9 a 17.

Con esto la medida ya puede existir, pero **sigue necesitando que haya algo que ofrecer**:
mientras no demos de alta productos (nuestros o de la tienda que ya está registrada), "dónde
comprarlo" seguirá saliendo vacío y el contador seguirá sin decir nada. La diferencia es que
ahora depende de dar de alta un producto —cosa nuestra, desde `/admin/productos`— y no de que
una tienda mantenga una lista que no usa para nada.

### Deploy del 30 jul 2026
`./scripts/deploy.sh all`, sin tocar el compose ni el `.env` del VPS (todas las
`MARKETPLACE_*` tienen default, y declararlas sin valor era justo el bug de arriba).
Rama `pulido/paneles-roles` pusheada a `mypetlive` (6 commits, `4a6700b..4d03716`).

Verificado en vivo, no solo el smoke del script:

- `src/` del VPS **idéntico a HEAD**, comprobado con `rsync -azn -ii --delete` filtrando por
  `^(>|<|\*deleting|c)` — vacío. (`DEPLOYED_COMMIT` sigue mintiendo: no lo escribe nadie.)
- Catálogo público 200 con `{items:[],total:0}`; ficha inexistente 404; `checkout` vacío 400
  `empty_cart`; `/api/marketplace/orders` y el alta de productos 401 sin sesión.
- `/api/shop/click/product/no-es-un-id` → 302 a `/comprar` (el caso de id inválido).
- `where-to-buy` con JWT forjado: 200 con `options: []`, y 400 `product_required` sin producto.
- `/tienda`, `/carrito` y `/mis-pedidos` sirven 200.
- Sin errores en el log del contenedor tras el arranque.
- **Producción sigue limpia**: `shopclicks`, `products` y `orders` a 0. Las pruebas fueron todas
  de lectura a propósito, para no ensuciar la métrica que este trabajo existe para poder medir.

## 5.18 Los anclas del header no llevaban a ninguna parte (30 jul 2026)

"Impacto" y "Cómo funciona" de `PublicHeader` cambiaban la URL a `/#impacto` y `/#como`
y dejaban la página exactamente donde estaba. No es un bug de la landing: las secciones
existen y tienen su `id`. Es que **React Router no hace scroll al ancla**, ni al navegar
ni al cargar `https://mypetlive.es/#impacto` en frío (cuando el navegador intentaría
saltar, el árbol de React todavía no está montado).

Nuevo `frontend/src/components/HashScroll.tsx`, montado dentro de `<BrowserRouter>` en
`AppRoutes.tsx`. Hace el scroll a mano, con dos detalles que no son opcionales:

- **Offset de 76px**: la cabecera es `sticky`, y sin margen la sección aterriza debajo.
- **Vigila 2,5s que la sección no se mueva.** Un único scroll dejaba `#impacto` 245px
  descolocado *en producción pero no en local*: las estadísticas y las fotos llegan
  después del primer render y empujan el layout. Se recoloca solo cuando la página está
  quieta (si `scrollY` no cambió desde el tick anterior, el scroll suave ya terminó), y
  se cancela al primer `wheel`/`touchstart`/`keydown` para no mover la página bajo los
  pies del usuario.

Verificado en vivo (Playwright contra `https://mypetlive.es`), los cuatro caminos dejan
la sección a ~76px del borde: clic estando en la landing, clic en "Cómo funciona", carga
directa de `/#impacto`, y volver a la landing desde `/animals`. También a 390px de ancho
(el nav se oculta, pero la URL con ancla sigue entrando bien) y con el `<a href="#como">`
del footer, que es un ancla nativa y también pasa por el componente.

Deploy: `./scripts/deploy.sh web` (solo frontend, `main.9abfcd6b.js`). Copia previa del
docroot en el VPS: `httpdocs.bak.hashscroll-1785434252.tgz`.

## 5.19 Los números de impacto suben desde 0 (30 jul 2026)

`frontend/src/components/CountUp.tsx`, usado en las cuatro tarjetas de `#impacto`.
Arranca con `IntersectionObserver` (al 40% visible), no al montar: la sección está muy
abajo y contar al cargar significaría que el usuario llega siempre a números quietos.
Una sola vez — repetir cada vez que la sección vuelve a entrar marea. `easeOutExpo`,
1,6s, y `prefers-reduced-motion` salta directo a la cifra final.

Dos detalles del formato:

- **`toLocaleString('es-ES')` NO vale.** El español de CLDR no agrupa los números de
  cuatro dígitos (`minimumGroupingDigits: 2`), así que dejaba **`1247` donde el diseño
  pone `1.247`** — mientras que `38.200`, de cinco dígitos, sí salía bien. Se agrupa a
  mano con un regex. Ojo si aparecen más contadores en otras pantallas.
- **`tabular-nums`**: sin eso el número baila de ancho a cada frame, porque los dígitos
  de la tipografía de display no miden lo mismo.

No interfiere con `HashScroll` (5.18): la animación cambia el ancho del número pero no
la altura de la tarjeta, así que no mueve el layout. Verificado en producción, el ancla
sigue aterrizando a 75,5px.

**Las cuatro cifras siguen siendo inventadas** (`85`, `1.247`, `€38.200`, `126k`, escritas
a mano en `Landing.tsx`). En producción `orders`, `products` y `shopclicks` están a 0. Animarlas
las hace más visibles, no más ciertas: cuando haya datos reales conviene enchufarlas a
`/api/admin/metrics` o bajarlas a lo que se pueda sostener.

Deploy: `./scripts/deploy.sh web`, smoke verde. Copia previa: `httpdocs.bak.countup-1785435402.tgz`.

## 5.20 El menú del partner mentía en dos entradas (30 jul 2026)

Dos entradas del nav de `store`/`vet` (`config/nav.config.json`) no llevaban donde decían:

- **"Validar cupones" → `/coupons`**, que es el catálogo público del adoptante. Los cupones
  se validan en **Caja** (`applyCouponToCustomer`, `PatitasPartnerPanel.tsx`), no ahí.
- **"Patitas pendientes" → `/partner`**, exactamente la misma pantalla que "Inicio".

En vez de solo renombrarlas, las dos entradas pasan a tener contenido propio:

### Cupones del partner (autoservicio)
Crear cupones era **solo de admin**, así que una tienda dependía de que se los dieran de alta
a mano. Nuevos endpoints en `coupon.routes.ts`, montados ANTES de `/coupons/:id` (si no, `:id`
se come "mine"): `GET/POST /coupons/mine` y `PATCH /coupons/mine/:id`, rol `store`/`vet`.
Página nueva `/partner/cupones` (`PartnerCouponsPage`).

**Lo que no es negociable en el servidor:**
- `partnerId` y `partnerType` salen del token, **nunca del body**. Sin eso una tienda podría
  publicar cupones a nombre de la clínica de al lado. Hay test, y se comprobó en producción:
  mandar un `partnerId` ajeno se ignora y el cupón sale a nombre de quien llama.
- **`COUPON_BONUS_MAX_PATITAS` (200 por defecto, `utils/limits.ts`).** `bonusPatitas` no es
  decorativo: `useCoupon()` llama a `earnForUser()` con ese número, o sea **acuña moneda de
  impacto**. Mientras crear cupones fue de admin daba igual; en autoservicio, sin tope, es
  una impresora. El admin sigue sin tope.
- No se edita un cupón ya canjeado (409), y tocar el de otro partner da **404, no 403**:
  quién tiene qué cupón no es asunto de nadie más.

**Limitación heredada que ahora se ve:** un cupón es de **un solo uso global** (`usedAt` está en
el documento del cupón, no por usuario). El primer cliente que lo canjea lo consume para todos.
La página lo avisa en un banner. Si se quiere una oferta permanente, hay que rediseñar el modelo.

### Inicio y Patitas pendientes, separados
`PatitasPartnerPanel` se partió en dos: `RedeemFromShelter` (cobrar canjes de protectoras) vive
ahora en `/partner/patitas`, y el default export queda como resumen de Inicio (métricas,
extracto, cobros, TPV). Páginas `PartnerHome` y `PatitasPending`.

### Verificado
10 tests nuevos (`coupons.partner.test.ts`) + las suites de cupones y métricas en verde, y los
44 tests del frontend. En producción: menú correcto, las tres rutas con su `h1` propio, cupón
creado desde la UI, tope y suplantación rechazados. **Los cupones de prueba se borraron**:
`coupons` vuelve a tener los 4 sembrados, y `orders`/`products` siguen a 0.

**Bug propio arreglado de paso:** `HashScroll` (5.18) asumía que `hash` siempre existe y rompía
`App.test.tsx`, que mockea `useLocation` sin él. No lo detecté entonces porque compilé y
desplegué sin correr la suite del frontend.

Deploy: `./scripts/deploy.sh all`. Copia previa: `httpdocs.bak.cupones-*.tgz`.

## 5.23 El alta de mascota no dejaba elegir sexo ni tamaño (2 sep 2026)

**Reportado por usuarias reales.** Al dar de alta una mascota propia, el formulario pedía
nombre, especie, edad, estado emocional y fotos. Sexo y tamaño no aparecían por ninguna parte.

**Y lo grave no era la ausencia, era el relleno.** `POST /api/animals/personal` sí aceptaba los
dos campos —y `PUT /api/animals/mine/:id` también—, así que el fallo estaba solo en el
formulario; pero como el modelo los declaraba con `default: 'female'` y `default: 'medium'`,
**toda mascota registrada por una familia quedaba guardada como hembra de tamaño mediano**. No
era un hueco vacío: era un dato inventado, y es el que sale impreso en el **pasaporte público
del QR del collar**, en la ficha y en el JSON-LD (`sex ? … : null` en los tres sitios, que
nunca llegaba a ser `null`).

- El diálogo de alta —que es el mismo que el de edición— gana **Sexo** y **Tamaño**, en una
  fila de dos columnas para no alargarlo, con **«Sin especificar» de primera opción**: son
  opcionales de verdad y quien no lo sepa (una acogida recién llegada) no tiene por qué
  inventárselo.
- Fuera los dos `default` del modelo. El alta de protectora no se entera: `animalCreateSchema`
  exige ambos campos. Los `enum` admiten ahora `null`, como ya hacía `mood`.
- `personalPetUpdateSchema` los acepta `nullable`, así que desde la ficha se pueden **corregir
  y también volver a dejar en blanco**. Ésa es la vía para arreglar lo que ya está guardado.

🔴 **Las fichas creadas antes de hoy dicen «hembra» y «mediano» sin que nadie lo eligiera.**
Contadas en producción tras el deploy: **21 mascotas personales y las 21 con `female` +
`medium`**, sin una sola excepción. Eso cierra la duda de si alguna era verdad — el campo no
existía, así que ninguna lo es salvo por casualidad. Hay nombres que cantan (Pepe, Tico, Alf,
Popeye), pero **deducir el sexo del nombre sería volver a inventarlo**, así que no se hace.

Corregidas solo las dos de las que tenemos el dato de la propia usuaria: **Sandra** avisó del
fallo y dijo que sus dos perros son machos — `ROLLING-416` (macho, mediano) y `CANELO-871`
(macho, grande), ambas dadas de alta el 2 sep a las 14:51 y 14:52, minutos antes de reportarlo.
Verificado en el pasaporte público de las dos. **Las otras 19 se quedan como están**: lo
correcto es que cada familia las corrija desde su ficha, que ya puede. La alternativa —vaciar
los dos campos en las 19— está sobre la mesa y es una línea de `mongosh`: deja el hueco en
blanco en vez de un dato falso en el pasaporte impreso del collar.

6 tests nuevos en `animal.updateMine.test.ts` (23 en verde en esa suite y 43 en las de cuidado
y chapas), `tsc --noEmit` del frontend limpio.

## 5.22 El pasaporte avisa de lo que toca (1 sep 2026) — **EN PRODUCCIÓN**

**El agujero que lo motivó:** ninguna de las usuarias reales había recibido jamás un correo
de MyPetLive. Los recordatorios que había cuelgan de las citas veterinarias y del plan de
bienvenida *posterior a una adopción*, y las 9 personas reales entraron por **mascota
propia**: el pasaporte no las llamaba nunca y ninguna volvió después del día del alta.

**Y un bloqueo de fondo:** `POST /:code/health` estaba cerrado a `assertRole('vet','admin')`,
así que la familia no podía apuntar ni una vacuna. Por eso `healthHistory` estaba vacío en
todas las mascotas personales — no había nada que recordar. Ahora también puede quien pasa
`canManageAnimal`; el vet y el admin siguen pudiendo aunque no sean la familia.

- `healthEntrySchema` gana `nextDueAt` y `reminderSentAt`.
- Tres formas de decidir la repetición: fecha explícita; `nextDueAt: null` para renunciar al
  aviso; o ausente, y el servidor pone el intervalo de la categoría (vacuna 12 meses,
  desparasitación 3). Lo que no se repite por calendario —cirugía, prueba— no programa nada.
- `sendHealthDueReminders` avisa **una semana antes**, no el día: una vacuna exige pedir cita.
  Idempotente por entrada y **un solo correo por animal** aunque le toquen dos cosas la misma
  semana. Marca `reminderSentAt` *antes* de enviar: si falla el correo se pierde un aviso, que
  es mejor que reenviarlo en cada pasada.
- La ficha de la mascota gana el formulario para apuntarlo y muestra la próxima fecha.

16 tests nuevos (`animal.health.reminder.test.ts`), 91 en verde en las suites de animales y
47 en el frontend. Verificado en producción con la cuenta dueña de POPEYE-111: apuntar
programa la fecha, y otra usuaria contra la misma mascota recibe 403.

## 5.21 Chapas QR físicas del collar (9 ago 2026) — **EN PRODUCCIÓN desde el 1 sep 2026**

Jorge cerró proveedor de collares con chapa grabada: **0,18 €/unidad, 100 uds, envío incluido**.
A ese precio la chapa deja de ser un extra y va de serie con cada pasaporte.

**El problema que había:** `Animal.code` se genera al crear la ficha a partir del nombre
(`slugifyName(name) + random(100,999)` → `LUNA-472`). Eso impide preimprimir — el código no
existe hasta que existe el animal — y además solo tiene 900 variantes por nombre, así que es
enumerable. Un identificador grabado en metal no puede ser ninguna de las dos cosas.

**Modelo nuevo `Tag` (`src/models/tag.model.ts`), desacoplado del animal.** La chapa nace
**vacía** en fábrica y se casa con un animal después. Eso es lo que permite imprimir stock sin
saber a qué animal irá cada una, y **reasignar** una chapa (animal fallecido, collar perdido,
devolución) en vez de tirar el metal.

- Código = `PREFIJO-XXXXXX`, sufijo de 6 en **Crockford base32** (sin I, L, O ni U: las tres
  primeras se confunden en metal rayado, la U evita palabrotas por azar). 32^6 = 1.073 millones
  por prefijo. **El prefijo es un parámetro del generador, no una constante**, para poder
  decidirlo justo antes de imprimir.
- El código de la chapa es **opaco a propósito**: nadie lo teclea, se llega por QR. Lo que sí se
  teclea es el código del animal, que es otro campo.

**Recorrido (`/t/:code`, `frontend/src/pages/tag/TagLanding.tsx`):**
- **Chapa asignada** → `<Navigate replace>` a `/p/:animalCode`. Sin escala y **sin cuenta**: es
  el caso de quien se encuentra al animal por la calle. El modo perdido y el relé de avisos ya
  los cubre `getPassport`, no se duplica nada.
- **Chapa vacía** → "¿de quién es esta chapa?": lista de tus mascotas + input para teclear el
  código del animal. Sin sesión, a `/login|register?redirect=/t/CODE`.

**Endpoints.** Públicos bajo `/api/tags` (montado en la zona pública de `app.ts`, cada ruta pone
su propio `authenticate`): `GET /:code` (resolver, con limitador por IP porque incrementa el
contador de escaneos), `POST /:code/claim`, `POST /:code/release`, `GET /mine`. Admin bajo
`/api/admin/tags`: `POST /batch` (fabricar lote), `GET /batch/:batch.csv` (**el fichero que se
manda al proveedor**: columnas `codigo,url`), `GET /` (estado de la flota), `POST /:code/revoke`.

**Decisiones de seguridad, todas con test (`src/__tests__/tags.test.ts`, 20 en verde):**
- Asignar **exige sesión y `canManageAnimal`**. Sin eso, cualquiera con una chapa en blanco la
  apuntaría al animal de otro adivinando su código (900 variantes por nombre).
- Un animal, una chapa (`animal_already_tagged`); una chapa asignada no se puede robar
  (`tag_already_claimed`).
- El `claim` es un `findOneAndUpdate` condicionado a `animalId: null` — dos toques simultáneos no
  la asignan dos veces. El contador de escaneos es `$inc` por `updateOne` para no pisar con un
  `save()` una asignación concurrente.
- Chapa anulada → **410, no 404**: el código sigue existiendo en el mundo físico.
- Animal borrado con la chapa puesta → vuelve a `libre` en vez de quedar muerta.

**Refactor de paso:** `canManageAnimal` estaba privado en `animal.controller.ts` con 3 llamadas.
Extraído a `src/utils/animalAccess.ts` porque ahora lo usan dos controladores — una comprobación
de autorización duplicada acaba divergiendo, y la mitad que se quede atrás es un agujero.
GitNexus no tenía el símbolo indexado (índice desactualizado); radio verificado a mano.

**Ruta `/t/:code` fuera del `AppShell`**, como `/p/:code`.

**Desplegado el 1 sep 2026** (commit `0fde720`): API recreada y frontend recompilado al docroot.
Verificado en vivo: `/api/tags/<inexistente>` 404, `/api/tags/mine` 401, `/api/admin/tags/batch` 401
y `/t/:code` sirviendo la SPA, con el pasaporte de siempre intacto.

**PENDIENTE:** decidir el prefijo grabado, fabricar el lote (`POST /api/admin/tags/batch`),
descargar el CSV y mandarlo al proveedor. Nada de esto está desplegado todavía.

## 6. Operativa / notas de mantenimiento
- **Credenciales demo:** protectora@mypetlive.es / adoptante@mypetlive.es / **demo.tienda@mypetlive.es** (Demo1234!).
  La tienda (rol `store`, "Pet Market Centro") ya existía sembrada pero sin contraseña conocida y sin
  `isVerified`; el 30 jul 2026 se le puso `Demo1234!` para poder probar el marketplace. **Los roles
  profesionales no se pueden auto-registrar** (`professional_onboarding_required` en
  `auth.controller.ts`): se activan a mano en Mongo. **Stripe en producción es `sk_test_`**, así que
  se puede probar el checkout sin mover dinero real. Para cobrar en modo `partner` falta el
  onboarding de Connect (`/partner` → "Conectar cuenta de cobro"); sin `stripeAccountId` el checkout
  responde 409 `seller_payouts_not_ready`.
- **Email:** Brevo requiere autorizar la IP de salida del VPS + dominio autenticado.
- **GOTCHA Docker+firewall:** `plesk ext firewall --apply` borra las reglas de red de Docker → `systemctl restart docker` para recuperarlas.
- **GOTCHA Plesk:** regenera los vhost.conf si se reconfigura el dominio → reaplicar las directivas custom (redirect 301, RewriteRule de bots sociales).
- **Operar como un rol sin password:** forjar un JWT con el `JWT_SECRET` del contenedor (`docker exec mypetlive_api node -e "jwt.sign(...)"`). El bypass por headers `x-user-*` solo funciona en `NODE_ENV=test`.

---

*Documento mantenido manualmente. Para el detalle técnico fino, ver la memoria del asistente
(MyPetLive: proyecto, deploy, pasaporte, patitas, veterinario, servicios de pago).*
