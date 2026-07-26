import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Project root (one level up from frontend/), where the mkcert-generated
// cert/key pair lives. Filenames are tied to the specific LAN IP they were
// issued for (mkcert's own naming convention) -- if that IP changes (new
// wifi, DHCP lease renewal), regenerate the cert and update these two
// filenames to match.
const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const certFile = path.join(repoRoot, '10.66.160.89+1.pem');
const keyFile = path.join(repoRoot, '10.66.160.89+1-key.pem');

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Same as running `vite --host`: bind to all network interfaces (not
    // just localhost) so other devices on the same wifi can reach this.
    host: true,
    https: {
      cert: fs.readFileSync(certFile),
      key: fs.readFileSync(keyFile),
    },
    // Vite's DNS-rebinding protection otherwise rejects requests whose Host
    // header isn't localhost/127.0.0.1 -- needed here specifically because
    // the whole point is reaching this over the LAN IP from other devices.
    allowedHosts: true,
  },
});
