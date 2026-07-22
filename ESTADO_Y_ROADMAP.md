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

## 6. Operativa / notas de mantenimiento
- **Credenciales demo:** protectora@mypetlive.es / adoptante@mypetlive.es (Demo1234!).
- **Email:** Brevo requiere autorizar la IP de salida del VPS + dominio autenticado.
- **GOTCHA Docker+firewall:** `plesk ext firewall --apply` borra las reglas de red de Docker → `systemctl restart docker` para recuperarlas.
- **GOTCHA Plesk:** regenera los vhost.conf si se reconfigura el dominio → reaplicar las directivas custom (redirect 301, RewriteRule de bots sociales).
- **Operar como un rol sin password:** forjar un JWT con el `JWT_SECRET` del contenedor (`docker exec mypetlive_api node -e "jwt.sign(...)"`). El bypass por headers `x-user-*` solo funciona en `NODE_ENV=test`.

---

*Documento mantenido manualmente. Para el detalle técnico fino, ver la memoria del asistente
(MyPetLive: proyecto, deploy, pasaporte, patitas, veterinario, servicios de pago).*
