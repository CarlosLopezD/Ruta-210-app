import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useTranslation } from "../context/LanguageContext";
import type { Language } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import AuthModal from "./AuthModal";

const LANGUAGES: Language[] = ["es", "en"];

export default function Header() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const langMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (langMenuRef.current && !langMenuRef.current.contains(target)) {
        setLangMenuOpen(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLangMenuOpen(false);
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Close menus on navigation.
  useEffect(() => {
    setLangMenuOpen(false);
    setAccountMenuOpen(false);
  }, [location.pathname]);

  function openAuth(mode: "login" | "register") {
    setAuthMode(mode);
    setAuthModalOpen(true);
    setAccountMenuOpen(false);
  }

  function selectLanguage(lang: Language) {
    setLanguage(lang);
    setLangMenuOpen(false);
  }

  const accountLabel = user?.display_name || user?.email || "";

  return (
    <header className="app-header">
      <div className="app-header__title">
        <h1>{t("app.title")}</h1>
        <p>{t("app.subtitle")}</p>
        <span className="app-header__badge">{t("app.badge")}</span>
      </div>

      <div className="app-header__controls">
        <nav className="app-nav">
          <Link to="/" className={location.pathname === "/" ? "app-nav__link is-active" : "app-nav__link"}>
            {t("nav.planner")}
          </Link>
          <Link
            to="/mis-viajes"
            className={location.pathname === "/mis-viajes" ? "app-nav__link is-active" : "app-nav__link"}
          >
            {t("nav.history")}
          </Link>
        </nav>

        <div className="dropdown" ref={langMenuRef}>
          <button
            type="button"
            className="dropdown__trigger"
            onClick={() => setLangMenuOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={langMenuOpen}
            aria-label={t("nav.language")}
          >
            <HamburgerIcon />
            <span className="dropdown__trigger-label">{language.toUpperCase()}</span>
            <Chevron open={langMenuOpen} />
          </button>
          {langMenuOpen && (
            <div className="dropdown__menu" role="listbox">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  role="option"
                  aria-selected={lang === language}
                  className={lang === language ? "dropdown__item is-active" : "dropdown__item"}
                  onClick={() => selectLanguage(lang)}
                >
                  <span className="dropdown__item-code">{lang.toUpperCase()}</span>
                  <span>{t(`lang.${lang}` as const)}</span>
                  {lang === language && (
                    <span className="dropdown__check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="theme-switch"
          role="switch"
          aria-checked={theme === "dark"}
          data-theme={theme}
          onClick={toggleTheme}
          aria-label={theme === "light" ? t("theme.to_dark") : t("theme.to_light")}
          title={theme === "light" ? t("theme.to_dark") : t("theme.to_light")}
        >
          <span className="theme-switch__track">
            <span className="theme-switch__icon theme-switch__icon--sun" aria-hidden="true">
              ☀️
            </span>
            <span className="theme-switch__icon theme-switch__icon--moon" aria-hidden="true">
              🌙
            </span>
            <span className="theme-switch__thumb">
              <span className="theme-switch__thumb-icon" aria-hidden="true">
                {theme === "light" ? "☀️" : "🌙"}
              </span>
            </span>
          </span>
        </button>

        <div className="dropdown" ref={accountMenuRef}>
          <button
            type="button"
            className="dropdown__trigger dropdown__trigger--account"
            onClick={() => setAccountMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            aria-label={t("nav.account")}
          >
            {isAuthenticated ? (
              <span className="dropdown__avatar" aria-hidden="true">
                {accountLabel.charAt(0).toUpperCase()}
              </span>
            ) : (
              <HamburgerIcon />
            )}
            <span className="dropdown__trigger-label">{isAuthenticated ? accountLabel : t("nav.account")}</span>
            <Chevron open={accountMenuOpen} />
          </button>

          {accountMenuOpen &&
            (isAuthenticated ? (
              <div className="dropdown__menu dropdown__menu--right" role="menu">
                <div className="dropdown__menu-label">{user?.email}</div>
                <button
                  type="button"
                  role="menuitem"
                  className="dropdown__item dropdown__item--danger"
                  onClick={() => {
                    logout();
                    setAccountMenuOpen(false);
                  }}
                >
                  {t("nav.logout")}
                </button>
              </div>
            ) : (
              <div className="dropdown__menu dropdown__menu--right" role="menu">
                <button type="button" role="menuitem" className="dropdown__item" onClick={() => openAuth("login")}>
                  {t("nav.login")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="dropdown__item dropdown__item--primary"
                  onClick={() => openAuth("register")}
                >
                  {t("nav.register")}
                </button>
              </div>
            ))}
        </div>
      </div>

      {authModalOpen && <AuthModal initialMode={authMode} onClose={() => setAuthModalOpen(false)} />}
    </header>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? "dropdown__chevron is-open" : "dropdown__chevron"}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg className="dropdown__trigger-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1.5 3.5H12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M1.5 7H12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M1.5 10.5H12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
