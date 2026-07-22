import React, { useMemo, useState } from "react";
import { resetPassword as apiResetPassword } from "../../api/auth";

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
      const message =
        error?.response?.data?.error || "No se pudo restablecer la contraseña. Inténtalo más tarde.";
      setErrorMessage(message);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <h2>Restablecer contraseña</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="password">Nueva contraseña</label>
        <input
          id="password"
          type="password"
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
      {status === "success" && (
        <p style={{ ...messageStyle, color: "#389e0d" }}>
          Tu contraseña se ha actualizado correctamente. Ya puedes iniciar sesión con la nueva clave.
        </p>
      )}
      {status === "error" && (
        <p style={{ ...messageStyle, color: "#cf1322" }}>{errorMessage || "Error al restablecer la contraseña."}</p>
      )}
    </div>
  );
};

export default ResetPassword;
