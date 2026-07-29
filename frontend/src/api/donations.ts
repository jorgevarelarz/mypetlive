import { api as client } from './client';

// `shelterId` es la protectora destinataria. El backend la deduce del animal
// cuando se pasa `animalId`, pero sin ninguno de los dos responde 400
// `shelter_required`: hay que enviar siempre uno de los dos.
export async function createDonationSession(amountEUR: number, animalId?: string, shelterId?: string) {
  const { data } = await client.post(
    '/api/donations/checkout-session',
    { amountEUR, animalId, shelterId },
    // Los errores de este endpoint son códigos internos (`shelter_payouts_not_ready`,
    // …); los traduce la página, sin el toast genérico con el código crudo.
    { skipErrorToast: true } as any,
  );
  return data as { id: string; url: string };
}

// Códigos de error del checkout de donación. Un flujo de dinero no puede fallar
// mostrándole al donante `shelter_required`.
const DONATION_ERROR_MESSAGE: Record<string, string> = {
  invalid_amount: 'El importe no es válido. Introduce una cantidad en euros mayor que cero.',
  amount_too_small: 'El importe es demasiado pequeño.',
  amount_too_large: 'El importe supera el máximo por donación.',
  payments_unavailable: 'Las donaciones están temporalmente desactivadas. Vuelve a intentarlo más tarde.',
  shelter_required: 'Elige a qué protectora quieres donar.',
  shelter_verification_required: 'Esta protectora todavía no está verificada para recibir donaciones.',
  shelter_payouts_not_ready: 'Esta protectora aún no ha terminado de configurar su cuenta de cobro, así que todavía no puede recibir donaciones.',
};

export function donationErrorMessage(error: any) {
  const body = error?.response?.data;
  const code = body?.error;
  // Los topes son configurables por entorno en el servidor, así que el límite lo
  // dice la respuesta, no una constante del front.
  if (code === 'amount_too_small' && Number.isFinite(body?.min)) {
    return `La donación mínima es de ${body.min} €.`;
  }
  if (code === 'amount_too_large' && Number.isFinite(body?.max)) {
    return `El máximo por donación es de ${Number(body.max).toLocaleString('es-ES')} €. Para donar más, escribe a la protectora.`;
  }
  return DONATION_ERROR_MESSAGE[code] || 'No se pudo iniciar la donación. Vuelve a intentarlo.';
}
