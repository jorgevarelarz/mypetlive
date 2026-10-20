import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppRoutes from './AppRoutes';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';

// Mock react-router-dom completely to avoid resolver issues
jest.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }: any) => <div>{children}</div>,
  Routes: ({ children }: any) => <div>{children}</div>,
  Route: () => null,
  Navigate: () => null,
  useNavigate: () => jest.fn(),
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
  NavLink: ({ children, to }: any) => <a href={to}>{children}</a>,
  useLocation: () => ({ pathname: '/' }),
}), { virtual: true });

// Mock other external dependencies
jest.mock('axios', () => {
  const axiosMock = {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  } as any;
  axiosMock.create = jest.fn(() => axiosMock);
  return { __esModule: true, default: axiosMock };
}, { virtual: true });
jest.mock('@stripe/stripe-js', () => ({ loadStripe: jest.fn(async () => null) }), { virtual: true });

test('la app renderiza sin crashear', () => {
  // AuthProvider usa la caché de React Query (la vacía al cambiar de cuenta), igual que en index.tsx.
  render(
    <QueryClientProvider client={new QueryClient()}>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          {/* App needs to be inside a Router, even a mocked one */}
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
    </QueryClientProvider>
  );
  expect(true).toBe(true);
});
