import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BolgeYanit } from "../types/bolge";
import type { EkipOzet } from "../types/saha";
import { sarmala } from "../test/yardimcilar";

/** Atama akisi ucdan uca: kart -> EkipSecici -> API -> tazeleme -> kart.
 *  Bildirilen hata bu zincirdeydi - atama sunucuda oluyor ama panel eski
 *  durumu gosterip "havuza geri al"i hic cikarmiyordu. */

const BOLGE: BolgeYanit = {
  id: "b1",
  ad: "Test Alanı",
  aciklama: null,
  renk: "#7c3aed",
  departman: "fen_isleri",
  noktalar: [
    [
      [28.9, 41.0],
      [28.91, 41.0],
      [28.91, 41.01],
      [28.9, 41.0],
    ],
  ],
  alan_m2: 1000,
  worker_id: null,
  worker_ad: null,
  assigned_at: null,
  tamamlandi_at: null,
  yaka: "avrupa",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const EKIP: EkipOzet = {
  id: "w1",
  full_name: "Ekip A",
  email: "a@ornek.com",
  longitude: 28.9,
  latitude: 41.0,
  last_seen_at: null,
  aktif_gorev: 0,
  yaka: "avrupa",
  departman: "fen_isleri",
};

/** Sunucu durumu testin icinde yasar: `bolgeAta` onu degistirir, `bolgeler`
 *  her cagrildiginda guncel hali doner - gercek tazeleme dongusu gibi. */
let sunucudakiBolge: BolgeYanit;

vi.mock("../api/bolgeler", () => ({
  bolgeler: () => Promise.resolve([sunucudakiBolge]),
  bolgeAta: (_id: string, workerId: string | null) => {
    sunucudakiBolge = {
      ...sunucudakiBolge,
      worker_id: workerId,
      worker_ad: workerId ? "Ekip A" : null,
    };
    return Promise.resolve(sunucudakiBolge);
  },
  bolgeGuncelle: vi.fn(),
  bolgeSil: vi.fn(),
}));

// Panel iki ucu birden ceker; bu test yalnizca alan tarafini olcuyor ama
// guzergah sorgusu cozulmeden birlesik liste undefined kalirdi.
vi.mock("../api/guzergahlar", () => ({
  guzergahlar: () => Promise.resolve([]),
  guzergahAta: vi.fn(),
  guzergahGuncelle: vi.fn(),
  guzergahSil: vi.fn(),
}));

vi.mock("../hooks/useDepartmanlar", () => ({
  useDepartmanlar: () => ({ data: [] }),
}));

// eslint-disable-next-line import/first
import BolgePaneli from "./BolgePaneli";

function ciz() {
  return sarmala(
    <BolgePaneli
      tip="alan"
      alanda={null}
      ekipler={[EKIP]}
      gizliler={new Set()}
      onGorunurlukDegis={vi.fn()}
      onTumunuGoster={vi.fn()}
      onTumunuGizle={vi.fn()}
      katmanAcik
      onBolgeyeGit={vi.fn()}
      seciliId={null}
    />
  );
}

describe("BolgePaneli - atama sonrasi panel guncellenir", () => {
  beforeEach(() => {
    sunucudakiBolge = { ...BOLGE };
  });

  it("atamayi kaldirinca kart havuza doner", async () => {
    sunucudakiBolge = { ...BOLGE, worker_id: "w1", worker_ad: "Ekip A" };
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.click(await screen.findByText(/Görev ekibi: Ekip A/));
    await kullanici.click(await screen.findByText(/Atamayı kaldır/));

    await waitFor(() =>
      expect(screen.getByText(/Görev ekibi seç/)).toBeInTheDocument()
    );
    expect(screen.queryByText(/Atamayı kaldır/)).not.toBeInTheDocument();
  });

  it("ekibe atayinca kart atamayi gosterir ve 'havuza geri al' cikar", async () => {
    const kullanici = userEvent.setup();
    ciz();

    // Atama bolumunu ac (katlanmis duruyor).
    const acKapa = await screen.findByText(/Görev ekibi seç/);
    await kullanici.click(acKapa);

    // Ekibi sec ve ata.
    await kullanici.click(await screen.findByText("Ekip A"));
    await kullanici.click(screen.getByRole("button", { name: /^Ata$/ }));

    // Tazeleme sonrasi: kart artik ekibi gosterir...
    await waitFor(() =>
      expect(screen.getByText(/Görev ekibi: Ekip A/)).toBeInTheDocument()
    );
    // ...ve atamayi kaldirma secenegi gorunur olur.
    expect(screen.getByText(/Atamayı kaldır/)).toBeInTheDocument();
  });
});
