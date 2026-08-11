import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import { setTurSozlugu } from "../data/turSozlugu";
import type { AssetFeature, AssetStatus, AssetType } from "../types/asset";
import type { ReportFeature, ReportStatus } from "../types/report";
import type { Tur } from "../types/tur";

/** Bilesen testleri icin ortak kurulum.
 *
 *  Amac, App'in TAMAMINI ayakta tutmak degil; refactor'un bozabilecegi
 *  DAVRANISLARI (filtre kaynagi, secim eslemesi, sekme senkronu) gercek
 *  bilesen agaci uzerinde cakmak. Bu yuzden ag katmani sahte, geri kalan her
 *  sey gercek. */

/** Testler arasi sizinti olmasin diye her testte YENI bir istemci; ayrica
 *  yeniden deneme kapali - basarisiz bir sorgu testi bekletmemeli. */
export function testQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** Tur sozlugu artik backend verisidir; uygulamada korumali ekranlar o gelene
 *  kadar cizilmez (auth/RequireRole). Testler bileseni dogrudan monte ettigi
 *  icin o kapi devrede degil - sozluk burada, sahte veriyle kurulur. Kucuk
 *  tutuldu: testlerin ihtiyaci olan turler + her renk grubundan birer ornek. */
export const TEST_TURLERI: Tur[] = [
  { kod: "agac", ad: "Ağaç", grup: "yesil", glif: "agac" },
  { kod: "bank", ad: "Bank", grup: "yesil", glif: "bank" },
  { kod: "direk", ad: "Aydınlatma Direği", grup: "aydinlatma", glif: "direk" },
  { kod: "yol", ad: "Yol / Asfalt", grup: "yol", glif: "yol" },
  { kod: "rogar", ad: "Rögar Kapağı", grup: "yol", glif: "rogar" },
  { kod: "su_hatti", ad: "Su Hattı", grup: "altyapi", glif: "su_hatti" },
  { kod: "diger", ad: "Diğer", grup: "diger", glif: "diger" },
];

export function sarmala(ui: ReactElement) {
  setTurSozlugu(TEST_TURLERI);
  const client = testQueryClient();
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    ),
  };
}

// --- Sahte veri kuruculari -------------------------------------------------

let sayac = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++sayac).padStart(12, "0")}`;

export function varlik(
  ozel: Partial<AssetFeature["properties"]> & {
    koordinat?: [number, number];
  } = {}
): AssetFeature {
  const { koordinat = [28.98, 41.01], ...props } = ozel;
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: koordinat },
    properties: {
      id: props.id ?? uuid(),
      name: props.name ?? "Test Varlik",
      type: (props.type ?? "agac") as AssetType,
      status: (props.status ?? "iyi") as AssetStatus,
      source: props.source ?? "kayitli",
      install_date: props.install_date ?? null,
      brand_model: props.brand_model ?? null,
      photo_url: props.photo_url ?? null,
      created_at: props.created_at ?? "2026-01-01T00:00:00Z",
      updated_at: props.updated_at ?? "2026-01-01T00:00:00Z",
      repaired_at: props.repaired_at ?? null,
      assigned: props.assigned ?? false,
    },
  };
}

export function talep(
  ozel: Partial<ReportFeature["properties"]> & {
    koordinat?: [number, number];
  } = {}
): ReportFeature {
  const { koordinat = [28.98, 41.01], ...props } = ozel;
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: koordinat },
    properties: {
      id: props.id ?? uuid(),
      name: props.name ?? "Test Talep",
      type: (props.type ?? "agac") as AssetType,
      status: (props.status ?? "beklemede") as ReportStatus,
      note: props.note ?? "aciklama",
      photo_url: props.photo_url ?? null,
      reporter_id: props.reporter_id ?? uuid(),
      reviewed_by: props.reviewed_by ?? null,
      reviewed_at: props.reviewed_at ?? null,
      review_note: props.review_note ?? null,
      created_asset_id: props.created_asset_id ?? null,
      created_at: props.created_at ?? "2026-01-01T00:00:00Z",
      assigned: props.assigned ?? false,
    } as ReportFeature["properties"],
  };
}

export const koleksiyon = <T,>(features: T[]) => ({
  type: "FeatureCollection" as const,
  features,
});

export const PERSONEL = {
  id: uuid(),
  email: "admin@test.com",
  full_name: "Test Yonetici",
  role: "admin" as const,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  yaka: null,
};
