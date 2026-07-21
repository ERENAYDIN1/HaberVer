import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Docker bind mount'larinda dosya sistemi olaylari her zaman iletilmez;
    // polling ile degisikliklerin (hot-reload) kacirilmamasi saglanir.
    watch: { usePolling: true },
  },
});
