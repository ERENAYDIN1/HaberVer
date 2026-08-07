import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

/** Backend'in yayinladigi olay adlari; her biri bir react-query anahtarinin
 *  kokudur (bkz. backend/app/olaylar.py::OlayAdi). Adlarin iki tarafta AYNI
 *  yazilmasi bilincli: "hangi olay hangi ekrani tazeler" sorusu tek kelimeyle
 *  cevaplanabilsin. */
export type OlayAdi = "saha" | "bolgeler" | "assets" | "reports" | "logs";

/** Yedek yoklama araligi (ms). SSE ana kanal, bu yalnizca AGDIR: baglanti
 *  sessizce olurse (proxy zaman asimi, uyuyan sekme) ekran en fazla bu kadar
 *  bayat kalir. Eski periyotlar 10-20 sn'ydi; olay kanali calisirken bu
 *  istekler pratikte hicbir sey degistirmeden doner. */
export const YEDEK_YOKLAMA_MS = 60000;

/** Baglanti durumu - arayuzde "canli" rozeti icin. */
export type CanliDurum = "baglaniyor" | "canli" | "kopuk";

/** Sunucudan gelen degisiklik sinyallerini dinler ve ilgili react-query
 *  anahtarlarini invalidate eder.
 *
 *  NEDEN VERI DEGIL SINYAL: Olay yalnizca "su anahtar degisti" der; veriyi
 *  istemci HER ZAMANKI ucdan yeniden ceker. Boylece kapsam kurallari
 *  (departman suzgeci, 404-vs-403) backend'de tek yerde kalir - olayin icinde
 *  kayit tasinsaydi ayni suzgecleri olay katmaninda ikinci kez yazmak
 *  gerekirdi ve iki mudurluk arasindaki sizinti tam orada olusurdu.
 *
 *  YEDEK YOKLAMA KALDIRILMAZ: `EventSource` kendi kendine yeniden baglanir,
 *  ama sessizce olen bir baglanti (araya giren proxy'nin zaman asimi) fark
 *  edilmeyebilir. Uzun periyotlu bir yoklama, "hic guncellenmiyor" durumunu
 *  imkansiz kilar; maliyeti eskisinin ~1/6'si. */
export function useCanliGuncelleme(etkin: boolean): CanliDurum {
  const queryClient = useQueryClient();
  const [durum, setDurum] = useState<CanliDurum>("baglaniyor");
  // `queryClient` referansi sabittir ama effect'i ona baglamamak icin ref'te
  // tutulur; baglanti yalnizca `etkin` degisince kurulup yikilmali.
  const qcRef = useRef(queryClient);
  qcRef.current = queryClient;

  useEffect(() => {
    if (!etkin) {
      setDurum("baglaniyor");
      return;
    }
    // Cookie ile kimlik dogrulanir (BFF oturumu); `withCredentials` ayni
    // origin'de gerekmez ama proxy arkasinda da dogru davranmasi icin acik.
    const kaynak = new EventSource("/api/olaylar", { withCredentials: true });

    kaynak.onopen = () => setDurum("canli");

    kaynak.addEventListener("tazele", (olay) => {
      try {
        const { anahtar } = JSON.parse((olay as MessageEvent).data) as {
          anahtar: OlayAdi;
        };
        if (!anahtar) return;
        // Prefix invalidate: ["saha"] altindaki tum sorgular (gorevlerim,
        // ekip-gorevleri, havuz, bolgelerim...) tek sinyalle tazelenir.
        qcRef.current.invalidateQueries({ queryKey: [anahtar] });
      } catch {
        // Bozuk paket kanali dusurmemeli; bir sonraki olay yine gelir.
      }
    });

    kaynak.onerror = () => {
      // EventSource kendi yeniden baglanir; burada yalnizca durum yansitilir.
      // `readyState === CLOSED` ise tarayici pes etmistir (ornegin 401).
      setDurum(kaynak.readyState === EventSource.CLOSED ? "kopuk" : "baglaniyor");
    };

    return () => kaynak.close();
  }, [etkin]);

  return durum;
}
