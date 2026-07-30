import { useState, type ReactElement } from "react";

import {
  IconCheck,
  IconChevronRight,
  IconInbox,
  IconLayers,
  IconLegend,
  IconPin,
  IconRoute,
  IconUsers,
} from "./icons";

/** Haritada bagimsiz olarak acilip kapatilabilen genel-bakis katmanlari. */
export type KatmanAnahtari =
  | "varliklar"
  | "ihbarlar"
  | "bolgeler"
  | "guzergahlar"
  | "ekipler";

export type KatmanGorunurluk = Record<KatmanAnahtari, boolean>;

/** Bir ana katmanin altindaki tekil filtre secenegi (varlik turu / ihbar durumu). */
export interface AltFiltre {
  anahtar: string;
  etiket: string;
  /** Haritadaki isaretci rengiyle ayni renk noktasi (lejant). */
  renk: string;
  secili: boolean;
  sayi: number;
}

/** Bir katmanin alt-filtrelerinin bir kirilimi. Varliklar katmaninda iki grup
 *  vardir (Tur / Durum), ihbarlarda tek grup (durum) - tek grupta baslik
 *  gereksiz kalabalik olacagindan `baslik` opsiyoneldir. */
export interface AltGrup {
  baslik?: string;
  secenekler: AltFiltre[];
  onSec: (anahtar: string) => void;
}

interface KatmanTanimi {
  anahtar: KatmanAnahtari;
  etiket: string;
  /** Haritadaki isaretci rengiyle birebir ayni (marker paletiyle uyumlu). */
  renk: string;
  ikon: (p: { className?: string }) => ReactElement;
}

/** Katman sirasi/etiketleri tek yerde; harita marker renkleriyle eslesir:
 *  varlik yesili, ihbar moru (MapView IHBAR_RENK), bolge menekse, guzergah
 *  mavisi, saha ekibi indigosu. Bolgeler/guzergahlar bilincli olarak ihbarlarla
 *  saha ekipleri ARASINDA durur: ustteki ikisi "is", alttaki "kim" - ikisi de
 *  bunlari baglayan gorev alani. Gorev bolgeleri (alan) ve guzergahlar (cizgi)
 *  ayri ayri acilip kapatilir; sol paneldeki iki ayri sekmeyle birebir eslesir. */
const KATMANLAR: KatmanTanimi[] = [
  { anahtar: "varliklar", etiket: "Varlıklar", renk: "#059669", ikon: IconPin },
  { anahtar: "ihbarlar", etiket: "İhbarlar", renk: "#9333ea", ikon: IconInbox },
  { anahtar: "bolgeler", etiket: "Bölgeler", renk: "#7c3aed", ikon: IconLayers },
  { anahtar: "guzergahlar", etiket: "Güzergâhlar", renk: "#2563eb", ikon: IconRoute },
  { anahtar: "ekipler", etiket: "Saha Ekipleri", renk: "#4f46e5", ikon: IconUsers },
];

interface KatmanKontroluProps {
  gorunur: KatmanGorunurluk;
  onDegistir: (anahtar: KatmanAnahtari) => void;
  /** Her katmanin o an haritadaki adedi (rozet). */
  sayilar: Record<KatmanAnahtari, number>;
  /** Varliklar katmaninin alt-filtreleri: tur (agac/direk/sulama) + durum
   *  (iyi/bakim lazim) olmak uzere iki grup. */
  varlikAlt: AltGrup[];
  /** Ihbarlar katmaninin durum alt-filtreleri (beklemede/onaylandi/reddedildi). */
  ihbarAlt: AltGrup[];
}

/**
 * Haritanin sag-ust kosesindeki lejant + katman filtresi. Kullanici varlik,
 * ihbar ve saha ekibi katmanlarini "tik atarak" bagimsizca acip kapatabilir;
 * ayrica Varliklar (tur + durum) ve Ihbarlar (durum) katmanlarini kendi icinde ince
 * filtreleyebilir. Kart dar tutulur, alt-filtreler dikey olarak acilir - yazi
 * sikismaz/kaymaz. Baslik satirindan tumu kucuk bir dugmeye indirilebilir.
 */
export default function KatmanKontrolu({
  gorunur,
  onDegistir,
  sayilar,
  varlikAlt,
  ihbarAlt,
}: KatmanKontroluProps) {
  const [acik, setAcik] = useState(true);
  // Hangi ana katmanlarin alt-filtresi genisletilmis (varsayilan: kapali).
  const [genis, setGenis] = useState<Record<string, boolean>>({});
  const acikSayisi = KATMANLAR.filter((k) => gorunur[k.anahtar]).length;

  const genisletmeDegistir = (anahtar: string) =>
    setGenis((g) => ({ ...g, [anahtar]: !g[anahtar] }));

  if (!acik) {
    return (
      <div className="absolute right-3 top-3 z-20">
        <button
          onClick={() => setAcik(true)}
          title="Katmanlar"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white/90 text-slate-600 shadow-lg shadow-slate-900/5 backdrop-blur-md transition hover:text-slate-900"
        >
          <IconLegend className="h-5 w-5" />
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {acikSayisi}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="absolute right-3 top-3 z-20 w-52 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-xl shadow-slate-900/10 backdrop-blur-md">
      <button
        onClick={() => setAcik(false)}
        className="flex w-full items-center gap-2 border-b border-slate-200/70 px-3 py-2.5 text-left transition hover:bg-slate-50/70"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <IconLegend className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 text-sm font-semibold text-slate-800">Katmanlar</span>
        <IconChevronRight className="h-4 w-4 -rotate-90 text-slate-400" />
      </button>

      <div className="p-1.5">
        {KATMANLAR.map((katman) => {
          const secili = gorunur[katman.anahtar];
          const Ikon = katman.ikon;
          const altlar =
            katman.anahtar === "varliklar"
              ? varlikAlt
              : katman.anahtar === "ihbarlar"
                ? ihbarAlt
                : null;
          const genisletilmis = altlar ? genis[katman.anahtar] : false;

          return (
            <div key={katman.anahtar}>
              <div className="flex items-center gap-1.5 rounded-xl pr-1 transition hover:bg-slate-50">
                {/* Renkli kutucuk + ikon: katmani ac/kapat (tek dokunusluk). */}
                <button
                  onClick={() => onDegistir(katman.anahtar)}
                  aria-pressed={secili}
                  title={secili ? "Katmanı gizle" : "Katmanı göster"}
                  className="flex items-center gap-2 py-2 pl-2"
                >
                  <span
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-2 transition"
                    style={{
                      borderColor: secili ? katman.renk : "#cbd5e1",
                      backgroundColor: secili ? katman.renk : "transparent",
                    }}
                  >
                    <Ikon
                      className={`h-3.5 w-3.5 ${secili ? "text-white" : "text-slate-400"}`}
                    />
                  </span>
                </button>

                {/* Etiket + sayi + (alt-filtre varsa) genislet oku: bu bolge
                    alt-filtreleri acar/kapar; alt-filtresi olmayan katmanda
                    yine katmani ac/kapatir. */}
                <button
                  onClick={() =>
                    altlar ? genisletmeDegistir(katman.anahtar) : onDegistir(katman.anahtar)
                  }
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left"
                >
                  <span
                    className={`flex-1 whitespace-nowrap text-[13px] font-semibold leading-tight ${
                      secili ? "text-slate-800" : "text-slate-400"
                    }`}
                  >
                    {katman.etiket}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums transition ${
                      secili ? "bg-slate-100 text-slate-700" : "bg-slate-50 text-slate-300"
                    }`}
                  >
                    {sayilar[katman.anahtar].toLocaleString("tr-TR")}
                  </span>
                  {altlar && (
                    <IconChevronRight
                      className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${
                        genisletilmis ? "rotate-90" : ""
                      }`}
                    />
                  )}
                </button>
              </div>

              {/* Alt-filtreler: dikey liste, sola girintili, hafif ayrac cizgisiyle. */}
              {altlar && genisletilmis && (
                <div className="mb-1 ml-4 border-l border-slate-200 pl-1.5">
                  {altlar.map((grup, i) => (
                    <div key={grup.baslik ?? i} className={i > 0 ? "mt-1" : undefined}>
                      {grup.baslik && (
                        <p className="px-1.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          {grup.baslik}
                        </p>
                      )}
                      {grup.secenekler.map((alt) => (
                        <button
                          key={alt.anahtar}
                          onClick={() => grup.onSec(alt.anahtar)}
                          aria-pressed={alt.secili}
                          disabled={!secili}
                          className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition ${
                            secili ? "hover:bg-slate-50" : "cursor-not-allowed opacity-50"
                          }`}
                        >
                          <span
                            className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border transition"
                            style={{
                              borderColor: alt.secili ? alt.renk : "#cbd5e1",
                              backgroundColor: alt.secili ? alt.renk : "transparent",
                            }}
                          >
                            {alt.secili && <IconCheck className="h-2.5 w-2.5 text-white" />}
                          </span>
                          <span
                            className={`flex-1 whitespace-nowrap text-[12px] font-medium leading-tight ${
                              alt.secili ? "text-slate-700" : "text-slate-400"
                            }`}
                          >
                            {alt.etiket}
                          </span>
                          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">
                            {alt.sayi.toLocaleString("tr-TR")}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
