import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "../context/LanguageContext";
import { AuthApiError, resendVerification, requestPasswordReset } from "../api/authApi";

interface Props {
  initialMode?: "login" | "register";
  onClose: () => void;
  onSuccess?: () => void;
}

type Mode = "login" | "register" | "forgot";

export default function AuthModal({ initialMode = "login", onClose, onSuccess }: Props) {
  const { login, register } = useAuth();
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  // Set once register/forgot-password succeed — swaps the form for a plain
  // confirmation message instead of closing the modal (there's nothing to
  // log into yet: the account still needs email confirmation).
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setError(null);
    setErrorCode(undefined);
    setSuccessMessage(null);
    setResendState("idle");
    setMode(next);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setErrorCode(undefined);
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        onSuccess?.();
        onClose();
      } else if (mode === "register") {
        const result = await register(email, password, displayName);
        setSuccessMessage(t("auth.register_check_email").replace("{email}", result.email));
      } else {
        await requestPasswordReset(email);
        // Generic message regardless of whether the account exists — the
        // backend deliberately doesn't reveal that (see accounts/views.py).
        setSuccessMessage(t("auth.forgot_sent"));
      }
    } catch (err) {
      if (err instanceof AuthApiError) {
        setError(err.message);
        setErrorCode(err.code);
      } else {
        setError(t("auth.error_generic"));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResendState("sending");
    try {
      await resendVerification(email);
    } catch {
      // the endpoint itself never errors on a known/unknown email — a
      // network failure here is the only realistic case, ignore it quietly
    } finally {
      setResendState("sent");
    }
  }

  const title =
    mode === "login" ? t("auth.login_title") : mode === "register" ? t("auth.register_title") : t("auth.forgot_title");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card__header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("auth.close")}>
            ✕
          </button>
        </div>

        {successMessage ? (
          <div className="trip-form">
            <div className="alert alert-success">{successMessage}</div>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {t("auth.close")}
            </button>
          </div>
        ) : (
          <form className="trip-form" onSubmit={handleSubmit}>
            {error && (
              <div className="alert alert-error">
                {error}
                {errorCode === "email_not_verified" && (
                  <div style={{ marginTop: "0.5rem" }}>
                    {resendState === "sent" ? (
                      <span>{t("auth.resend_sent")}</span>
                    ) : (
                      <button type="button" className="link-btn" onClick={handleResend} disabled={resendState === "sending"}>
                        {resendState === "sending" ? t("auth.resend_sending") : t("auth.resend_verification")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

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

            {mode !== "forgot" && (
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
            )}

            <div className="trip-form__actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading && <span className="spinner" />}
                {mode === "login"
                  ? t("auth.login_submit")
                  : mode === "register"
                    ? t("auth.register_submit")
                    : t("auth.forgot_submit")}
              </button>
            </div>

            {mode === "login" && (
              <button type="button" className="link-btn" onClick={() => switchMode("forgot")}>
                {t("auth.forgot_link")}
              </button>
            )}

            <button type="button" className="link-btn" onClick={() => switchMode(mode === "login" ? "register" : "login")}>
              {mode === "register" ? t("auth.switch_to_login") : mode === "forgot" ? t("auth.switch_to_login") : t("auth.switch_to_register")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
