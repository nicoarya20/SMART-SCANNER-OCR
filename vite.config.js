import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Accept temporary Cloudflare Quick Tunnel host names during remote mobile testing.
    allowedHosts: ['.trycloudflare.com'],
  },
});
