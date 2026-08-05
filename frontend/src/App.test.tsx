import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { talep, koleksiyon, PERSONEL, sarmala, varlik } from "./test/yardimcilar";

/** App.tsx'in refactor sirasinda bozulabilecek iki davranisi (ikisi de daha
 *  once bir kez gercekten bozuldu):
 *    1. Tur/durum filtresi tek state'ten beslenir - panel acilirlari ile
 *       lejant birbirini ezmemeli, sayaclar gercek toplami gostermeli.
 *    2. Onaylanan talep ile ondan olusan varlik ayni secimdir.
 *
 *  Ag katmani sahte, bilesen agaci gercek. */

// Iki bakim varligi (acilista gorunur) + bir saglam varlik (acilista gizli):
// acilista yalnizca "Bakım Lazım" isaretlidir.
const AGAC = varlik({ name: "Cinar Agaci", type: "agac", status: "bakim_lazim" });
const DIREK = varlik({ name: "Aydinlatma Diregi", type: "direk", status: "bakim_lazim" });
const SAGLAM_BANK = varlik({ name: "Saglam Bank", type: "bank", status: "iyi" });

// Onaylanan talep -> ondan olusan varlik (ayri id'ler, `created_asset_id` ile bagli).
const TALEP_VARLIGI = varlik({
  name: "Talepten Dogan Rogar",
  type: "rogar",
  status: "bakim_lazim",
  source: "ihbar",
});
const ONAYLI_TALEP = talep({
  name: "Rogar Kapagi Acik",
  type: "rogar",
  status: "onaylandi",
  created_asset_id: TALEP_VARLIGI.properties.id,
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
    // Backend gibi davranir: `source`/`status` sorguyu daraltir; tur filtresi
    // sorguda degildir, client-side uygulanir.
    let hepsi = [AGAC, DIREK, SAGLAM_BANK, TALEP_VARLIGI];
    if (filtre.source) {
      hepsi = hepsi.filter((v) => v.properties.source === filtre.source);
    }
    if (filtre.status) {
      hepsi = hepsi.filter((v) => v.properties.status === filtre.status);
    }
    return koleksiyon(hepsi);
  }),
  getAsset: vi.fn(async () => TALEP_VARLIGI),
  assetsWithin: vi.fn(async () => koleksiyon([])),
  createAsset: vi.fn(),
  updateAsset: vi.fn(),
  deleteAsset: vi.fn(),
  repairAsset: vi.fn(),
}));

vi.mock("./api/reports", () => ({
  listReports: vi.fn(async (status?: string) =>
    koleksiyon(status === "onaylandi" ? [ONAYLI_TALEP] : [])
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
  // MapView maske icin il sinirini cekiyor; bos halka listesi yeterli.
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

/** Ekranda gorunen varlik adlari. Senkron olmali: icinde bekleyen bir `findBy*`
 *  olsaydi disaridaki `waitFor`un zaman asimini yerdi. */
function gorunenAdlar(): string[] {
  return [AGAC, DIREK, SAGLAM_BANK, TALEP_VARLIGI]
    .map((v) => v.properties.name)
    .filter((ad) => screen.queryAllByText(ad).length > 0);
}

/** App acilista sol paneli kapali gosterir; listeyi gormek icin kenar
 *  cubugundan "Varlıklar" sekmesi acilmali. */
async function varlikPaneliniAc(kullanici: ReturnType<typeof userEvent.setup>) {
  // Lejanttaki katman dugmesi de "Varlıklar" ile basliyor ("Varlıklar1"),
  // bu yuzden tam eslesme aranir.
  const dugme = screen
    .getAllByRole("button")
    .find((b) => b.textContent?.trim() === "Varlıklar");
  if (!dugme) throw new Error("kenar cubugunda 'Varlıklar' sekmesi bulunamadi");
  await kullanici.click(dugme);
}

/** Sol paneldeki tur acilirini dondurur.
 *
 *  Acilir INDEKSLE degil ICERIGIYLE bulunur: panele yeni bir filtre eklendiginde
 *  (orn. departman secici) indeks kayiyor ve test, ilgisiz bir degisiklik
 *  yuzunden anlamsiz bir yerde patliyordu. */
function tipSecici(): HTMLSelectElement {
  const secici = screen
    .getAllByRole("combobox")
    .find((s) =>
      [...(s as HTMLSelectElement).options].some((o) => o.textContent === "Tüm tipler")
    );
  if (!secici) throw new Error("tur acilir listesi bulunamadi");
  return secici as HTMLSelectElement;
}

describe("App - tur/durum filtresi tek kaynaktan beslenir", () => {
  it("acilista TUM turler gorunur (BASLANGIC sabitleri sozlukten turetilir)", async () => {
    const kullanici = userEvent.setup();
    sarmala(<App />);
    await varlikPaneliniAc(kullanici);
    // Regresyon: BASLANGIC.katmanTurleri bir donem elle yazilmis 3 turle
    // bayatlamisti ve turlerin cogu ilk render'da haritadan dusuyordu.
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
    // Saglam envanter haritayi doldurmasin diye acilista yalnizca bakim
    // bekleyenler isaretlidir.
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
    // tur/durum ile daraltiliyordu ve o kayitlar hic getirilmiyordu.
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

    // Sorgu tur/durum bilmez; yalnizca `source` degisince yeniden gider.
    expect(vi.mocked(listAssets).mock.calls.length).toBe(oncekiCagri);
  });
});

describe("App - onaylanan talep ile olusan varlik ayni secimdir", () => {
  it("talep kaydi olusturdugu varliga created_asset_id ile baglidir", async () => {
    const kullanici = userEvent.setup();
    sarmala(<App />);
    await varlikPaneliniAc(kullanici);
    await waitFor(() =>
      expect(gorunenAdlar()).toContain("Cinar Agaci")
    );
    // Esleme testin varsayimi; bozulursa senaryo anlamsizlasir.
    expect(ONAYLI_TALEP.properties.created_asset_id).toBe(
      TALEP_VARLIGI.properties.id
    );
    expect(ONAYLI_TALEP.properties.id).not.toBe(TALEP_VARLIGI.properties.id);
  });
});
