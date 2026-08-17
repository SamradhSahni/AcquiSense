import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    // Proxy API calls to Node server (avoids CORS in dev)
    proxy: {
      '/api': {
        target: 'http://server:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'ws://server:4000',
        ws: true,
      },
    },
  },
  define: {
    'process.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || 'http://localhost:4000'),
    'process.env.VITE_WS_URL': JSON.stringify(process.env.VITE_WS_URL || 'ws://localhost:4000'),
  },
});
