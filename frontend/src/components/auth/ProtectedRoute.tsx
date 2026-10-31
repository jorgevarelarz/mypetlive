import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

type Props = {
  children: React.ReactElement;
};

export default function ProtectedRoute({ children }: Props) {
  const { user, legalStatus, legalStatusLoading, legalStatusError, refreshLegalStatus } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const hasPendingLegal = (() => {
    if (!legalStatus) return false;
    const termsOk = !legalStatus.terms.latest || legalStatus.terms.acceptedVersion === legalStatus.terms.latest.version;
    const privacyOk =
      !legalStatus.privacy.latest || legalStatus.privacy.acceptedVersion === legalStatus.privacy.latest.version;
    return !(termsOk && privacyOk);
  })();

  if (!legalStatus && legalStatusLoading) {
    return <div style={{ padding: 24 }}>Comprobando documentación legal…</div>;
  }

  // Sin estado legal no se sigue: no poder comprobar la aceptación no es lo
  // mismo que haberla obtenido.
  if (legalStatusError && !legalStatus) {
    return (
      <div style={{ padding: 24, maxWidth: 520 }} role="alert">
        <h2>No hemos podido comprobar tu aceptación de los términos</h2>
        <p>
          Es un problema temporal por nuestra parte. Vuelve a intentarlo en unos segundos; si
          persiste, escríbenos a <a href="mailto:info@mypetlive.es">info@mypetlive.es</a>.
        </p>
        <button onClick={() => { void refreshLegalStatus(); }}>Reintentar</button>
      </div>
    );
  }

  if (hasPendingLegal && location.pathname !== "/legal-consent") {
    return <Navigate to="/legal-consent" replace state={{ from: location.pathname }} />;
  }

  if (!hasPendingLegal && location.pathname === "/legal-consent") {
    return <Navigate to={location.state?.from || "/"} replace />;
  }

  return children;
}
