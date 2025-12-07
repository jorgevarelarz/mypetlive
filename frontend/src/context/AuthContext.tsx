import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  User,
  getStoredUser,
  login as apiLogin,
  logout as apiLogout,
  bootstrapAuthHeader,
} from "../api/auth";
import {
  LegalStatus,
  getLegalStatus,
  acceptLegal as apiAcceptLegal,
} from "../api/legal";

type AuthCtx = {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  hasRole: (...roles: User["role"][]) => boolean;
  legalStatus: LegalStatus | null;
  legalStatusLoading: boolean;
  refreshLegalStatus: () => Promise<void>;
  acceptLegal: (slug: "terms" | "privacy", version: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [legalStatus, setLegalStatus] = useState<LegalStatus | null>(null);
  const [legalStatusLoading, setLegalStatusLoading] = useState(false);

  const refreshLegalStatus = useCallback(async () => {
    if (!user?.token) {
      setLegalStatus(null);
      return;
    }
    try {
      setLegalStatusLoading(true);
      const status = await getLegalStatus();
      setLegalStatus(status);
    } catch (error) {
      console.error("Error fetching legal status", error);
    } finally {
      setLegalStatusLoading(false);
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
    setUser(u);
    await refreshLegalStatus();
    return u;
  };

  const logout = () => {
    apiLogout();
    setUser(null);
    setLegalStatus(null);
  };

  const hasRole = (...roles: User["role"][]) => !!user && roles.includes(user.role);

  const token = user?.token ?? null;

  return (
    <Ctx.Provider
      value={{
        token,
        user,
        login,
        logout,
        hasRole,
        legalStatus,
        legalStatusLoading,
        refreshLegalStatus,
        acceptLegal,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
