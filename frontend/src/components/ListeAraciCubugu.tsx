import { useRef } from "react";

import type { SiralamaEtiketi } from "../utils/listeAraci";
import { IconSearch, IconX } from "./icons";

interface ListeAraciCubuguProps {
  /** Arama kutusu gosterilsin mi. Bolge/guzergah panellerinde kapalidir. */
  arama?: {
    deger: string;
    onDegis: (v: string) => void;
    ipucu: string;
    /** Mobil placeholder: dar ekranda uzun ipucu ortadan kesiliyordu, kisa
     *  surum tek emir cumlesidir. Alanlarin tam listesi `aria-label`'da kalir.
     *  Verilmezse `ipucu` kullanilir. */
    mobilIpucu?: string;
  };
  siralama: {
    secenekler: readonly SiralamaEtiketi[];
    deger: string;
    onDegis: (v: string) => void;
  };
  /** Suzme sonrasi kalan / toplam kayit; arama aktifken "12 / 340" yazar. */
  sayac?: { gorunen: number; toplam: number; birim: string };
  mobil?: boolean;
}

/** Varlik / talep / bolge listelerinin ustunde duran ortak arac cubugu: arama
 *  girdisi + siralama acilirı. Arama yalnizca paneli suzer, haritaya
 *  dokunmaz (bkz. CLAUDE.md "Alan secimi HARITAYI DARALTMAZ"). */
export default function ListeAraciCubugu({
  arama,
  siralama,
  sayac,
  mobil,
}: ListeAraciCubuguProps) {
  const girdiRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`flex flex-col border-b border-slate-200 ${
        mobil ? "gap-1 px-3 py-1" : "gap-1.5 px-4 py-1.5"
      }`}
    >
      <div className={`flex items-center ${mobil ? "gap-1.5" : "gap-2"}`}>
        {arama && (
          <div className="relative min-w-0 flex-1">
            <IconSearch className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              ref={girdiRef}
              type="search"
              value={arama.deger}
              onChange={(e) => arama.onDegis(e.target.value)}
              // Esc kutuyu temizler, odak korunur.
              onKeyDown={(e) => {
                if (e.key === "Escape" && arama.deger) {
                  e.preventDefault();
                  arama.onDegis("");
                }
              }}
              placeholder={(mobil && arama.mobilIpucu) || arama.ipucu}
              aria-label={arama.ipucu}
              // Mobilde font 16px kalir (`text-base`): altinda iOS odaklaninca
              // sayfayi zoomluyor. Yukseklik font'tan degil sabit `h-8`'den
              // gelir ki siralama acilirıyla hizasi bozulmasin.
              className={`arama-girdisi w-full border border-slate-300 bg-white pl-7 focus:border-emerald-500 focus:outline-none ${
                mobil ? "h-8 pr-8 text-base" : "py-1.5 pr-7 text-xs"
              }`}
            />
            {arama.deger && (
              <button
                type="button"
                onClick={() => {
                  arama.onDegis("");
                  girdiRef.current?.focus();
                }}
                aria-label="Aramayı temizle"
                title="Temizle"
                className={`absolute right-0.5 top-1/2 flex -translate-y-1/2 items-center justify-center text-slate-400 hover:text-red-600 ${
                  mobil ? "h-6 w-6" : "h-5 w-5"
                }`}
              >
                <IconX className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        <select
          value={siralama.deger}
          onChange={(e) => siralama.onDegis(e.target.value)}
          aria-label="Sıralama"
          title="Sıralama"
          // `secici-kompakt`: index.css'teki "mobilde tum form alanlari 16px"
          // kuralindan muaf tutar, yoksa acilir sisip etiketi kesiyordu.
          className={`secici-kompakt shrink-0 border border-slate-300 bg-white px-1.5 text-xs text-slate-600 focus:border-emerald-500 focus:outline-none ${
            mobil ? "h-8" : "py-1.5"
          } ${arama ? (mobil ? "max-w-[6.75rem]" : "max-w-[9.5rem]") : "flex-1"}`}
        >
          {siralama.secenekler.map((s) => (
            <option key={s.deger} value={s.deger}>
              {s.etiket}
            </option>
          ))}
        </select>
      </div>

      {sayac && arama?.deger.trim() && (
        <p className="text-[11px] text-slate-500">
          {sayac.gorunen === 0 ? (
            <span className="text-amber-700">
              Aramaya uyan {sayac.birim} yok.
            </span>
          ) : (
            <>
              <span className="font-medium text-slate-700">{sayac.gorunen}</span>
              {` / ${sayac.toplam} ${sayac.birim} gösteriliyor`}
            </>
          )}
        </p>
      )}
    </div>
  );
}
