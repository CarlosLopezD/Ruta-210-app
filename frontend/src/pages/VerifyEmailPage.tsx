import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmail, AuthApiError } from "../api/authApi";
import { useTranslation } from "../context/LanguageContext";

type Status = "verifying" | "success" | "error";

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const uid = params.get("uid");
    const token = params.get("token");
    if (!uid || !token) {
      setStatus("error");
      setMessage(t("auth.verify_invalid_link"));
      return;
    }
    verifyEmail(uid, token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof AuthApiError ? err.message : t("auth.verify_invalid_link"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="auth-page">
      <h1>{t("auth.verify_title")}</h1>
      {status === "verifying" && <p>{t("auth.verify_pending")}</p>}
      {status === "success" && (
        <div className="alert alert-success">
          {t("auth.verify_success")} <Link to="/">{t("auth.verify_go_home")}</Link>
        </div>
      )}
      {status === "error" && <div className="alert alert-error">{message}</div>}
    </div>
  );
}
