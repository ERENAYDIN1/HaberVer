import { describe, expect, it } from "vitest";

import type { Bolge, BolgeTipi, SekilDuzenleme } from "../types/bolge";
import { sekilDegistiMi, sekilNoktalari } from "./useSekilDuzenleme";

/** Sekil duzenlemenin KAPALI HALKA tuzagi.
 *
 *  API poligonlari GeoJSON kuralinca kapali dondurur (son nokta = ilk nokta).
 *  Bu bir kez gozden kacinca iki ayri sey birden bozulmustu: ilk kosede ust
 *  uste iki tutamak olusuyor (biri suruklenince sekil bozuluyor) ve "degisti
 *  mi" karsilastirmasi hicbir sey degismeden hep "degisti" diyor, yani Kaydet
 *  surekli etkin kaliyordu. */

const UCGEN_ACIK: [number, number][] = [
  [29.0, 41.0],
  [29.01, 41.0],
  [29.01, 41.01],
];
const UCGEN_KAPALI: [number, number][] = [...UCGEN_ACIK, [29.0, 41.0]];

function bolge(ozel: Partial<Bolge> = {}): Bolge {
  return {
    id: "b1",
    ad: "Test Bolge",
    aciklama: null,
    tip: (ozel.tip ?? "alan") as BolgeTipi,
    renk: "#7c3aed",
    noktalar: ozel.noktalar ?? [UCGEN_KAPALI],
    alan_m2: null,
    uzunluk_m: null,
    departman: null,
    worker_id: null,
    worker_ad: null,
    assigned_at: null,
    tamamlandi_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...ozel,
  };
}

function taslak(noktalar: [number, number][][], tip: BolgeTipi = "alan"): SekilDuzenleme {
  return { id: "b1", ad: "Test Bolge", tip, renk: "#7c3aed", noktalar };
}

describe("sekilNoktalari", () => {
  it("alanlarda kapali halkanin son tekrarini atar", () => {
    expect(sekilNoktalari("alan", [UCGEN_KAPALI])).toEqual([UCGEN_ACIK]);
  });

  it("cizgilerde DOKUNMAZ (ucu ucuna gelen guzergah mesru)", () => {
    // Bir guzergah baslangicina donebilir; son noktayi atmak rotayi kisaltirdi.
    expect(sekilNoktalari("cizgi", [UCGEN_KAPALI])).toEqual([UCGEN_KAPALI]);
  });
});

describe("sekilDegistiMi", () => {
  it("kapali kayit ile acik taslak AYNI sayilir", () => {
    // Regresyon: ham karsilastirma burada "degisti" derdi ve Kaydet hicbir
    // duzenleme yapilmadan etkin kalirdi.
    expect(sekilDegistiMi(taslak([UCGEN_ACIK]), bolge())).toBe(false);
  });

  it("bir kose oynayinca degismis sayilir", () => {
    const oynatilmis: [number, number][] = [
      [29.0, 41.0],
      [29.02, 41.0],
      [29.01, 41.01],
    ];
    expect(sekilDegistiMi(taslak([oynatilmis]), bolge())).toBe(true);
  });

  it("kose eklenince/silinince degismis sayilir", () => {
    const eklenmis: [number, number][] = [...UCGEN_ACIK, [29.0, 41.01]];
    expect(sekilDegistiMi(taslak([eklenmis]), bolge())).toBe(true);
    expect(sekilDegistiMi(taslak([UCGEN_ACIK.slice(0, 2)]), bolge())).toBe(true);
  });

  it("duzenleme yokken false", () => {
    expect(sekilDegistiMi(null, bolge())).toBe(false);
  });

  it("kayit listede yoksa degismis sayilir", () => {
    // Kayit henuz gelmemis ya da silinmis olabilir; kullanicinin emegini
    // kaydedilemez gostermektense kaydetmeyi denemek daha iyi.
    expect(sekilDegistiMi(taslak([UCGEN_ACIK]), undefined)).toBe(true);
  });

  it("cizgide de ayni normalde karsilastirir", () => {
    const rota: [number, number][] = [
      [29.0, 41.0],
      [29.02, 41.0],
    ];
    const kayit = bolge({ tip: "cizgi", noktalar: [rota] });
    expect(sekilDegistiMi(taslak([rota], "cizgi"), kayit)).toBe(false);
  });
});
