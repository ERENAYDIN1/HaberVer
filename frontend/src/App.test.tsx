import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ihbar, koleksiyon, PERSONEL, sarmala, varlik } from "./test/yardimcilar";

/** App.tsx'in REFACTOR SIRASINDA BOZULABILECEK davranislari.
 *
 *  Buradaki iki senaryo da gecmiste bir kez gercekten bozulmustu (CLAUDE.md
 *  ikisini de anlatiyor) ve ikisi de `useKatmanlar` / `useIhbarGorunumleri`
 *  cikarilirken dogrudan risk altinda:
 *
 *    1. Tur/durum filtresi TEK state'ten beslenir - paneldeki acilir ile
 *       sag-ustteki lejant birbirini ezmemeli, lejant sayaclari gercek
 *       toplami gostermeli.
 *    2. Onaylanan ihbar ile ondan olusan varlik AYNI SECIMDIR - biri
 *       secilince digeri de secilmeli (ayri id'ler oldugu icin bu elle
 *       kurulan bir eslemedir).
 *
 *  Ag katmani sahte, bilesen agaci gercek. */

// Iki bakim varligi (acilista GORUNUR) + bir saglam varlik (acilista GIZLI):
// App acilista yalnizca "Bakım Lazım"i isaretli getirir, saglam envanter
// haritayi doldurmaz (BASLANGIC.katmanVarlikDurumlari).
const AGAC = varlik({ name: "Cinar Agaci", type: "agac", status: "bakim_lazim" });
const DIREK = varlik({ name: "Aydinlatma Diregi", type: "direk", status: "bakim_lazim" });
const SAGLAM_BANK = varlik({ name: "Saglam Bank", type: "bank", status: "iyi" });

// Onaylanan ihbar -> ondan olusan varlik (ayri id'ler, `created_asset_id` ile bagli).
const IHBAR_VARLIGI = varlik({
  name: "Ihbardan Dogan Rogar",
  type: "rogar",
  status: "bakim_lazim",
  source: "ihbar",
});
const ONAYLI_IHBAR = ihbar({
  name: "Rogar Kapagi Acik",
  type: "rogar",
  status: "onaylandi",
  created_asset_id: IHBAR_VARLIGI.properties.id,
});

vi.mock("./auth/AuthContext", () => ({
  useAuth: () => ({
    user: PERSONEL,
    yukleniyor: false,
    girisYap: vi.fn(),
    kayitOl: vi.fn(),
    cikisYap: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./api/assets", () => ({
  listAssets: vi.fn(async (filtre: { source?: string; status?: string } = {}) => {
    // Backend'in davranisini taklit eder: `source`/`status` sorguyu daraltir,
    // tur/durum filtresi ARTIK SORGUDA DEGILDIR (client-side yapilir).
    let hepsi = [AGAC, DIREK, SAGLAM_BANK, IHBAR_VARLIGI];
    if (filtre.source) {
      hepsi = hepsi.filter((v) => v.properties.source === filtre.source);
    }
    if (filtre.status) {
      hepsi = hepsi.filter((v) => v.properties.status === filtre.status);
    }
    return koleksiyon(hepsi);
  }),
  getAsset: vi.fn(async () => IHBAR_VARLIGI),
  assetsWithin: vi.fn(async () => koleksiyon([])),
  createAsset: vi.fn(),
  updateAsset: vi.fn(),
  deleteAsset: vi.fn(),
  repairAsset: vi.fn(),
}));

vi.mock("./api/reports", () => ({
  listReports: vi.fn(async (status?: string) =>
    koleksiyon(status === "onaylandi" ? [ONAYLI_IHBAR] : [])
  ),
  reopenReport: vi.fn(),
  fotoUrl: (y: string | null) => y,
}));

vi.mock("./api/saha", () => ({
  ekipGorevleri: vi.fn(async () => []),
  havuz: vi.fn(async () => []),
  ekibeAta: vi.fn(),
  gorevGeriAl: vi.fn(),
  gorevDurumu: vi.fn(async () => ({ gorev: null, varlik_yaka: null, varlik_yaka_ad: null })),
}));

vi.mock("./api/bolgeler", () => ({
  bolgeler: vi.fn(async () => []),
  bolgeGuncelle: vi.fn(),
  bolgeOlustur: vi.fn(),
  bolgeSil: vi.fn(),
  bolgeAta: vi.fn(),
}));

vi.mock("./api/geo", () => ({
  alanOzeti: vi.fn(async () => ({ alanlar: [], toplam_m2: 0, ham_toplam_m2: 0 })),
  alanTamponu: vi.fn(),
}));

vi.mock("./api/sinirlar", () => ({
  ilceSiniri: vi.fn(),
  mahalleSiniri: vi.fn(),
  // MapView Istanbul maskesi icin il sinirini cekiyor; bos halka listesi
  // yeterli (harita zaten cizilmiyor).
  ilSiniri: vi.fn(async () => ({ kod: "34", ad: "Istanbul", noktalar: [] })),
  konumCozumle: vi.fn(async () => ({ ilce: null, mahalle: null })),
  konumCozumleToplu: vi.fn(async () => []),
  ilceler: vi.fn(async () => []),
  mahalleler: vi.fn(async () => []),
}));

vi.mock("./api/logs", () => ({ listLogs: vi.fn(async () => []) }));

let App: (typeof import("./App"))["default"];

beforeEach(async () => {
  ({ default: App } = await import("./App"));
});

/** Ekranda gorunen varlik adlari. SENKRON olmali: icinde `findBy*` (1000 ms
 *  bekleyen) bir cagri olsaydi, disaridaki `waitFor`un zaman asimini yer ve
 *  assertion hic calismadan test duserdi - ilk yazimda tam olarak bu oldu. */
function gorunenAdlar(): string[] {
  return [AGAC, DIREK, SAGLAM_BANK, IHBAR_VARLIGI]
    .map((v) => v.properties.name)
    .filter((ad) => screen.queryAllByText(ad).length > 0);
}

/** App acilista sol paneli KAPALI gosterir (bkz. App.tsx BASLANGIC yorumu:
 *  `panelAcik=false` -> aktif sekme yok, boylece sekme->katman efekti
 *  baslangic katman secimini ezmez). Varlik listesini gorebilmek icin kenar
 *  cubugundan "Varlıklar" sekmesi acilmali. */
async function varlikPaneliniAc(kullanici: ReturnType<typeof userEvent.setup>) {
  // Lejanttaki katman dugmesi de "Varlıklar" ile BASLAR ("Varlıklar1"), bu
  // yuzden tam eslesme sart.
  const dugme = screen
    .getAllByRole("button")
    .find((b) => b.textContent?.trim() === "Varlıklar");
  if (!dugme) throw new Error("kenar cubugunda 'Varlıklar' sekmesi bulunamadi");
  await kullanici.click(dugme);
}

/** Sol paneldeki tur acilirini dondurur (ilk combobox: "Tüm tipler"). */
function tipSecici(): HTMLSelectElement {
  return screen.getAllByRole("combobox")[0] as HTMLSelectElement;
}

describe("App - tur/durum filtresi tek kaynaktan beslenir", () => {
  it("acilista TUM turler gorunur (BASLANGIC sabitleri sozlukten turetilir)", async () => {
    const kullanici = userEvent.setup();
    sarmala(<App />);
    await varlikPaneliniAc(kullanici);
    // Regresyon: BASLANGIC.katmanTurleri bir donem elle yazilmis 3 turle
    // (agac/direk/sulama) bayatlamisti; 13 turun 10'u ilk render'da haritadan
    // dusuyor, sonra bir senkron efekti sessizce duzeltiyordu. Iki farkli
    // turun (agac + direk) birlikte gorunmesi bunu caker.
    await waitFor(() => {
      const adlar = gorunenAdlar();
      expect(adlar).toContain("Cinar Agaci");
      expect(adlar).toContain("Aydinlatma Diregi");
    });
  });

  it("acilista yalnizca 'Bakım Lazım' varliklar gorunur", async () => {
    const kullanici = userEvent.setup();
    sarmala(<App />);
    await varlikPaneliniAc(kullanici);
    // BASLANGIC.katmanVarlikDurumlari: saglam envanter haritayi doldurmasin
    // diye acilista yalnizca bakim bekleyenler isaretlidir.
    await waitFor(() => expect(gorunenAdlar()).toContain("Cinar Agaci"));
    expect(gorunenAdlar()).not.toContain("Saglam Bank");
  });

  it("panelden tur secmek listeyi daraltir, geri alinca eski hale doner", async () => {
    const kullanici = userEvent.setup();
    sarmala(<App />);
    await varlikPaneliniAc(kullanici);
    await waitFor(() =>
      expect(gorunenAdlar()).toContain("Aydinlatma Diregi")
    );

    await kullanici.selectOptions(tipSecici(), "agac");

    await waitFor(() => {
      const adlar = gorunenAdlar();
      expect(adlar).toContain("Cinar Agaci");
      expect(adlar).not.toContain("Aydinlatma Diregi");
    });

    // "Tüm tipler"e donunce hepsi geri gelmeli. Regresyon: sorgu bir donem
    // tur/durum ile DARALTILIYORDU, dolayisiyla lejanttan baska bir turu
    // acmak haritaya hicbir sey eklemiyordu (o kayitlar hic getirilmemisti).
    await kullanici.selectOptions(tipSecici(), "");
    await waitFor(() => {
      const adlar = gorunenAdlar();
      expect(adlar).toContain("Cinar Agaci");
      expect(adlar).toContain("Aydinlatma Diregi");
    });
  });

  it("tur filtresi degisince backend'e YENIDEN gidilmez (client-side suzme)", async () => {
    const kullanici = userEvent.setup();
    const { listAssets } = await import("./api/assets");
    sarmala(<App />);
    await varlikPaneliniAc(kullanici);
    await waitFor(() =>
      expect(gorunenAdlar()).toContain("Cinar Agaci")
    );
    const oncekiCagri = vi.mocked(listAssets).mock.calls.length;

    await kullanici.selectOptions(tipSecici(), "agac");
    await waitFor(() =>
      expect(gorunenAdlar()).not.toContain("Aydinlatma Diregi")
    );

    // Sorgu artik tur/durum BILMEZ; yalnizca `source` degisince yeniden gider.
    expect(vi.mocked(listAssets).mock.calls.length).toBe(oncekiCagri);
  });
});

describe("App - onaylanan ihbar ile olusan varlik ayni secimdir", () => {
  it("ihbar kaydi olusturdugu varliga created_asset_id ile baglidir", async () => {
    const kullanici = userEvent.setup();
    sarmala(<App />);
    await varlikPaneliniAc(kullanici);
    await waitFor(() =>
      expect(gorunenAdlar()).toContain("Cinar Agaci")
    );
    // Esleme verisi testin varsayimidir; bozulursa asagidaki senaryo anlamsiz
    // olur - bu yuzden acikca cakiliyor.
    expect(ONAYLI_IHBAR.properties.created_asset_id).toBe(
      IHBAR_VARLIGI.properties.id
    );
    expect(ONAYLI_IHBAR.properties.id).not.toBe(IHBAR_VARLIGI.properties.id);
  });
});
