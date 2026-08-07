import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EkipOzet } from "../types/saha";
import EkipSecici from "./EkipSecici";

/** Ekip secici, atama durumunu SUNUCUDAN (`mevcutWorkerId`) okur ama secimi
 *  kendi state'inde tutar. Bu testler ikisinin birbirine karismadigini olcer:
 *  "ata -> havuza al -> tekrar ata" dizisinde secici, kayit havuzdayken onu
 *  hala atali sanip dugmeyi kilitliyordu. */

const ekip = (id: string, ad: string, aktif = 0): EkipOzet => ({
  id,
  full_name: ad,
  email: `${id}@ornek.com`,
  longitude: 28.98,
  latitude: 41.01,
  last_seen_at: null,
  aktif_gorev: aktif,
  yaka: "avrupa",
  departman: "fen_isleri",
});

const EKIPLER = [ekip("a", "Ekip A"), ekip("b", "Ekip B")];
const IS = { konum: [28.98, 41.01] as [number, number], yaka: "avrupa", departman: "fen_isleri" };

/** Bileseni verilen atama durumuyla cizer; `rerender(workerId)` sunucudan yeni
 *  durumun gelmesini taklit eder. */
function kur(mevcutWorkerId: string | null, onAta = vi.fn(), islemde = false) {
  const ciz = (wid: string | null, isl: boolean) => (
    <EkipSecici
      ekipler={EKIPLER}
      is={IS}
      mevcutWorkerId={wid}
      onAta={onAta}
      islemde={isl}
      kaldirilabilir
    />
  );
  const utils = render(ciz(mevcutWorkerId, islemde));
  return {
    onAta,
    ...utils,
    yeniDurum: (wid: string | null, isl = false) => utils.rerender(ciz(wid, isl)),
  };
}

/** Onay dugmesi: metni duruma gore "Ata" / "Zaten atalı" / "…" olur, ama
 *  "Atamayı kaldır" ile karismamali - tam eslesme kullanilir. */
const ataDugmesi = () =>
  screen.getByRole("button", { name: /^(Ata|Zaten atalı|…)$/ });

describe("EkipSecici - secim ile sunucu durumu karismaz", () => {
  it("atali ekip yeniden secilirse 'Zaten atalı' der ve atamaz", async () => {
    const kullanici = userEvent.setup();
    kur("a");
    await kullanici.click(screen.getByText("Ekip A"));
    expect(ataDugmesi()).toBeDisabled();
    expect(ataDugmesi()).toHaveTextContent("Zaten atalı");
  });

  /** Bildirilen hata: "ata -> havuza al -> tekrar ata" dizisinde ucuncu adim
   *  "Zaten atalı" deyip kilitleniyordu. Kritik nokta ZAMANLAMA - kullanici,
   *  havuza alma yaniti gelmeden ekibi yeniden seciyor, yani `mevcutWorkerId`
   *  o an hala "a". Sifirlama `onAta` cagrisina baglanmis olsaydi bu dizi yine
   *  kirilirdi; atamanin kendisine bagli oldugu icin kirilmiyor. */
  it("HAVUZA ALINDIKTAN sonra ayni ekip tekrar atanabilir", async () => {
    const kullanici = userEvent.setup();
    const { onAta, yeniDurum } = kur("a");

    // 1) Havuza al - istek ucuyor, yanit HENUZ GELMEDI (mevcutWorkerId = "a").
    await kullanici.click(screen.getByText(/Atamayı kaldır/));
    expect(onAta).toHaveBeenCalledWith(null);
    yeniDurum("a", true);

    // 2) Kullanici beklemeden ayni ekibi yeniden seciyor.
    await kullanici.click(screen.getByText("Ekip A"));
    expect(ataDugmesi()).not.toHaveTextContent("Zaten atalı");

    // 3) Yanit geldi: kayit artik havuzda.
    yeniDurum(null);
    await kullanici.click(screen.getByText("Ekip A"));
    expect(ataDugmesi()).toBeEnabled();
    expect(ataDugmesi()).toHaveTextContent("Ata");
    await kullanici.click(ataDugmesi());
    expect(onAta).toHaveBeenLastCalledWith("a");
  });

  /** Hatanin asil mekanizmasi: `invalidateQueries` beklenmedigi icin "islem
   *  bitti" (islemde=false) yeni veriden ONCE geliyordu. O pencerede
   *  `mevcutWorkerId` hala eski atamayi tasir. Cagiran taraflar artik tazelemeyi
   *  bekliyor (AssetDetayModal/BolgePaneli/BolgeDetayModal::tazele), ama secici
   *  bu durumda da kendini toparlayabilmeli. */
  it("islem bittiginde veri BAYATSA bile eski secim kilitlenmeye yol acmaz", async () => {
    const kullanici = userEvent.setup();
    const { yeniDurum } = kur("a");
    await kullanici.click(screen.getByText("Ekip A"));
    expect(ataDugmesi()).toHaveTextContent("Zaten atalı");

    // Havuza alindi: veri geldigi an secim birakilir, dugme "Ata"ya doner.
    yeniDurum(null);
    expect(ataDugmesi()).toHaveTextContent("Ata");
    await kullanici.click(screen.getByText("Ekip A"));
    expect(ataDugmesi()).toBeEnabled();
  });

  it("istek ucarken 'Zaten atalı' IDDIA EDILMEZ (mevcutWorkerId bayat olabilir)", async () => {
    const kullanici = userEvent.setup();
    const { yeniDurum } = kur(null);
    await kullanici.click(screen.getByText("Ekip A"));

    // Havuza alma istegi ucuyor: sunucu hala "a atali" diyor ama islem surmekte.
    yeniDurum("a", true);
    expect(ataDugmesi()).toHaveTextContent("…");
    expect(ataDugmesi()).not.toHaveTextContent("Zaten atalı");
  });

  it("atama degisince secim birakilir - eski secim ekranda kalmaz", async () => {
    const kullanici = userEvent.setup();
    const { yeniDurum } = kur(null);
    await kullanici.click(screen.getByText("Ekip B"));
    expect(ataDugmesi()).toBeEnabled();

    // Atama sunucuda gerceklesti; secim tuketilmis sayilir.
    yeniDurum("b");
    expect(ataDugmesi()).toBeDisabled();
    expect(ataDugmesi()).toHaveTextContent("Ata");
  });
});
