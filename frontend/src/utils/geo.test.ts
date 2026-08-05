import { describe, expect, it } from "vitest";

import {
  cizgiOrtaNoktasi,
  cokHalkaliAlanM2,
  enBuyukHalkaMerkezi,
  halkalariAc,
  halkayiAc,
  mesafeMetre,
  noktaAlandaMi,
  noktaHalkadaMi,
  poligonAlaniM2,
  poligonMerkezi,
  poligonSinirKutusu,
  toplamMesafeMetre,
} from "./geo";

/** Geometri yardimcilari `useAlanSecimi` / `useSekilDuzenleme` cikarilirken
 *  yerinde kalacak ama cagrildiklari yer degisecek. Buradaki testler, o
 *  tasima sirasinda yanlis fonksiyonun cagrilmasini (ornegin cizgide
 *  `poligonMerkezi`) yakalar - bu tam olarak bir kez yasanmis bir hatadir. */

// Istanbul olceginde referans noktalar.
const SULTANAHMET: [number, number] = [28.9768, 41.0055];
const KADIKOY: [number, number] = [29.0257, 40.9903];

describe("mesafe", () => {
  it("bilinen iki nokta arasini makul dogrulukla olcer", () => {
    // Sultanahmet - Kadikoy kus ucusu ~4.4 km.
    const m = mesafeMetre(SULTANAHMET, KADIKOY);
    expect(m).toBeGreaterThan(4000);
    expect(m).toBeLessThan(5000);
  });

  it("ayni nokta icin sifir dondurur", () => {
    expect(mesafeMetre(SULTANAHMET, SULTANAHMET)).toBe(0);
  });

  it("cok segmentli mesafe, segmentlerin toplamidir", () => {
    const orta: [number, number] = [29.0, 40.998];
    expect(toplamMesafeMetre([SULTANAHMET, orta, KADIKOY])).toBeCloseTo(
      mesafeMetre(SULTANAHMET, orta) + mesafeMetre(orta, KADIKOY),
      6
    );
  });
});

describe("alan", () => {
  // ~0.01 derece kenarli kare: enlem 41'de yaklasik 1.11 km x 0.84 km.
  const kare: [number, number][] = [
    [29.0, 41.0],
    [29.01, 41.0],
    [29.01, 41.01],
    [29.0, 41.01],
  ];

  it("basit bir karenin alanini makul araliktan verir", () => {
    const m2 = poligonAlaniM2(kare);
    expect(m2).toBeGreaterThan(800_000);
    expect(m2).toBeLessThan(1_100_000);
  });

  it("halka yonunden (winding) bagimsizdir", () => {
    expect(poligonAlaniM2([...kare].reverse())).toBeCloseTo(
      poligonAlaniM2(kare),
      3
    );
  });

  it("cok halkali alan, halkalarin toplamidir", () => {
    const ikinci: [number, number][] = kare.map(([x, y]) => [x + 0.5, y]);
    expect(cokHalkaliAlanM2([kare, ikinci])).toBeCloseTo(
      poligonAlaniM2(kare) + poligonAlaniM2(ikinci),
      3
    );
  });

  it("en buyuk halkanin merkezini secer (kucugunkini degil)", () => {
    const kucuk: [number, number][] = [
      [30.0, 41.0],
      [30.001, 41.0],
      [30.001, 41.001],
      [30.0, 41.001],
    ];
    const [lon] = enBuyukHalkaMerkezi([kucuk, kare]);
    // Buyuk halka 29.x'te; kucuk olan 30.x'te. Merkez buyugun uzerinde olmali.
    expect(lon).toBeGreaterThan(28.9);
    expect(lon).toBeLessThan(29.1);
  });
});

describe("cizgiOrtaNoktasi", () => {
  it("duz bir hatta gercek orta noktayi verir", () => {
    const [lon, lat] = cizgiOrtaNoktasi([
      [29.0, 41.0],
      [29.02, 41.0],
    ]);
    expect(lon).toBeCloseTo(29.01, 4);
    expect(lat).toBeCloseTo(41.0, 4);
  });

  it("L seklindeki rotada nokta HATTIN UZERINDE kalir", () => {
    // Regresyon: burada `poligonMerkezi` (nokta ortalamasi) kullanilsaydi
    // sonuc L'nin ic kosesine, yani hattin hic gecmedigi bir yere duserdi.
    const l: [number, number][] = [
      [29.0, 41.0],
      [29.02, 41.0],
      [29.02, 41.02],
    ];
    const [lon, lat] = cizgiOrtaNoktasi(l);
    const yatayda = Math.abs(lat - 41.0) < 1e-9 && lon >= 29.0 && lon <= 29.02;
    const dikeyde = Math.abs(lon - 29.02) < 1e-9 && lat >= 41.0 && lat <= 41.02;
    expect(yatayda || dikeyde).toBe(true);

    const ortalama = poligonMerkezi(l);
    expect([lon, lat]).not.toEqual(ortalama);
  });

  it("tek noktali ve bos girdide patlamaz", () => {
    expect(cizgiOrtaNoktasi([[29, 41]])).toEqual([29, 41]);
    expect(cizgiOrtaNoktasi([])).toEqual([0, 0]);
  });
});

describe("halkayiAc", () => {
  it("kapali halkanin son tekrarini atar", () => {
    // Regresyon: backend GeoJSON kuralinca KAPALI halka dondurur; tekrar
    // atilmazsa ilk kosede ust uste iki tutamak olusur ve biri suruklenince
    // sekil bozulur.
    const kapali: [number, number][] = [
      [29, 41],
      [29.01, 41],
      [29.01, 41.01],
      [29, 41],
    ];
    expect(halkayiAc(kapali)).toHaveLength(3);
  });

  it("acik halkaya dokunmaz ve idempotenttir", () => {
    const acik: [number, number][] = [
      [29, 41],
      [29.01, 41],
      [29.01, 41.01],
    ];
    expect(halkayiAc(acik)).toEqual(acik);
    expect(halkayiAc(halkayiAc(acik))).toEqual(acik);
  });

  it("halkalariAc tum halkalara uygular", () => {
    const kapali: [number, number][] = [
      [29, 41],
      [29.01, 41],
      [29.01, 41.01],
      [29, 41],
    ];
    expect(halkalariAc([kapali, kapali]).map((h) => h.length)).toEqual([3, 3]);
  });
});

describe("poligonSinirKutusu", () => {
  it("[[minLon,minLat],[maxLon,maxLat]] dondurur", () => {
    expect(
      poligonSinirKutusu([
        [29.0, 41.0],
        [28.9, 41.2],
        [29.3, 40.8],
      ])
    ).toEqual([
      [28.9, 40.8],
      [29.3, 41.2],
    ]);
  });
});

/** Nokta-icinde-mi testi lejantin ilce/mahalle filtresini besler: talep,
 *  bolge ve ekip katmanlari secili sinira gore burada elenir. */
describe("noktaHalkadaMi / noktaAlandaMi", () => {
  // Basit kare: [29,41] - [30,42].
  const kare: [number, number][] = [
    [29, 41],
    [30, 41],
    [30, 42],
    [29, 42],
  ];
  // Ayni kare kapali yazimla (son nokta = ilk nokta); API poligonlari boyle doner.
  const kapaliKare: [number, number][] = [...kare, [29, 41]];
  // Uzakta, ayri bir parca - "Adalar gibi cok halkali sinir" durumu.
  const ikinciParca: [number, number][] = [
    [31, 40],
    [31.5, 40],
    [31.5, 40.5],
    [31, 40.5],
  ];

  it("icerideki noktayi bulur, disaridakini elemez", () => {
    expect(noktaHalkadaMi([29.5, 41.5], kare)).toBe(true);
    expect(noktaHalkadaMi([28.5, 41.5], kare)).toBe(false);
    expect(noktaHalkadaMi([29.5, 42.5], kare)).toBe(false);
  });

  it("halkanin kapali yazilmis olmasi sonucu degistirmez", () => {
    expect(noktaHalkadaMi([29.5, 41.5], kapaliKare)).toBe(true);
    expect(noktaHalkadaMi([28.5, 41.5], kapaliKare)).toBe(false);
  });

  it("cok halkali sinirda her parca bagimsiz poligondur (delik degil)", () => {
    const halkalar = [kare, ikinciParca];
    expect(noktaAlandaMi([29.5, 41.5], halkalar)).toBe(true);
    expect(noktaAlandaMi([31.2, 40.2], halkalar)).toBe(true);
    expect(noktaAlandaMi([30.5, 41.5], halkalar)).toBe(false);
  });
});
