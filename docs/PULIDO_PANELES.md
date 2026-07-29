# Pulido rol por rol, panel por panel

Rama de trabajo: **`pulido/paneles-roles`** (remoto `mypetlive`). Nunca `origin`.

Método: se recorre **un rol cada vez** y, dentro del rol, **un panel cada vez**.
Un agente implementa cada panel y el cambio se revisa antes de commitear; un commit
por panel (o por arreglo con entidad propia).

## Qué se busca en cada panel

1. **Datos falsos o inventados** — chips, métricas o textos fijos que finjan datos
   reales. Se eliminan o se sustituyen por el dato de verdad.
2. **Valores crudos del modelo en pantalla** — `cat`, `en_adaptacion`, `aprobada`…
   Se pasan por los helpers de `styles/mypetlive.tsx` (`speciesLabel`, `sizeLabel`,
   `sexLabel`, `statusLabel`, `moodLabel`).
3. **Vocabulario del legado de alquiler** — estados `accepted`/`active`/`signed` que
   no existen en los modelos pet. Los estados reales de adopción son los nueve de
   `AdoptionStatus` (`recibida` … `cancelada`).
4. **Estados de carga / vacío / error** — los tres deben existir y ser honestos: un
   fallo de red nunca puede pintarse como "no tienes nada".
5. **Coherencia de rol** — que el panel no ofrezca acciones que el backend va a
   rechazar, y que el `RoleGuard` de la ruta cuadre con lo que hace la página.
6. **Móvil** — nada que se rompa por debajo de 380 px; ojo con los overlays `fixed`
   dentro de `<header>` (el `backdrop-blur` crea containing block).

## Estado

| Rol | Panel | Ruta | Estado |
|-----|-------|------|--------|
| Adoptante | Home | `/home` | ✅ hecho |
| Adoptante | Mi mascota | `/pet` | ✅ hecho |
| Adoptante | Mis adopciones | `/adoptions/mine` | ✅ hecho |
| Adoptante | Detalle de adopción | `/adoptions/:id` | ✅ hecho |
| Adoptante | Favoritos | `/me/favorites` | ✅ hecho |
| Adoptante | Alertas | `/me/alerts` | ✅ hecho |
| Adoptante | Donaciones | `/donate` | ✅ hecho |
| Adoptante | Citas (solo lectura) | `/citas` | ✅ hecho |
| Protectora | Dashboard | `/landlord` | ✅ hecho |
| Protectora | Animales | `/landlord/animals` | ✅ hecho |
| Protectora | Solicitudes | `/landlord/adoptions` | ✅ hecho |
| Protectora | Cuestionario | `/landlord/questionnaire` | ✅ hecho |
| Protectora | Verificación | `/landlord/verificacion` | ✅ hecho |
| Veterinario | Panel partner | `/partner` | ✅ hecho |
| Veterinario | Caja | `/caja` | ✅ hecho |
| Veterinario | Agenda / calendario | `/citas` | ✅ hecho |
| Tienda | Panel partner | `/partner` | ✅ hecho |
| Tienda | Caja | `/caja` | ✅ hecho |
| Admin | Home | `/admin` | ⏳ |
| Admin | Usuarios | `/admin/users` | ✅ hecho |
| Admin | Animales | `/admin/animals` | ⏳ |
| Admin | Adopciones | `/admin/adoptions` | ✅ hecho |
| Admin | Cupones | `/admin/coupons` | ⏳ |
| Admin | Verificaciones | `/admin/verifications` | ⏳ |
| Admin | Liquidaciones | `/admin/settlements` | ⏳ |
| Admin | Informes / KPIs | `/admin/reports` | ⏳ |
| Admin | Ajustes | `/admin/settings` | ⏳ |
| Todos | Perfil | `/profile` | ✅ hecho |

## Hallazgos por panel

### Adoptante · Home (`/home`) — hecho
- **Bug real:** la mascota adoptada no aparecía nunca. `fetchFeaturedAnimal` filtraba
  adopciones por `accepted`/`active` (legado alquiler) en vez de `aprobada`.
- Se volcaban valores crudos del modelo: `species` (`cat`) y `mood` (`en_adaptacion`).
  Nuevos helpers `moodLabel` y `usesLitter` en `styles/mypetlive.tsx`.
- La tarjeta "Arena" se ofrecía también a perros.
- El chip "Cerca de ti" era texto fijo, no un dato → ahora la ciudad real.
- Sin estado de error: un fallo de red se pintaba como "no has registrado tu mascota".

### Adoptante · Mi mascota (`/pet`) — hecho
- **Bug real (backend):** los botones "Marcar comida" / "Cambiar arena" devolvían
  siempre 403. `authorizeCare` (`src/controllers/animalCare.controller.ts`) buscaba
  una adopción en estado `accepted` (legado alquiler; el real es `aprobada`) y no
  contemplaba `ownerId`, así que el dueño de una mascota **personal** tampoco podía
  cuidarla. Además la ruta admite el rol `protectora` y la función solo miraba
  `landlord`. Sin tests que cubrieran estos endpoints.
- **Bug real (carga):** `isLoading` era `myPetsLoading && !currentPet && fallbackQuery.isLoading`;
  al resolver `/animals/mine` vacío mientras el respaldo seguía en vuelo se pintaba
  el estado vacío y luego la mascota (falso "no tienes mascota").
- Sin estado de error: un fallo de `/animals/mine` se pintaba como "Hoy no tenemos
  una mascota asignada" → ahora tarjeta de error con "Reintentar".
- Valores crudos en pantalla: `species` (`cat`), `mood` (`en_adaptacion`, que solo se
  maquillaba con `replace('_', ' ')`) y `healthHistory[].type` (`deworming`,
  `checkup`…). Nuevo helper `healthCategoryLabel` y especies `rabbit`/`bird`/`other`
  añadidas a `speciesLabel` en `styles/mypetlive.tsx`.
- Arena ofrecida a perros y conejos → `usesLitter(species)` (comida siempre).
- Tarjeta "¿Ya vives con un animal? Regístralo" eliminada: solo podía aparecer
  **junto a** la ficha de una mascota ya mostrada (su `petItems.length === 0` vive
  dentro de la rama que ya tiene animal, es decir cuando el animal venía del
  respaldo y no de `/animals/mine`), duplicando el botón "➕ Añadir otra mascota"
  que está justo encima. Redundante, no contradictoria.
- Alta de mascota: validación de nombre/especie/edad con mensaje concreto e inline
  (antes un genérico "Completa los campos requeridos" por toast), traducción de los
  códigos del backend (`missing_fields`, `invalid_file_type`… se leían crudos),
  validación de imagen (tipo y 10 MB, lo mismo que multer) y "Guardar" bloqueado
  mientras se sube una foto (antes se guardaba sin ella).
- El cuidado marcado aquí no invalidaba el animal destacado de la home (60 s de
  `staleTime`) → seguía diciendo que tocaba rellenar la comida.
- Móvil: los dos botones de cabecera se salían por debajo de 380 px (`flex` sin
  `flex-wrap`) y el modal de alta no hacía scroll, dejando Cancelar/Guardar fuera de
  pantalla en pantallas bajas.
- **No tocado:** `fetchFeaturedAnimal` captura todos los errores y devuelve `null`,
  así que su `isError` nunca se dispara (afecta también a la home); aquí el estado de
  error se apoya en la query de `/animals/mine`. Cambiarlo toca otro panel.

### Adoptante · Mis adopciones (`/adoptions/mine`) y detalle (`/adoptions/:id`) — hecho
- **Bug real:** el enlace "Ver animal" estaba roto en toda adopción aprobada. Aprobar
  convierte el animal en mascota personal (`isPersonalPet = true`,
  `createdByRole = 'tenant'`, `adoption.controller.ts`) y `GET /api/animals/:id`
  devuelve 404 con esos dos filtros (`animal.controller.ts`), así que el enlace llevaba
  a "no encontramos esta ficha". Ahora apunta a `/pet` cuando la adopción es tuya y
  desaparece cuando no hay destino válido.
- **Bug real:** "Cargando solicitud…" eterno en el detalle. `isLoading || !data` dejaba
  el spinner para siempre ante un fallo de red, un 403 (solicitud de otra persona) o un
  id inexistente. No había estado de error en ninguno de los dos paneles.
- **Bug real:** la nota que escribe la protectora al pedir información o al rechazar se
  guardaba en `history[].payload.note` y **no se pintaba en ningún sitio**: el adoptante
  veía el chip "Información adicional" sin saber qué le piden. Ahora se muestra la última
  (filtrando `payload.by === 'adopter'`, que marca la retirada del propio adoptante).
- Texto falso: "aparecerá en Mi Mascota cuando se complete el cierre" — no hay cierre
  posterior, aprobar traspasa el animal en el mismo paso.
- `species` cruda (`cat`) en las tarjetas y en los chips de mascotas del solicitante.
- Los contadores Total / En proceso / Aprobadas se pintaban como tres ceros en error y en
  vacío, con aspecto de dato real.
- Lo que ya estaba bien: las nueve etiquetas de estado salían de `ADOPTION_STATUS_LABEL`,
  el botón de retirar solicitud ya coincidía con el guard del backend y las fechas ya
  estaban en `es-ES`.

### Adoptante · Favoritos, Alertas y Donaciones — hecho
- **Bug real, el más grave del barrido hasta ahora:** `/donate` no podía completar
  ninguna donación. La página solo sacaba la protectora destinataria de `?animalId`,
  y el único enlace a `/donate` de toda la app (el pie de la landing) no lleva ese
  parámetro; el backend responde 400 `shelter_required` sin protectora ni animal.
  Comprobado con búsqueda exhaustiva de enlaces: no había ninguna ruta de entrada
  que funcionase. Ahora hay selector de protectora, alimentado con
  `GET /api/protectoras`, que ya filtra por `canReceiveDonations` — el mismo gate
  que el checkout, así que no se ofrece a quien el servidor va a rechazar.
- `/donate`: el beneficiario se pintaba como un ObjectId de Mongo, no se decía a
  quién va el dinero ni que la plataforma retiene comisión (`DONATION_FEE_PERCENT`),
  los códigos de error se mostraban crudos y **por duplicado** (interceptor global
  más toast de la página), no había protección contra doble clic — cada pulsación
  creaba una sesión de Stripe y un `Donation` pendiente — y una respuesta sin `url`
  dejaba el botón como si no se hubiera pulsado. **Lógica de pago intacta**: no se
  tocan importes, `application_fee_amount`, `transfer_data` ni URLs de retorno.
- Nuevo opt-out `skipErrorToast` en `frontend/src/api/client.ts`, aditivo y usado
  solo por el checkout de donación. El 401 de sesión caducada se sigue gestionando
  siempre, deliberadamente fuera del flag.
- **Favoritos:** `favorites.ids` e `items` divergen y nadie lo contaba — el backend
  filtra los items por `createdByRole: 'protectora'` e `isPersonalPet`, pero devuelve
  todos los ids, así que al aprobarse una adopción ese favorito desaparecía de la
  pantalla sin explicación y sin forma de quitarlo de la lista. Ahora hay aviso y
  botón para limpiarlos. Además: sin estado de error (el `Promise.allSettled` de la
  ruta anónima se comía los fallos de red y los hacía indistinguibles de "no tienes
  favoritos"), `toggle` sin catch dejando una promesa rechazada sin capturar, estado
  `borrador` pintado crudo, y `adoptado`/`no_disponible` con el mismo chip dorado que
  `reservado`, de modo que un animal ya adoptado se leía como disponible.
- **Alertas:** sin estado de error, mutaciones sin `onError` (pausar o borrar algo que
  el servidor rechaza no cambiaba nada en pantalla), borrado irreversible sin
  confirmación, y ninguna forma de ejecutar la búsqueda guardada — se veía "N
  compañeros coinciden" sin camino a esos N animales. La copy también prometía menos
  de lo que hace: sí se avisa por email al publicarse un animal que encaje.
- Contrato UI↔servidor de alertas **verificado correcto**: las nueve claves de filtro
  del backend coinciden exactamente con los parámetros que lee el catálogo público,
  así que el "Ver resultados" nuevo reconstruye la búsqueda de verdad.

### Protectora · Dashboard (`/landlord`) y Solicitudes (`/landlord/adoptions`) — hecho
- **Bug real:** la tarjeta "adopciones cerradas" era **siempre 0**. Contaba animales con
  `status === 'adoptado'` sobre el listado de la protectora, pero ese listado filtra
  `createdByRole: 'protectora'` e `isPersonalPet`, y aprobar una adopción pone justo lo
  contrario: el animal adoptado no vuelve a aparecer nunca ahí. Ahora sale de
  `metrics.adopciones.total`. Verificado en los dos controladores.
- **Bug real:** las solicitudes en `info_adicional` **desaparecían del tablero**. No había
  columna para ese estado (ni para `cuestionario_pendiente`) aunque el contador de "en
  proceso" sí las sumaba: el contador decía 3 y el tablero mostraba 1. Justo la solicitud
  en la que la protectora había pedido datos era la invisible.
- **Bug real:** el servidor topa `limit` en 50 y los dos paneles pedían 100, recibiendo 50
  en silencio. Con más de 50 solicitudes los cuatro contadores de los filtros y las notas
  "N total" del dashboard eran falsos y el histórico quedaba truncado sin avisar. Nuevo
  `listAllAdoptionsForMyAnimals()` que pagina y expone `truncated`. Lo mismo pasaba con
  "animales en total", capado a 100: ahora se lee el `total` del servidor con `limit: 1`.
- **Bug real:** el CTA principal "Publicar animal" llevaba a un 403. `canPublishAnimals`
  exige verificación aprobada; si la protectora no lo está, el botón principal del panel
  la mandaba a una pantalla que iba a rechazarla. Ahora, si consta no verificada, el CTA
  pasa a "Verificar protectora" con banner explicativo; si el estado es desconocido por
  error de red no se afirma nada.
- **Bug real:** "Pedir información" con el `prompt` cancelado seguía adelante, dejando al
  adoptante en "pendiente de información adicional" sin ninguna pista de qué enviar — y esa
  nota es lo único que ve. Ahora es obligatoria para `info_adicional`, opcional al rechazar.
- El confirm de aprobar prometía que se descartaba al resto de candidatos: `setStatus` no
  toca las demás solicitudes del animal, se quedan abiertas para siempre. Texto corregido
  y aviso en las tarjetas cuyo animal ya está `adoptado` con la solicitud aún abierta.
- Sin estado de error en ninguno de los dos (séptima vez): el de solicitudes pintaba un
  fallo de red como "No hay solicitudes" con los filtros a "(0)", de modo que la protectora
  podía dejar candidaturas sin contestar creyendo que no había ninguna.
- El export CSV se tragaba los fallos en un `.catch(() => {})`: el botón no hacía nada.
- Cambiar un estado no invalidaba las claves del dashboard, que se quedaba obsoleto.
- Conversión y días medios mal rotulados: la conversión se calcula sobre solicitudes
  cerradas y los días medios solo sobre las aprobadas, pero el panel los colgaba de la
  tarjeta "este mes" y de "N solicitudes en total". Reetiquetado con nota al pie.
- Lo que ya estaba bien: **ningún vocabulario de legado en estos dos ficheros**, y
  `NEXT_ACTIONS` coincide exactamente con el enum del validador — ninguna acción imposible.

### Protectora · Animales, Cuestionario y Verificación — hecho
- **Bug real (pérdida de datos):** el cuestionario se podía borrar solo. Sin estado de
  error, un fallo al cargar pintaba "Aún no tienes preguntas" con el botón de guardar
  activo, y un clic enviaba `[]`. Y `create` de adopciones solo exige respuestas
  `if (requiredQuestions.length)` — verificado en el controlador —, así que un
  cuestionario vacío **desactiva el filtro de adopción entero**.
- **Bug real:** el `useEffect` del cuestionario se rehidrataba con la respuesta de
  react-query al volver a la pestaña, machacando lo que la protectora estaba escribiendo.
- **Bug real (de diseño):** el **texto** de la pregunta es su identificador — el adoptante
  responde en un mapa `pregunta → respuesta` y el servidor casa por texto exacto —, así
  que dos preguntas iguales dejan una sola casilla y una sola respuesta. Ahora se bloquean.
- **Bug real:** la página de verificación mentía sobre el estado. Sin `isError`, un fallo
  de red daba `status: 'unverified'`, de modo que una protectora ya verificada veía "aún no
  estás verificada" y un formulario en blanco; reenviarlo la pone en `pending`, o sea que un
  error de red podía costarle el permiso de publicar.
- **Bug real:** el panel de animales pedía `limit: 200` con el servidor topando en 100
  (truncado silencioso), no tenía `catch` en la carga (un fallo de red se leía como "no
  tienes animales" en la pantalla de gestión), ofrecía "Publicado" sin comprobar
  `canPublishAnimals` (403), dejaba escribir la especie a mano cuando el modelo la canoniza
  (se escribía "Perro" y la tarjeta pintaba `dog`), no permitía **editar** una ficha —un
  nombre mal puesto solo se arreglaba borrando el animal, con su código y su pasaporte— y
  dejaba crear la ficha mientras las fotos aún subían.
- **RECHAZADO del informe del agente:** afirmaba que filtrar por especie en el catálogo
  público devuelve cero resultados, porque la UI manda `perro` y el modelo guarda `dog`.
  **Es falso**, comprobado ejecutándolo: Mongoose 7.8 aplica los setters también a los
  filtros de consulta, y `find({species:'perro'})` se castea a `{species:'dog'}`. El uso de
  `speciesVariants` en las alertas es red de seguridad para datos legados sin migrar, no
  porque el filtro directo esté roto.
- **Aviso de confianza:** el arreglo del panel de animales llegó como **reescritura de 1254
  líneas** (el agente se salió del encargo y además lo repasó a estilos MPL). Está en un
  commit aparte (`9eb1788`) para poder revertirlo solo. Verificado contra el backend, `tsc`,
  las 4 suites y el build, pero **no auditado línea a línea**.

### Partner (vet y tienda) · Panel `/partner` y Caja `/caja` — hecho

Las dos rutas son envoltorios finos: el panel real es
`components/patitas/PatitasPartnerPanel.tsx` (735 líneas, 6 tarjetas), y `/caja` monta
solo su `GeneratePatitas`. Un mismo arreglo cubre por tanto las cuatro filas de la tabla
(vet y tienda comparten pantalla; `RoleGuard roles={["store","vet"]}` cuadra con el
`assertRole('store','vet','admin')` de las rutas del backend — verificado).

- **RETIRADO — hallazgo propio, falso.** Se dio por bueno que "Perfil → Conectar tu TPV"
  no existía, porque un grep de `TPV|posKey` sobre `ProfilePage.tsx` no devuelve nada.
  **Es falso:** `ProfilePage.tsx:670` monta `<PatitasPartnerPanel />` para `store`/`vet`,
  y ese componente incluye `PosIntegration`, o sea la tarjeta "Conectar tu TPV". El
  enlace de la Caja y el texto de la guía del TPV eran correctos y se han dejado como
  estaban. Lección: en esta app los paneles se montan transitivamente en varias rutas —
  grepear el fichero de la página no basta, hay que seguir los componentes que monta.
- **Duplicación real detectada al comprobarlo:** el panel entero (735 líneas: métricas,
  extracto, cobro, caja, TPV, canje e historial) se renderiza en **dos rutas a la vez**,
  `/partner` (vía `PatitasPending`) y `/profile`, para el mismo usuario store/vet. No es
  un fallo funcional pero sí dos sitios que mantener y dos veces las mismas consultas.
  Unificarlo (dejar el panel solo en `/partner` y en Perfil un enlace) es decisión de
  producto.
- **Sin estado de error, quinta y sexta vez, y esta vez sobre el dinero:** el **extracto
  de liquidación** pintaba cualquier fallo de red como "Todavía no hay ventas
  registradas" — el partner podía dar por bueno que no debía comisión de un mes que sí
  facturó. Igual en **Cobros recientes** ("Todavía no has cobrado ningún canje") y en los
  **cupones** de la caja ("No tienes cupones activos"). Los tres con `LoadError`+reintentar.
- **Datos falsos en "Tu actividad en MyPetLive":** las notas al pie (`0 este mes · 0
  creados`, `0 € este mes`, `0 € recibidos`) y el `label` de ventas (`ventas (0)`) se
  pintaban **durante la carga y en error**, cuando los valores de arriba ya decían `...`.
  Ahora las notas solo salen con datos y los valores caen a `—` en error, como en
  ProtectoraDashboard.
- **Bug real:** `PartnerPayout` solo trataba el 503 ("pagos aún no disponibles") y se
  tragaba el resto. Un 500 o una red caída dejaba `status = null` y pintaba **"Conectar
  cuenta de cobro" a un partner que ya podía tenerla conectada**, invitándole a rehacer el
  onboarding KYC de Stripe.
- **Bug real:** `PosIntegration.reload()` tenía `.catch(() => {})`. Al fallar, `keys` se
  quedaba en `null` para siempre y **los dos botones de generar clave quedaban
  `disabled` sin explicación** (`disabled={busy || !keys}`): la pantalla se quedaba muda.
- **Bug real (caja):** los cupones marcados se **perdían en silencio** al pulsar "Solo
  visita (sin compra)". Solo `registerSale` los consume; `earnVisit` no los recibe, y el
  `reset()` posterior limpiaba la selección. Ahora se confirma y se aclara que siguen
  disponibles para el cliente.
- **Importe que no cuadra:** las líneas del ticket son informativas (alimentan las ofertas
  por items); lo que se registra —y de lo que salen Patitas y comisión— es `amountEur`.
  Teclear 20 € con 45 € en líneas se registraba a 20 € sin decir nada. Ahora avisa.
- Lo que ya estaba bien: `payoutStatus === 'paid'` cuadra con el enum real del backend
  (`none|pending_payout|paid`), el extracto formatea el mes en UTC correctamente, la tabla
  ya tenía `overflowX: auto` para móvil y el `busy` sí protegía del doble clic en venta,
  visita y canje.

### Citas (`/citas`) — agenda del vet y vista del adoptante/protectora — hecho

Una sola ruta para los tres roles (`RoleGuard roles={["tenant","landlord","vet"]}`):
`AppointmentsPage` monta el calendario para todos y luego `VetAppointmentsPanel` (vet)
o `BookVetAppointment` (dueño y protectora). Cubre las dos filas de la tabla.

- **Bug real, simétrico al de la nota de la protectora:** el vet **nunca podía escribir
  el motivo de cancelación**. El campo existe en el modelo (`cancelReason`), la API del
  front ya lo aceptaba en su firma, el `AppointmentCard` lo pinta ("Motivo de
  cancelación: …") y el email al otro lado lo incluye
  (`vetAppointment.controller.ts:348`, `Motivo: ${appt.cancelReason}`) — pero ninguna
  de las dos pantallas lo enviaba jamás. Estaba cableado de punta a punta y sin origen:
  todas las cancelaciones salían mudas. Ahora se pide al cancelar, en ambos lados.
- **Bug real:** cancelar era **irreversible y a un solo clic, sin confirmación**.
  `cancelled` no tiene transiciones de salida en `VET_TRANSITIONS`, así que un clic de
  más destruye la cita sin forma de reabrirla. El mismo `window.prompt` del motivo hace
  ahora de confirmación (Cancelar aborta), que es el idiom que ya usaba `complete()`.
- **Sin estado de error, en las cinco consultas de la pantalla:** la agenda del vet
  ("Todavía no tienes solicitudes de cita"), las citas del dueño ("Aún no tienes citas"),
  el **calendario** (mes en blanco, "Sin citas este día"), el **directorio de
  veterinarios** (desplegable vacío, sin poder pedir cita y sin saber por qué) y la lista
  de mascotas propias ("No tienes mascotas registradas"). El del vet es el peor: podía
  dejar solicitudes sin contestar creyendo que no había ninguna.
- **Bug real (calendario):** al cambiar de mes, el día seleccionado **no se movía**. La
  cabecera decía "agosto" y el detalle de abajo seguía listando "29 de julio". Ahora
  salta a hoy si vuelves al mes actual, o al día 1 en cualquier otro.
- **Fechas pasadas:** ni el formulario de pedir cita ni el de reprogramar tenían `min` en
  el `datetime-local`. Al crear, el backend sí corta (`date_in_past`), así que era un
  viaje de ida y vuelta para nada; **al reprogramar no valida nada**, de modo que el vet
  podía mover una cita al pasado y dejarla fuera del recordatorio de 24 h.
- **409 `invalid_transition` tratado como error genérico:** significa que la tarjeta está
  obsoleta (la cita cambió por otro lado). Ahora se dice y se refresca la lista, en vez
  de un "No se pudo actualizar" que invita a reintentar sobre datos viejos.
- Doble clic: los botones de la agenda no se bloqueaban con `mut.isPending`. El pago de
  Patitas al completar **ya estaba protegido** por la máquina de estados del backend
  (`VET_TRANSITIONS['completed']` no existe → 409), así que no había fuga de dinero; aun
  así se bloquean para no soltar un error confuso.
- Lo que ya estaba bien: `STATUS_META` cubre exactamente los cinco estados del enum del
  backend (ningún crash por estado desconocido), `counterpartName` está bien cableado
  pese al nombre confuso de sus dos helpers, el `RoleGuard` cuadra con los permisos del
  controlador y la protectora sí debe ver `BookVetAppointment` (agenda pagando Patitas).

### Todos · Perfil (`/profile`) — hecho

- **Bug real, el mismo que en el panel de partner:** `DonationPayout` solo trataba el 503
  y se tragaba el resto de errores, dejando `status` en `null`. Una protectora **con la
  cuenta de cobro ya lista** veía "Configurar cuenta de cobro" ante un fallo de red, y
  pulsarlo la mandaba a rehacer el onboarding KYC de Stripe. Dos instancias del mismo
  patrón en dos ficheros distintos.
- **Bug real:** guardar mientras la foto se estaba subiendo **descartaba la foto en
  silencio** — el PATCH sale con el `avatarUrl` anterior. Es el mismo fallo que ya se
  arregló en el alta de mascota de `/pet`; aquí seguía vivo.
- **Sin validación de la foto:** ni tipo ni tamaño, cuando multer corta en 10 MB y solo
  acepta imágenes (`upload.routes.ts`). Se subían 10 MB para recibir un error. Ahora se
  valida antes, con los mismos límites y los mismos textos que `/pet`.
- El campo Email no decía que es la dirección con la que se inicia sesión. Cambiarlo es
  inmediato y sin confirmación, y quien lo tocase sin saberlo se quedaba fuera.
- Comprobado y **correcto** (no se toca): `isVerified` viaja en el JWT, no en el
  documento de usuario (`auth.middleware.ts`), así que cambiar el email desde aquí no
  altera el estado de verificación; el 409 de email duplicado ya se traduce
  (`user.controller.ts`); los mensajes de error del backend ya vienen en castellano, no
  son códigos crudos; y el `useEffect` de rehidratación depende solo de `user?._id`, así
  que **no** reproduce el bug del cuestionario (machacar lo que se está escribiendo).

### Admin · Usuarios (`/admin/users`) y Adopciones (`/admin/adoptions`) — hecho

- **Bug real y transversal (backend):** los `$regex` de búsqueda no escapaban la
  entrada. Escribir un `(` en el buscador de usuarios hace que Mongo rechace la
  expresión y la petición acabe en **500** — y como el panel tampoco tenía estado de
  error, se leía como "No hay usuarios para esos filtros". Nuevo `utils/regex.ts`
  aplicado en los tres sitios que lo tenían: `user.controller` (buscador admin),
  `property.controller` (donde la variable se llamaba `safe` pero solo hacía `trim`)
  y `offers.controller`. Este último es el de más alcance: casa `targetCity` contra
  `animal.city`, que **lo escribe una persona**, así que un animal en
  "A Coruña (centro)" se quedaba sin ninguna oferta y sin ningún error visible.
  Tests en `utils/regex.test.ts`.
- **Bug real:** el panel de adopciones pintaba `animalId` y `adopterId` **crudos**:
  dos columnas de ObjectIds. En el modelo son `String` sin `ref`, así que `populate`
  no sirve; el join se hace ahora en `listAll` (dos consultas por página, no una por
  fila) y se muestran nombre + código del animal y nombre + email del adoptante.
- **Truncado silencioso, otra vez, y peor de lo registrado:** adopciones pedía
  `limit: 200` con el servidor topando en **50**, y animales pide 200 con tope de
  **100**. Además el contador de la cabecera era `items.length`, o sea que con más
  de 50 solicitudes decía "50" para siempre. Ahora sale el `total` del servidor y hay
  paginación real.
- **Estado de error muerto:** `AdminUsersPage` tenía un `useState` de error y un
  `{error && …}` en el render, pero `setError` **solo se llamaba con `null`**. El
  hueco estaba pintado y nunca se rellenaba.
- **Una petición por tecla** en el buscador de usuarios: la `queryKey` colgaba de `q`
  directamente. Ahora hay debounce de 350 ms.
- El "Exportar CSV" solo baja la página cargada (10 filas), no los `total` usuarios.
  Renombrado a "Exportar esta página" en vez de cambiar el comportamiento.
- Comprobado y **correcto** (no se toca): `GET /api/users` sí lleva `requireAdmin` en
  `user.routes.ts` — el listado de emails no está expuesto. Y el confirm de los
  estados finales de adopción ya existía.

## Pendientes detectados de paso (para cuando toque su panel)

- **Admin · adopciones sin máquina de estados:** `ADMIN_STATUSES.filter(s => s !== it.status)`
  ofrece las siete transiciones siempre. Es la misma incoherencia ya anotada para
  `AdoptionDetail`, y aquí choca de frente con el agujero de `setStatus`: desde el panel
  de admin se puede pasar una adopción **ya aprobada** a `rechazada` sin revertir el
  traspaso del animal. Necesita la decisión de producto que sigue pendiente.

- **Perfil · sin aviso de cambios sin guardar:** es el formulario más largo de la app y
  navegar fuera lo pierde entero, sin preguntar.
- **Perfil · cambiar el email no lo confirma en la nueva dirección** ni avisa a la
  anterior. Con una sesión abierta se puede mover la cuenta a otro correo en silencio, y
  desde ahí usar "he olvidado mi contraseña". Necesita decisión de producto (¿doble
  opt-in?), es backend y toca auth.

- **Citas · el vet puede quedarse sin cobrar en silencio (dinero, necesita decisión):**
  la protectora compromete Patitas al pedir la cita, pero el débito ocurre **al
  completarla** (`vetAppointment.controller.ts`, rama `status === 'completed'`). Si entre
  medias gastó ese saldo, el `findOneAndUpdate` condicionado no encuentra documento, se
  registra un `logger.warn` y **ahí se acaba**: la cita se marca completada, el vet ve
  "Cita actualizada" y nadie —ni vet ni protectora— se entera de que no hubo pago. La
  tarjeta solo deja el rastro "🐾 N Patitas · pendiente". Opciones: reservar el saldo al
  crear la cita, o devolver el fallo al vet y avisar a la protectora.

- **Venta sin tope realista:** el backend corta en 100 000 € (`registerSale`,
  `patitas.controller.ts`), así que un dedazo (1000 en vez de 100) se registra y genera
  Patitas y comisión. Mismo caso que las donaciones: necesita decisión de negocio.
- **La caja no tiene ni un test de UI.** `frontend/src/__tests__/` contiene un único
  fichero (`rbac.ui.test.tsx`, y encima cubre código muerto). Toda la pantalla por la que
  pasa el dinero del partner está sin cobertura de front.

- **Protectora · agujero de integridad en `setStatus`** (`src/controllers/adoption.controller.ts`):
  no hay guard de estado terminal, así que una adopción **ya aprobada** se puede pasar a
  `rechazada` — y el traspaso del animal no se revierte: se queda como mascota personal del
  adoptante con la solicitud marcada como rechazada. Verificado leyendo el controlador.
  Necesita decisión de producto (¿desaprobar revierte la propiedad?) antes de tocarlo.
- **Protectora · detalle de solicitud sin máquina de estados:** `MANAGE_ACTIONS` en
  `AdoptionDetail.tsx` ofrece las 6 transiciones siempre, mientras el panel
  `landlord/AdoptionsPage.tsx` sí tiene mapa de transiciones válidas. Incoherencia entre
  las dos pantallas de la misma protectora.
- **Público · `AnimalDetail.tsx`:** `res.status === 'pending' ? … : 'Solicitud creada'` es
  vocabulario del legado; `createAdoption` devuelve `recibida`, así que la primera rama es
  código muerto.
- **`listMine` pagina a 20 sin UI de paginación:** con más de 20 solicitudes el resto es
  invisible y "Total" cuenta solo la página cargada.
- **Donaciones · retorno de Stripe sin acuse:** `success_url`/`cancel_url` apuntan a la
  portada (`/?donation=success|cancel`) y **nadie lee ese parámetro**, así que una
  donación cobrada no da ninguna confirmación. Es lógica de pago: necesita decisión
  (¿apuntar el retorno a `/donate` o tratarlo en la portada?).
- **Donaciones · sin tope de importe** en ninguna capa: un dedazo (1000 en vez de 100)
  se cobra. En TEST es inocuo; antes de Stripe live hay que decidir el límite.
- **Doble toast de error en más de 20 páginas:** el interceptor global y las páginas
  toastean lo mismo. Ya existe el opt-out `skipErrorToast`; queda aplicarlo panel a
  panel a medida que se recorran.
- **Test previo en rojo, ajeno a este trabajo:** `frontend/src/__tests__/rbac.ui.test.tsx`
  busca el texto "Inicio" en el Sidebar, que ya no lo contiene. Esta rama no toca
  Sidebar.
- **`Layout.tsx` y `Sidebar.tsx` son código muerto:** nadie importa `Layout`, y `Sidebar`
  solo lo importaba `Layout` (y su test). La navegación viva es `layout/AppShell.tsx`.
  El único test de RBAC de la UI (`rbac.ui.test.tsx`) cubre por tanto código muerto:
  queda un hueco real de cobertura sobre la navegación que sí se usa. Borrarlos o
  escribir el test contra `AppShell` es decisión del dueño del proyecto.
- **Al aprobar no se cierran las candidaturas hermanas:** el resto de solicitudes del mismo
  animal quedan abiertas para siempre. Hoy solo se avisa en la UI; cerrarlas es backend.
- **`cuestionario_pendiente` es un estado muerto:** está en el modelo y en el enum, pero
  nadie lo fija en todo `src/`.
- **`AnimalsPage.tsx` pide `limit: 200`** y el servidor topa en 100: el mismo bug del tope
  silencioso, en un panel aún por revisar.
- **`getMyVerification` usa `axios` crudo con una cabecera `x-user-id` vestigial** (el
  bypass por cabeceras solo funciona en tests). Funciona porque `api/auth.ts` fija
  `axios.defaults.headers.common.Authorization`, pero es un patrón a limpiar.
- **El servidor no limita número ni longitud de las preguntas** del cuestionario.
- **`AnimalsList.tsx` pinta `species` cruda** (`dog`): otro panel, pendiente.
- **`questionnaire.controller.ensureProtectora` devuelve `null` para admin**, así que un
  admin en `/landlord/questionnaire` recibe 403. Pre-existente y menor.
- **`verificationLevel` lo fija el admin al aprobar**, no se deriva de los documentos
  subidos: la copia de la página evita prometer automatismo.
