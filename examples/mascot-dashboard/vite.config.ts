import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@aisnitch/client': '../../packages/client/src/index.ts'
    }
  },
  server: {
    port: 5173,
  },
});
