import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/** true dentro de la app de iOS/Android (Capacitor); false en la web. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Abre una página de pago o de un tercero (Stripe Checkout, Stripe Connect).
 * En la web navega como siempre. En la app se abre en Safari (SFSafariViewController)
 * por encima: si navegáramos el WebView a stripe.com, la vuelta (success_url de
 * mypetlive.es) cargaría la web dentro de la app y la persona se quedaría fuera
 * de ella. `onClose` se llama al cerrar Safari para refrescar el estado.
 */
export async function openPaymentPage(url: string, onClose?: () => void): Promise<void> {
  if (!isNativeApp()) {
    window.location.href = url;
    return;
  }
  if (onClose) {
    const handle = await Browser.addListener('browserFinished', () => {
      void handle.remove();
      onClose();
    });
  }
  await Browser.open({ url, presentationStyle: 'popover' });
}

/** URL pública de una ruta de la web, para abrirla fuera de la app. */
export function webUrl(path: string): string {
  return `https://mypetlive.es${path}`;
}
