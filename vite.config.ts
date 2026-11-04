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
      // index.html is the live player. The Vue app has no HTML entry until phase 3 switches
      // to it, so it is built as an extra entry: `npm run build` compiles every .vue file and
      // fails if the Vue app does not bundle.
      input: { main: 'index.html', 'vue-app': 'src/main.ts' },
    },
  },
});
