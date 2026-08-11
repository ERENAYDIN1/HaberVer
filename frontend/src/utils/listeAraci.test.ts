import { describe, expect, it } from "vitest";

import {
  aramaMetni,
  aramaNormalize,
  atanmamisOnce,
  metinKarsilastir,
  suzVeSirala,
  tariheGoreYeni,
} from "./listeAraci";

/* Suzme/siralama hesaplari bilesenden AYRI test edilir: davranisin kendisi
 * (arama paneli suzer, sorguyu degil) App.test.tsx'te cakiliyor. */

describe("aramaNormalize - Turkce harfler sadelestirilir", () => {
  it("kucuk harfe cevirir", () => {
    expect(aramaNormalize("ÇINAR")).toBe("cinar");
  });

  it("sapkasiz yazan kullaniciyi bulur", () => {
    // Mobilde Turkce klavye tuslarina uzanmak zahmetli; masaustunde de kimse
    // arama kutusuna sapkali harf yazmiyor.
    expect(aramaNormalize("Çöp Kutusu")).toBe("cop kutusu");
    expect(aramaNormalize("Rögar Kapağı")).toBe("rogar kapagi");
  });

  it("duzeltme isaretini de atar", () => {
    // "Güzergâh" panelde bu haliyle yaziliyor ama kullanici "guzergah" yazar.
    expect(aramaNormalize("Güzergâh")).toBe("guzergah");
    expect(aramaNormalize("kâğıt")).toBe("kagit");
  });

  it("noktali/noktasiz i ayrimini kaldirir", () => {
    // "Işık" ve "ışık" ayni sonucu vermeli: kullanici hangisini yazdigini
    // bilmiyor, ikisi de ayni kaydi bulmali.
    expect(aramaNormalize("IŞIK")).toBe("isik");
    expect(aramaNormalize("ışık")).toBe("isik");
    expect(aramaNormalize("İstanbul")).toBe("istanbul");
  });
});

describe("aramaMetni - bos alanlar atlanir", () => {
  it("null/undefined alanlari yok sayar", () => {
    // brand_model ve note nullable; birlestirme "null" dizgisi uretmemeli.
    expect(aramaMetni("Bank", null, "Ağaç")).toBe("bank agac");
    expect(aramaMetni("Bank", undefined)).toBe("bank");
  });

  it("bos dizgi de atlanir", () => {
    expect(aramaMetni("", "Yol")).toBe("yol");
  });
});

describe("metinKarsilastir - Turkce siralama", () => {
  it("Turkce'ye ozgu harfleri dogru yere koyar", () => {
    // Duz sort() Unicode kod noktasina gore siralar ve 'ç' ingiliz
    // alfabesinin SONUNA duser; Turkce'de 'c'den hemen sonra gelmeli.
    const sirali = ["Zeytin", "Çınar", "Armut"].sort(metinKarsilastir);
    expect(sirali).toEqual(["Armut", "Çınar", "Zeytin"]);
  });

  it("'ı' harfi 'i'den once gelir", () => {
    const sirali = ["İnci", "Işık"].sort(metinKarsilastir);
    expect(sirali).toEqual(["Işık", "İnci"]);
  });
});

describe("suzVeSirala - suzme + siralama tek gecis", () => {
  interface Kayit {
    ad: string;
    tarih: string;
  }
  const SIRALAMA = [
    {
      deger: "yeni",
      etiket: "En yeni",
      karsilastir: (a: Kayit, b: Kayit) => tariheGoreYeni(a.tarih, b.tarih),
    },
    {
      deger: "ad",
      etiket: "Ada göre",
      karsilastir: (a: Kayit, b: Kayit) => metinKarsilastir(a.ad, b.ad),
    },
  ];
  const KAYITLAR: Kayit[] = [
    { ad: "Çınar Ağacı", tarih: "2026-01-01T00:00:00Z" },
    { ad: "Bank", tarih: "2026-03-01T00:00:00Z" },
    { ad: "Ağaç Direği", tarih: "2026-02-01T00:00:00Z" },
  ];

  it("bos aramada hepsini dondurur, secili siraya gore", () => {
    const sonuc = suzVeSirala(KAYITLAR, "", (k) => aramaMetni(k.ad), SIRALAMA, "yeni");
    expect(sonuc.map((k) => k.ad)).toEqual([
      "Bank",
      "Ağaç Direği",
      "Çınar Ağacı",
    ]);
  });

  it("arama suzer ve siralama korunur", () => {
    const sonuc = suzVeSirala(KAYITLAR, "agac", (k) => aramaMetni(k.ad), SIRALAMA, "ad");
    // "Çınar Ağacı" ve "Ağaç Direği" eslesir; 'Ağ' < 'Çı' (Turkce).
    expect(sonuc.map((k) => k.ad)).toEqual(["Ağaç Direği", "Çınar Ağacı"]);
  });

  it("kaynak diziyi DEGISTIRMEZ (react-query onbellegi bozulmasin)", () => {
    const kopya = [...KAYITLAR];
    suzVeSirala(KAYITLAR, "", (k) => aramaMetni(k.ad), SIRALAMA, "ad");
    expect(KAYITLAR).toEqual(kopya);
  });

  it("bilinmeyen sira degeri ilk secenege duser", () => {
    // Sekme degisince secenek kumesi degisiyor; onceki sekmenin sira degeri
    // yeni kumede olmayabilir ve liste bos/kirik donmemeli.
    const sonuc = suzVeSirala(KAYITLAR, "", (k) => aramaMetni(k.ad), SIRALAMA, "yok");
    expect(sonuc[0].ad).toBe("Bank");
  });
});

describe("atanmamisOnce - uc kademeli siralama", () => {
  interface Is {
    id: string;
    bakim: boolean;
    tarih: string;
  }
  const karsilastir = (atanmamis: string[]) =>
    atanmamisOnce<Is>(
      new Set(atanmamis),
      (k) => k.id,
      (k) => k.bakim,
      (k) => k.tarih
    );

  const HAVUZDA: Is = { id: "a", bakim: true, tarih: "2026-01-01T00:00:00Z" };
  const ATALI: Is = { id: "b", bakim: true, tarih: "2026-02-01T00:00:00Z" };
  const IYI: Is = { id: "c", bakim: false, tarih: "2026-03-01T00:00:00Z" };

  it("atanmamis bakim isi -> atanmis bakim isi -> bakim gerektirmeyen", () => {
    const sonuc = [IYI, ATALI, HAVUZDA].sort(karsilastir(["a"]));
    expect(sonuc.map((k) => k.id)).toEqual(["a", "b", "c"]);
  });

  it("'İyi' varliklar en sonda kalir, tarihleri yeni olsa bile", () => {
    // Ucuncu kademe olmasa IYI (en yeni tarih) atanmislarla karisirdi.
    const sonuc = [IYI, ATALI].sort(karsilastir([]));
    expect(sonuc.map((k) => k.id)).toEqual(["b", "c"]);
  });

  it("ayni kademede en yeni one gelir", () => {
    const eski: Is = { id: "x", bakim: true, tarih: "2026-01-01T00:00:00Z" };
    const yeni: Is = { id: "y", bakim: true, tarih: "2026-05-01T00:00:00Z" };
    const sonuc = [eski, yeni].sort(karsilastir(["x", "y"]));
    expect(sonuc.map((k) => k.id)).toEqual(["y", "x"]);
  });

  it("havuz bos ise bakim isleri tarihe gore dizilir, iyi olanlar sonda", () => {
    const sonuc = [IYI, HAVUZDA, ATALI].sort(karsilastir([]));
    // Ikisi de "atanmis bakim" kademesinde: en yeni (ATALI) once.
    expect(sonuc.map((k) => k.id)).toEqual(["b", "a", "c"]);
  });
});

describe("tariheGoreYeni - en yeni once", () => {
  it("yeni tarihi one alir", () => {
    const sirali = [
      "2026-01-01T00:00:00Z",
      "2026-03-01T00:00:00Z",
      "2026-02-01T00:00:00Z",
    ].sort(tariheGoreYeni);
    expect(sirali[0]).toBe("2026-03-01T00:00:00Z");
    expect(sirali[2]).toBe("2026-01-01T00:00:00Z");
  });

  it("argumanlar ters verilince en eski one gecer", () => {
    // "En eski" secenegi ayri bir fonksiyon degil, ayni fonksiyonun ters
    // cagrilmis hali - bu sozlesme bozulmamali.
    const tersine = (a: string, b: string) => tariheGoreYeni(b, a);
    const sirali = ["2026-03-01T00:00:00Z", "2026-01-01T00:00:00Z"].sort(tersine);
    expect(sirali[0]).toBe("2026-01-01T00:00:00Z");
  });
});
