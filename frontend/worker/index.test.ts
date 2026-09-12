import { describe, expect, it } from "vitest";
import { buildUpstreamUrl } from "./index";

describe("buildUpstreamUrl", () => {
  it("reemplaza el origen por el de la API y conserva el path", () => {
    const result = buildUpstreamUrl(
      "https://ruta210.example.com/api/auth/login/",
      "https://eld-trip-planner-api-wkzt.onrender.com"
    );
    expect(result).toBe("https://eld-trip-planner-api-wkzt.onrender.com/api/auth/login/");
  });

  it("conserva el query string", () => {
    const result = buildUpstreamUrl(
      "https://ruta210.example.com/api/trips/history/?page=2",
      "https://eld-trip-planner-api-wkzt.onrender.com"
    );
    expect(result).toBe("https://eld-trip-planner-api-wkzt.onrender.com/api/trips/history/?page=2");
  });

  it("no le importa con qué host/esquema llegó la request, siempre apunta al origen configurado", () => {
    const result = buildUpstreamUrl("http://127.0.0.1:8787/api/auth/me/", "https://api.example.com");
    expect(result).toBe("https://api.example.com/api/auth/me/");
  });

  it("tolera una barra final en API_ORIGIN sin duplicarla", () => {
    const result = buildUpstreamUrl("https://ruta210.example.com/api/auth/refresh/", "https://api.example.com/");
    expect(result).toBe("https://api.example.com/api/auth/refresh/");
  });
});
