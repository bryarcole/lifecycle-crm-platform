import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const demoMode = process.env.VITE_DEMO_MODE === 'true';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  server: {
    proxy: demoMode ? undefined : { '/api': 'http://localhost:4201' },
  },
});
