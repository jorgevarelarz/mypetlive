import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Share } from '@capacitor/share';

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

/**
 * Comparte un enlace público de mypetlive.es. En la app usa la hoja nativa
 * del iPhone (navigator.share no existe en el WebView) y nunca la dirección
 * interna capacitor://localhost, que no sirve fuera de la app. En la web usa
 * la hoja del navegador y, si no hay, copia el enlace. Devuelve false si no
 * se pudo; cancelar la hoja no cuenta como fallo.
 */
export async function shareLink(opts: { title: string; text: string; path: string; onCopied?: () => void }): Promise<boolean> {
  const url = webUrl(opts.path);
  try {
    if (isNativeApp()) {
      await Share.share({ title: opts.title, text: opts.text, url, dialogTitle: opts.title });
    } else if (navigator.share) {
      await navigator.share({ title: opts.title, text: opts.text, url });
    } else {
      await navigator.clipboard.writeText(url);
      opts.onCopied?.();
    }
    return true;
  } catch (error: any) {
    const msg = String(error?.message || error?.name || '');
    return error?.name === 'AbortError' || /cancel/i.test(msg);
  }
}
