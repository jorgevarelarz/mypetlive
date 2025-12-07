import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const sp = new URLSearchParams(loc.search);
  const next = sp.get('redirect') || (loc.state as any)?.from || "/home";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = await login(email, password);
      const destination = user?.role === 'tenant' ? '/home' : next;
      nav(destination, { replace: true });
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Error de login");
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
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </label>
        {err && <p className="auth-error" style={{ color: '#b91c1c' }}>{err}</p>}
        <button type="submit" className="auth-button">
          Entrar
        </button>
      </form>
      <div className="auth-footer">
        ¿No tienes cuenta? <Link to="/register" className="auth-link">Regístrate</Link>
      </div>
      <div className="auth-cta" style={{ marginTop: 24, textAlign: 'center', color: '#3F4A3C' }}>
        <p style={{ fontWeight: 600 }}>¿Eres protectora, veterinario o tienda?</p>
        <p className="text-sm" style={{ color: '#7A8273' }}>Hablemos y te activamos como profesional.</p>
        <a
          href="https://wa.me/XXXXXXXXXX"
          target="_blank"
          rel="noreferrer"
          className="text-sm"
          style={{ textDecoration: 'underline', textUnderlineOffset: 4 }}
        >
          Escríbenos por WhatsApp
        </a>
      </div>
    </>
  );
}
