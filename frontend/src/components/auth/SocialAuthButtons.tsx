import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { SocialProvider } from "../../api/auth";

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

  // Google pinta su propio botón oficial (es requisito de su marca) dentro del
  // div que le pasamos.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
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
  }, [enter]);

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

  if (!GOOGLE_CLIENT_ID && !APPLE_CLIENT_ID) return null;

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
        {GOOGLE_CLIENT_ID && <div ref={googleRef} />}
        {APPLE_CLIENT_ID && (
          <button
            type="button"
            onClick={appleSignIn}
            disabled={busy === "apple"}
            className="auth-button"
            style={{
              width: 300,
              maxWidth: "100%",
              height: 40,
              borderRadius: 999,
              background: "#000",
              color: "#fff",
              border: "1px solid #000",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <svg width="15" height="18" viewBox="0 0 14 17" aria-hidden fill="currentColor">
              <path d="M11.6 9c0-1.6.8-2.5 2.1-3.2-.7-1-1.8-1.6-3.2-1.7-1.4-.1-2.9.8-3.4.8-.6 0-1.8-.8-2.9-.8C2.3 4.2.7 5.3.7 7.7c0 .9.2 1.9.5 2.9.5 1.3 2 4.5 3.6 4.4.8 0 1.4-.6 2.5-.6s1.6.6 2.5.6c1.6 0 3-2.9 3.4-4.2-2.1-1-3.6-1.3-3.6-1.8zM9.4 3c.8-.9 1.2-2 1-3.1-.9.1-1.9.6-2.5 1.3-.7.7-1.1 1.8-1 2.9 1 .1 2-.4 2.5-1.1z" />
            </svg>
            {busy === "apple" ? "Entrando…" : "Continuar con Apple"}
          </button>
        )}
      </div>

      {err && (
        <p className="auth-error" style={{ color: "#b91c1c", textAlign: "center", marginTop: 12 }}>
          {err}
        </p>
      )}
    </div>
  );
}
