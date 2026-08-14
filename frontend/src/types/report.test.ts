import { describe, expect, it } from "vitest";

import {
  TALEP_GORUNUMLERI,
  talepGorunumu,
  talepNoktasi,
  type ReportFeature,
} from "./report";

/** `talepGorunumu` refactor sirasinda App.tsx'ten cikarilacak `useTalep
 *  Gorunumleri` hook'unun cekirdegi. Buradaki kurallar UI'da bir kez bozulmus
 *  davranislari cakiyor - ozellikle "varlik bilgisi yuklenmeden siniflama
 *  yapma" kurali, acilista her seyin bir an "Tamir Edildi"ye dusup geri
 *  zipladigi hatanin duzeltmesidir. */
describe("talepGorunumu", () => {
  it("onaylanmamis talepler durumlarini oldugu gibi korur", () => {
    // Varlik bilgisi hic gelmemis olsa bile bunlar etkilenmez.
    expect(talepGorunumu("beklemede", undefined, false)).toBe("beklemede");
    expect(talepGorunumu("beklemede", undefined, true)).toBe("beklemede");
    expect(talepGorunumu("reddedildi", undefined, true)).toBe("reddedildi");
    // Varlik durumu gonderilse bile onaylanmamis kayit bolunmez.
    expect(talepGorunumu("reddedildi", "iyi", true)).toBe("reddedildi");
  });

  it("varlik hala bakim bekliyorsa ACIK IS olarak kalir", () => {
    expect(talepGorunumu("onaylandi", "bakim_lazim", true)).toBe("onaylandi");
  });

  it("varlik tamir edilmisse 'tamir' gorunumune gecer", () => {
    expect(talepGorunumu("onaylandi", "iyi", true)).toBe("tamir");
  });

  it("varlik artik yoksa (otomatik silinmis) yine 'tamir' sayilir", () => {
    // TAMIR_SAKLAMA_GUN sonrasi varlik silinir; talep kaydi kalir ve bitmis
    // is olarak gorunmelidir - "onaylandi"da kalirsa haritada acik is gibi
    // gorunurdu.
    expect(talepGorunumu("onaylandi", undefined, true)).toBe("tamir");
  });

  it("varlik bilgisi HENUZ YUKLENMEDIYSE siniflama yapmaz", () => {
    // Regresyon: bu kural olmadan acilista (varlik sorgusu donmeden) her
    // onayli talep bir an "Tamir Edildi"ye dusup sonra geri zipliyordu.
    expect(talepGorunumu("onaylandi", undefined, false)).toBe("onaylandi");
    expect(talepGorunumu("onaylandi", "iyi", false)).toBe("onaylandi");
  });

  it("her zaman tanimli bir gorunum dondurur", () => {
    const tumKombinasyonlar = (["onaylandi", "beklemede", "reddedildi"] as const)
      .flatMap((s) =>
        ([undefined, "iyi", "bakim_lazim"] as const).flatMap((d) =>
          [true, false].map((v) => talepGorunumu(s, d, v))
        )
      );
    for (const g of tumKombinasyonlar) {
      expect(TALEP_GORUNUMLERI).toContain(g);
    }
  });
});

/** Talep sekli artik yalnizca NOKTA (bkz. migration 0016), ama pin/mesafe
 *  hesabi hala TEK bir hesap noktasindan gecer: `talepNoktasi`. Bozulursa
 *  pin, popup, secim senkronu ve alan suzgeci birlikte kayar. */
describe("talepNoktasi", () => {
  const talep = (
    geometry: ReportFeature["geometry"],
    nokta: [number, number] | null
  ): ReportFeature =>
    ({
      type: "Feature",
      geometry,
      properties: { nokta } as ReportFeature["properties"],
    }) as ReportFeature;

  it("backend'in verdigi temsil noktasini kullanir", () => {
    // Onaylanan talepte bu nokta VARLIGIN (personelin duzeltmis olabilecegi)
    // konumudur; ham `geometry` vatandasin gonderdigi kayit olarak durur.
    const f = talep({ type: "Point", coordinates: [29, 41] }, [29.005, 41.005]);
    expect(talepNoktasi(f)).toEqual([29.005, 41.005]);
  });

  it("temsil noktasi yoksa geometrinin kendisine duser", () => {
    // Eski bir onbellek yaniti `nokta` tasimiyor olabilir.
    const f = talep({ type: "Point", coordinates: [28.98, 41.0] }, null);
    expect(talepNoktasi(f)).toEqual([28.98, 41.0]);
  });
});
