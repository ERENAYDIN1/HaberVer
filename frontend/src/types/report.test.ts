import { describe, expect, it } from "vitest";

import {
  TALEP_GORUNUMLERI,
  sekilliTalep,
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

/** Talep sekli: vatandas nokta / cizgi / alan bildirebilir, ama HARITA PINI
 *  ile MESAFE HESABI her zaman tek bir noktaya ihtiyac duyar. `talepNoktasi`
 *  o tek hesap noktasidir; bozulursa pin, popup, secim senkronu ve alan
 *  suzgeci birlikte kayar. */
describe("talepNoktasi / sekilliTalep", () => {
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
    // Cizgi/alan taleplerde tek dogru kaynak budur: PostGIS hattin ortasini /
    // seklin icine dusen bir noktayi hesaplar, frontend tahmin yurutmez.
    const f = talep(
      { type: "LineString", coordinates: [[29, 41], [29.01, 41.01]] },
      [29.005, 41.005]
    );
    expect(talepNoktasi(f)).toEqual([29.005, 41.005]);
  });

  it("temsil noktasi yoksa NOKTA geometrisinden dusulur", () => {
    // Eski bir onbellek yaniti `nokta` tasimiyor olabilir; nokta talepte
    // geometrinin kendisi zaten dogru cevaptir.
    const f = talep({ type: "Point", coordinates: [28.98, 41.0] }, null);
    expect(talepNoktasi(f)).toEqual([28.98, 41.0]);
  });

  it("temsil noktasi olmayan CIZGI/ALAN icin null doner (tahmin etmez)", () => {
    // Yanlis bir noktaya pin koymaktansa hic koymamak dogru: cagiran taraflar
    // null'i "bu kaydi haritada atla" diye ele alir.
    const f = talep(
      { type: "Polygon", coordinates: [[[29, 41], [29.1, 41], [29.1, 41.1], [29, 41]]] },
      null
    );
    expect(talepNoktasi(f)).toBeNull();
  });

  it("yalnizca cizgi/alan kayitlari 'sekilli' sayilir", () => {
    expect(sekilliTalep(talep({ type: "Point", coordinates: [29, 41] }, [29, 41]))).toBe(
      false
    );
    expect(
      sekilliTalep(
        talep({ type: "LineString", coordinates: [[29, 41], [29.1, 41]] }, [29.05, 41])
      )
    ).toBe(true);
  });
});
