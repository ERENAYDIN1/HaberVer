import { describe, expect, it } from "vitest";

import {
  departmanAdi,
  departmanBul,
  departmanTurleri,
  turDepartmani,
  type Departman,
  type TurDepartmanEslemesi,
} from "./departman";

const DEPARTMANLAR: Departman[] = [
  {
    kod: "fen_isleri",
    ad: "Fen İşleri Müdürlüğü",
    aciklama: null,
    renk: "#f97316",
    aktif: true,
  },
  {
    kod: "park_bahceler",
    ad: "Park ve Bahçeler Müdürlüğü",
    aciklama: null,
    renk: "#059669",
    aktif: true,
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
    expect(departmanBul(DEPARTMANLAR, "fen_isleri")?.renk).toBe("#f97316");
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
