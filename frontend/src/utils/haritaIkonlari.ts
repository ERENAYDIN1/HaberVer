import type maplibregl from "maplibre-gl";

import { turGlifi, turKodlari, turRengi, turRenkCiftleri } from "../data/turSozlugu";
import { TIP_RENGI_VARSAYILAN } from "../types/asset";
import {
  HALKALI_GORUNUMLER,
  TALEP_DURUM_RENGI,
  TALEP_GIYSISI,
  TALEP_GORUNUMLERI,
  ROZETLI_GORUNUMLER,
  type DurumRozeti,
} from "../types/report";
import { EKIP_VARSAYILAN_RENK } from "./haritaPopup";

/** Haritadaki isaretci goruntuleri: pin/glif/halka/rozet SVG uretimi, haritaya
 *  yukleme ve bunlara bagli stil ifadeleri. MapView'dan ayri, `map` disina dokunmaz. */

const TALEP_PIN_SECIM_RENK = "#0f172a";

/** Sabit degil FONKSIYON: tur sozlugu backend'den geldigi icin ifade ancak
 *  katmanlar kurulurken uretilebilir. `match` en az bir cift ister, sozluk
 *  bossa duz renk donulur. */
export function tipRengiIfadesi(): maplibregl.ExpressionSpecification {
  const ciftler = turRenkCiftleri();
  if (!ciftler.length) {
    return TIP_RENGI_VARSAYILAN as unknown as maplibregl.ExpressionSpecification;
  }
  return [
    "match",
    ["get", "type"],
    ...ciftler,
    TIP_RENGI_VARSAYILAN,
  ] as unknown as maplibregl.ExpressionSpecification;
}

/* Pin, tur glifi, durum halkasi ve rozet AYNI viewBox'ta cizilir; hepsi ayni
 * icon-anchor + icon-size ile eklenir, `icon-offset` hesabi gerekmez. Tuval
 * (34x42) halka/rozetin pin disina tasmasi icin genis. */
const PIN_VIEWBOX = { g: 34, y: 42 };
/** Ham pin path'i (tepesi (12,12) merkezli, ucu (12,31.2)) bu kadar kaydirilir. */
const PIN_KAYDIRMA = { x: 5, y: 10 };
const PIN_BAS = { x: 12 + PIN_KAYDIRMA.x, y: 12 + PIN_KAYDIRMA.y };
export const PIN_BAS_YARICAP = 9.6;

/** `<text>` degil path: data-URI'den raster'a cevrilen SVG'de metin
 *  tarayicinin fontuna kalirdi. */
const ROZET_CIZIMI: Record<DurumRozeti, string> = {
  unlem: `<path d="M0 -3.6 V0.6"/><path d="M0 3.1 h0.01"/>`,
  soru:
    `<path d="M-2.3 -2 C-2.3 -4.6 2.4 -4.5 2.4 -1.9 C2.4 -0.3 0 0.2 0 1.7"/>` +
    `<path d="M0 3.9 h0.01"/>`,
  onay: `<path d="M-2.9 0.2 L-0.9 2.3 L3 -2.4"/>`,
  carpi: `<path d="M-2.5 -2.5 L2.5 2.5"/><path d="M2.5 -2.5 L-2.5 2.5"/>`,
};

/** Yaricap cagirandan gelir: pin rozeti ile varlik rozeti farkli
 *  viewBox'larda ayni ekran boyutuna gelmeli. */
function rozetCizimi(
  cx: number,
  cy: number,
  yaricap: number,
  renk: string,
  simge: DurumRozeti
): string {
  return (
    `<circle cx="${cx}" cy="${cy}" r="${yaricap}" fill="${renk}" ` +
    `stroke="#ffffff" stroke-width="1.9"/>` +
    `<g transform="translate(${cx} ${cy})" fill="none" stroke="#ffffff" ` +
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
    `${ROZET_CIZIMI[simge]}</g>`
  );
}

function pinSvgKabugu(ic: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PIN_VIEWBOX.g} ${PIN_VIEWBOX.y}" ` +
    `width="${PIN_VIEWBOX.g * 2}" height="${PIN_VIEWBOX.y * 2}">${ic}</svg>`
  );
}

/** SVG'yi raster'a cevirip haritaya ekler. Hata durumunda da resolve eder ki
 *  tek bir bozuk goruntu tum katman kurulumunu bloklamasin. */
function svgIkonuYukle(map: maplibregl.Map, id: string, svg: string): Promise<void> {
  if (map.hasImage(id)) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 });
      resolve();
    };
    img.onerror = () => resolve();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

/** Path'ler React ikonlariyla ayni kaynaktan (`GLIF_KITAPLIGI`) gelir. */
function tipGlifiSvg(ic: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" ` +
    `fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" ` +
    `stroke-linejoin="round">${ic}</svg>`
  );
}

/** Ayni glifin pin varyanti: pinin basina oturacak sekilde kucultulup
 *  PIN_VIEWBOX'a yerlestirilir. */
function pinGlifiSvg(ic: string): string {
  const olcek = 0.62;
  return pinSvgKabugu(
    `<g fill="none" stroke="#ffffff" stroke-width="${(2.2 / olcek).toFixed(2)}" ` +
      `stroke-linecap="round" stroke-linejoin="round" ` +
      `transform="translate(${PIN_BAS.x} ${PIN_BAS.y}) scale(${olcek}) translate(-12 -12)">` +
      `${ic}</g>`
  );
}

/** SDF yerine tur basina hazir goruntu uretilir: SDF ham distance field
 *  ister, alfa maskesi kenar/halo davranisini bozuyor. */
function talepPinSvg(renk: string): string {
  return pinSvgKabugu(
    `<g transform="translate(${PIN_KAYDIRMA.x} ${PIN_KAYDIRMA.y})">` +
      `<path d="M12 31.2C12 31.2 2.4 18.6 2.4 12A9.6 9.6 0 1 1 21.6 12C21.6 18.6 12 31.2 12 31.2Z" ` +
      `fill="${renk}" stroke="#ffffff" stroke-width="1.9" stroke-linejoin="round"/></g>`
  );
}

/** Pinin arkasina cizilen durum halkasi; kesikli varyant "karar bekliyor". */
function talepHalkaSvg(renk: string, kesikli: boolean): string {
  const r = PIN_BAS_YARICAP + 3.9;
  return pinSvgKabugu(
    `<circle cx="${PIN_BAS.x}" cy="${PIN_BAS.y}" r="${r}" fill="${renk}" opacity="0.16"/>` +
      `<circle cx="${PIN_BAS.x}" cy="${PIN_BAS.y}" r="${r}" fill="none" stroke="${renk}" ` +
      `stroke-width="2.4"${kesikli ? ` stroke-dasharray="4 3.2"` : ""}/>`
  );
}

function talepRozetSvg(renk: string, simge: DurumRozeti): string {
  // Kayma bas yaricapindan bir tik iceride: tam yaricapta rozetin beyaz
  // konturu viewBox kenarina dayanip kirpiliyordu.
  const kayma = PIN_BAS_YARICAP - 0.4;
  return pinSvgKabugu(
    rozetCizimi(PIN_BAS.x + kayma, PIN_BAS.y - kayma, 6.4, renk, simge)
  );
}

/** Sag-alt omuzda aktif goreve bagli oldugunu gosteren nokta (ayni renk ve
 *  kose saha ekibi pininde de kullanilir, bkz. EKIP_VARSAYILAN_RENK). */
function talepAtamaSvg(): string {
  // Kayma pin BASINA degil durum halkasinin yaricapina gore: bas yaricapina
  // hizalanirsa nokta halkanin altinda yariya kadar gizleniyordu. Kosegen
  // izdusumu (r/√2) noktayi halkanin kenarina oturtur.
  const kayma = (PIN_BAS_YARICAP + 3.9) / Math.SQRT2;
  return pinSvgKabugu(
    `<circle cx="${(PIN_BAS.x + kayma).toFixed(2)}" cy="${(PIN_BAS.y + kayma).toFixed(2)}" r="4.4" ` +
      `fill="${EKIP_VARSAYILAN_RENK}" stroke="#ffffff" stroke-width="1.9"/>`
  );
}

/** Bu halka (`assets-durum`) "bakim lazim"in TEK gorsel isaretidir. */
export const VARLIK_UYARI_RENK = TALEP_DURUM_RENGI.onaylandi;

function tipIkonuYukle(map: maplibregl.Map, tur: string): Promise<void> {
  const ic = turGlifi(tur);
  const renk = turRengi(tur);
  return Promise.all([
    svgIkonuYukle(map, `tip-${tur}`, tipGlifiSvg(ic)),
    svgIkonuYukle(map, `pin-glif-${tur}`, pinGlifiSvg(ic)),
    svgIkonuYukle(map, `talep-pin-${tur}`, talepPinSvg(renk)),
  ]).then(() => undefined);
}

/** Stil degisiminde katmanlar bastan kuruldugu icin tekrar cagrilir. */
export function tipIkonlariniHazirla(map: maplibregl.Map): Promise<void> {
  return Promise.all([
    ...turKodlari().map((tur) => tipIkonuYukle(map, tur)),
    ...HALKALI_GORUNUMLER.map((d) =>
      svgIkonuYukle(
        map,
        `talep-halka-${d}`,
        talepHalkaSvg(TALEP_DURUM_RENGI[d], TALEP_GIYSISI[d].halkaKesikli)
      )
    ),
    ...ROZETLI_GORUNUMLER.map((d) =>
      svgIkonuYukle(
        map,
        `talep-rozet-${d}`,
        talepRozetSvg(TALEP_DURUM_RENGI[d], TALEP_GIYSISI[d].rozet as DurumRozeti)
      )
    ),
    svgIkonuYukle(map, "talep-pin-secim", talepPinSvg(TALEP_PIN_SECIM_RENK)),
    svgIkonuYukle(map, "talep-pin-atama", talepAtamaSvg()),
  ]).then(() => undefined);
}

export const TALEP_OPAKLIK_IFADESI = [
  "match",
  ["coalesce", ["get", "gorunum"], ["get", "status"]],
  ...TALEP_GORUNUMLERI.flatMap((d) => [d, TALEP_GIYSISI[d].opaklik]),
  1,
] as unknown as maplibregl.ExpressionSpecification;

export function gorunumFiltresi(gorunumler: readonly string[]) {
  return [
    "in",
    ["coalesce", ["get", "gorunum"], ["get", "status"]],
    ["literal", gorunumler],
  ] as unknown as maplibregl.FilterSpecification;
}
