# Gap analysis: Dossier Maestro vs producto implementado

> Generado el 2 de julio de 2026 cruzando `MyPetLive_Dossier_Maestro_Detallado.pdf`
> (20 págs., visión de producto/negocio) con el estado real del código y despliegue
> (`ESTADO_Y_ROADMAP.md`). Cierra el pendiente "Contrastar con el Dossier Maestro".

## Resumen

El MVP definido por el dossier (adoptantes + protectoras + partners + cupones + Patitas
básico, sin marketplace) está **implementado y en producción, y en varias áreas superado**
(Patitas con ledger y pago real, pasaporte digital, SEO/OG, vet completo — el rol vet ni
aparece en el dossier). Los huecos reales están en la **capa de relación y retención**
(post-adopción, emails, recomendaciones) y en la **capa de datos** (métricas para
protectoras y partners, KPIs internos).

## Cumplido (dossier → producto)

- Módulos: usuarios/perfiles, animales (estados calcados al dossier), solicitudes con
  máquina de estados e historial, panel protectora, cupones con segmentación, Patitas
  (más avanzado que el MVP del dossier), donaciones con comisión, admin con acciones.
- Flujo adoptante pasos 1–10 completo (descubrimiento → adopción) con estados visibles.
- Validación de cupones por QR/código y placement destacado de pago (sponsored).
- Regla de oro UX ("no pedir 50 datos antes de generar interés") — se cumple.
- Añadidos que el dossier no contemplaba: rol veterinario completo (perfil, agenda,
  historial clínico, catálogo de servicios con precio), pasaporte digital con linaje,
  render OG para bots y sitemap.

## Huecos priorizados

### P1 — Relación y retención (el dossier insiste: "el valor real aparece después de la adopción")
1. **Emails transaccionales de adopción** — el dossier los pide explícitamente ("email
   transaccional para estados, solicitudes, citas y cupones"). Auditado el 2 jul 2026:
   ya existían cambio de estado → adoptante, cancelación → protectora y alertas de
   búsqueda al publicar (`notifyMatchingAlerts`). Se añadió el que faltaba: solicitud
   nueva → protectora. ✔ hecho.
2. **Plan de bienvenida post-adopción** (paso 11 del flujo): al aprobar una adopción,
   activar guía de bienvenida + cupones de bienvenida segmentados + recordatorios.
   Hoy existe cuidado diario y ofertas del pasaporte, pero nada se dispara al adoptar.
3. **Recomendación de animales similares** al rechazar/cancelar una solicitud
   ("si una mascota no encaja, recomendar similares").

### P2 — Capa de datos (KPIs "desde el primer día" según el dossier)
4. **Finanzas/impacto de la protectora**: donaciones recibidas, Patitas, adopciones
   del mes, conversión solicitud→adopción, tiempo medio de proceso + exportación.
   Los datos ya existen (`AnimalEvent`, `PatitaTxn`, adopciones); falta agregarlos.
5. **Métricas del partner**: usos de cupón, clientes generados, Patitas recibidas.
   Sin retorno visible, el partner no pagará suscripción (riesgo señalado en dossier).
6. **KPIs internos de plataforma** (panel admin): solicitudes, adopciones, cupones
   usados, GMV, tasa de conversión. Base para decidir cuándo activar cada línea de
   ingreso del modelo.

### P3 — Herramientas de protectora
7. **Cuestionarios propios/plantillas** por protectora (hoy el cuestionario es estándar).
8. **Notas internas** en solicitudes (visibles solo protectora/admin).
9. **Seguimiento post-adopción estructurado** (recordatorios de seguimiento, reduce
   devoluciones).

### P4 — Monetización (gateado por Stripe live + tracción, por diseño)
10. Suscripciones partner 29/49/79 € y Protectora Pro freemium (19–39 €).
11. Campañas de donación con objetivo y transparencia de destino (hoy solo donación directa).
12. Marketplace con comisión 8–15 % (fase 5 de la hoja de ruta del dossier — correcto no hacerlo aún).
13. Campañas de marca / B2G (fase de expansión).

## No aplica / descartado conscientemente
- Narrativa de inversión (el dossier es de ejecución propia).
- Stack sugerido (Next.js/Supabase) — se ejecutó sobre el fork RentalApp (Express/Mongo);
  decisión ya tomada y en producción, sin motivo para migrar.
- Kanban de solicitudes (hay tabla con estados; cosmético).
