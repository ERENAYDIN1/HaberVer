import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import RequireRole from "./auth/RequireRole";
import "./index.css";
import Giris from "./pages/Giris";
import SahaEkran from "./pages/SahaEkran";
import VatandasEkran from "./pages/VatandasEkran";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/giris" element={<Giris />} />
            {/* Eski rol bazli giris baglantilari icin yonlendirme */}
            <Route
              path="/vatandas/giris"
              element={<Navigate to="/giris" replace />}
            />
            <Route
              path="/vatandas/kayit"
              element={<Navigate to="/giris" replace />}
            />
            <Route
              path="/vatandas"
              element={
                <RequireRole roller={["vatandas"]}>
                  <VatandasEkran />
                </RequireRole>
              }
            />
            <Route
              path="/saha"
              element={
                <RequireRole roller={["saha_calisani"]}>
                  <SahaEkran />
                </RequireRole>
              }
            />
            <Route
              path="/"
              element={
                <RequireRole roller={["admin", "calisan"]}>
                  <App />
                </RequireRole>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
