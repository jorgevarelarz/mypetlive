import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from '@tanstack/react-query';
import {
  User,
  getStoredUser,
  login as apiLogin,
  logout as apiLogout,
  socialLogin as apiSocialLogin,
  SocialProvider,
  bootstrapAuthHeader,
} from "../api/auth";
import { nativePushAvailable, disableNativePush, refreshNativePush } from '../utils/nativePush';
import {
  LegalStatus,
  getLegalStatus,
  acceptLegal as apiAcceptLegal,
} from "../api/legal";

type AuthCtx = {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  loginWithProvider: (provider: SocialProvider, idToken: string, name?: string) => Promise<User>;
  logout: () => void;
  updateUser: (patch: Partial<User>) => void;
  hasRole: (...roles: User["role"][]) => boolean;
  legalStatus: LegalStatus | null;
  legalStatusLoading: boolean;
  legalStatusError: boolean;
  refreshLegalStatus: () => Promise<void>;
  acceptLegal: (slug: "terms" | "privacy", version: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const sessionGeneration = useRef(0);
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [legalStatus, setLegalStatus] = useState<LegalStatus | null>(null);
  const [legalStatusLoading, setLegalStatusLoading] = useState(false);
  const [legalStatusError, setLegalStatusError] = useState(false);

  const refreshLegalStatus = useCallback(async () => {
    if (!user?.token) {
      setLegalStatus(null);
      return;
    }
    const generation = sessionGeneration.current;
    try {
      setLegalStatusLoading(true);
      const status = await getLegalStatus();
      if (generation !== sessionGeneration.current) return;
      setLegalStatus(status);
      setLegalStatusError(false);
    } catch (error) {
      if (generation !== sessionGeneration.current) return;
      // Falla EN CERRADO: si no sabemos si aceptó, no se le deja pasar. Antes
      // el error se tragaba aquí, legalStatus quedaba null y la comprobación
      // de ProtectedRoute lo interpretaba como "no hay nada pendiente".
      console.error("Error fetching legal status", error);
      setLegalStatus(null);
      setLegalStatusError(true);
    } finally {
      if (generation === sessionGeneration.current) setLegalStatusLoading(false);
    }
  }, [user?.token]);

  const acceptLegal = useCallback(async (slug: "terms" | "privacy", version: string) => {
    await apiAcceptLegal(slug, version);
    await refreshLegalStatus();
  }, [refreshLegalStatus]);

  useEffect(() => {
    bootstrapAuthHeader();
  }, []);

  useEffect(() => {
    if (!user) {
      setLegalStatus(null);
      return;
    }
    refreshLegalStatus();
  }, [user, refreshLegalStatus]);

  const login = async (email: string, password: string) => {
    const u = await apiLogin(email, password);
    sessionGeneration.current += 1;
    queryClient.clear();
    setLegalStatus(null);
    setLegalStatusError(false);
    setLegalStatusLoading(true);
    setUser(u);
    return u;
  };

  const loginWithProvider = async (provider: SocialProvider, idToken: string, name?: string) => {
    const u = await apiSocialLogin(provider, idToken, name);
    sessionGeneration.current += 1;
    queryClient.clear();
    setLegalStatus(null);
    setLegalStatusError(false);
    setLegalStatusLoading(true);
    setUser(u);
    return u;
  };

  const logout = () => {
    sessionGeneration.current += 1;
    // Este móvil deja de recibir los avisos de la cuenta que sale.
    if (nativePushAvailable()) void disableNativePush(user?.token);
    apiLogout();
    // clear() cancela consultas: una respuesta de A no repuebla la caché de B.
    queryClient.clear();
    setUser(null);
    setLegalStatus(null);
    setLegalStatusError(false);
    setLegalStatusLoading(false);
  };

  // App de iPhone con sesión y permiso ya dado: renovar el token de notificaciones.
  useEffect(() => {
    if (user?.token && nativePushAvailable()) void refreshNativePush().catch(() => undefined);
  }, [user?.token]);

  // Mezcla cambios en el usuario en memoria + localStorage (preserva el token).
  const updateUser = useCallback((patch: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const next: User = { ...prev, ...patch, token: prev.token };
      try {
        localStorage.setItem("user", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const hasRole = (...roles: User["role"][]) => !!user && roles.includes(user.role);

  const token = user?.token ?? null;

  return (
    <Ctx.Provider
      value={{
        token,
        user,
        login,
        loginWithProvider,
        logout,
        updateUser,
        hasRole,
        legalStatus,
        legalStatusLoading,
        legalStatusError,
        refreshLegalStatus,
        acceptLegal,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
