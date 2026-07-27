import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import type { UserRole } from "../types/auth";
import { useAuth } from "./AuthContext";

/** Her rolun kendi ana ekrani: vatandas -> /vatandas, saha calisani -> /saha,
 *  admin/calisan -> / (ana konsol). */
export function rolAnaSayfasi(rol: UserRole): string {
  if (rol === "vatandas") return "/vatandas";
  if (rol === "saha_calisani") return "/saha";
  return "/";
}

interface RequireRoleProps {
  roller: UserRole[];
  /** Giris yoksa yonlendirilecek giris sayfasi. */
  girisYolu: string;
  children: ReactNode;
}

export default function RequireRole({
  roller,
  girisYolu,
  children,
}: RequireRoleProps) {
  const { user, yukleniyor } = useAuth();

  if (yukleniyor) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-slate-500">
        Yükleniyor…
      </div>
    );
  }

  if (!user) return <Navigate to={girisYolu} replace />;

  // Yanlis rol: kullaniciyi kendi ana sayfasina gonder.
  if (!roller.includes(user.role)) {
    return <Navigate to={rolAnaSayfasi(user.role)} replace />;
  }

  return <>{children}</>;
}
