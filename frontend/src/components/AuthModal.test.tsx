import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthModal from "./AuthModal";
import { AuthProvider } from "../context/AuthContext";
import { LanguageProvider } from "../context/LanguageContext";
import { AuthApiError } from "../api/authApi";
import * as authApi from "../api/authApi";

// Mock the whole api/authApi module so no real network call is ever made —
// AuthApiError itself is kept real (both AuthModal and AuthContext use
// `instanceof AuthApiError` to decide how to render an error).
vi.mock("../api/authApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/authApi")>();
  return {
    ...actual,
    login: vi.fn(),
    register: vi.fn(),
    resendVerification: vi.fn(),
    requestPasswordReset: vi.fn(),
    refreshAccessToken: vi.fn(),
    logoutRequest: vi.fn(),
  };
});

function renderModal(initialMode?: "login" | "register") {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  render(
    <LanguageProvider>
      <AuthProvider>
        <AuthModal initialMode={initialMode} onClose={onClose} onSuccess={onSuccess} />
      </AuthProvider>
    </LanguageProvider>
  );
  return { onClose, onSuccess };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // LanguageProvider defaults to the browser's language when nothing is
  // stored yet, which in jsdom is "en" — force Spanish so these tests match
  // the app's default language for real users instead of the test runner's.
  localStorage.setItem("eld-trip-planner:lang", "es");
});

describe("AuthModal", () => {
  it("muestra el formulario de login por defecto", () => {
    renderModal();
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre (opcional)")).not.toBeInTheDocument();
  });

  it("cambia a registro y muestra el campo de nombre", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: "¿No tenés cuenta? Registrate" }));
    expect(screen.getByRole("heading", { name: "Crear cuenta" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre (opcional)")).toBeInTheDocument();
  });

  it("hace login exitoso, llama onSuccess y cierra el modal", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockResolvedValue({
      access: "access-token",
      user: { id: 1, email: "carlos@example.com", display_name: "Carlos", is_email_verified: true },
    });
    const { onClose, onSuccess } = renderModal();

    await user.type(screen.getByLabelText("Email"), "carlos@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "supersecreta123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(authApi.login).toHaveBeenCalledWith("carlos@example.com", "supersecreta123");
  });

  it("si la cuenta no está verificada, muestra el link de reenvío y lo hace funcionar", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockRejectedValue(
      new AuthApiError("Confirmá tu email antes de iniciar sesión. Revisá tu bandeja de entrada.", 400, "email_not_verified")
    );
    vi.mocked(authApi.resendVerification).mockResolvedValue({ detail: "ok" });
    renderModal();

    await user.type(screen.getByLabelText("Email"), "sinverificar@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "supersecreta123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Confirmá tu email antes de iniciar sesión. Revisá tu bandeja de entrada.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reenviar email de verificación" }));

    await waitFor(() => expect(authApi.resendVerification).toHaveBeenCalledWith("sinverificar@example.com"));
    expect(await screen.findByText("Listo, revisá tu bandeja de entrada.")).toBeInTheDocument();
  });

  it("al registrarse con éxito muestra la confirmación y NO cierra el modal", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.register).mockResolvedValue({
      detail: "Cuenta creada. Revisá tu email para confirmarla antes de iniciar sesión.",
      email: "nuevo@example.com",
    });
    const { onClose } = renderModal("register");

    await user.type(screen.getByLabelText("Email"), "nuevo@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "supersecreta123");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText(/nuevo@example\.com/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("el flujo de recuperar contraseña pide el email y muestra el mensaje genérico", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.requestPasswordReset).mockResolvedValue({ detail: "ok" });
    renderModal();

    await user.click(screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }));
    expect(screen.getByRole("heading", { name: "Recuperar contraseña" })).toBeInTheDocument();
    // Password field shouldn't be asked for in this mode.
    expect(screen.queryByLabelText("Contraseña")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Email"), "cualquiera@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar instrucciones" }));

    expect(
      await screen.findByText("Si existe una cuenta con ese email, te enviamos instrucciones para restablecer tu contraseña.")
    ).toBeInTheDocument();
    expect(authApi.requestPasswordReset).toHaveBeenCalledWith("cualquiera@example.com");
  });

  it("muestra el mensaje de error genérico ante un fallo no tipado (ej. de red)", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.requestPasswordReset).mockRejectedValue(new Error("network down"));
    renderModal();

    await user.click(screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }));
    await user.type(screen.getByLabelText("Email"), "x@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar instrucciones" }));

    expect(await screen.findByText("Ocurrió un error. Revisá los datos e intentá de nuevo.")).toBeInTheDocument();
  });

  it("un fallo de red en login muestra el mensaje genérico TRADUCIDO, no un texto en inglés hardcodeado", async () => {
    const user = userEvent.setup();
    // A raw network failure — fetch itself throwing — not an AuthApiError
    // from the API. Regression test for a bug where AuthContext used to
    // rewrap this into a hardcoded English "Login failed", bypassing i18n.
    vi.mocked(authApi.login).mockRejectedValue(new TypeError("Failed to fetch"));
    renderModal();

    await user.type(screen.getByLabelText("Email"), "carlos@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "supersecreta123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Ocurrió un error. Revisá los datos e intentá de nuevo.")).toBeInTheDocument();
    expect(screen.queryByText(/login failed/i)).not.toBeInTheDocument();
  });

  it("un fallo de red en registro muestra el mensaje genérico TRADUCIDO, no un texto en inglés hardcodeado", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.register).mockRejectedValue(new TypeError("Failed to fetch"));
    renderModal("register");

    await user.type(screen.getByLabelText("Email"), "nuevo@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "supersecreta123");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText("Ocurrió un error. Revisá los datos e intentá de nuevo.")).toBeInTheDocument();
    expect(screen.queryByText(/register failed/i)).not.toBeInTheDocument();
  });
});
