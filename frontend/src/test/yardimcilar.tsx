import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import type { AssetFeature, AssetStatus, AssetType } from "../types/asset";
import type { ReportFeature, ReportStatus } from "../types/report";

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

export function sarmala(ui: ReactElement) {
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
    },
  };
}

export function ihbar(
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
      name: props.name ?? "Test Ihbar",
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
