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
  // AGAC havuzda (atanmamis), DIREK bir ekibe atali. "Önce atanmamış"
  // siralamasi bu ayrimi okur; havuz ucu yalnizca `bakim_lazim` dondurur.
  havuz: vi.fn(async () => [
    {
      asset_id: AGAC.properties.id,
      name: AGAC.properties.name,
      type: "agac",
      source: "kayitli",
      longitude: 28.98,
      latitude: 41.01,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      yaka: "avrupa",
    },
  ]),
  ekibeAta: vi.fn(),
  gorevGeriAl: vi.fn(),
  gorevDurumu: vi.fn(async () => ({ gorev: null, varlik_yaka: null, varlik_yaka_ad: null })),
}));

/** Bir alan + bir cizgi: "Bölgeler" ve "Güzergâhlar" sekmeleri AYRI panellerdir,
 *  her biri yalnizca kendi tipini listeler. */
const BOLGE_KAYDI = {
  id: "bolge-1",
  ad: "Kadikoy Parki",
  aciklama: null,
  tip: "alan" as const,
  renk: "#7c3aed",
  departman: null,
  noktalar: [
    [
      [28.9, 41.0],
      [28.91, 41.0],
      [28.91, 41.01],
      [28.9, 41.0],
    ] as [number, number][],
  ],
  alan_m2: 1000,
  uzunluk_m: null,
  worker_id: null,
  worker_ad: null,
  assigned_at: null,
  tamamlandi_at: null,
  yaka: "avrupa",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const GUZERGAH_KAYDI = {
  ...BOLGE_KAYDI,
  id: "guzergah-1",
  ad: "Sahil Yolu Hatti",
  tip: "cizgi" as const,
  alan_m2: null,
  uzunluk_m: 500,
  noktalar: [
    [
      [28.9, 41.0],
      [28.92, 41.02],
    ] as [number, number][],
  ],
};

vi.mock("./api/bolgeler", () => ({
  bolgeler: vi.fn(async () => [BOLGE_KAYDI, GUZERGAH_KAYDI]),
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

/** Varlik adlarini LISTEDEKI GERCEK SIRAYLA dondurur. `gorunenAdlar` sabit bir
 *  dizi uzerinde filtreledigi icin siralamayi olcemez; burada DOM sirasi
 *  okunur. */
function siradakiAdlar(): string[] {
  const adlar = [AGAC, DIREK, SAGLAM_BANK, TALEP_VARLIGI].map(
    (v) => v.properties.name
  );
  return [...document.querySelectorAll("li")]
    .map((li) => adlar.find((ad) => li.textContent?.includes(ad)))
    .filter((ad): ad is string => Boolean(ad));
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

/** Sol paneldeki tur filtresi ARTIK checkbox tabanli coklu secim - buton
 *  ICERIGIYLE bulunur (indeksle degil, ayni gerekce: yeni bir filtre eklendiginde
 *  indeks kayiyor ve test ilgisiz bir degisiklik yuzunden anlamsiz bir yerde
 *  patliyordu). */
function tipButonu(): HTMLElement {
  const buton = screen
    .getAllByRole("button")
    .find((b) => /tip seçili|tüm tipler|hiçbiri seçili değil/i.test(b.textContent ?? ""));
  if (!buton) throw new Error("tur acilir dugmesi bulunamadi");
  return buton;
}

/** Tip acilirini ACIK degilse acar (buton tiklamasi zaten acikken tersleyip
 *  kapatir - panel secimden sonra bilincli olarak acik kalir, coklu isaretleme
 *  bir tikla kapanmasin diye). */
async function tipAciliriAc(kullanici: ReturnType<typeof userEvent.setup>) {
  if (screen.queryByText("Tümünü seç") || screen.queryByText("Seçimi temizle")) return;
  await kullanici.click(tipButonu());
}

/** Tip acilirini acar ve verilen tur adindaki checkbox'a tiklar.
 *
 *  Ayni tur adi lejantta da checkbox olarak gecebilir, bu yuzden secim
 *  ICINDE bulundugu `<label>`'a gore daraltilir - tip acilirindaki satirlar
 *  `<label>` iken lejanttakiler farkli bir yapidadir. */
async function tipSec(
  kullanici: ReturnType<typeof userEvent.setup>,
  turAdi: string
) {
  await tipAciliriAc(kullanici);
  const adaylar = await screen.findAllByText(turAdi);
  const kutu = adaylar.find((el) => el.closest("label"));
  if (!kutu) throw new Error(`tip acilirinda '${turAdi}' bulunamadi`);
  await kullanici.click(kutu);
}

/** Tip acilirindaki "Tümünü seç" ile hepsini geri acar. */
async function tipHepsiniSec(kullanici: ReturnType<typeof userEvent.setup>) {
  await tipAciliriAc(kullanici);
  const dugme = await screen.findByText("Tümünü seç");
  await kullanici.click(dugme);
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

    await tipSec(kullanici, "Aydınlatma Direği");

    await waitFor(() => {
      const adlar = gorunenAdlar();
      expect(adlar).toContain("Cinar Agaci");
      expect(adlar).not.toContain("Aydinlatma Diregi");
    });

    // "Tümünü seç"e donunce hepsi geri gelmeli. Regresyon: sorgu bir donem
    // tur/durum ile daraltiliyordu ve o kayitlar hic getirilmiyordu.
    await tipHepsiniSec(kullanici);
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

    await tipSec(kullanici, "Aydınlatma Direği");
    await waitFor(() =>
      expect(gorunenAdlar()).not.toContain("Aydinlatma Diregi")
    );

    // Sorgu tur/durum bilmez; yalnizca `source` degisince yeniden gider.
    expect(vi.mocked(listAssets).mock.calls.length).toBe(oncekiCagri);
  });
});

describe("App - liste aramasi paneli suzer, sorguyu degil", () => {
  /** Varlik panelindeki arama kutusu. Indeksle degil ROL+etiketle bulunur
   *  (tipSecici'deki gerekce). */
  function aramaKutusu(): HTMLInputElement {
    return screen.getByPlaceholderText(/ara…/i) as HTMLInputElement;
  }

  it("arama listeyi daraltir", async () => {
    const kullanici = userEvent.setup();
    sarmala(<App />);
    await varlikPaneliniAc(kullanici);
    await waitFor(() => expect(gorunenAdlar()).toContain("Cinar Agaci"));
    expect(gorunenAdlar()).toContain("Aydinlatma Diregi");

    await kullanici.type(aramaKutusu(), "cinar");

    await waitFor(() =>
      expect(gorunenAdlar()).not.toContain("Aydinlatma Diregi")
    );
    expect(gorunenAdlar()).toContain("Cinar Agaci");
  });

  it("arama BACKEND'e yeni istek gondermez (client-side suzme)", async () => {
    const kullanici = userEvent.setup();
    const { listAssets } = await import("./api/assets");
    sarmala(<App />);
    await varlikPaneliniAc(kullanici);
    await waitFor(() => expect(gorunenAdlar()).toContain("Cinar Agaci"));
    const oncekiCagri = vi.mocked(listAssets).mock.calls.length;

    await kullanici.type(aramaKutusu(), "cinar");
    await waitFor(() =>
      expect(gorunenAdlar()).not.toContain("Aydinlatma Diregi")
    );

    // Arama tur/durum filtresiyle ayni tarafta durur: sorgu degismez.
    expect(vi.mocked(listAssets).mock.calls.length).toBe(oncekiCagri);
  });

  it("temizlenince liste eski haline doner", async () => {
    const kullanici = userEvent.setup();
    sarmala(<App />);
    await varlikPaneliniAc(kullanici);
    await waitFor(() => expect(gorunenAdlar()).toContain("Aydinlatma Diregi"));

    await kullanici.type(aramaKutusu(), "cinar");
    await waitFor(() =>
      expect(gorunenAdlar()).not.toContain("Aydinlatma Diregi")
    );

    await kullanici.clear(aramaKutusu());
    await waitFor(() => expect(gorunenAdlar()).toContain("Aydinlatma Diregi"));
  });

  it("tur ADIYLA da bulunur (kullanici tur kodunu bilmez)", async () => {
    const kullanici = userEvent.setup();
    sarmala(<App />);
    await varlikPaneliniAc(kullanici);
    await waitFor(() => expect(gorunenAdlar()).toContain("Cinar Agaci"));

    // "Aydinlatma Diregi" varliginin turu `direk`, adi "Aydınlatma Direği".
    // Sapkasiz/kucuk harfli yazim da eslesmeli.
    await kullanici.type(aramaKutusu(), "aydinlatma");

    await waitFor(() => expect(gorunenAdlar()).not.toContain("Cinar Agaci"));
    expect(gorunenAdlar()).toContain("Aydinlatma Diregi");
  });
});

describe("App - 'Önce atanmamış' siralamasi (varliklar)", () => {
  function siraSeciciVarlik(): HTMLSelectElement {
    return screen.getByLabelText("Sıralama") as HTMLSelectElement;
  }

  it("atanmamis bakim isi en uste, 'İyi' varlik en sona gider", async () => {
    const kullanici = userEvent.setup();
    sarmala(<App />);
    await varlikPaneliniAc(kullanici);
    await waitFor(() => expect(gorunenAdlar()).toContain("Cinar Agaci"));

    // "İyi" varliklar da listede olsun diye durum filtresi acilir.
    const durumSecici = screen
      .getAllByRole("combobox")
      .find((s) =>
        [...(s as HTMLSelectElement).options].some(
          (o) => o.textContent === "Tüm durumlar"
        )
      ) as HTMLSelectElement;
    await kullanici.selectOptions(durumSecici, "");
    await waitFor(() => expect(gorunenAdlar()).toContain("Saglam Bank"));

    await kullanici.selectOptions(siraSeciciVarlik(), "atanmamis");

    await waitFor(() => {
      const sira = siradakiAdlar();
      // AGAC havuzda (kademe 0), DIREK atali (kademe 1), SAGLAM_BANK iyi (2).
      expect(sira.indexOf("Cinar Agaci")).toBeLessThan(
        sira.indexOf("Aydinlatma Diregi")
      );
      expect(sira.indexOf("Aydinlatma Diregi")).toBeLessThan(
        sira.indexOf("Saglam Bank")
      );
    });
  });

  it("secenek listede yer alir", async () => {
    const kullanici = userEvent.setup();
    sarmala(<App />);
    await varlikPaneliniAc(kullanici);
    await waitFor(() => expect(gorunenAdlar()).toContain("Cinar Agaci"));

    await waitFor(() =>
      expect(
        [...siraSeciciVarlik().options].map((o) => o.textContent)
      ).toContain("Önce atanmamış")
    );
  });
});

describe("App - Bölgeler ve Güzergâhlar AYRI panellerdir", () => {
  /** Kenar cubugundaki bir sekmeyi acar (tam eslesme: lejant dugmeleri de
   *  ayni adla basliyor). */
  async function sekmeAc(
    kullanici: ReturnType<typeof userEvent.setup>,
    ad: string
  ) {
    const dugme = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.trim() === ad);
    if (!dugme) throw new Error(`kenar cubugunda '${ad}' sekmesi bulunamadi`);
    await kullanici.click(dugme);
  }

  function siraSecici(): HTMLSelectElement {
    return screen.getByLabelText("Sıralama") as HTMLSelectElement;
  }

  it("her sekme yalnizca kendi tipini listeler", async () => {
    const kullanici = userEvent.setup();
    sarmala(<App />);

    await sekmeAc(kullanici, "Bölgeler");
    await waitFor(() =>
      expect(screen.getByText("Kadikoy Parki")).toBeInTheDocument()
    );
    expect(screen.queryByText("Sahil Yolu Hatti")).not.toBeInTheDocument();

    await sekmeAc(kullanici, "Güzergâhlar");
    await waitFor(() =>
      expect(screen.getByText("Sahil Yolu Hatti")).toBeInTheDocument()
    );
    expect(screen.queryByText("Kadikoy Parki")).not.toBeInTheDocument();
  });

  it("siralama secimi sekme basina HATIRLANIR, sizmaz", async () => {
    // Iki ayri regresyon tek testte:
    //  1. Sizinti: iki sekme ayni state'i paylasiyordu, birinde secilen
    //     siralama digerine tasiniyordu.
    //  2. Unutma: `key={sekme}` ile ayirmak sizintiyi cozuyordu ama secimi
    //     her sekme degisiminde SIFIRLIYORDU - kullanicinin bildirdigi sorun.
    // Dogru davranis: her sekme kendi secimini korur.
    const kullanici = userEvent.setup();
    sarmala(<App />);

    await sekmeAc(kullanici, "Bölgeler");
    await waitFor(() =>
      expect(screen.getByText("Kadikoy Parki")).toBeInTheDocument()
    );
    await kullanici.selectOptions(siraSecici(), "ad");
    expect(siraSecici().value).toBe("ad");

    // Guzergahlar kendi varsayilaniyla acilir: secim SIZMAZ.
    await sekmeAc(kullanici, "Güzergâhlar");
    await waitFor(() =>
      expect(screen.getByText("Sahil Yolu Hatti")).toBeInTheDocument()
    );
    expect(siraSecici().value).toBe("yeni");
    await kullanici.selectOptions(siraSecici(), "atanmamis");

    // Bolgeler'e donunce KENDI secimi yerinde durur: UNUTULMAZ.
    await sekmeAc(kullanici, "Bölgeler");
    await waitFor(() =>
      expect(screen.getByText("Kadikoy Parki")).toBeInTheDocument()
    );
    expect(siraSecici().value).toBe("ad");

    // Guzergahlar da kendi secimini korur.
    await sekmeAc(kullanici, "Güzergâhlar");
    await waitFor(() =>
      expect(screen.getByText("Sahil Yolu Hatti")).toBeInTheDocument()
    );
    expect(siraSecici().value).toBe("atanmamis");
  });

  it("sekme degisince ARAMA sifirlanir (siralamadan farkli)", async () => {
    // Arama listeyi GIZLER: asili kalirsa sekmeye donen kullanici bos bir
    // liste gorup "kayit yok" sanar. Siralama hicbir sey gizlemedigi icin
    // hatirlanir - bu testin ustundeki testte olculuyor.
    const kullanici = userEvent.setup();
    sarmala(<App />);

    // Varlik panelinde arama her zaman gorunur (bolgedeki 8 kayit esigi yok).
    await varlikPaneliniAc(kullanici);
    await waitFor(() => expect(gorunenAdlar()).toContain("Cinar Agaci"));
    const kutu = screen.getByPlaceholderText(/ara…/i) as HTMLInputElement;
    await kullanici.type(kutu, "cinar");
    expect(kutu.value).toBe("cinar");

    await sekmeAc(kullanici, "Talepler");
    await sekmeAc(kullanici, "Varlıklar");

    await waitFor(() =>
      expect(
        (screen.getByPlaceholderText(/ara…/i) as HTMLInputElement).value
      ).toBe("")
    );
    // Tam liste geri gelmis olmali.
    expect(gorunenAdlar()).toContain("Aydinlatma Diregi");
  });

  it("'Büyükten küçüğe' secenegi YOKTUR", async () => {
    const kullanici = userEvent.setup();
    sarmala(<App />);
    await sekmeAc(kullanici, "Bölgeler");
    await waitFor(() =>
      expect(screen.getByText("Kadikoy Parki")).toBeInTheDocument()
    );

    const etiketler = [...siraSecici().options].map((o) => o.textContent);
    expect(etiketler).not.toContain("Büyükten küçüğe");
    expect(etiketler).toEqual([
      "En yeni",
      "En eski",
      "Ada göre (A-Z)",
      "Önce atanmamış",
    ]);
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
