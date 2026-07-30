import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const PROXY_HEDEFI = process.env.VITE_PROXY_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Docker bind mount'larinda dosya sistemi olaylari her zaman iletilmez;
    // polling ile degisikliklerin (hot-reload) kacirilmamasi saglanir.
    watch: { usePolling: true },
    // TEK ORIGIN: uygulama, API ve yuklenen dosyalar tarayici icin ayni
    // adrestedir (http://localhost:5173). Oturum cookie'sinin first-party
    // kalmasinin (ve `SameSite=Lax` korumasinin calismasinin) sarti budur -
    // token tarayiciya hic verilmedigi icin kimlik tamamen bu cookie'ye bagli.
    // Production'da ayni islevi bir reverse proxy (nginx/Caddy) ustlenmeli.
    // Hedef ortama gore degisir: docker'da servis adi (backend), host'ta
    // dogrudan localhost.
    proxy: {
      "/api": { target: PROXY_HEDEFI, changeOrigin: false },
      "/media": { target: PROXY_HEDEFI, changeOrigin: false },
    },
  },
});
