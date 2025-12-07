import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

type Props = {
  roles: Array<"tenant" | "landlord" | "pro" | "admin" | "store" | "vet">;
  children: React.ReactElement;
};

export default function RoleGuard({ roles, children }: Props) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    const home: Record<string, string> = {
      tenant: '/pet',
      landlord: '/landlord',
      pro: '/pro',
      admin: '/admin',
      store: '/partner',
      vet: '/partner',
    };
    return <Navigate to={home[user.role] || '/'} replace />;
  }

  return children;
}
