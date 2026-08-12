import { useEffect, useRef, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useTurler } from "../hooks/useTurler";
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

/** Girisi kullaniciya sormadan baslatir: rol zaten token'dan gelir, onden bir
 *  secim ekrani gostermenin karsiligi yok. Yanlis roldeki kullanici giristen
 *  sonra kendi ana sayfasina gonderilir. */
export default function RequireRole({ roller, children }: RequireRoleProps) {
  const { user, yukleniyor } = useAuth();
  const konum = useLocation();

  const girisiz = !yukleniyor && !user;
  // Az once de yonlendirmisiz: giris tutmuyor demektir (bkz. auth/token.ts).
  const dongu = girisiz && girisDongusuVarMi();

  // StrictMode effect'i iki kez calistirir; ref olmadan /auth/login'e iki
  // istek gider ve akis cookie'sindeki state/nonce birbirini ezer.
  const baslatildiRef = useRef(false);
  useEffect(() => {
    if (girisiz && !dongu && !baslatildiRef.current) {
      baslatildiRef.current = true;
      // "replace": geri tusu korumali sayfaya donmesin.
      girisBaslat(konum.pathname + konum.search, "replace");
    }
  }, [girisiz, dongu, konum.pathname, konum.search]);

  if (yukleniyor) return <Bekleme metin="Yükleniyor…" />;

  if (!user) {
    if (dongu) return <Navigate to="/giris?hata=oturum" replace />;
    return <Bekleme metin="Giriş ekranına yönlendiriliyorsunuz…" />;
  }

  if (!roller.includes(user.role)) {
    return <Navigate to={rolAnaSayfasi(user.role)} replace />;
  }

  return <SozlukKapisi>{children}</SozlukKapisi>;
}

/** Tur sozlugu gelmeden korumali ekranlar cizilmez: sozlugu okuyan cogu yer
 *  React disi (harita katmanlari, popup HTML'leri, CSV disa aktarma), o
 *  yuzden tek tek abone olmak yerine tek bir kapi konuldu. */
function SozlukKapisi({ children }: { children: ReactNode }) {
  const { isPending, isError, error, refetch } = useTurler();

  if (isPending) return <Bekleme metin="Tür sözlüğü yükleniyor…" />;
  if (isError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-sm text-slate-600">
        <p>Tür sözlüğü yüklenemedi: {(error as Error).message}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Tekrar dene
        </button>
      </div>
    );
  }
  return <>{children}</>;
}
