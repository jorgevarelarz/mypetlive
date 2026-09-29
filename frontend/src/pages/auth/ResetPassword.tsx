import React, { useMemo, useState } from "react";
import PasswordField from '../../components/auth/PasswordField';
import { Link } from "react-router-dom";
import { resetPassword as apiResetPassword } from "../../api/auth";

// La API responde `{ code, message }`; leer `data.error` dejaba todos los fallos
// en el texto genérico y la usuaria no sabía que el enlace ya estaba gastado.
function resetErrorMessage(error: any): string {
  const data = error?.response?.data || {};
  if (data.code === "token_invalid") {
    return "Este enlace ya se ha usado o ha caducado. Si ya cambiaste la contraseña, inicia sesión con la nueva; si no, pide un enlace nuevo.";
  }
  if (error?.response?.status === 429) {
    return data.message || "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
  }
  const validation = Array.isArray(data.errors) ? data.errors[0]?.msg : undefined;
  return data.message || validation || data.error || "No se pudo restablecer la contraseña. Inténtalo más tarde.";
}

const containerStyle: React.CSSProperties = {
  maxWidth: 360,
  margin: "64px auto",
  padding: 24,
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "#fff",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 16,
  padding: "10px 16px",
  backgroundColor: "#1890ff",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  marginTop: 8,
  border: "1px solid #ccc",
  borderRadius: 4,
};

const messageStyle: React.CSSProperties = {
  marginTop: 16,
  fontSize: 14,
};

const ResetPassword: React.FC = () => {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      setStatus("error");
      setErrorMessage("Token no válido. Revisa el enlace de recuperación.");
      return;
    }
    setLoading(true);
    setStatus("idle");
    setErrorMessage("");
    try {
      await apiResetPassword(token, password);
      setStatus("success");
    } catch (error: any) {
      console.error("Error resetting password", error);
      setErrorMessage(resetErrorMessage(error));
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <h2>Restablecer contraseña</h2>
      {status === "success" ? (
        // El enlace es de un solo uso: si el formulario seguía a la vista, la usuaria
        // lo reenviaba, recibía "token inválido" y creía que no había funcionado.
        <>
          <p style={{ ...messageStyle, color: "#389e0d" }}>
            Tu contraseña se ha actualizado correctamente. Ya puedes iniciar sesión con la nueva clave.
          </p>
          <Link to="/login" style={{ ...buttonStyle, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
            Iniciar sesión
          </Link>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <label htmlFor="password">Nueva contraseña</label>
          <PasswordField
            id="password"
            required
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            style={inputStyle}
          />
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#666' }}>Usa entre 12 y 72 caracteres.</p>
          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </form>
      )}
      {status === "error" && (
        <>
          <p style={{ ...messageStyle, color: "#cf1322" }}>{errorMessage || "Error al restablecer la contraseña."}</p>
          <p style={{ ...messageStyle, marginTop: 8 }}>
            <Link to="/login">Iniciar sesión</Link> · <Link to="/forgot-password">Pedir un enlace nuevo</Link>
          </p>
        </>
      )}
    </div>
  );
};

export default ResetPassword;
