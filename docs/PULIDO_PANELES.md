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
| Adoptante | Mis adopciones | `/adoptions/mine` | ⏳ |
| Adoptante | Detalle de adopción | `/adoptions/:id` | ⏳ |
| Adoptante | Favoritos | `/me/favorites` | ⏳ |
| Adoptante | Alertas | `/me/alerts` | ⏳ |
| Adoptante | Donaciones | `/donate` | ⏳ |
| Adoptante | Citas (solo lectura) | `/citas` | ⏳ |
| Protectora | Dashboard | `/landlord` | ⏳ |
| Protectora | Animales | `/landlord/animals` | ⏳ |
| Protectora | Solicitudes | `/landlord/adoptions` | ⏳ |
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
