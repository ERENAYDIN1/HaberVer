import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import type { UserRole } from "../types/auth";
import { useAuth } from "./AuthContext";
import { girisBaslat, girisDongusuVarMi } from "./token";

/** Her rolun kendi ana ekrani: vatandas -> /vatandas, saha calisani -> /saha,
 *  admin/calisan -> / (ana konsol). */
export function rolAnaSayfasi(rol: UserRole): string {
  if (rol === "vatandas") return "/vatandas";
  if (rol === "saha_calisani") return "/saha";
  return "/";
}

function Bekleme({ metin }: { metin: string }) {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-slate-500">
      {metin}
    </div>
  );
}

interface RequireRoleProps {
  roller: UserRole[];
  children: ReactNode;
}

/** Girisi kullaniciya sormadan baslatir: "personel misin, vatandas misin"
 *  sorusunun cevabi zaten token'da (rol Keycloak'ta yasar), bu yuzden onden
 *  bir secim ekrani gostermenin teknik bir karsiligi yok. Yanlis role sahip
 *  kullanici girisin ardindan kendi ana sayfasina gonderilir - `next` her
 *  zaman dogru yere varir. */
export default function RequireRole({ roller, children }: RequireRoleProps) {
  const { user, yukleniyor } = useAuth();
  const konum = useLocation();

  const girisiz = !yukleniyor && !user;
  // Az once de yonlendirmisiz demek ki giris tutmuyor: tekrar denemek yerine
  // kullaniciya duran bir sayfa goster (bkz. auth/token.ts).
  const dongu = girisiz && girisDongusuVarMi();

  useEffect(() => {
    if (girisiz && !dongu) girisBaslat(konum.pathname + konum.search);
  }, [girisiz, dongu, konum.pathname, konum.search]);

  if (yukleniyor) return <Bekleme metin="Yükleniyor…" />;

  if (!user) {
    if (dongu) return <Navigate to="/giris?hata=oturum" replace />;
    return <Bekleme metin="Giriş ekranına yönlendiriliyorsunuz…" />;
  }

  // Yanlis rol: kullaniciyi kendi ana sayfasina gonder.
  if (!roller.includes(user.role)) {
    return <Navigate to={rolAnaSayfasi(user.role)} replace />;
  }

  return <>{children}</>;
}
