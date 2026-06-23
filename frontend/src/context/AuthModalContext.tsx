import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export type AuthMode = 'login' | 'register';

type OpenOpts = {
  mode?: AuthMode;
  message?: string;
  onSuccess?: () => void;
};

type Ctx = {
  open: boolean;
  mode: AuthMode;
  message?: string;
  openAuth: (opts?: OpenOpts) => void;
  closeAuth: () => void;
  setMode: (mode: AuthMode) => void;
  fireSuccess: () => void;
};

const AuthModalCtx = createContext<Ctx>(null!);

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>('register');
  const [message, setMessage] = useState<string | undefined>();
  const onSuccessRef = useRef<(() => void) | undefined>(undefined);

  const openAuth = useCallback((opts?: OpenOpts) => {
    setMode(opts?.mode ?? 'register');
    setMessage(opts?.message);
    onSuccessRef.current = opts?.onSuccess;
    setOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setOpen(false);
    setMessage(undefined);
    onSuccessRef.current = undefined;
  }, []);

  const fireSuccess = useCallback(() => {
    onSuccessRef.current?.();
  }, []);

  return (
    <AuthModalCtx.Provider value={{ open, mode, message, openAuth, closeAuth, setMode, fireSuccess }}>
      {children}
    </AuthModalCtx.Provider>
  );
}

export const useAuthModal = () => useContext(AuthModalCtx);
