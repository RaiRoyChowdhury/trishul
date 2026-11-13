import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// envDir '..' means ONE .env file at the project root is shared by client and server.
export default defineConfig({
  plugins: [react()],
  envDir: '..',
  server: {
    port: 5173,
    // In development the browser talks to :5173 and Vite forwards /api to the Express server.
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
