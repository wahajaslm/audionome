import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    rollupOptions: {
      // index.html mounts the Vue app (the player). The original single-page player is kept as a
      // second page, so /legacy/original-player.html works in `vite` dev and in the build.
      input: { main: 'index.html', legacy: 'legacy/original-player.html' },
    },
  },
});
