import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Dev proxy so `pnpm dev` works against the local M2 server (packages/server): the
  // WebSocket endpoint lives on the same port as the built client.
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
});
