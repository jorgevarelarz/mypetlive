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
  payments_unavailable: 'Las donaciones están temporalmente desactivadas. Vuelve a intentarlo más tarde.',
  shelter_required: 'Elige a qué protectora quieres donar.',
  shelter_verification_required: 'Esta protectora todavía no está verificada para recibir donaciones.',
  shelter_payouts_not_ready: 'Esta protectora aún no ha terminado de configurar su cuenta de cobro, así que todavía no puede recibir donaciones.',
};

export function donationErrorMessage(error: any) {
  const code = error?.response?.data?.error;
  return DONATION_ERROR_MESSAGE[code] || 'No se pudo iniciar la donación. Vuelve a intentarlo.';
}
