import type maplibregl from "maplibre-gl";

import { fotoUrl } from "../api/reports";
import { konumCozumle } from "../api/sinirlar";
import {
  ASSET_SOURCE_LABELS,
  ASSET_TYPE_LABELS,
  TIP_RENGI,
  TIP_RENGI_VARSAYILAN,
  durumEtiketi,
} from "../types/asset";
import type { AssetFeature } from "../types/asset";
import { BOLGE_TIP_ETIKETLERI } from "../types/bolge";
import type { Bolge } from "../types/bolge";
import { REPORT_STATUS_LABELS } from "../types/report";
import type { ReportFeature } from "../types/report";
import { MAKS_AKTIF_GOREV } from "../types/saha";
import type { EkipGorevleri } from "../types/saha";
import { alanEtiketi, cokHalkaliAlanM2, mesafeEtiketi } from "./geo";
import { kacis } from "./html";

/** MapLibre popup'lari ve saha ekibi marker'i React degil duz HTML string ile
 *  kurulur. Buradaki her sey girdi -> HTML donduren saf fonksiyonlardir. */

/** Popup'larin ortak genisligi. Cift sayi olmasi onemli: anchor'daki
 *  `translate(-50%)` tek genislikte yarim piksele denk gelip metni
 *  bulaniklastiriyor. (200 + ~20 padding = 220) */
export const POPUP_GENISLIK = "200px";

/** Popup'un alt seridi: TEK bir "Detay" dugmesi, kaydin kendi rengiyle.
 *
 *  Islemler (Düzenle / Varlığı Yönet / Reddi Geri Al / Şekli Düzenle) bilincli
 *  olarak burada degil, acilan detay modalinin aksiyon seridindedir. Eskiden
 *  ikinci bir dolu dugme vardi ve ayni yer her kayit turunde baska bir iliskiyi
 *  anlatiyordu: varlikta "Detay"in bir kisayolu ("Düzenle"), ihbarda ise baska
 *  bir kayda atlama ("Varlığı Yönet"). Kullanici varliklardan "Detay zengindir"
 *  diye ogrenip ihbarda ince bir kart buluyordu. Tek kural kaldi:
 *  isaretciye tikla -> Detay -> ne yapacaksan orada. */
function detayDugmesi(renk: string): string {
  return (
    `<div style="margin-top:8px">` +
    `<button type="button" class="popup-detay-btn" style="` +
    `width:100%; padding:6px 0; border:1px solid ${renk}; border-radius:6px; ` +
    `background:${renk}; color:#fff; font-size:11px; font-weight:600; ` +
    `cursor:pointer;">Detay</button></div>`
  );
}

export function popupIcerigi(asset: AssetFeature): string {
  const { name, type, status, source, brand_model, install_date, photo_url } =
    asset.properties;
  const bakim = status === "bakim_lazim";
  const foto = fotoUrl(photo_url);
  const satirlar = [
    brand_model ? `<div>${kacis(brand_model)}</div>` : "",
    install_date ? `<div>Kurulum: ${kacis(install_date)}</div>` : "",
  ].join("");

  const turRenk = TIP_RENGI[type] ?? TIP_RENGI_VARSAYILAN;

  return `
    <div style="font-family: system-ui, sans-serif; width: ${POPUP_GENISLIK}">
      ${
        foto
          ? `<img src="${kacis(foto)}" style="width:100%; max-height:120px; object-fit:cover; margin-bottom:6px; border:1px solid #e2e8f0;" />`
          : ""
      }
      <div style="font-weight: 600; margin-bottom: 4px">${kacis(name)}</div>
      <div style="color:#475569; font-size:12px; display:flex; align-items:center; gap:5px">
        <span style="display:inline-block; width:9px; height:9px; border-radius:9999px; background:${turRenk}"></span>
        ${ASSET_TYPE_LABELS[type]}
      </div>
      <div style="margin-top:6px; display:flex; gap:4px; flex-wrap:wrap">
        <span style="
          display:inline-block; padding:2px 8px; border-radius:9999px;
          font-size:11px; font-weight:500;
          background:${bakim ? "#fef3c7" : "#d1fae5"};
          color:${bakim ? "#92400e" : "#065f46"}">
          ${durumEtiketi(status, source)}
        </span>
        <span style="
          display:inline-block; padding:2px 8px; border-radius:9999px;
          font-size:11px; font-weight:500;
          background:${source === "ihbar" ? "#fef3c7" : "#d1fae5"};
          color:${source === "ihbar" ? "#92400e" : "#065f46"}">
          ${ASSET_SOURCE_LABELS[source]}
        </span>
      </div>
      <div style="color:#64748b; font-size:11px; margin-top:6px">${satirlar}</div>
      <div class="popup-konum" style="color:#64748b; font-size:11px; margin-top:2px"></div>
      ${detayDugmesi("#059669")}
    </div>
  `;
}

/** Popup acildiktan sonra ilce/mahalle bilgisini backend'den cekip yerlestirir. */
export async function konumSatiriDoldur(
  popup: maplibregl.Popup,
  asset: AssetFeature
) {
  const [lon, lat] = asset.geometry.coordinates;
  try {
    const konum = await konumCozumle(lat, lon);
    const metin = [konum.mahalle?.ad, konum.ilce?.ad].filter(Boolean).join(", ");
    if (!metin) return;
    const el = popup.getElement()?.querySelector(".popup-konum");
    if (el) el.textContent = `📍 ${metin}`;
  } catch {
    // Konum cozumlenemezse satiri bos birak.
  }
}

/** Ihbar popup'i. Karar (onay/ret), reddi geri alma ve onaylanmis ihbardan
 *  varliga gecis "Detay"daki modaldedir - bkz. `detayDugmesi`. */
export function ihbarPopupIcerigi(report: ReportFeature): string {
  const { name, type, status, note, photo_url } = report.properties;
  // Rozet ham durumu degil gorunumu anlatir: tamir edilmis bir is "Onaylandı"
  // yazip acik isle ayni rengi tasimasin.
  const gorunum = report.properties.gorunum ?? status;
  const foto = fotoUrl(photo_url);
  const durumRenk: Record<string, { bg: string; fg: string }> = {
    beklemede: { bg: "#fef3c7", fg: "#92400e" },
    onaylandi: { bg: "#d1fae5", fg: "#065f46" },
    reddedildi: { bg: "#fee2e2", fg: "#991b1b" },
    tamir: { bg: "#f1f5f9", fg: "#475569" },
  };
  const dr = durumRenk[gorunum] ?? durumRenk.beklemede;

  return `
    <div style="font-family: system-ui, sans-serif; width: ${POPUP_GENISLIK}">
      ${
        foto
          ? `<img src="${kacis(foto)}" style="width:100%; max-height:120px; object-fit:cover; margin-bottom:6px; border:1px solid #e2e8f0;" />`
          : ""
      }
      <div style="font-weight: 600; margin-bottom: 4px">${kacis(name)}</div>
      <div style="color:#475569; font-size:12px">${ASSET_TYPE_LABELS[type]} · İhbar</div>
      <div style="margin-top:6px">
        <span style="
          display:inline-block; padding:2px 8px; border-radius:9999px;
          font-size:11px; font-weight:500; background:${dr.bg}; color:${dr.fg}">
          ${REPORT_STATUS_LABELS[gorunum]}
        </span>
      </div>
      ${
        note
          ? `<div style="color:#64748b; font-size:11px; margin-top:6px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden">${kacis(note)}</div>`
          : ""
      }
      ${detayDugmesi("#9333ea")}
    </div>
  `;
}

/** Bolge/guzergah popup'i: alanin ya da cizginin uzerine tiklaninca acilir,
 *  paneldeki kartla ayni bilgiyi verir. */
export function bolgePopupIcerigi(bolge: Bolge): string {
  const cizgi = bolge.tip === "cizgi";
  const olcu = cizgi
    ? bolge.uzunluk_m != null
      ? mesafeEtiketi(bolge.uzunluk_m)
      : null
    : alanEtiketi(bolge.alan_m2 ?? cokHalkaliAlanM2(bolge.noktalar));

  const rozet = (metin: string, bg: string, fg: string) =>
    `<span style="display:inline-block; padding:2px 8px; border-radius:9999px;
      font-size:11px; font-weight:500; background:${bg}; color:${fg}">${kacis(metin)}</span>`;

  return `
    <div style="font-family: system-ui, sans-serif; width: ${POPUP_GENISLIK}">
      <div style="font-weight:600; margin-bottom:4px">${kacis(bolge.ad)}</div>
      <div style="color:#475569; font-size:12px; display:flex; align-items:center; gap:5px">
        <span style="display:inline-block; width:9px; height:9px; border-radius:9999px; background:${bolge.renk}"></span>
        ${BOLGE_TIP_ETIKETLERI[bolge.tip]}${olcu ? ` · ${kacis(olcu)}` : ""}
      </div>
      <div style="margin-top:6px; display:flex; gap:4px; flex-wrap:wrap">
        ${
          bolge.worker_ad
            ? rozet(bolge.worker_ad, "#e0e7ff", "#3730a3")
            : rozet("Atanmamış", "#f1f5f9", "#64748b")
        }
        ${bolge.tamamlandi_at ? rozet("Tamamlandı", "#d1fae5", "#065f46") : ""}
      </div>
      ${
        bolge.aciklama
          ? `<div style="color:#64748b; font-size:11px; margin-top:6px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden">${kacis(
              bolge.aciklama
            )}</div>`
          : ""
      }
      ${detayDugmesi("#7c3aed")}
    </div>
  `;
}

/** Saha ekibi simgesi (kasasinda anahtar tasiyan servis araci); hem pin'de hem
 *  ekip popup'inin basliginda ayni cizim kullanilir. Ikon ~18px cizildigi icin
 *  detay bilincli olarak seyrek tutuldu. */
const EKIP_IKONU =
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">` +
  // kasa + kabin
  `<path d="M13.4 15.7V7.1a1 1 0 0 0-1-1H3.2a1 1 0 0 0-1 1v8.6"/>` +
  `<path d="M13.4 9.5h3.9l3.5 3.7v2.5"/>` +
  // zemin cizgisi (tekerleklerin arasinda kesilir)
  `<path d="M2.2 15.7h2.3M9 15.7h5.6M19.2 15.7h1.6"/>` +
  `<circle cx="6.7" cy="16.9" r="1.9"/><circle cx="16.9" cy="16.9" r="1.9"/>` +
  // Kasadaki capraz iki anahtar: sap cizgisi + iki ucta agzi acik C. Agizlarin
  // dis yaricapi 1.55 birim; merkezleri oynatirken kasa ic yuzlerine (x
  // 3.05-12.55, y 6.95-15.7) bu payi birakmak gerekir.
  `<g stroke="#fcd34d" stroke-width="1.1">` +
  // sol alt <-> sag ust
  `<path d="M5.92 12.22 9.68 9.58"/>` +
  `<path d="M4.76 13.74A1 1 0 1 0 4.1 12.8"/>` +
  `<path d="M10.84 8.06A1 1 0 1 0 11.5 9"/>` +
  // sol ust <-> sag alt
  `<path d="M5.92 9.58 9.68 12.22"/>` +
  `<path d="M4.1 9A1 1 0 1 0 4.76 8.06"/>` +
  `<path d="M11.5 12.8A1 1 0 1 0 10.84 13.74"/>` +
  `</g></svg>`;

/** Ekip marker'inin icerigini (pin + yuk rozeti + ad etiketi) kurar/gunceller.
 *  Ayni element hem olusturmada hem guncellemede kullanilir; stiller
 *  index.css'teki `.ekip-marker*` siniflarinda. */
export function ekipMarkerGuncelle(el: HTMLElement, e: EkipGorevleri): void {
  const dolu = e.aktif_gorev >= MAKS_AKTIF_GOREV;
  const kisaAd = (e.full_name || e.email).replace(/\s*\(.*\)\s*$/, "");
  // className atamasi MapLibre'nin kendi `maplibregl-marker` sinifini silerdi.
  el.classList.add("ekip-marker");
  el.classList.toggle("ekip-marker--dolu", dolu);
  el.innerHTML = `
    <div class="ekip-marker__govde">
      <div class="ekip-marker__pin">${EKIP_IKONU}</div>
      <div class="ekip-marker__rozet">${e.aktif_gorev}</div>
      <div class="ekip-marker__ad">${kacis(kisaAd)} · ${e.aktif_gorev}/${MAKS_AKTIF_GOREV}</div>
    </div>`;
  el.title = `${kisaAd} - detay için tıklayın`;
}

/** ISO tarih -> cok kisa goreli sure ("3 sa", "2 gün"); popup satirlari dar. */
function kisaSure(iso: string | null): string {
  if (!iso) return "";
  const sn = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (sn < 60) return "az önce";
  if (sn < 3600) return `${Math.floor(sn / 60)} dk`;
  if (sn < 86400) return `${Math.floor(sn / 3600)} sa`;
  return `${Math.floor(sn / 86400)} gün`;
}

/** Ekip marker'inin popup'i: ad + yuk + son gorulme + aktif gorevler + son
 *  tamir edilenler. Gorev satirlari tiklanabilir (bkz. `data-gorev-asset`). */
export function ekipPopupHtml(e: EkipGorevleri): string {
  const dolu = e.aktif_gorev >= MAKS_AKTIF_GOREV;
  const vurgu = dolu ? "#dc2626" : "#4f46e5";
  const tamAd = e.full_name || e.email;
  const sonGorulme = e.last_seen_at
    ? new Date(e.last_seen_at).toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  // Kapasite sayidan once gorulsun diye segmentli bir cubukla gosterilir.
  const segmentler = Array.from({ length: MAKS_AKTIF_GOREV }, (_, i) => {
    const doluSegment = i < e.aktif_gorev;
    return `<span style="flex:1;height:4px;border-radius:9999px;background:${
      doluSegment ? vurgu : "#e2e8f0"
    }"></span>`;
  }).join("");
  // `data-gorev-asset`, MapView'in popup'a bagladigi delege dinleyici
  // tarafindan yakalanir ve varligin detay modalini acar; bu yuzden <button>.
  const satirlar = e.gorevler.length
    ? e.gorevler
        .map((g) => {
          const renk = TIP_RENGI[g.type] ?? TIP_RENGI_VARSAYILAN;
          return (
            `<button type="button" class="ekip-gorev-satiri" data-gorev-asset="${kacis(
              g.asset_id
            )}" title="${kacis(g.name)} - detay/tamir icin tıklayın" ` +
            `style="display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;` +
            `background:#f8fafc;border:1px solid #e2e8f0;width:100%;text-align:left;cursor:pointer">` +
            `<span style="width:6px;height:6px;border-radius:9999px;background:${renk};flex:none"></span>` +
            `<span style="flex:1;min-width:0;font-size:11px;color:#0f172a;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${kacis(
              g.name
            )}</span>` +
            `<span style="font-size:10px;color:#94a3b8;flex:none">${kacis(
              ASSET_TYPE_LABELS[g.type]
            )}</span>` +
            `<span style="font-size:11px;color:#cbd5e1;flex:none">›</span>` +
            `</button>`
          );
        })
        .join("")
    : `<div style="padding:6px;border-radius:6px;background:#f8fafc;font-size:11px;color:#94a3b8;text-align:center">Şu an aktif görev yok</div>`;

  // Kisa gecmis; satirlar aktif gorevlerle ayni sekilde tiklanabilir.
  const tamamlananlar = e.son_tamamlananlar ?? [];
  const tamamlananBolum = tamamlananlar.length
    ? `<div style="font-size:11px;font-weight:600;color:#475569;margin:8px 0 4px">Son Tamir Edilenler</div>` +
      `<div style="display:flex;flex-direction:column;gap:3px">` +
      tamamlananlar
        .map(
          (t) =>
            `<button type="button" class="ekip-gorev-satiri" data-gorev-asset="${kacis(
              t.asset_id
            )}" title="${kacis(t.name)} - detay için tıklayın" ` +
            `style="display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:6px;` +
            `background:#fff;border:1px solid #f1f5f9;width:100%;text-align:left;cursor:pointer">` +
            `<span style="font-size:10px;color:#10b981;flex:none">✓</span>` +
            `<span style="flex:1;min-width:0;font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${kacis(
              t.name
            )}</span>` +
            `<span style="font-size:10px;color:#94a3b8;flex:none">${kacis(
              kisaSure(t.completed_at)
            )}</span>` +
            `</button>`
        )
        .join("") +
      `</div>`
    : "";
  return (
    // Genislik sabit ve cift (bkz. POPUP_GENISLIK). Yukseklik de onemli:
    // anchor "bottom" oldugu icin satir yuksekligi `.ekip-popup` sinifiyla
    // tam piksele sabitlenir (index.css), yoksa metin bulaniklasiyor.
    `<div style="font-family:system-ui,sans-serif;width:${POPUP_GENISLIK}">` +
    // Baslik: haritadaki pin + ad + son gorulme
    `<div style="display:flex;align-items:center;gap:8px">` +
    `<span style="width:30px;height:30px;flex:none;border-radius:9999px;background:${
      dolu ? "linear-gradient(145deg,#fb7185,#dc2626)" : "linear-gradient(145deg,#818cf8,#4338ca)"
    };display:flex;align-items:center;justify-content:center">${EKIP_IKONU}</span>` +
    `<span style="min-width:0">` +
    // Ortak 14px satir kutusu 13px ada dar geliyor ('ğ/y' kuyruklari
    // kirpiliyor); bu satira 16px verilir - yine tam piksel.
    `<span style="display:block;line-height:16px;font-weight:600;font-size:13px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${kacis(
      tamAd
    )}</span>` +
    `<span style="display:block;font-size:10px;color:#94a3b8">${
      sonGorulme ? `Son konum ${kacis(sonGorulme)}` : "Konum bilgisi yok"
    }</span>` +
    `</span></div>` +
    // Kapasite
    `<div style="display:flex;align-items:center;gap:6px;margin:8px 0 2px">` +
    `<span style="display:flex;gap:3px;flex:1">${segmentler}</span>` +
    `<span style="font-size:10px;font-weight:700;color:${vurgu}">${e.aktif_gorev}/${MAKS_AKTIF_GOREV}</span>` +
    `</div>` +
    `<div style="font-size:10px;color:#94a3b8;margin-bottom:6px">${
      dolu ? "Kapasitesi dolu - yeni iş atanmaz" : "Yeni iş alabilir"
    }</div>` +
    `<div style="font-size:11px;font-weight:600;color:#475569;margin-bottom:4px">Üzerindeki İşler</div>` +
    `<div style="display:flex;flex-direction:column;gap:3px">${satirlar}</div>` +
    tamamlananBolum +
    `</div>`
  );
}
