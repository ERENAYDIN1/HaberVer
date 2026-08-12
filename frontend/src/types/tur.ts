import type { TipGrubu } from "./asset";

/** Bir varlik/talep turu. Sozluk BACKEND'DEN gelir (`turler` tablosu), kodda
 *  sabitlenmez. Renk burada YOKTUR - turun rengi grubundan gelir (`GRUP_RENGI`). */
export interface Tur {
  /** Dogal anahtar; `assets.type` / `reports.type` icinde yasayan deger. */
  kod: string;
  ad: string;
  grup: TipGrubu;
  /** Glif kitapligindaki anahtar (`data/tipGlifleri.ts`); NULL ise grubun
   *  genel glifi kullanilir. SVG'nin kendisi frontend'dedir - yeni bir tur
   *  eklemek cizim yapmayi degil listeden secmeyi gerektirsin diye. */
  glif: string | null;
}

/** POST /api/turler govdesi. Yonlendirme (departman) turle BIRLIKTE yazilir:
 *  mudurlugu olmayan bir tur hicbir kapsama girmez, yani gorunmez olur. */
export interface TurCreateInput {
  kod: string;
  ad: string;
  grup: TipGrubu;
  glif: string | null;
  departman: string;
}

/** PATCH /api/turler/{kod} govdesi. Kod degistirilemez. */
export type TurUpdateInput = Partial<Omit<TurCreateInput, "kod" | "departman">>;
