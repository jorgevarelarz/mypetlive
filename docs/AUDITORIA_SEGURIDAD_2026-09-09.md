# Auditoría de seguridad — 9 de septiembre de 2026

Revisión de los cinco puntos que planteó un tercero: **claves, política de
privacidad, permisos del dispositivo, autorización a nivel de dato ("RLS") y
CORS**. La app está **en producción** en https://mypetlive.es.

> Nota sobre "RLS": es un término de Supabase/Postgres. MyPetLive usa MongoDB,
> así que no hay RLS literal; el equivalente es la comprobación de propiedad en
> el servidor (que el usuario X solo vea/toque sus objetos). Ahí es donde está
> el trabajo pendiente.

---

## 1. Claves y secretos

| Estado | Punto |
|---|---|
| ✅ | `.env` está en `.gitignore` y **nunca se ha subido** (verificado en todo el historial). |
| ✅ | Cabeceras endurecidas (helmet, CSP en prod, HSTS, `x-powered-by` off), rate-limit por endpoint, `trust proxy`. |
| ✅ | `errorHandler` ya no filtra `err.message` de excepciones internas al cliente (arreglado en el trabajo en curso). |
| ✅ | JWT con `tokenVersion`: al restablecer la contraseña se invalidan los tokens vivos (trabajo en curso). |
| 🔧 arreglado | `.env.example` traía un `JWT_SECRET` con pinta de valor real y `TENANT_PRO_UPLOADS_KEY` con ceros. Sustituidos por marcadores explícitos. |
| 🔧 arreglado | `getJwtSecret()` ahora **aborta el arranque** si `JWT_SECRET` es el hex antiguo del ejemplo o el marcador nuevo (`src/config/jwt.ts`). |
| ⚠️ acción de Jorge | **Contraseña de MongoDB Atlas débil** (`mypetlive:Popeye22_` en el `.env` local, cluster `hefso6g`). Es la BD de desarrollo, pero es un Atlas expuesto a internet. Rotar por una aleatoria larga y revisar el **IP allowlist de Atlas** (que no sea `0.0.0.0/0`). |
| ⚠️ acción de Jorge | Confirmar en el VPS que el `JWT_SECRET` de producción **no** es el hex viejo del ejemplo. Si lo fuera, rotarlo (invalida todas las sesiones: aceptable). |
| ⚠️ acción de Jorge | La `sk_live_` de Stripe sigue pendiente de rotar en el dashboard (ya anotado en el roadmap). |

## 2. Política de privacidad

| Estado | Punto |
|---|---|
| ✅ | `legal/privacy_v2.md` es completa: responsable con NIF, categorías de datos, **tabla de bases legales**, destinatarios, transferencias internacionales, **retención detallada**, derechos ARCO+, cláusula de menores (>18), brechas, no decisiones automatizadas. |
| ✅ | Stripe declarado como responsable independiente; "no tratamos datos de pago". Prueba de consentimiento versionada (fecha, IP, navegador). |
| ⚠️ pendiente | **No hay borrado de cuenta self-service.** El RGPD lo permite por email, pero la **App Store (guía 5.1.1(v)) lo exige dentro de la app**. Bloqueante para publicar en iOS. Propuesta: endpoint `DELETE /api/users/me` → marca la cuenta, `tokenVersion++`, purga a los 30 días (job) respetando las retenciones legales de adopciones (3 años) y ventas (6 años) → anonimizar, no borrar, esos registros. Necesita decisión de producto de Jorge. |
| ⚠️ verificar | Si la web usa analítica con cookies, el banner debe bloquear scripts antes del consentimiento. Existe `cookies_v1.md`. |
| ℹ️ | El domicilio y NIF de Jorge son públicos en el aviso legal (obligatorio como autónomo). |

## 3. Permisos del dispositivo

| Estado | Punto |
|---|---|
| ✅ | `AndroidManifest.xml` de origen pide **solo `INTERNET`**. Cero cámara/ubicación/almacenamiento/contactos. |
| ✅ | iOS: sin APIs sensibles, sin cadenas de propósito necesarias. |
| 🔧 arreglado | `android:allowBackup` pasa a `false` + `dataExtractionRules` que excluye todo de backup y traspaso de dispositivo (la sesión no debe viajar en un backup de Google). Nuevo `res/xml/data_extraction_rules.xml`. |
| ℹ️ | Al añadir subida de fotos desde la app hará falta permiso de cámara/fotos + textos de propósito. |

## 4. Autorización a nivel de dato (el "RLS" de Mongo)

| Estado | Punto |
|---|---|
| ✅ | `authenticate` (JWT) + `authorizeRoles` + `requireAdmin` aplicados. Admin se comprueba por rol en el JWT, no por cabecera. |
| ✅ | El admin **no** se puede activar con la cabecera `x-admin` (el servidor no la lee en ningún sitio; solo está en la lista de CORS por el cliente legado). |
| ✅ | `updateUser` (`PATCH /api/users/:id`) comprueba propiedad y no deja cambiar el rol; el email pasa por doble confirmación. |
| ✅ | El trabajo en curso ya tapa: exposición de `ownerId`/avistamientos/`__v` en el catálogo de animales, borradores visibles por ID, XSS almacenado en `/uploads` (detección por magic bytes), reserva atómica de stock en marketplace, token de invitado en los enlaces de pedido. |
| 🔧 arreglado | **Inyección de operadores de Mongo**: nuevo `src/middleware/mongoSanitize.ts` (global, sin dependencias) que quita claves `$…` y `a.b` de `body`/`query`/`params`. Varios controladores (`animal.search`, filtros, `findOne`) copiaban `req.query.campo` directo al filtro, y `?campo[$ne]=x` colaba un operador. |
| 🔧 arreglado | `payments.routes.ts`: quitado el `?? req.header('x-user-id')` (código muerto, `authenticate` ya corre antes). |
| ⚠️ pendiente | **Auditoría IDOR ruta por ruta** de los recursos que no son de animales (citas vet, cupones de partner, patitas, donaciones, tickets): confirmar que cada `GET /:id` comprueba que el objeto es del solicitante. Es lo más importante antes de escalar. |
| ℹ️ | Tests legados de RentalApp (`rbac.test.ts`, `security.test.ts` de contratos, `api.test.ts` de propiedades) fallan desde antes de este trabajo: prueban rutas de alquiler ya retiradas. No confundir con regresiones. |

## 5. CORS

| Estado | Punto |
|---|---|
| ✅ | Lista blanca explícita desde `CORS_ORIGIN`; en producción **deniega todo** si no está definida (no cae a `*`). |
| ✅ | `credentials: true` con lista de orígenes explícita (combinación correcta). |
| ✅ | Webhook de Stripe montado antes de CORS, con raw body y verificación de firma. |
| ⚠️ cosmético | `allowedHeaders` incluye `x-admin` y `x-user-id`. El servidor **no** los usa para auth en producción, así que no es explotable, pero conviene quitarlos de ahí **y** del cliente (`frontend/src/api/*.ts`) a la vez para no romper el panel admin. Cambio de las dos partes, baja prioridad. |

---

## Cambios aplicados en este pase

- `.env.example` — marcadores en `JWT_SECRET` y `TENANT_PRO_UPLOADS_KEY`.
- `src/config/jwt.ts` — el arranque aborta con los valores de plantilla.
- `src/middleware/mongoSanitize.ts` (nuevo) + `src/app.ts` — sanea `$`/`.` en body/query/params.
- `src/routes/payments.routes.ts` — fuera el fallback a `x-user-id`.
- `frontend/android/app/src/main/AndroidManifest.xml` + `res/xml/data_extraction_rules.xml` — sin backup ni traspaso de datos.

`tsc` limpio. Sin regresiones en la suite (los fallos que quedan son de rutas
RentalApp retiradas y de un test nuevo del trabajo en curso que espera `https://`
donde el entorno de test da `http://localhost:3001`).

## Pendiente (necesita a Jorge)

1. Rotar la contraseña de Mongo Atlas + revisar IP allowlist.
2. Confirmar/rotar el `JWT_SECRET` de producción en el VPS.
3. Rotar la `sk_live_` de Stripe.
4. Endpoint de borrado de cuenta in-app (bloqueante App Store) — decisión de producto.
5. Auditoría IDOR ruta por ruta de citas vet / cupones / patitas / donaciones.
6. Verificar el banner de cookies si hay analítica.
