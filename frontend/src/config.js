// In production (deployed to Render/Vercel/Netlify/etc.), the frontend and
// backend are two separate services on two different domains, so the
// backend's URL can no longer be derived from the page's own origin --
// VITE_BACKEND_URL is baked in at build time (any Vite env var prefixed
// VITE_ is embedded into the built JS) to the backend's real deployed URL.
//
// Falls back to deriving from the current page's origin when that env var
// isn't set, which is what keeps local dev working: `npm run dev` (and the
// mkcert HTTPS-over-LAN setup, where the page might be reached as
// https://10.66.160.89:5173 from another device) both continue to work
// without needing a .env file.
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || `${window.location.protocol}//${window.location.hostname}:3001`;
