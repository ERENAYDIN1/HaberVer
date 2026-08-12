import { useEffect, useRef, useState } from "react";

import {
  useDepartmanlar,
  useTurDepartmanEslemesi,
} from "../hooks/useDepartmanlar";
import { turAdi } from "../data/turSozlugu";
import {
  YONLENDIRILMEMIS_AD,
  departmanTurGruplari,
} from "../types/departman";
import type { AssetType } from "../types/asset";
import { IconCheck, IconChevronRight, IconX } from "./icons";

interface TipCoktanSeciciProps {
  /** Gosterilecek turler; cagiranlar `turKodlari()` gecer. */
  turler: readonly AssetType[];
  /** Hangi turlerin isaretli oldugu. */
  secili: Record<AssetType, boolean>;
  /** Tek bir turu ac/kapa. */
  onDegis: (tur: AssetType) => void;
  /** Bir mudurlugun TUM turlerini tek islemde ac/kapa. Verilmezse `onDegis`
   *  tur tur cagrilir - dogru sonucu verir, ama paylasilan state'e yazan
   *  cagiranlar (AssetList) icin tek bir toplu yazim daha ucuzdur. */
  onGrupDegis?: (turler: readonly AssetType[], secili: boolean) => void;
  /** Butonda ozet etiket icin: hepsi acikken gosterilecek metin. */
  hepsiEtiketi: string;
}

/**
 * Tip filtresi icin checkbox tabanli coklu secim acilir kutusu. Buton bir
 * ozet metin gosterir, tiklaninca acilan panelde her tur bir checkbox'tir.
 * Gruplama `TipSecenekleri` ile ayni kaynagi (`departmanTurGruplari`) kullanir.
 */
export default function TipCoktanSecici({
  turler,
  secili,
  onDegis,
  onGrupDegis,
  hepsiEtiketi,
}: TipCoktanSeciciProps) {
  const [acik, setAcik] = useState(false);
  const kutuRef = useRef<HTMLDivElement>(null);
  const { data: departmanlar } = useDepartmanlar();
  const { data: esleme } = useTurDepartmanEslemesi();
  const gruplar = departmanTurGruplari(departmanlar, esleme, turler);

  const acikTurler = turler.filter((t) => secili[t]);
  const hepsiAcik = acikTurler.length === turler.length;
  const ozet = hepsiAcik
    ? hepsiEtiketi
    : acikTurler.length === 0
      ? "Hiçbiri seçili değil"
      : acikTurler.length === 1
        ? turAdi(acikTurler[0])
        : `${acikTurler.length} tip seçili`;

  // Disari tiklaninca kapan - form elemanlarinin standart davranisi.
  useEffect(() => {
    if (!acik) return;
    const disariTikla = (e: MouseEvent) => {
      if (kutuRef.current && !kutuRef.current.contains(e.target as Node)) {
        setAcik(false);
      }
    };
    document.addEventListener("mousedown", disariTikla);
    return () => document.removeEventListener("mousedown", disariTikla);
  }, [acik]);

  /** Bir mudurlugun turlerini toplu yazar. `onGrupDegis` verilmisse tek
   *  islemde, yoksa yalnizca degismesi gereken turler icin `onDegis` cagrilir. */
  const grubuYaz = (grupTurleri: readonly AssetType[], hedef: boolean) => {
    if (onGrupDegis) {
      onGrupDegis(grupTurleri, hedef);
      return;
    }
    grupTurleri.filter((t) => secili[t] !== hedef).forEach(onDegis);
  };

  const satir = (t: AssetType) => (
    <label
      key={t}
      className="flex cursor-pointer items-center gap-2 py-1.5 pl-6 pr-2 text-xs text-slate-700 hover:bg-slate-50"
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center border ${
          secili[t]
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-slate-300 bg-white"
        }`}
      >
        {secili[t] && <IconCheck className="h-3 w-3" />}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={secili[t]}
        onChange={() => onDegis(t)}
      />
      {turAdi(t)}
    </label>
  );

  return (
    <div ref={kutuRef} className="relative flex-1">
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        className="flex w-full items-center justify-between gap-1 border border-slate-300 bg-white px-2 py-1.5 text-left text-xs text-slate-700 focus:border-emerald-500 focus:outline-none"
      >
        <span className="truncate">{ozet}</span>
        <IconChevronRight
          className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${
            acik ? "-rotate-90" : "rotate-90"
          }`}
        />
      </button>

      {acik && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-max min-w-full overflow-y-auto border border-slate-300 bg-white shadow-lg">
          {/* Tek satir, sabit yukseklik: kosullu gorunup kaybolsaydi liste
              secim degistikce ziplardi. */}
          <button
            type="button"
            onClick={() =>
              hepsiAcik
                ? acikTurler.forEach(onDegis)
                : turler.filter((t) => !secili[t]).forEach(onDegis)
            }
            className={`flex w-full items-center gap-1 border-b border-slate-100 px-2 py-1.5 text-left text-xs font-medium hover:bg-slate-50 ${
              hepsiAcik ? "text-slate-500" : "text-emerald-700"
            }`}
          >
            {hepsiAcik ? (
              <IconX className="h-3 w-3" />
            ) : (
              <IconCheck className="h-3 w-3" />
            )}
            {hepsiAcik ? "Seçimi temizle" : "Tümünü seç"}
          </button>

          {gruplar
            ? gruplar.map((grup, i) => {
                // Baslik uc durumludur: hepsi / hicbiri / bir kismi.
                const acikSayisi = grup.turler.filter((t) => secili[t]).length;
                const hepsi = acikSayisi === grup.turler.length;
                const kismi = acikSayisi > 0 && !hepsi;
                return (
                  <div key={grup.departman?.kod ?? "__yonlendirilmemis"}>
                    <button
                      type="button"
                      // Yarim secili basliga tiklamak tamamini acar.
                      onClick={() => grubuYaz(grup.turler, !hepsi)}
                      // Ilk grupta ust bordur yok ("Tümünü seç" kendi alt
                      // bordurunu tasiyor, ust uste gelince cift cizgi olurdu).
                      className={`flex w-full items-center gap-2 border-b border-slate-100 bg-slate-50 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-100 ${
                        i > 0 ? "border-t" : ""
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center border ${
                          hepsi || kismi
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {hepsi ? (
                          <IconCheck className="h-3 w-3" />
                        ) : kismi ? (
                          <span className="h-0.5 w-2 bg-white" />
                        ) : null}
                      </span>
                      <span
                        className="truncate"
                        style={{ color: grup.departman?.renk }}
                      >
                        {grup.departman?.ad ?? YONLENDIRILMEMIS_AD}
                      </span>
                    </button>
                    {grup.turler.map(satir)}
                  </div>
                );
              })
            : turler.map(satir)}
        </div>
      )}
    </div>
  );
}
