import { useRef } from "react";

import type { SiralamaEtiketi } from "../utils/listeAraci";
import { IconSearch, IconX } from "./icons";

interface ListeAraciCubuguProps {
  /** Arama kutusu gosterilsin mi. Bolge/guzergah panellerinde kapalidir:
   *  kayitlar duzinelerle olculur ve adlari zaten personelin kendi koydugu
   *  adlardir, kaydirarak bulunur. */
  arama?: {
    deger: string;
    onDegis: (v: string) => void;
    /** Girdinin placeholder'i - hangi alanlarda arandigini soyler. */
    ipucu: string;
  };
  siralama: {
    secenekler: readonly SiralamaEtiketi[];
    deger: string;
    onDegis: (v: string) => void;
  };
  /** Suzme sonrasi kalan / toplam kayit. Arama aktifken "12 / 340" yazar;
   *  kullanici kac kaydin gizlendigini gormeli, yoksa liste "eksik" sanilir. */
  sayac?: { gorunen: number; toplam: number; birim: string };
  /** Mobilde siralama acilirinin etiketi gizlenir (yer dar). */
  mobil?: boolean;
}

/** Varlik / talep / bolge listelerinin ustunde duran ortak arac cubugu:
 *  arama girdisi + siralama acilirı.
 *
 *  Tek bilesen olmasinin sebebi yalnizca kod tekrari degil: uc panelde de
 *  ayni yerde, ayni sirayla, ayni klavye davranisiyla durmasi gerekiyor -
 *  kullanici bir panelde ogrendigini digerinde aramamali.
 *
 *  ARAMA YALNIZCA PANELI SUZER, HARITAYA DOKUNMAZ. Alan seciminde alinan
 *  kararla ayni (bkz. CLAUDE.md "Alan secimi HARITAYI DARALTMAZ"): bir sorgu
 *  yaptigini sanan kullanici haritasini kaybetmemeli. */
export default function ListeAraciCubugu({
  arama,
  siralama,
  sayac,
  mobil,
}: ListeAraciCubuguProps) {
  const girdiRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-2.5">
      <div className="flex items-center gap-2">
        {arama && (
          <div className="relative min-w-0 flex-1">
            <IconSearch className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              ref={girdiRef}
              type="search"
              value={arama.deger}
              onChange={(e) => arama.onDegis(e.target.value)}
              // Esc kutuyu temizler (odak korunur): mobilde temizleme
              // dugmesine basmak, masaustunde metni silmek zahmetli.
              onKeyDown={(e) => {
                if (e.key === "Escape" && arama.deger) {
                  e.preventDefault();
                  arama.onDegis("");
                }
              }}
              placeholder={arama.ipucu}
              aria-label={arama.ipucu}
              // Mobilde girdi yuksekligi ve font buyur: 44px'lik dokunmatik
              // hedef kurali (alt sekme cubugundaki olcu) ve iOS'un 16px
              // altindaki girdilere odaklanildiginda sayfayi zoomlamasi.
              // Masaustunde panel dar oldugu icin kompakt kalir.
              className={`w-full border border-slate-300 bg-white pl-7 focus:border-emerald-500 focus:outline-none ${
                mobil ? "py-2.5 pr-10 text-base" : "py-1.5 pr-7 text-xs"
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
                // Mobilde dokunma hedefi buyur; ikon ayni boyutta kalir.
                className={`absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center text-slate-400 hover:text-red-600 ${
                  mobil ? "h-9 w-9" : "h-5 w-5"
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
          // Yukseklik girdiyle AYNI olcuden gelir ki iki kontrol hizalansin.
          className={`shrink-0 border border-slate-300 bg-white px-2 text-slate-600 focus:border-emerald-500 focus:outline-none ${
            mobil ? "py-2.5 text-sm" : "py-1.5 text-xs"
          } ${arama ? (mobil ? "max-w-[7.5rem]" : "max-w-[9.5rem]") : "flex-1"}`}
        >
          {siralama.secenekler.map((s) => (
            <option key={s.deger} value={s.deger}>
              {s.etiket}
            </option>
          ))}
        </select>
      </div>

      {/* Arama aktifken kac kaydin suzuldugu yazilir. Aramasiz durumda satir
          hic cizilmez: her panelde zaten bir sayac seridi var. */}
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
