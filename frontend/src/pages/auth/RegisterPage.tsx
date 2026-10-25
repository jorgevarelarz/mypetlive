import React, { useState } from "react";
import PasswordField from '../../components/auth/PasswordField';
import { Link, useLocation, useNavigate } from "react-router-dom";
import { register as apiRegister } from "../../api/auth";
import { useAuth } from "../../context/AuthContext";
import SocialAuthButtons from "../../components/auth/SocialAuthButtons";
import LegalCheckbox from "../../components/auth/LegalCheckbox";
import { markNewAccount } from "../../utils/webPush";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const { login } = useAuth();

  const sp = new URLSearchParams(loc.search);
  const explicitNext = sp.get("redirect") || null;
  const mismatch = password2.length > 0 && password !== password2;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    // Comprobado también aquí y no solo con `mismatch`: el usuario puede enviar
    // el formulario con Enter sin haber salido del segundo campo.
    if (password !== password2) {
      setErr('Las dos contraseñas no coinciden.');
      return;
    }
    if (!acceptedLegal) {
      setErr('Tienes que aceptar los términos y la política de privacidad.');
      return;
    }
    setLoading(true);
    try {
      await apiRegister(name.trim(), email.trim(), password, true);
      markNewAccount();
      const user = await login(email.trim(), password);
      const destination = explicitNext || (user?.role === 'tenant' ? '/home' : '/');
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
      {(loc.state as any)?.message && (
        <p style={{ margin: '0 0 18px', padding: '12px 14px', borderRadius: 12, background: '#E2EEEC', color: '#176363', fontSize: 14, fontWeight: 600 }}>
          {(loc.state as any).message}
        </p>
      )}
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
          <PasswordField id="password" required minLength={12} maxLength={72} autoComplete="new-password" placeholder="Mínimo 12 caracteres" className="auth-input" value={password} onChange={e=>setPassword(e.target.value)} />
        </label>
        <p className="text-sm auth-hint" style={{ color: '#7A8273', marginTop: -8 }}>Usa entre 12 y 72 caracteres.</p>
        <label className="auth-label" htmlFor="password2">
          Repite la contraseña
          <PasswordField
            id="password2"
            required
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
            className="auth-input"
            style={mismatch ? { borderColor: '#b91c1c' } : undefined}
            aria-invalid={mismatch || undefined}
            aria-describedby={mismatch ? 'password2-error' : undefined}
            value={password2}
            onChange={e => setPassword2(e.target.value)}
          />
        </label>
        {mismatch && (
          <p id="password2-error" className="text-sm" style={{ color: '#b91c1c', marginTop: -8 }}>
            Las dos contraseñas no coinciden.
          </p>
        )}
        <LegalCheckbox checked={acceptedLegal} onChange={setAcceptedLegal} />
        {err && <p className="auth-error" style={{ color: '#b91c1c' }}>{err}</p>}
        <button type="submit" className="auth-button" disabled={loading || mismatch || !acceptedLegal}>
          {loading ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>

      <SocialAuthButtons redirectTo={explicitNext || undefined} />

      <div className="auth-footer">
        ¿Ya tienes cuenta? <Link to={`/login${loc.search}`} state={loc.state} className="auth-link">Inicia sesión</Link>
      </div>
      <div className="auth-cta auth-pro" style={{ marginTop: 24, textAlign: 'center', color: '#3F4A3C' }}>
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
