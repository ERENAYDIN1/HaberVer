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
import { REPORT_STATUS_LABELS } from "../types/report";
import type { ReportFeature } from "../types/report";
import { MAKS_AKTIF_GOREV } from "../types/saha";
import type { EkipGorevleri } from "../types/saha";
import { kacis } from "./html";

/** MapLibre popup'lari ve saha ekibi DOM marker'i React degil, duz HTML string
 *  uretilerek kurulur. Bu dosya o uretimi MapView'in harita yasam dongusunden
 *  ayirir: buradaki her sey girdi -> HTML string olan saf fonksiyonlardir,
 *  harita durumuna (ref/effect) hic dokunmaz. */

/** Varlik ve ihbar popup'lari icin ortak, sabit ve CIFT piksellik genislik.
 *  Ayni genislik iki popup'i birebir esitler (istenen: hepsi "onaylandi"
 *  boyutunda). Ayrica cift sayi olmasi kritik: MapLibre popup'i kesirsiz tam
 *  piksele yuvarlar ama anchor'daki `translate(-50%)` tek genislikte yarim
 *  piksele denk gelip metni bulaniklastiriyordu; cift genislikte -%50 tam
 *  piksele oturur ve yazi keskin kalir. (200 + ~20 padding = 220, cift.) */
export const POPUP_GENISLIK = "200px";

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
      <button type="button" class="popup-detay-btn" style="
        margin-top:8px; width:100%; padding:5px 0; border:1px solid #059669;
        border-radius:6px; background:#fff; color:#059669; font-size:11px;
        font-weight:600; cursor:pointer;">Detayları Gör</button>
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

export function ihbarPopupIcerigi(report: ReportFeature): string {
  const { name, type, status, note, photo_url } = report.properties;
  const foto = fotoUrl(photo_url);
  const durumRenk: Record<string, { bg: string; fg: string }> = {
    beklemede: { bg: "#fef3c7", fg: "#92400e" },
    onaylandi: { bg: "#d1fae5", fg: "#065f46" },
    reddedildi: { bg: "#fee2e2", fg: "#991b1b" },
  };
  const dr = durumRenk[status] ?? durumRenk.beklemede;

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
          ${REPORT_STATUS_LABELS[status]}
        </span>
      </div>
      ${
        note
          ? `<div style="color:#64748b; font-size:11px; margin-top:6px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden">${kacis(note)}</div>`
          : ""
      }
      <button type="button" class="popup-detay-btn" style="
        margin-top:8px; width:100%; padding:5px 0; border:1px solid #9333ea;
        border-radius:6px; background:#fff; color:#9333ea; font-size:11px;
        font-weight:600; cursor:pointer;">Detayları Gör</button>
    </div>
  `;
}

/** Saha ekibi simgesi: servis araci silueti - hem pin'in icinde hem ekip
 *  popup'inin basliginda ayni cizim kullanilir. Varlik glifleri (agac/direk/
 *  sulama) cizgisel dogal formlar oldugundan arac silueti onlarla karismaz. */
const EKIP_IKONU =
  `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
  `<path d="M13.5 17.5V7.2a1.7 1.7 0 0 0-1.7-1.7H4.2A1.7 1.7 0 0 0 2.5 7.2v9.4a.9.9 0 0 0 .9.9h1.3"/>` +
  `<path d="M9.2 17.5h2.6"/>` +
  `<path d="M18.4 17.5h2a.9.9 0 0 0 .9-.9v-3.3a.9.9 0 0 0-.2-.56l-3.1-3.9a.9.9 0 0 0-.7-.34h-3.8"/>` +
  `<circle cx="7" cy="17.6" r="1.9"/><circle cx="16.5" cy="17.6" r="1.9"/></svg>`;

/** Bir saha ekibi DOM marker'inin icerigini (damla pin + yuk rozeti + gizli ad
 *  etiketi) kurar/gunceller. Ayni element hem olusturmada hem guncellemede
 *  kullanilir; stiller `index.css`'teki `.ekip-marker*` siniflarinda (etiket
 *  mutlak konumlu -> isaretcinin kapladigi yer sabit). Tam ad uzerine gelince
 *  belirir, gorevler markera tiklaninca acilir. */
export function ekipMarkerGuncelle(el: HTMLElement, e: EkipGorevleri): void {
  const dolu = e.aktif_gorev >= MAKS_AKTIF_GOREV;
  const kisaAd = (e.full_name || e.email).replace(/\s*\(.*\)\s*$/, "");
  // classList: MapLibre'nin element'e ekledigi `maplibregl-marker` sinifi
  // korunmali (className atamasi onu silerdi).
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

/** Bir saha ekibi marker'ina tiklaninca acilan popup: tam ad + yuk + son
 *  gorulme + o an ustundeki aktif gorevlerin listesi (istek: haritadan ekibe
 *  basinca hangi gorevler onda, kac tane gorunsun). */
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
  // Kapasite, sayidan once gorulsun diye 3 segmentli bir cubukla anlatilir.
  const segmentler = Array.from({ length: MAKS_AKTIF_GOREV }, (_, i) => {
    const doluSegment = i < e.aktif_gorev;
    return `<span style="flex:1;height:4px;border-radius:9999px;background:${
      doluSegment ? vurgu : "#e2e8f0"
    }"></span>`;
  }).join("");
  const satirlar = e.gorevler.length
    ? e.gorevler
        .map((g) => {
          const renk = TIP_RENGI[g.type] ?? TIP_RENGI_VARSAYILAN;
          return (
            `<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;background:#f8fafc">` +
            `<span style="width:6px;height:6px;border-radius:9999px;background:${renk};flex:none"></span>` +
            `<span style="flex:1;min-width:0;font-size:11px;color:#0f172a;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${kacis(
              g.name
            )}</span>` +
            `<span style="font-size:10px;color:#94a3b8;flex:none">${kacis(
              ASSET_TYPE_LABELS[g.type]
            )}</span>` +
            `</div>`
          );
        })
        .join("")
    : `<div style="padding:6px;border-radius:6px;background:#f8fafc;font-size:11px;color:#94a3b8;text-align:center">Şu an aktif görev yok</div>`;
  return (
    `<div style="font-family:system-ui,sans-serif;min-width:210px;max-width:250px">` +
    // Baslik: haritadaki pin'in aynisi + ad + son gorulme
    `<div style="display:flex;align-items:center;gap:8px">` +
    `<span style="width:30px;height:30px;flex:none;border-radius:9999px;background:${
      dolu ? "linear-gradient(145deg,#fb7185,#dc2626)" : "linear-gradient(145deg,#818cf8,#4338ca)"
    };display:flex;align-items:center;justify-content:center">${EKIP_IKONU}</span>` +
    `<span style="min-width:0">` +
    `<span style="display:block;font-weight:600;font-size:13px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${kacis(
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
    `</div>`
  );
}
