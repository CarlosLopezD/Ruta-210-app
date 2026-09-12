// Cloudflare Worker that sits in front of the static frontend build.
//
// Why this exists: the httpOnly refresh-token cookie the backend sets
// (see backend/accounts/cookies.py) needs `SameSite=Lax` to be usable
// without a separate CSRF-token scheme, and `SameSite=Lax` cookies are only
// sent by the browser on same-site requests. The frontend
// (ruta-210-app.pages? no — *.workers.dev / the custom domain) and the
// Django API (*.onrender.com) are different sites, so without this proxy
// the cookie would never reach the API at all.
//
// This worker makes them the same site from the browser's point of view:
// requests to /api/* are forwarded server-to-server to the real Django
// backend (see API_ORIGIN below), and everything else falls through to the
// static assets (the built React app) via `run_worker_first` in
// wrangler.jsonc — this fetch handler only runs at all for the paths listed
// there, everything else is served as a static asset without ever reaching
// this code.
//
// Cookies aren't handled specially here on purpose: `Cookie` on the way in
// and `Set-Cookie` on the way out are ordinary headers that `fetch` already
// forwards untouched — see buildUpstreamUrl/handleRequest below.

export interface Env {
  // Set in wrangler.jsonc's top-level "vars" — the Django backend's origin,
  // e.g. "https://eld-trip-planner-api-wkzt.onrender.com". No trailing slash.
  API_ORIGIN: string;
}

// Pure and dependency-free on purpose so it can be unit-tested with plain
// Vitest, no Miniflare/Cloudflare runtime required: given the incoming
// request's URL and the configured API origin, returns the URL to fetch
// upstream. Only the path and query string cross over — the incoming
// scheme/host are irrelevant, since we're always sending this request to
// API_ORIGIN regardless of what this Worker itself is reached as.
export function buildUpstreamUrl(requestUrl: string, apiOrigin: string): string {
  const incoming = new URL(requestUrl);
  const origin = apiOrigin.replace(/\/+$/, "");
  return `${origin}${incoming.pathname}${incoming.search}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const upstreamUrl = buildUpstreamUrl(request.url, env.API_ORIGIN);
    // Cloning the request this way (rather than building a fresh Request
    // with individually-copied fields) preserves method, headers — Cookie
    // and Authorization included — and body exactly as the browser sent
    // them; only the URL changes.
    const upstreamRequest = new Request(upstreamUrl, request);
    // Returned as-is: Set-Cookie and every other response header (and the
    // body) pass straight back to the browser.
    return fetch(upstreamRequest);
  },
};
