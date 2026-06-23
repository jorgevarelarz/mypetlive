import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { LegalDoc } from "../../api/legal";

const LegalConsentPage: React.FC = () => {
  const {
    legalStatus,
    legalStatusLoading,
    refreshLegalStatus,
    acceptLegal,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as any)?.from || "/";

  useEffect(() => {
    if (!legalStatus && !legalStatusLoading) {
      refreshLegalStatus();
    }
  }, [legalStatus, legalStatusLoading, refreshLegalStatus]);

  const needsAcceptance = (doc: LegalDoc | null, acceptedVersion: string | null) => {
    if (!doc) return false;
    return doc.version !== acceptedVersion;
  };

  const statusReady = legalStatus && !legalStatusLoading;

  const allAccepted =
    statusReady &&
    !needsAcceptance(legalStatus?.terms.latest || null, legalStatus?.terms.acceptedVersion || null) &&
    !needsAcceptance(legalStatus?.privacy.latest || null, legalStatus?.privacy.acceptedVersion || null);

  useEffect(() => {
    if (statusReady && allAccepted) {
      navigate(from, { replace: true });
    }
  }, [statusReady, allAccepted, from, navigate]);

  if (!legalStatus || legalStatusLoading) {
    return <p style={{ margin: 0 }}>Cargando documentación legal…</p>;
  }

  const sections: Array<{
    key: "terms" | "privacy";
    title: string;
    description: string;
  }> = [
    {
      key: "terms",
      title: "Términos y condiciones",
      description: "Debes aceptar la versión vigente para continuar usando la plataforma.",
    },
    {
      key: "privacy",
      title: "Política de privacidad",
      description: "Explica cómo tratamos tus datos personales. Acepta para continuar.",
    },
  ];

  const onAccept = async (key: "terms" | "privacy") => {
    const doc = legalStatus[key].latest;
    if (!doc) return;
    await acceptLegal(key, doc.version);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <header style={{ display: "grid", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Documentación legal pendiente</h1>
        <p style={{ margin: 0, color: "#475569" }}>
          Para seguir usando MyPetLive necesitas revisar y aceptar los documentos legales actualizados. Puedes descargar
          o copiar el texto para revisarlo con tu equipo legal.
        </p>
      </header>
      <div style={{ display: "grid", gap: 20 }}>
        {sections.map(section => {
          const doc = legalStatus[section.key].latest;
          const acceptedVersion = legalStatus[section.key].acceptedVersion;
          const pending = needsAcceptance(doc || null, acceptedVersion || null);
          return (
            <section key={section.key} style={cardStyle}>
              <header style={{ display: "grid", gap: 4 }}>
                <h2 style={{ margin: 0 }}>{section.title}</h2>
                <p style={{ margin: 0, color: "#64748b" }}>{section.description}</p>
                <div style={{ fontSize: 14, color: "#475569" }}>
                  <span style={{ fontWeight: 600 }}>Versión vigente:</span> {doc?.version || "No disponible"}
                  {acceptedVersion && (
                    <>
                      {" · "}
                      <span>Última aceptada: {acceptedVersion}</span>
                    </>
                  )}
                </div>
              </header>
              <textarea
                readOnly
                value={doc?.content || "No hay contenido disponible para este documento."}
                style={textareaStyle}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: pending ? "#b91c1c" : "#047857", fontWeight: 600 }}>
                  {pending ? "Pendiente de aceptación" : "Versión aceptada"}
                </span>
                <button
                  type="button"
                  disabled={!pending}
                  style={{
                    ...buttonStyle,
                    background: pending ? "#1d4ed8" : "#94a3b8",
                    cursor: pending ? "pointer" : "not-allowed",
                  }}
                  onClick={() => onAccept(section.key)}
                >
                  Aceptar versión {doc?.version || ""}
                </button>
              </div>
            </section>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
        Guardaremos fecha y versión aceptada para asegurar la trazabilidad de tu consentimiento.
      </p>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 20,
  display: "grid",
  gap: 12,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 180,
  resize: "vertical",
  border: "1px solid #cbd5f5",
  borderRadius: 12,
  padding: 12,
  background: "#f8fafc",
  fontFamily: "inherit",
  fontSize: 15,
};

const buttonStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "none",
  padding: "10px 18px",
  color: "#fff",
  fontWeight: 600,
};

export default LegalConsentPage;
