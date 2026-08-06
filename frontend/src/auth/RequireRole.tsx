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
  // Az once de yonlendirmisiz: giris tutmuyor demektir, tekrar denemek yerine
  // duran bir sayfa gosterilir (bkz. auth/token.ts).
  const dongu = girisiz && girisDongusuVarMi();

  // StrictMode bu effect'i iki kez calistirir; korumasiz birakilirsa
  // /auth/login'e iki istek gider, her biri farkli bir state/nonce uretip akis
  // cookie'sini ustune yazar ve Keycloak'tan donen state eslesmeyebilir. Ref,
  // ayni mount icinde tek cagriyi garanti eder.
  const baslatildiRef = useRef(false);
  useEffect(() => {
    if (girisiz && !dongu && !baslatildiRef.current) {
      baslatildiRef.current = true;
      // "replace": yonlendirmeyi kullanici baslatmadigi icin gecmise durak
      // eklenmez, yoksa geri tusu hep bu korumali sayfaya donerdi.
      girisBaslat(konum.pathname + konum.search, "replace");
    }
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

  return <SozlukKapisi>{children}</SozlukKapisi>;
}

/** Tur sozlugu gelmeden korumali ekranlar cizilmez.
 *
 *  Sozluk artik backend verisi (admin tur ekleyebiliyor), ama onu okuyanlarin
 *  cogu React DISI: harita katmanlari, popup HTML'leri, CSV disa aktarma.
 *  Bunlari tek tek bir React aboneligine baglamak yerine tek bir kapi
 *  konuluyor - asagidaki her sey sozlugun dolu oldugunu varsayabilir. Bedeli
 *  ilk acilista bir istek kadar bekleme; karsiliginda "tur adi bir an kod
 *  olarak gorunuyor" sinifindan hatalarin tamami yok. */
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
