import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Mirrors what the Cloudflare Worker does in production (see
      // frontend/worker/): makes the page and the API the same origin from
      // the browser's point of view, so the httpOnly refresh-token cookie
      // (SameSite=Lax — see backend/accounts/cookies.py) is actually sent.
      // Without this, `npm run dev` (localhost:5173) and the backend
      // (127.0.0.1:8000) are different origins, the cookie never leaves the
      // login response, and every page reload silently logs you out. Only
      // active for `npm run dev` — the production build doesn't run a Vite
      // server at all, and `VITE_API_BASE_URL` in .env.example is empty so
      // fetches actually go through this proxy instead of straight to 8000.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
