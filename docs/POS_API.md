# API de TPV — MyPetLive

Integración del sistema de caja (TPV) de un partner (tienda o clínica veterinaria)
con MyPetLive: al escanear el código del cliente, el TPV registra la venta con sus
productos y aplica automáticamente los cupones disponibles del cliente.

## Autenticación

Todas las llamadas llevan la cabecera `X-Api-Key` con una clave del partner
(formato `mpl_pos_…`). El partner la genera en su panel de MyPetLive
(**Patitas → Conectar tu TPV**), con una etiqueta por caja ("Caja 1", "Caja 2"…).
La clave se muestra una sola vez; si se pierde o se compromete, se revoca **solo esa**
(las demás cajas siguen funcionando) y se crea otra.

### Clave de pruebas (sandbox)

Una clave de modo test (formato `mpl_pos_test_…`, se crea igual desde el panel)
ejecuta todo el flujo con las mismas validaciones y la misma forma de respuesta,
pero **sin efectos**: no crea ventas, no consume cupones y no acredita Patitas.
Las respuestas llevan `"test": true` (y `saleId: null` en `/sales`). Úsala para
desarrollar la integración; cambia a la clave real al pasar a producción.

Base URL: `https://mypetlive.es/api/pos`

## Flujo en caja

1. El cliente muestra su QR o código corto de MyPetLive (app → "Mi código").
2. El TPV llama a `POST /identify` → recibe el nombre del cliente y sus **cupones
   aplicables en este establecimiento** (para aplicar el descuento en el ticket).
3. Al cerrar el ticket, el TPV llama a `POST /sales` con el importe, las líneas y
   el id del ticket como `externalRef` (idempotencia). MyPetLive registra la venta,
   marca los cupones indicados como usados y acredita las Patitas al cliente
   (proporcionales al importe + bonus de los cupones).

## Identificación del cliente

`/identify` y `/sales` identifican al cliente **solo** con prueba de presencia:

- `userToken` — contenido del QR que muestra el cliente (token firmado), o
- `code` — su código corto de 6 caracteres (fallback manual).

No se acepta un `userId` directo: la venta requiere que el cliente esté en caja.
El código corto caduca a los 10 minutos; el TPV debe pedirlo en el momento.

## POST /identify

```bash
curl -X POST https://mypetlive.es/api/pos/identify \
  -H "X-Api-Key: mpl_pos_XXXX" \
  -H "Content-Type: application/json" \
  -d '{"code": "ABC123"}'
```

Respuesta `200`:

```json
{
  "userId": "6a3a…",
  "name": "Ana",
  "coupons": [
    { "_id": "6a41…", "title": "10% en pienso", "discount": "-10%", "bonusPatitas": 20, "targetAnimalCode": null }
  ]
}
```

Errores: `400 invalid_user_code` (código caducado o mal), `401 invalid_api_key`.

## POST /sales

```bash
curl -X POST https://mypetlive.es/api/pos/sales \
  -H "X-Api-Key: mpl_pos_XXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "ABC123",
    "amountEur": 47.50,
    "externalRef": "TICKET-2026-000123",
    "couponIds": ["6a41…"],
    "items": [
      { "name": "Pienso cachorro 3kg", "qty": 1, "priceEur": 32.50 },
      { "name": "Juguete mordedor", "qty": 2, "priceEur": 7.50 }
    ]
  }'
```

Body:

| Campo | Tipo | Notas |
|---|---|---|
| `code` / `userToken` | string | Identificación del cliente (uno de los dos). |
| `amountEur` | number | Importe total del ticket. Obligatorio. |
| `externalRef` | string | Id del ticket en la caja. Muy recomendado: hace la llamada idempotente (los reintentos de red no duplican la venta). |
| `items` | array | Líneas del ticket `{name, qty?, priceEur?}` (máx. 50). Opcional pero recomendado. |
| `couponIds` | string[] | Consumir solo estos cupones (los que la caja descontó de verdad en el ticket). |
| `applyCoupons` | boolean | `true` para consumir todos los cupones elegibles. Por defecto (sin `couponIds` ni `applyCoupons`) no se consume ninguno. |

Respuesta `201`:

```json
{
  "ok": true,
  "saleId": "6a47…",
  "commissionPct": 5,
  "commissionEur": 2.38,
  "patitasEarned": 67,
  "appliedCoupons": [{ "_id": "6a41…", "title": "10% en pienso", "discount": "-10%", "bonusPatitas": 20, "targetAnimalCode": null }]
}
```

`patitasEarned` = Patitas por importe (1/€) + bonus de los cupones aplicados.

### Reintentos (idempotencia)

Si el TPV reenvía la venta con el mismo `externalRef` (timeout, corte de red…),
recibe `200` con la venta original y `"duplicate": true` — **misma respuesta que
la primera llamada, cupones incluidos**, para poder reimprimir el ticket real.
No se duplican ni la venta ni las Patitas.

## Notas

- Los cupones son de un solo uso: si dos cajas intentan aplicar el mismo, solo
  una lo consigue (marcado atómico); el consumo del cupón y su bonus de Patitas
  se aplican como unidad (no queda cupón quemado sin recompensa).
- Rate limit: 120 llamadas/minuto por IP. Respuestas `429` → reintentar con backoff.
- El `userId` devuelto por `/identify` es informativo; `/sales` sigue exigiendo
  `code` o `userToken`.
