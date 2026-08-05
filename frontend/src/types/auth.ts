import type { Yaka } from "./saha";

export const USER_ROLES = ["admin", "calisan", "saha_calisani", "vatandas"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Yönetici",
  calisan: "Personel",
  saha_calisani: "Saha Çalışanı",
  vatandas: "Vatandaş",
};

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  /** Yalnizca saha_calisani icin: ekibin kadro yakasi. null ise ekibin yakasi
   *  son bildirdigi konumdan turetilir (bkz. types/saha.ts). */
  yaka: Yaka | null;
  /** Personelin bagli oldugu mudurluk (`departmanlar.kod`). `calisan` ve
   *  `saha_calisani` icin doludur; admin tum departmanlari gordugu ve
   *  vatandasin departmani olmadigi icin onlarda null. */
  departman: string | null;
}

