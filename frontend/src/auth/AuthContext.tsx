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
        girisDenemesiniUnut();
        setUser(gelen);
      })
      .catch(() => setUser(null))
      .finally(() => setYukleniyor(false));
  }, []);

  // Dinleyici React render dongusu disinda calistigi icin state degil ref okur.
  const kullaniciRef = useRef<User | null>(null);
  kullaniciRef.current = user;

  // bfcache'ten donen sayfa React state'ini korur ama istek atmadigi icin
  // `/auth/me` calismaz; A'dan cikip B ile girilse bile A'nin ekrani gorunur
  // kalirdi. `pageshow.persisted` kimligi yeniden sorar, degistiyse sayfa
  // tamamen yenilenir.
  useEffect(() => {
    const geriGelindi = (olay: PageTransitionEvent) => {
      if (!olay.persisted || !kullaniciRef.current) return;
      const oncekiId = kullaniciRef.current.id;
      authApi
        .me()
        .then((gelen) => {
          if (gelen.id !== oncekiId) window.location.reload();
        })
        .catch(() => window.location.reload());
    };
    window.addEventListener("pageshow", geriGelindi);
    return () => window.removeEventListener("pageshow", geriGelindi);
  }, []);

  const cikisYap = async () => {
    // RequireRole'un yonlendirmesi cikis navigasyonunu iptal etmesin diye once kapi kapatilir.
    cikisiBaslat();
    let cikisUrl: string | null = null;
    try {
      cikisUrl = (await authApi.logout()).cikis_url;
    } catch {
      // Sunucuya ulasilamasa bile kullaniciyi disari cikar.
    }
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
