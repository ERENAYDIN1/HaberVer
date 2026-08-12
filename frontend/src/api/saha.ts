import type {
  EkipGorevleri,
  EkipOzet,
  GorevDurumu,
  GorevFeatureCollection,
  HavuzVarlik,
} from "../types/saha";
import { istek } from "./http";

/** Saha calisani son konumunu bildirir. */
export function konumGuncelle(longitude: number, latitude: number) {
  return istek<void>("/saha/konum", {
    method: "POST",
    body: JSON.stringify({ longitude, latitude }),
  });
}

/** Giris yapan saha ekibinin aktif gorevleri. */
export function gorevlerim() {
  return istek<GorevFeatureCollection>("/saha/gorevlerim");
}

/** Giris yapan saha ekibinin yakinda tamamladigi gorevler ("Tamamlanan İşler"). */
export function tamamlananlarim() {
  return istek<GorevFeatureCollection>("/saha/tamamlananlarim");
}

/** Saha ekibi yanlislikla tamamladigi bir gorevi geri alir (yeniden bakim). */
export function tamamlananiGeriAl(assignment_id: string) {
  return istek<void>("/saha/tamamlanan-geri-al", {
    method: "POST",
    body: JSON.stringify({ assignment_id }),
  });
}

/** Personel: tum saha ekiplerinin konum + yuk ozeti. */
export function ekipler() {
  return istek<EkipOzet[]>("/saha/ekipler");
}

/** Personel yonetim panosu: her ekip + kendine dusen aktif gorevler. */
export function ekipGorevleri() {
  return istek<EkipGorevleri[]>("/saha/ekip-gorevleri");
}

/** Personel: havuzda bekleyen (atanmamis) bakim varliklari. */
export function havuz() {
  return istek<HavuzVarlik[]>("/saha/havuz");
}

/** Personel: havuzu (ve bekleyen bolge/guzergahlari) elle yeniden dagitmayi
 *  dener - kayit aninda uygun ekip yokken sonradan uygun hale gelen isleri
 *  telafi eder. */
export function havuzDagit() {
  return istek<{ dagitilan: number }>("/saha/havuz/dagit", { method: "POST" });
}

/** Personel: bir bakim varligini elle bir ekibe (yeniden) yonlendirir. */
export function ekibeAta(asset_id: string, worker_id: string) {
  return istek<void>("/saha/ata", {
    method: "POST",
    body: JSON.stringify({ asset_id, worker_id }),
  });
}

/** Personel: bir varligin o an atali oldugu ekip (havuzdaysa null) + varligin
 *  yakasi (elle atamada 'secilen ekip karsi yakada' uyarisi icin). */
export function gorevDurumu(asset_id: string) {
  return istek<GorevDurumu>(`/saha/gorev/${asset_id}`);
}

/** Personel: bir varligin aktif gorevini iptal edip havuza geri alir. */
export function gorevGeriAl(asset_id: string) {
  return istek<void>("/saha/geri-al", {
    method: "POST",
    body: JSON.stringify({ asset_id }),
  });
}
