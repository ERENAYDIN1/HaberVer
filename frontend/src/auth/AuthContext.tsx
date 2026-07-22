import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import * as authApi from "../api/auth";
import type { TokenResponse, User } from "../types/auth";
import { tokenAl, tokenKaydet, tokenSil } from "./token";

interface AuthContextTipi {
  user: User | null;
  yukleniyor: boolean;
  oturumAyarla: (yanit: TokenResponse) => void;
  cikisYap: () => void;
}

const AuthContext = createContext<AuthContextTipi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Ilk yuklemede token varsa /auth/me ile oturumu geri yukleriz.
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    if (!tokenAl()) {
      setYukleniyor(false);
      return;
    }
    authApi
      .me()
      .then(setUser)
      .catch(() => tokenSil())
      .finally(() => setYukleniyor(false));
  }, []);

  const oturumAyarla = (yanit: TokenResponse) => {
    tokenKaydet(yanit.access_token);
    setUser(yanit.user);
  };

  const cikisYap = () => {
    tokenSil();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, yukleniyor, oturumAyarla: oturumAyarla, cikisYap }}
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
