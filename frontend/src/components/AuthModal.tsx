import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "../context/LanguageContext";
import { AuthApiError } from "../api/authApi";

interface Props {
  initialMode?: "login" | "register";
  onClose: () => void;
  onSuccess?: () => void;
}

export default function AuthModal({ initialMode = "login", onClose, onSuccess }: Props) {
  const { login, register } = useAuth();
  const { t } = useTranslation();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : t("auth.error_generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card__header">
          <h2>{mode === "login" ? t("auth.login_title") : t("auth.register_title")}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("auth.close")}>
            ✕
          </button>
        </div>

        <form className="trip-form" onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}

          <div className="field">
            <label htmlFor="auth-email">{t("auth.email")}</label>
            <input
              id="auth-email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {mode === "register" && (
            <div className="field">
              <label htmlFor="auth-name">{t("auth.display_name")}</label>
              <input id="auth-name" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          )}

          <div className="field">
            <label htmlFor="auth-password">{t("auth.password")}</label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="trip-form__actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading && <span className="spinner" />}
              {mode === "login" ? t("auth.login_submit") : t("auth.register_submit")}
            </button>
          </div>

          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setError(null);
              setMode(mode === "login" ? "register" : "login");
            }}
          >
            {mode === "login" ? t("auth.switch_to_register") : t("auth.switch_to_login")}
          </button>
        </form>
      </div>
    </div>
  );
}
