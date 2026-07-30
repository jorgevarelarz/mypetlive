// Topes de importe de las operaciones con dinero real.
//
// Hasta ahora las donaciones no tenían tope ninguno y las ventas de partner
// cortaban en 100.000 €, que no es un tope: es el límite de lo absurdo. Un
// dedazo —1000 en vez de 100— se cobraba a la tarjeta, o se registraba como
// venta generando Patitas y comisión sobre un importe que nunca existió.
// En modo TEST era inocuo; con Stripe live deja de serlo.
//
// Los valores por defecto son conservadores a propósito: cubren de sobra el
// caso normal (una donación puntual, un ticket de tienda o de clínica) y
// obligan a subirlos por entorno cuando el negocio lo pida, que es una decisión
// consciente en vez de un descubrimiento a posteriori en el extracto.

function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

// Stripe rechaza cobros por debajo de 0,50 € en EUR con un error opaco; se corta
// antes para poder decir algo útil.
export const DONATION_MIN_EUR = envNumber('DONATION_MIN_EUR', 1);
export const DONATION_MAX_EUR = envNumber('DONATION_MAX_EUR', 2000);

// Ticket de una tienda o clínica veterinaria.
export const SALE_MAX_EUR = envNumber('SALE_MAX_EUR', 3000);

// Patitas de regalo que un partner puede poner en un cupón que crea él mismo.
// `bonusPatitas` no es decorativo: al canjear el cupón, useCoupon() llama a
// earnForUser() con ese número, así que ACUÑA moneda de impacto. Mientras crear
// cupones fue solo de admin daba igual; en autoservicio, sin tope, sería una
// impresora de billetes en manos del partner. El admin sigue sin tope.
export const COUPON_BONUS_MAX_PATITAS = envNumber('COUPON_BONUS_MAX_PATITAS', 200);

export function eurAmountError(
  amountEur: number,
  { min, max }: { min: number; max: number },
): { error: string; min: number; max: number } | null {
  if (!Number.isFinite(amountEur) || amountEur <= 0) return { error: 'invalid_amount', min, max };
  if (amountEur < min) return { error: 'amount_too_small', min, max };
  if (amountEur > max) return { error: 'amount_too_large', min, max };
  return null;
}
