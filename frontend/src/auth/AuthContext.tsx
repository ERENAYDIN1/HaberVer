import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import * as authApi from "../api/auth";
import type { User } from "../types/auth";
import {
  cikisiBaslat,
  girisBaslat,
  girisDenemesiniUnut,
  kayitBaslat,
} from "./token";

interface AuthContextTipi {
  user: User | null;
  yukleniyor: boolean;
  /** Keycloak giris ekranina gider (tam sayfa yonlendirme). */
  girisYap: (donus?: string) => void;
  /** Keycloak kayit ekranina gider (vatandas oz-kaydi). */
  kayitOl: (donus?: string) => void;
  /** Yerel oturumu VE Keycloak oturumunu kapatir. */
  cikisYap: () => Promise<void>;
}

const AuthContext = createContext<AuthContextTipi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Oturum httpOnly cookie'de oldugu icin acilista tek yol sunucuya sormak.
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then((gelen) => {
        // Dongu isareti temizlenir, yoksa ayni sekmede sonraki giris ihtiyaci
        // dongu sanilirdi.
        girisDenemesiniUnut();
        setUser(gelen);
      })
      .catch(() => setUser(null))
      .finally(() => setYukleniyor(false));
  }, []);

  // Asagidaki dinleyici React render dongusunun disinda calistigi icin
  // state'i degil bu ref'i okur.
  const kullaniciRef = useRef<User | null>(null);
  kullaniciRef.current = user;

  // Geri/ileri tusuyla gelinen sayfa bfcache'ten oldugu gibi (React state ve
  // react-query onbellegi dahil) geri gelebilir; hicbir istek atilmadigi icin
  // `/auth/me` de calismaz. Boylece A hesabindan cikip B ile girildikten sonra
  // A'nin ekrani gorunmeye devam eder - istekler B olarak gitse de bu bir
  // gizlilik sorunu. `pageshow.persisted` bu durumu bildirir: kimlik yeniden
  // sorulur, degistiyse sayfa tamamen yenilenir (bayat ekrani yamamak yerine
  // bellegi tumden atmak tek guvenli yol).
  useEffect(() => {
    const geriGelindi = (olay: PageTransitionEvent) => {
      // Bellekte kimlik yoksa korunacak veri de yok.
      if (!olay.persisted || !kullaniciRef.current) return;
      const oncekiId = kullaniciRef.current.id;
      authApi
        .me()
        .then((gelen) => {
          if (gelen.id !== oncekiId) window.location.reload();
        })
        // Oturum bitmis: bu ekran artik kimseye ait degil.
        .catch(() => window.location.reload());
    };
    window.addEventListener("pageshow", geriGelindi);
    return () => window.removeEventListener("pageshow", geriGelindi);
  }, []);

  const cikisYap = async () => {
    // Ilk is giris kapisini kapatmak: yoksa RequireRole'un yonlendirmesi
    // asagidaki cikis navigasyonunu iptal eder ve Keycloak oturumu kapanmaz.
    cikisiBaslat();
    let cikisUrl: string | null = null;
    try {
      cikisUrl = (await authApi.logout()).cikis_url;
    } catch {
      // Sunucuya ulasilamasa bile kullaniciyi disari cikar.
    }
    // `setUser(null)` bilincli olarak yok: zaten sayfadan ayriliyoruz, state'i
    // bosaltmak yalnizca gereksiz bir ara render uretir. Hata durumunda koke
    // degil /giris'e gidilir - kok rota girisi kendisi baslatirdi.
    window.location.href = cikisUrl ?? "/giris";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        yukleniyor,
        girisYap: girisBaslat,
        kayitOl: kayitBaslat,
        cikisYap,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth AuthProvider icinde kullanilmalidir");
  return ctx;
}
