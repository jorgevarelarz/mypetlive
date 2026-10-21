import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { SocialProvider } from "../../api/auth";
import { isNativeApp, openPaymentPage, webUrl } from "../../utils/native";

/**
 * Botones de "Continuar con Google / Apple".
 *
 * Si no hay client id configurado para un proveedor, su botón NO se pinta: así
 * el componente se puede desplegar antes de tener las credenciales sin que
 * aparezca un botón que falla al pulsarlo. Si no hay ninguno, no se pinta nada
 * (ni el separador).
 */

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";
const APPLE_CLIENT_ID = process.env.REACT_APP_APPLE_CLIENT_ID || "";

// En la app (iOS) se usan los SDK nativos vía @capgo/capacitor-social-login:
// los botones web de Google y Apple no funcionan dentro del WebView. Los client
// id son públicos (van en cualquier app); el servidor acepta los dos de Google.
const NATIVE_GOOGLE_IOS_CLIENT_ID = "268255224468-l3i8165nkj06mkkdn9g043codg2ibca5.apps.googleusercontent.com";
const NATIVE_GOOGLE_WEB_CLIENT_ID = "268255224468-ur6nibvuiteejblsfde57gu4iaade233.apps.googleusercontent.com";

let nativeInit: Promise<any> | null = null;
function nativeSocialLogin() {
  if (!nativeInit) {
    nativeInit = import("@capgo/capacitor-social-login").then(async ({ SocialLogin }) => {
      await SocialLogin.initialize({
        apple: { clientId: "es.mypetlive.app" },
        google: {
          iOSClientId: NATIVE_GOOGLE_IOS_CLIENT_ID,
          iOSServerClientId: NATIVE_GOOGLE_WEB_CLIENT_ID,
          mode: "online",
        },
      });
      return SocialLogin;
    });
    nativeInit.catch(() => { nativeInit = null; });
  }
  return nativeInit;
}

const GOOGLE_SRC = "https://accounts.google.com/gsi/client";
const APPLE_SRC =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/es_ES/appleid.auth.js";

const scriptPromises = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const cached = scriptPromises.get(src);
  if (cached) return cached;
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script_error")));
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("script_error"));
    document.head.appendChild(el);
  });
  scriptPromises.set(src, promise);
  return promise;
}

type Props = {
  /** A dónde ir tras entrar. Por defecto, lo mismo que el login normal. */
  redirectTo?: string;
};

export default function SocialAuthButtons({ redirectTo }: Props) {
  const { loginWithProvider } = useAuth();
  const nav = useNavigate();
  const googleRef = useRef<HTMLDivElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<SocialProvider | null>(null);

  const enter = useCallback(
    async (provider: SocialProvider, idToken: string, name?: string) => {
      setErr(null);
      setBusy(provider);
      try {
        const user = await loginWithProvider(provider, idToken, name);
        const destination = redirectTo || (user?.role === "tenant" ? "/home" : "/");
        nav(destination, { replace: true });
      } catch (e: any) {
        setErr(
          e?.response?.data?.message ||
            "No hemos podido entrar con ese proveedor. Inténtalo de nuevo.",
        );
      } finally {
        setBusy(null);
      }
    },
    [loginWithProvider, nav, redirectTo],
  );

  const native = isNativeApp();

  const nativeSignIn = useCallback(async (provider: SocialProvider) => {
    setErr(null);
    try {
      const SocialLogin = await nativeSocialLogin();
      const res: any = await SocialLogin.login(
        provider === "apple"
          ? { provider: "apple", options: { scopes: ["email", "name"] } }
          : { provider: "google", options: { scopes: ["email", "profile"] } },
      );
      const idToken = res?.result?.idToken;
      if (!idToken) throw new Error("no_token");
      // Apple solo da el nombre la primera vez: se aprovecha para el alta.
      const p = res?.result?.profile || {};
      const name = `${p.givenName || ""} ${p.familyName || ""}`.trim() || undefined;
      await enter(provider, idToken, name);
    } catch (e: any) {
      const msg = String(e?.message || e?.code || "");
      // Cerrar la hoja de Apple/Google no es un error que merezca aviso.
      if (/cancel/i.test(msg) || /1001|-5/.test(msg)) return;
      setErr(`No hemos podido entrar con ${provider === "apple" ? "Apple" : "Google"}. Inténtalo de nuevo.`);
    }
  }, [enter]);

  // Google pinta su propio botón oficial (es requisito de su marca) dentro del
  // div que le pasamos.
  useEffect(() => {
    if (native || !GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadScript(GOOGLE_SRC)
      .then(() => {
        const google = (window as any).google;
        if (cancelled || !google?.accounts?.id || !googleRef.current) return;
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response: any) => {
            if (response?.credential) enter("google", response.credential);
          },
        });
        google.accounts.id.renderButton(googleRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          locale: "es",
          width: 300,
        });
      })
      .catch(() => {
        if (!cancelled) setErr("No se ha podido cargar el acceso con Google.");
      });
    return () => {
      cancelled = true;
    };
  }, [enter, native]);

  const appleSignIn = useCallback(async () => {
    setErr(null);
    try {
      await loadScript(APPLE_SRC);
      const AppleID = (window as any).AppleID;
      if (!AppleID?.auth) throw new Error("apple_unavailable");
      AppleID.auth.init({
        clientId: APPLE_CLIENT_ID,
        scope: "name email",
        redirectURI: `${window.location.origin}/login`,
        usePopup: true,
      });
      const data = await AppleID.auth.signIn();
      const idToken = data?.authorization?.id_token;
      if (!idToken) throw new Error("apple_no_token");
      // Apple SOLO manda el nombre la primera vez que autorizas, y fuera del
      // token: si no se aprovecha aquí, se pierde para siempre.
      const first = data?.user?.name?.firstName || "";
      const last = data?.user?.name?.lastName || "";
      const name = `${first} ${last}`.trim() || undefined;
      await enter("apple", idToken, name);
    } catch (e: any) {
      // El usuario cerrando el popup no es un error que merezca mensaje.
      if (e?.error === "popup_closed_by_user" || e?.error === "user_cancelled_authorize") return;
      setErr("No hemos podido entrar con Apple. Inténtalo de nuevo.");
    }
  }, [enter]);

  if (!native && !GOOGLE_CLIENT_ID && !APPLE_CLIENT_ID) return null;

  // En la app un target=_blank no abre nada: el texto va en Safari por encima.
  const openLegal = (path: string) => (e: React.MouseEvent) => {
    if (!native) return;
    e.preventDefault();
    void openPaymentPage(webUrl(path));
  };

  const showGoogle = native || Boolean(GOOGLE_CLIENT_ID);
  const showApple = native || Boolean(APPLE_CLIENT_ID);
  const pill: React.CSSProperties = {
    width: 300, maxWidth: "100%", height: 44, padding: 0, borderRadius: 999,
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    fontSize: 15, fontWeight: 600, cursor: "pointer",
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div
        aria-hidden
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          margin: "4px 0 16px",
          color: "rgba(63,74,60,.55)",
          fontSize: ".85rem",
        }}
      >
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />o
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>

      <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
        {!native && showGoogle && <div ref={googleRef} />}
        {showApple && (
          <button
            type="button"
            onClick={native ? () => nativeSignIn("apple") : appleSignIn}
            disabled={busy === "apple"}
            className="auth-button"
            style={{
              width: 300,
              maxWidth: "100%",
              height: native ? 44 : 40, // el botón web de Google mide 40
              boxShadow: "none",
              borderRadius: 999,
              background: "#000",
              color: "#fff",
              border: "1px solid #000",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            <svg width="15" height="18" viewBox="0 0 14 17" aria-hidden fill="currentColor">
              <path d="M11.6 9c0-1.6.8-2.5 2.1-3.2-.7-1-1.8-1.6-3.2-1.7-1.4-.1-2.9.8-3.4.8-.6 0-1.8-.8-2.9-.8C2.3 4.2.7 5.3.7 7.7c0 .9.2 1.9.5 2.9.5 1.3 2 4.5 3.6 4.4.8 0 1.4-.6 2.5-.6s1.6.6 2.5.6c1.6 0 3-2.9 3.4-4.2-2.1-1-3.6-1.3-3.6-1.8zM9.4 3c.8-.9 1.2-2 1-3.1-.9.1-1.9.6-2.5 1.3-.7.7-1.1 1.8-1 2.9 1 .1 2-.4 2.5-1.1z" />
            </svg>
            {busy === "apple" ? "Entrando…" : "Continuar con Apple"}
          </button>
        )}
        {native && showGoogle && (
          <button
            type="button"
            onClick={() => nativeSignIn("google")}
            disabled={busy === "google"}
            style={{ ...pill, background: "#fff", color: "#1f1f1f", border: "1px solid #747775" }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {busy === "google" ? "Entrando…" : "Continuar con Google"}
          </button>
        )}
      </div>

      {/* Aviso de aceptación: quien entra con Apple/Google no pasa por la
          casilla del registro. El front manda acceptLegal en socialLogin. */}
      <p style={{ fontSize: 12.5, lineHeight: 1.45, color: "#6B7464", textAlign: "center", margin: "12px auto 0", maxWidth: 300 }}>
        Al continuar con {showApple && showGoogle ? "Apple o Google" : showApple ? "Apple" : "Google"} aceptas los{" "}
        <a href="/legal/terms" target="_blank" rel="noreferrer" onClick={openLegal("/legal/terms")} style={{ textDecoration: "underline" }}>términos y condiciones</a>
        {" "}y la{" "}
        <a href="/legal/privacy" target="_blank" rel="noreferrer" onClick={openLegal("/legal/privacy")} style={{ textDecoration: "underline" }}>política de privacidad</a>.
      </p>

      {err && (
        <p className="auth-error" style={{ color: "#b91c1c", textAlign: "center", marginTop: 12 }}>
          {err}
        </p>
      )}
    </div>
  );
}
