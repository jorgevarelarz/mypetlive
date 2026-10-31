import { api as client } from './client';

/**
 * Confirma un cambio de email pendiente con el token del enlace del correo.
 * No lleva sesión: el enlace se abre desde el buzón nuevo y el token es la
 * credencial. `skipErrorToast` porque la página traduce los códigos a algo
 * legible en vez del toast genérico.
 */
export async function confirmEmailChange(token: string) {
  const { data } = await client.post(
    '/api/users/email/confirm',
    { token },
    { skipErrorToast: true } as any,
  );
  return data as { ok: boolean; email: string };
}
