import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmPasswordReset, AuthApiError } from "../api/authApi";
import { useTranslation } from "../context/LanguageContext";

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const uid = params.get("uid");
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!uid || !token) return;
    setLoading(true);
    setError(null);
    try {
      await confirmPasswordReset(uid, token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : t("auth.error_generic"));
    } finally {
      setLoading(false);
    }
  }

  if (!uid || !token) {
    return (
      <div className="auth-page">
        <h1>{t("auth.reset_title")}</h1>
        <div className="alert alert-error">{t("auth.verify_invalid_link")}</div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-page">
        <h1>{t("auth.reset_title")}</h1>
        <div className="alert alert-success">
          {t("auth.reset_success")} <Link to="/">{t("auth.verify_go_home")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>{t("auth.reset_title")}</h1>
      <form className="trip-form" onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label htmlFor="reset-password">{t("auth.reset_new_password")}</label>
          <input
            id="reset-password"
            type="password"
            required
            minLength={8}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="trip-form__actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading && <span className="spinner" />}
            {t("auth.reset_submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
