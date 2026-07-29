import type { TokenResponse, User, UserRole } from "../types/auth";
import type { Yaka } from "../types/saha";
import { istek } from "./http";

/** Kimlik uclarinda `oturumKontrolu: false`: buradaki 401 "e-posta veya parola
 *  hatali" demektir, oturum sonlanmasi degil - kullanici zaten giris
 *  sayfasinda, hata mesajini formda gormeli. */
export function login(email: string, password: string) {
  return istek<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    oturumKontrolu: false,
  });
}

export function register(email: string, password: string, full_name?: string) {
  return istek<TokenResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, full_name: full_name || null }),
    oturumKontrolu: false,
  });
}

/** Acilista token'i dogrulamak icin cagrilir. Burada da `oturumKontrolu: false`:
 *  gecersiz token'da AuthContext zaten token'i silip RequireRole uygun giris
 *  sayfasina yonlendiriyor - buradan ayrica tam sayfa yonlendirmesi yapmak
 *  acilisi gereksizce yeniden yuklerdi. */
export function me() {
  return istek<User>("/auth/me", { oturumKontrolu: false });
}

// --- Admin: kullanici yonetimi ---
export function listUsers() {
  return istek<User[]>("/users");
}

export function createUser(data: {
  email: string;
  password: string;
  full_name?: string;
  role: UserRole;
  /** Yalnizca saha_calisani icin anlamli; bos birakilirsa ekibin yakasi son
   *  bildirdigi konumdan turetilir. */
  yaka?: Yaka | null;
}) {
  return istek<User>("/users", {
    method: "POST",
    body: JSON.stringify({
      ...data,
      full_name: data.full_name || null,
      yaka: data.yaka || null,
    }),
  });
}

/** Admin: bir saha ekibinin kadro yakasini ayarlar (null: konumdan turet). */
export function updateUserYaka(user_id: string, yaka: Yaka | null) {
  return istek<User>(`/users/${user_id}`, {
    method: "PATCH",
    body: JSON.stringify({ yaka }),
  });
}
