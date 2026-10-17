import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [
    basicSsl(), // HTTPS requerido por WebXR
  ],
  server: {
    host: true, // Expone en red local para acceder desde el Quest 3
    port: 5173,
    https: true,
    headers: {
      'Permissions-Policy': 'xr-spatial-tracking=*',
      'Access-Control-Allow-Origin': '*',
    },
  },
});
