import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegisterPage from '../RegisterPage';
import * as authApi from '../../../api/auth';

// Lo que pidieron los primeros usuarios: que la contraseña se escriba dos veces
// y no se pueda crear la cuenta si no coinciden.

const mockNavigate = jest.fn();

// react-router-dom v7 no resuelve bajo el jest de CRA (pide 'react-router/dom').
jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
  useNavigate: () => mockNavigate,
  useLocation: () => ({ search: '', pathname: '/register', state: null }),
}), { virtual: true });

const mockLogin = jest.fn();
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ login: (...args: any[]) => mockLogin(...args) }),
}));

// Sin client ids configurados no hay botones sociales que pintar.
jest.mock('../../../components/auth/SocialAuthButtons', () => () => null);

const PASSWORD = 'una-clave-larga-2026';

function fill(password: string, repeat: string) {
  fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'Laura' } });
  fireEvent.change(screen.getByLabelText(/Correo electrónico/), {
    target: { value: 'laura@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/Repite la contraseña/), { target: { value: repeat } });
}

describe('RegisterPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(authApi, 'register').mockResolvedValue(undefined as any);
    mockLogin.mockResolvedValue({ role: 'tenant' });
  });

  it('avisa y desactiva el botón si las contraseñas no coinciden', () => {
    render(<RegisterPage />);
    fill(PASSWORD, 'otra-clave-larga-2026');

    expect(screen.getByText('Las dos contraseñas no coinciden.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crear cuenta/ })).toBeDisabled();
  });

  it('no llama al API si no coinciden', () => {
    render(<RegisterPage />);
    fill(PASSWORD, 'otra-clave-larga-2026');
    fireEvent.submit(screen.getByRole('button', { name: /Crear cuenta/ }).closest('form')!);

    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('registra cuando coinciden', async () => {
    render(<RegisterPage />);
    fill(PASSWORD, PASSWORD);

    expect(screen.queryByText('Las dos contraseñas no coinciden.')).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole('button', { name: /Crear cuenta/ }).closest('form')!);

    await waitFor(() =>
      expect(authApi.register).toHaveBeenCalledWith('Laura', 'laura@example.com', PASSWORD),
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true }));
  });
});
