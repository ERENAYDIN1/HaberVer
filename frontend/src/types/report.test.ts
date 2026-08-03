import { describe, expect, it } from "vitest";

import { IHBAR_GORUNUMLERI, ihbarGorunumu } from "./report";

/** `ihbarGorunumu` refactor sirasinda App.tsx'ten cikarilacak `useIhbar
 *  Gorunumleri` hook'unun cekirdegi. Buradaki kurallar UI'da bir kez bozulmus
 *  davranislari cakiyor - ozellikle "varlik bilgisi yuklenmeden siniflama
 *  yapma" kurali, acilista her seyin bir an "Tamir Edildi"ye dusup geri
 *  zipladigi hatanin duzeltmesidir. */
describe("ihbarGorunumu", () => {
  it("onaylanmamis ihbarlar durumlarini oldugu gibi korur", () => {
    // Varlik bilgisi hic gelmemis olsa bile bunlar etkilenmez.
    expect(ihbarGorunumu("beklemede", undefined, false)).toBe("beklemede");
    expect(ihbarGorunumu("beklemede", undefined, true)).toBe("beklemede");
    expect(ihbarGorunumu("reddedildi", undefined, true)).toBe("reddedildi");
    // Varlik durumu gonderilse bile onaylanmamis kayit bolunmez.
    expect(ihbarGorunumu("reddedildi", "iyi", true)).toBe("reddedildi");
  });

  it("varlik hala bakim bekliyorsa ACIK IS olarak kalir", () => {
    expect(ihbarGorunumu("onaylandi", "bakim_lazim", true)).toBe("onaylandi");
  });

  it("varlik tamir edilmisse 'tamir' gorunumune gecer", () => {
    expect(ihbarGorunumu("onaylandi", "iyi", true)).toBe("tamir");
  });

  it("varlik artik yoksa (otomatik silinmis) yine 'tamir' sayilir", () => {
    // TAMIR_SAKLAMA_GUN sonrasi varlik silinir; ihbar kaydi kalir ve bitmis
    // is olarak gorunmelidir - "onaylandi"da kalirsa haritada acik is gibi
    // gorunurdu.
    expect(ihbarGorunumu("onaylandi", undefined, true)).toBe("tamir");
  });

  it("varlik bilgisi HENUZ YUKLENMEDIYSE siniflama yapmaz", () => {
    // Regresyon: bu kural olmadan acilista (varlik sorgusu donmeden) her
    // onayli ihbar bir an "Tamir Edildi"ye dusup sonra geri zipliyordu.
    expect(ihbarGorunumu("onaylandi", undefined, false)).toBe("onaylandi");
    expect(ihbarGorunumu("onaylandi", "iyi", false)).toBe("onaylandi");
  });

  it("her zaman tanimli bir gorunum dondurur", () => {
    const tumKombinasyonlar = (["onaylandi", "beklemede", "reddedildi"] as const)
      .flatMap((s) =>
        ([undefined, "iyi", "bakim_lazim"] as const).flatMap((d) =>
          [true, false].map((v) => ihbarGorunumu(s, d, v))
        )
      );
    for (const g of tumKombinasyonlar) {
      expect(IHBAR_GORUNUMLERI).toContain(g);
    }
  });
});
