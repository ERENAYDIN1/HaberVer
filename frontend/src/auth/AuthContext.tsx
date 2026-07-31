import {
  createContext,
  useContext,
  useEffect,
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
  // Oturum tarayicida okunabilir bir yerde durmuyor (httpOnly cookie), bu
  // yuzden acilista tek yol sunucuya sormak: cookie gecerliyse /auth/me
  // kullaniciyi doner.
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then((gelen) => {
        // Oturum kuruldu: RequireRole'un dongu isareti temizlenir, yoksa
        // ayni sekmede daha sonra cikis yapinca giris dongu sanilirdi.
        girisDenemesiniUnut();
        setUser(gelen);
      })
      .catch(() => setUser(null))
      .finally(() => setYukleniyor(false));
  }, []);

  const cikisYap = async () => {
    // ILK is: giris kapisini kapat. Bu satirdan sonra RequireRole "kullanici
    // yok" gorse bile giris baslatmaz; yoksa o yonlendirme asagidaki cikis
    // navigasyonunu iptal eder ve Keycloak oturumu hic kapanmaz.
    cikisiBaslat();
    let cikisUrl: string | null = null;
    try {
      cikisUrl = (await authApi.logout()).cikis_url;
    } catch {
      // Sunucuya ulasilamasa bile kullaniciyi disari cikar.
    }
    // `setUser(null)` bilincli olarak YOK: zaten sayfadan ayriliyoruz ve
    // durumu bosaltmak yalnizca bir ara render (ve yukaridaki yaris) uretir.
    // Keycloak oturumu da kapansin diye kimlik saglayiciya gidilir; o da
    // kullaniciyi uygulamaya geri dondurur.
    // Sunucuya ulasilamadiginda bile koke DEGIL /giris'e gidilir: kok rota
    // girisi kendisi baslatir ve kullanici cikamamis gibi olurdu.
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
