import { describe, expect, it } from "vitest";

import {
  departmanAdi,
  departmanBul,
  departmanGrubu,
  departmanTurGruplari,
  departmanTurleri,
  grupUyumsuzlugu,
  turDepartmani,
  type Departman,
  type TurDepartmanEslemesi,
} from "./departman";

const DEPARTMANLAR: Departman[] = [
  {
    kod: "fen_isleri",
    ad: "Fen İşleri Müdürlüğü",
    aciklama: null,
    renk: "#ea580c",
    aktif: true,
    sira: 30,
  },
  {
    kod: "park_bahceler",
    ad: "Park ve Bahçeler Müdürlüğü",
    aciklama: null,
    renk: "#059669",
    aktif: true,
    sira: 10,
  },
];

const ESLEME: TurDepartmanEslemesi = {
  yol: "fen_isleri",
  kaldirim: "fen_isleri",
  agac: "park_bahceler",
};

/** Departman sozlugu ve tur -> departman eslemesi UYGULAMANIN HER YERINDE
 *  okunur: vatandas formundaki "hangi müdürlüğe gidecek" ipucu, personel
 *  rozetleri, saha panosundaki "başka departman" uyarisi ve dashboard
 *  kirilimi. Hepsi bu birkac fonksiyondan gectigi icin sozluk henuz
 *  yuklenmemisken (undefined) cokmemeleri sart - departman bilgisi bir ekranin
 *  cizilmesini engelleyecek kadar merkezi degil. */
describe("departman yardimcilari", () => {
  it("turun departmanini eslemeden cozer", () => {
    expect(turDepartmani(ESLEME, "yol")).toBe("fen_isleri");
    expect(turDepartmani(ESLEME, "agac")).toBe("park_bahceler");
  });

  it("eslemede olmayan tur icin undefined doner (cokmez)", () => {
    // Yeni bir tur eklenip esleme satiri henuz yazilmamis olabilir.
    expect(turDepartmani(ESLEME, "su_hatti")).toBeUndefined();
  });

  it("esleme/tur yokken sessizce undefined doner", () => {
    expect(turDepartmani(undefined, "yol")).toBeUndefined();
    expect(turDepartmani(ESLEME, null)).toBeUndefined();
  });

  it("koddan departmani bulur", () => {
    expect(departmanBul(DEPARTMANLAR, "fen_isleri")?.renk).toBe("#ea580c");
    expect(departmanBul(DEPARTMANLAR, "yok_boyle")).toBeUndefined();
    expect(departmanBul(undefined, "fen_isleri")).toBeUndefined();
    expect(departmanBul(DEPARTMANLAR, null)).toBeUndefined();
  });

  it("ad cozulemezse tire gosterir, bos dizgi degil", () => {
    // Rozet/uyari metinlerinde bos bir ad "…, bu iş  kapsamında" gibi bozuk
    // cumleler uretirdi.
    expect(departmanAdi(DEPARTMANLAR, "fen_isleri")).toBe("Fen İşleri Müdürlüğü");
    expect(departmanAdi(DEPARTMANLAR, null)).toBe("—");
    expect(departmanAdi(undefined, "fen_isleri")).toBe("—");
  });

  it("bir departmanin turlerini (eslemenin ters yonu) verir", () => {
    expect(departmanTurleri(ESLEME, "fen_isleri").sort()).toEqual([
      "kaldirim",
      "yol",
    ]);
    expect(departmanTurleri(ESLEME, "park_bahceler")).toEqual(["agac"]);
    expect(departmanTurleri(ESLEME, "temizlik_isleri")).toEqual([]);
    expect(departmanTurleri(undefined, "fen_isleri")).toEqual([]);
  });
});

/** `departmanTurGruplari` lejantin, tur acilirlarinin ve yonetim ekraninin
 *  ORTAK kategorilemesidir: uc yuzey de "Park ve Bahçeler Müdürlüğü" gibi bir
 *  ana baslik altinda ayni turleri gostermek zorunda. */
describe("departmanTurGruplari", () => {
  const TURLER = ["yol", "agac", "kaldirim"];

  it("turleri mudurluk mudurluk, SOZLUK sirasinda gruplar", () => {
    const gruplar = departmanTurGruplari(DEPARTMANLAR, ESLEME, TURLER);
    expect(gruplar?.map((g) => g.departman?.kod)).toEqual([
      "fen_isleri",
      "park_bahceler",
    ]);
    // Tur sirasi verilen listeden gelir (sozluk sirasi), esleme nesnesinin
    // anahtar sirasindan degil.
    expect(gruplar?.[0].turler).toEqual(["yol", "kaldirim"]);
  });

  it("turu olmayan mudurlugu listelemez", () => {
    const gruplar = departmanTurGruplari(DEPARTMANLAR, ESLEME, ["agac"]);
    expect(gruplar?.map((g) => g.departman?.kod)).toEqual(["park_bahceler"]);
  });

  it("yonlendirilmemis turleri ayri kovada tutar - ekrandan dusurmez", () => {
    const gruplar = departmanTurGruplari(DEPARTMANLAR, ESLEME, [
      ...TURLER,
      "su_hatti",
    ]);
    const artan = gruplar?.[gruplar.length - 1];
    expect(artan?.departman).toBeNull();
    expect(artan?.turler).toEqual(["su_hatti"]);
  });

  it("sozluk yuklenmeden null doner (cagiran duz liste cizer)", () => {
    // Aksi halde ilk karede TUM turler "yönlendirilmemiş" basligina duser,
    // esleme gelince yerine otururdu - lejantta gorulen tam olarak buydu.
    expect(departmanTurGruplari(undefined, ESLEME, TURLER)).toBeNull();
    expect(departmanTurGruplari(DEPARTMANLAR, undefined, TURLER)).toBeNull();
  });
});

/** Grup rengi ile mudurluk rengi 0012'den beri her turde ortusur; bu iki
 *  yardimci duzeni YENI kayitlarda da surdurur (yeni tur formu grubu buradan
 *  turetir, ayrisan satirlar uyari gosterir). */
describe("grup <-> mudurluk rengi", () => {
  const PARK = DEPARTMANLAR[1]; // #059669 = `yesil` grubunun rengi
  const FEN = DEPARTMANLAR[0]; // #ea580c = palette karsiligi olmayan bir ton

  it("mudurluk rengini paletteki gruba cozer", () => {
    expect(departmanGrubu(PARK)).toBe("yesil");
  });

  it("palette karsiligi olmayan renk icin undefined doner", () => {
    // Kural zorlanmaz: mudurluk veridir, admin herhangi bir renk secebilir.
    expect(departmanGrubu(FEN)).toBeUndefined();
    expect(departmanGrubu(undefined)).toBeUndefined();
  });

  it("ortusen renkte uyari vermez, ayrisanda verir", () => {
    expect(grupUyumsuzlugu("yesil", PARK)).toBeNull();
    expect(grupUyumsuzlugu("yol", PARK)).toContain(PARK.ad);
  });

  it("mudurluk bilinmiyorsa uyari uretmez", () => {
    expect(grupUyumsuzlugu("yesil", undefined)).toBeNull();
  });
});
