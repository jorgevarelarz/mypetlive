import React, { useState } from 'react';
import { register } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { useToast } from '../context/ToastContext';
import { useEffect } from 'react';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const { login: loginCtx } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  useEffect(() => {
    // Si ya hay sesión, redirige al dashboard
    if (localStorage.getItem('user')) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegister) {
        await register(name, email, password);
      }
      const user = await loginCtx(email, password);
      navigate(user?.role === 'tenant' ? '/home' : '/dashboard', { replace: true });
    } catch (err: any) {
      const code = err?.response?.data?.code || err?.response?.data?.error;
      let msg = err?.response?.data?.message || 'Error';
      if (code === 'email_in_use') msg = 'Ese correo ya está registrado';
      if (code === 'missing_fields') msg = 'Completa los campos requeridos';
      setError(msg);
      push({ title: msg, tone: 'error' });
    }
  };

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
      <Card style={{ width: 420, padding: 24 }}>
        <form onSubmit={handleSubmit}>
          <h1 style={{ marginTop: 0 }}>{isRegister ? 'Registro' : 'Login'}</h1>
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            {isRegister && (
              <Input label="Nombre" placeholder="Tu nombre" value={name} onChange={e => setName(e.target.value)} required />
            )}
            <Input label="Correo" type="email" placeholder="correo@dominio.com" value={email} onChange={e => setEmail(e.target.value)} required />
            <Input label="Contraseña" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            <Button type="submit">{isRegister ? 'Registrar' : 'Entrar'}</Button>
            <p style={{ textAlign: 'center' }}>
              {isRegister ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
              <button type="button" onClick={() => setIsRegister(!isRegister)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}>
                {isRegister ? 'Inicia sesión' : 'Regístrate'}
              </button>
            </p>
            {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}
          </div>
        </form>
      </Card>
    </div>
  );
};

export default Login;
