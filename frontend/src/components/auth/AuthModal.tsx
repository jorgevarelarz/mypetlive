import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAuthModal } from '../../context/AuthModalContext';
import { register as apiRegister } from '../../api/auth';
import Brand from '../Brand';
import { toast } from 'react-hot-toast';

const palette = {
  text: '#3F4A3C',
  border: '#E7E1D5',
  accent: '#6A7B4F',
  surface: '#FFFFFF',
};

export default function AuthModal() {
  const { open, mode, message, closeAuth, setMode, fireSuccess } = useAuthModal();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'adoptante' | 'protectora'>('adoptante');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const reset = () => {
    setName('');
    setEmail('');
    setPassword('');
    setBusy(false);
  };

  const done = () => {
    reset();
    fireSuccess();
    closeAuth();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === 'register') {
        if (!name.trim()) throw new Error('Indica tu nombre');
        await apiRegister(name.trim(), email.trim(), password, role);
        await login(email.trim(), password);
        toast.success('¡Cuenta creada! Bienvenido/a 🐾');
      } else {
        await login(email.trim(), password);
        toast.success('Sesión iniciada');
      }
      done();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'No se pudo completar';
      toast.error(msg);
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(31,35,28,0.45)' }}
      onClick={closeAuth}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-xl p-6 grid gap-4"
        style={{ background: palette.surface, color: palette.text }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="grid gap-1">
            <Brand size={18} />
            <h2 className="text-xl font-semibold">{mode === 'register' ? 'Crear cuenta' : 'Entrar'}</h2>
          </div>
          <button onClick={closeAuth} aria-label="Cerrar" className="text-xl leading-none" style={{ color: '#9AA08F' }}>×</button>
        </div>

        {message && (
          <p className="text-sm rounded-lg px-3 py-2" style={{ background: '#F1F3E8', color: '#5F6B3D' }}>{message}</p>
        )}

        {/* Tabs */}
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: palette.border }}>
          <button
            type="button"
            className="flex-1 py-2 text-sm"
            style={mode === 'register' ? { background: palette.accent, color: '#fff' } : {}}
            onClick={() => setMode('register')}
          >
            Crear cuenta
          </button>
          <button
            type="button"
            className="flex-1 py-2 text-sm"
            style={mode === 'login' ? { background: palette.accent, color: '#fff' } : {}}
            onClick={() => setMode('login')}
          >
            Ya tengo cuenta
          </button>
        </div>

        <form onSubmit={onSubmit} className="grid gap-3">
          {mode === 'register' && (
            <>
              <label className="grid gap-1 text-sm">
                Nombre
                <input className="border rounded px-3 py-2" style={{ borderColor: palette.border }} value={name} onChange={e => setName(e.target.value)} required />
              </label>
              <div className="grid gap-1 text-sm">
                <span>Quiero…</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setRole('adoptante')} className="flex-1 py-2 rounded border text-sm" style={role === 'adoptante' ? { borderColor: palette.accent, background: '#F1F3E8' } : { borderColor: palette.border }}>
                    Adoptar 🐾
                  </button>
                  <button type="button" onClick={() => setRole('protectora')} className="flex-1 py-2 rounded border text-sm" style={role === 'protectora' ? { borderColor: palette.accent, background: '#F1F3E8' } : { borderColor: palette.border }}>
                    Soy protectora 🏠
                  </button>
                </div>
              </div>
            </>
          )}
          <label className="grid gap-1 text-sm">
            Email
            <input type="email" className="border rounded px-3 py-2" style={{ borderColor: palette.border }} value={email} onChange={e => setEmail(e.target.value)} required />
          </label>
          <label className="grid gap-1 text-sm">
            Contraseña
            <input type="password" className="border rounded px-3 py-2" style={{ borderColor: palette.border }} value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
            style={{ background: palette.accent, color: '#fff' }}
          >
            {busy ? 'Procesando…' : mode === 'register' ? 'Crear cuenta' : 'Entrar'}
          </button>
          {mode === 'login' && (
            <button
              type="button"
              onClick={() => { closeAuth(); navigate('/forgot-password'); }}
              className="text-sm text-center underline"
              style={{ color: palette.accent, textUnderlineOffset: 4 }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
