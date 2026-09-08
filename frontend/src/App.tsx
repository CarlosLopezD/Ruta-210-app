import { BrowserRouter, Routes, Route } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./app.css";
import { ThemeProvider } from "./context/ThemeContext";
import { LanguageProvider } from "./context/LanguageContext";
import { AuthProvider } from "./context/AuthContext";
import Header from "./components/Header";
import PlannerPage from "./pages/PlannerPage";
import HistoryPage from "./pages/HistoryPage";

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
              </Routes>
            </div>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
