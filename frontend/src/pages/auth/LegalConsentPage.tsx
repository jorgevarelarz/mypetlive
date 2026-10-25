import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { LegalDoc } from "../../api/legal";
import { renderMarkdown } from "../../utils/legalMarkdown";
import { MPL, MPL_FONT_DISPLAY } from "../../styles/mypetlive";
import DeleteAccountPanel from "../../components/account/DeleteAccountPanel";

type Key = "terms" | "privacy";

const TITLES: Record<Key, string> = {
  terms: "Términos y condiciones",
  privacy: "Política de privacidad",
};

const needsAcceptance = (doc: LegalDoc | null | undefined, acceptedVersion: string | null | undefined) =>
  !!doc && doc.version !== acceptedVersion;

const LegalConsentPage: React.FC = () => {
  const { legalStatus, legalStatusLoading, refreshLegalStatus, acceptLegal, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as any)?.from || "/";
  const [open, setOpen] = useState<Key | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (!legalStatus && !legalStatusLoading) refreshLegalStatus();
  }, [legalStatus, legalStatusLoading, refreshLegalStatus]);

  const pending = useMemo<Key[]>(() => {
    if (!legalStatus) return [];
    return (["terms", "privacy"] as Key[]).filter(k => needsAcceptance(legalStatus[k].latest, legalStatus[k].acceptedVersion));
  }, [legalStatus]);

  useEffect(() => {
    if (legalStatus && !legalStatusLoading && pending.length === 0) navigate(from, { replace: true });
  }, [legalStatus, legalStatusLoading, pending.length, from, navigate]);

  if (!legalStatus || legalStatusLoading) {
    return <p style={{ margin: 0, color: MPL.muted }}>Cargando…</p>;
  }

  // Quien ya aceptó una versión anterior ve "hemos actualizado"; quien nunca
  // aceptó (alta antigua o por API) ve el texto de bienvenida.
  const isUpdate = pending.some(k => !!legalStatus[k].acceptedVersion);

  const acceptAll = async () => {
    setSaving(true);
    setError("");
    try {
      for (const key of pending) {
        const doc = legalStatus[key].latest;
        if (doc) await acceptLegal(key, doc.version);
      }
    } catch {
      setError("No hemos podido guardar tu aceptación. Inténtalo de nuevo.");
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <header style={{ display: "grid", gap: 8 }}>
        <h1 style={{ margin: 0, fontFamily: MPL_FONT_DISPLAY, fontSize: 26, fontWeight: 800, color: MPL.ink }}>
          {isUpdate ? "Hemos actualizado nuestras condiciones" : "Antes de empezar"}
        </h1>
        <p style={{ margin: 0, color: MPL.muted, fontSize: 14.5, lineHeight: 1.5 }}>
          Para seguir usando MyPetLive necesitamos que aceptes {pending.length > 1 ? "estos documentos" : "este documento"}.
          Puedes leerlos aquí antes de continuar.
        </p>
      </header>

      <div style={{ display: "grid", gap: 10 }}>
        {pending.map(key => {
          const doc = legalStatus[key].latest!;
          const expanded = open === key;
          return (
            <section key={key} style={{ border: `1px solid ${MPL.border}`, borderRadius: 14, background: "#fff", overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : key)}
                aria-expanded={expanded}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 16px", background: "none", border: 0, font: "inherit", cursor: "pointer", color: MPL.ink, textAlign: "left" }}
              >
                <span>
                  <strong style={{ display: "block", fontSize: 15 }}>{TITLES[key]}</strong>
                  <span style={{ fontSize: 12.5, color: MPL.muted }}>Versión {doc.version}</span>
                </span>
                <span style={{ color: MPL.teal, fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap" }}>{expanded ? "Ocultar" : "Leer"}</span>
              </button>
              {expanded && (
                <div
                  className="legal-consent-doc"
                  style={{ maxHeight: 320, overflowY: "auto", padding: "0 16px 16px", fontSize: 14, lineHeight: 1.55, color: MPL.ink, borderTop: `1px solid ${MPL.border}` }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.content) }}
                />
              )}
            </section>
          );
        })}
      </div>

      <button type="button" className="auth-button" onClick={acceptAll} disabled={saving}>
        {saving ? "Guardando…" : "Acepto y continúo"}
      </button>
      {error && <p role="alert" style={{ margin: 0, color: MPL.coralDark, fontSize: 13.5 }}>{error}</p>}

      <p style={{ margin: 0, fontSize: 12.5, color: MPL.muted, lineHeight: 1.5 }}>
        Guardamos la fecha y la versión que aceptas. Si no estás de acuerdo, puedes{" "}
        <button type="button" onClick={() => { logout(); navigate("/", { replace: true }); }}
          style={{ background: "none", border: 0, padding: 0, font: "inherit", color: MPL.teal, textDecoration: "underline", cursor: "pointer" }}>
          cerrar sesión
        </button>{" "}
        o{" "}
        <button type="button" onClick={() => setShowDelete(v => !v)}
          style={{ background: "none", border: 0, padding: 0, font: "inherit", color: MPL.teal, textDecoration: "underline", cursor: "pointer" }}>
          borrar tu cuenta
        </button>.
      </p>
      {/* Aquí y no en el perfil: el perfil exige haber aceptado antes. */}
      {showDelete && <DeleteAccountPanel startOpen onClose={() => setShowDelete(false)} />}
      <style>{`
        .legal-consent-doc h2 { font-size: 17px; margin: 16px 0 6px; }
        .legal-consent-doc h3, .legal-consent-doc h4, .legal-consent-doc h5 { font-size: 15px; margin: 14px 0 4px; }
        .legal-consent-doc p { margin: 8px 0; }
        .legal-consent-doc ul { padding-left: 18px; }
        .legal-consent-doc table { border-collapse: collapse; display: block; overflow-x: auto; font-size: 13px; }
        .legal-consent-doc th, .legal-consent-doc td { border: 1px solid ${MPL.border}; padding: 6px 8px; text-align: left; }
      `}</style>
    </div>
  );
};

export default LegalConsentPage;
