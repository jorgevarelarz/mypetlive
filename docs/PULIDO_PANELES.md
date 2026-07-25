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
| Adoptante | Citas (solo lectura) | `/citas` | ⏳ |
| Protectora | Dashboard | `/landlord` | ✅ hecho |
| Protectora | Animales | `/landlord/animals` | ⏳ |
| Protectora | Solicitudes | `/landlord/adoptions` | ✅ hecho |
| Protectora | Cuestionario | `/landlord/questionnaire` | ⏳ |
| Protectora | Verificación | `/landlord/verificacion` | ⏳ |
| Veterinario | Panel partner | `/partner` | ⏳ |
| Veterinario | Caja | `/caja` | ⏳ |
| Veterinario | Agenda / calendario | `/citas` | ⏳ |
| Tienda | Panel partner | `/partner` | ⏳ |
| Tienda | Caja | `/caja` | ⏳ |
| Admin | Home | `/admin` | ⏳ |
| Admin | Usuarios | `/admin/users` | ⏳ |
| Admin | Animales | `/admin/animals` | ⏳ |
| Admin | Adopciones | `/admin/adoptions` | ⏳ |
| Admin | Cupones | `/admin/coupons` | ⏳ |
| Admin | Verificaciones | `/admin/verifications` | ⏳ |
| Admin | Liquidaciones | `/admin/settlements` | ⏳ |
| Admin | Informes / KPIs | `/admin/reports` | ⏳ |
| Admin | Ajustes | `/admin/settings` | ⏳ |
| Todos | Perfil | `/profile` | ⏳ |

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

## Pendientes detectados de paso (para cuando toque su panel)

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
