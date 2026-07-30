import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import * as authApi from "../api/auth";
import type { User } from "../types/auth";
import { girisBaslat, kayitBaslat } from "./token";

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
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setYukleniyor(false));
  }, []);

  const cikisYap = async () => {
    let cikisUrl: string | null = null;
    try {
      cikisUrl = (await authApi.logout()).cikis_url;
    } catch {
      // Sunucuya ulasilamasa bile yerel durumu temizle.
    }
    setUser(null);
    // Keycloak oturumu da kapansin diye kimlik saglayiciya gidilir; o da
    // kullaniciyi uygulamaya geri dondurur.
    window.location.href = cikisUrl ?? "/";
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
