import type { User, UserRole } from "../types/auth";
import type { Yaka } from "../types/saha";
import { istek } from "./http";

/** Parola ile giris/kayit ucu KALMADI: ikisi de Keycloak'in kendi ekraninda
 *  yapiliyor (bkz. auth/token.ts::girisBaslat / kayitBaslat). */

/** Acilista oturumu geri yuklemek icin cagrilir. `oturumKontrolu: false`:
 *  oturum yoksa 401 beklenen durumdur, RequireRole giris akisini kendisi
 *  baslatir. */
export function me() {
  return istek<User>("/auth/me", { oturumKontrolu: false });
}

/** Yerel oturumu kapatir ve Keycloak'in cikis adresini doner: tarayici oraya
 *  gitmezse kimlik saglayicidaki oturum acik kalir ve "Giris"e basinca
 *  kullanici sorusuz iceri girer. */
export function logout() {
  return istek<{ cikis_url: string }>("/auth/logout", {
    method: "POST",
    oturumKontrolu: false,
  });
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
  /** `calisan` ve `saha_calisani` icin ZORUNLU: kullanicinin gorebilecegi tur
   *  kumesi bu mudurlukten turer. Admin/vatandas icin null. */
  departman?: string | null;
}) {
  return istek<User>("/users", {
    method: "POST",
    body: JSON.stringify({
      ...data,
      full_name: data.full_name || null,
      yaka: data.yaka || null,
      departman: data.departman || null,
    }),
  });
}

/** Admin: bir saha ekibinin kadro yakasini ayarlar (null: konumdan turet).
 *  Yalnizca `yaka` gonderilir - backend gonderilmeyen alanlara dokunmaz. */
export function updateUserYaka(user_id: string, yaka: Yaka | null) {
  return istek<User>(`/users/${user_id}`, {
    method: "PATCH",
    body: JSON.stringify({ yaka }),
  });
}

export function updateUserDepartman(user_id: string, departman: string) {
  return istek<User>(`/users/${user_id}`, {
    method: "PATCH",
    body: JSON.stringify({ departman }),
  });
}

/** Kapatmak Keycloak'ta da hesabi devre disi birakir ve ACIK OTURUMLARI
 *  ANINDA DUSER (bkz. crud/user.py::set_active). */
export function updateUserAktif(user_id: string, is_active: boolean) {
  return istek<User>(`/users/${user_id}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active }),
  });
}
