import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../AuthContext';
import * as auth from '../../api/auth';
import { getLegalStatus } from '../../api/legal';

jest.mock('../../api/auth');
jest.mock('../../api/legal');

function SessionControls() {
  const session = useAuth();
  return <>
    <button onClick={() => { void session.login('b@test.invalid', 'synthetic'); }}>Entrar B</button>
    <button onClick={session.logout}>Salir</button>
    <output data-testid="user">{session.user?._id || 'anonymous'}</output>
    <output data-testid="legal">{JSON.stringify(session.legalStatus)}</output>
  </>;
}

beforeEach(() => {
  jest.resetAllMocks();
  (auth.getStoredUser as jest.Mock).mockReturnValue({ _id: 'A', role: 'tenant', token: 'synthetic-A' });
  (auth.login as jest.Mock).mockResolvedValue({ _id: 'B', role: 'tenant', token: 'synthetic-B' });
  (getLegalStatus as jest.Mock).mockResolvedValue({ terms: null, privacy: null });
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['my-pets'], { privateMarker: 'A' });
  render(<QueryClientProvider client={client}><AuthProvider><SessionControls /></AuthProvider></QueryClientProvider>);
  return client;
}

it('borra los datos privados al salir y al cambiar de cuenta', async () => {
  const client = setup();
  fireEvent.click(screen.getByText('Salir'));
  expect(client.getQueryData(['my-pets'])).toBeUndefined();
  expect(screen.getByTestId('user')).toHaveTextContent('anonymous');
  client.setQueryData(['my-adoptions'], { privateMarker: 'A' });
  fireEvent.click(screen.getByText('Entrar B'));
  await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('B'));
  expect(client.getQueryData(['my-adoptions'])).toBeUndefined();
  client.clear();
});

it('una respuesta tardía de la sesión anterior no recupera datos ni consentimiento', async () => {
  let resolveLegal!: (value: any) => void;
  let resolveQuery!: (value: any) => void;
  (getLegalStatus as jest.Mock).mockReturnValue(new Promise(resolve => { resolveLegal = resolve; }));
  const client = setup();
  const pending = client.fetchQuery({ queryKey: ['private'], queryFn: () => new Promise(resolve => { resolveQuery = resolve; }) }).catch(() => undefined);
  fireEvent.click(screen.getByText('Salir'));
  await act(async () => {
    resolveLegal({ privateMarker: 'A' });
    resolveQuery({ privateMarker: 'A' });
    await pending;
  });
  expect(client.getQueryData(['private'])).toBeUndefined();
  expect(screen.getByTestId('legal')).toHaveTextContent('null');
  client.clear();
});
