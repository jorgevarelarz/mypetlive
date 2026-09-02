import React, { useState } from "react";
import PasswordField from '../../components/auth/PasswordField';
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import SocialAuthButtons from "../../components/auth/SocialAuthButtons";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const sp = new URLSearchParams(loc.search);
  // Un `redirect` explícito manda para todos los roles: es lo que trae a la
  // gente desde el botón "Quiero adoptar" de la portada.
  const explicitNext = sp.get('redirect') || (loc.state as any)?.from || null;
  const next = explicitNext || "/home";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = await login(email, password);
      const destination = explicitNext || (user?.role === 'tenant' ? '/home' : next);
      nav(destination, { replace: true });
    } catch (e: any) {
      // La API responde {code, message}: leyendo solo `error` se perdía el
      // motivo real y siempre salía "Error de login".
      setErr(e?.response?.data?.message || e?.response?.data?.error || "Error de login");
    }
  };

  return (
    <>
      <h1 className="auth-title">Inicia sesión</h1>
      <p className="auth-subtitle">Ingresa para cuidar de tus mascotas y seguir su día a día.</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="auth-label" htmlFor="email">
          Correo electrónico
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
            placeholder="correo@dominio.com"
            autoComplete="email"
          />
        </label>
        <label className="auth-label" htmlFor="password">
          Contraseña
          <PasswordField
            id="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </label>
        <div style={{ textAlign: 'right', marginTop: -4 }}>
          <Link to="/forgot-password" className="auth-link" style={{ fontSize: 14 }}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        {err && <p className="auth-error" style={{ color: '#b91c1c' }}>{err}</p>}
        <button type="submit" className="auth-button">
          Entrar
        </button>
      </form>

      <SocialAuthButtons redirectTo={explicitNext || undefined} />

      {/* Los primeros usuarios pedían que se viera el alta: mucha gente llegaba
          al login sin cuenta e intentaba entrar igualmente. */}
      <div
        className="auth-footer"
        style={{
          marginTop: 24,
          padding: '14px 16px',
          border: '1px solid var(--border)',
          borderRadius: 14,
          background: 'rgba(255,255,255,.6)',
          fontSize: '1rem',
        }}
      >
        ¿No tienes cuenta?{' '}
        <Link to="/register" className="auth-link" style={{ fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 4 }}>
          Regístrate gratis
        </Link>
      </div>
      <div className="auth-cta" style={{ marginTop: 24, textAlign: 'center', color: '#3F4A3C' }}>
        <p style={{ fontWeight: 600 }}>¿Eres protectora, veterinario o tienda?</p>
        <p className="text-sm" style={{ color: '#7A8273' }}>Hablemos y te activamos como profesional.</p>
        <a
          href="mailto:soporte@mypetlive.es?subject=Alta%20profesional%20MyPetLive"
          className="text-sm"
          style={{ textDecoration: 'underline', textUnderlineOffset: 4 }}
        >
          Solicita el alta profesional
        </a>
      </div>
    </>
  );
}
