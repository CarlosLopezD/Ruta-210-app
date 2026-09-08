import { BrowserRouter, Routes, Route } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./app.css";
import { ThemeProvider } from "./context/ThemeContext";
import { LanguageProvider } from "./context/LanguageContext";
import { AuthProvider } from "./context/AuthContext";
import Header from "./components/Header";
import PlannerPage from "./pages/PlannerPage";
import HistoryPage from "./pages/HistoryPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <BrowserRouter>
            <div className="app-shell">
              <Header />
              <Routes>
                <Route path="/" element={<PlannerPage />} />
                <Route path="/mis-viajes" element={<HistoryPage />} />
                <Route path="/verificar-email" element={<VerifyEmailPage />} />
                <Route path="/restablecer-contrasena" element={<ResetPasswordPage />} />
              </Routes>
            </div>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
