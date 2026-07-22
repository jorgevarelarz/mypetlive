import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register as apiRegister } from "../../api/auth";
import { useAuth } from "../../context/AuthContext";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const { login } = useAuth();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      await apiRegister(name.trim(), email.trim(), password);
      const user = await login(email.trim(), password);
      const destination = user?.role === 'tenant' ? '/home' : '/';
      nav(destination, { replace: true });
    } catch (e: any) {
      const code = e?.response?.data?.code || e?.response?.data?.error;
      if (code === 'email_in_use') {
        setErr('Ese correo ya está registrado. Inicia sesión o usa otro.');
      } else if (code === 'missing_fields') {
        setErr('Completa nombre, correo y contraseña.');
      } else {
        setErr(e?.response?.data?.message || e?.message || "No se pudo registrar");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="auth-title">Crea tu cuenta</h1>
      <p className="auth-subtitle">Únete a la comunidad de adoptantes y lleva el cuidado de tus mascotas al día.</p>
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-label" htmlFor="name">
          Nombre
          <input id="name" required className="auth-input" value={name} onChange={e=>setName(e.target.value)} />
        </label>
        <label className="auth-label" htmlFor="email">
          Correo electrónico
          <input id="email" type="email" required className="auth-input" value={email} onChange={e=>setEmail(e.target.value)} />
        </label>
        <label className="auth-label" htmlFor="password">
          Contraseña
          <input id="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" className="auth-input" value={password} onChange={e=>setPassword(e.target.value)} />
        </label>
        <p className="text-sm" style={{ color: '#7A8273', marginTop: -8 }}>Usa entre 12 y 72 caracteres.</p>
        {err && <p className="auth-error" style={{ color: '#b91c1c' }}>{err}</p>}
        <button type="submit" className="auth-button" disabled={loading}>
          {loading ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
      <div className="auth-footer">
        ¿Ya tienes cuenta? <Link to="/login" className="auth-link">Inicia sesión</Link>
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
