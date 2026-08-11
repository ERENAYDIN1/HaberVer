import { useState } from "react";

import type { SekilDuzenleme } from "../types/bolge";
import {
  alanEtiketi,
  cokHalkaliAlanM2,
  mesafeEtiketi,
  toplamMesafeMetre,
} from "../utils/geo";
import { IconCheck, IconLasso, IconRoute, IconX } from "./icons";

/** "Genişlet / Daralt" icin hazir adimlar (metre). Elle deger de girilebilir;
 *  bunlar sik istenen buyuklukleri tek tiklamaya indirir. */
const TAMPON_ADIMLARI = [5, 10, 25, 50, 100];

interface BolgeSekilPaneliProps {
  duzenleme: SekilDuzenleme;
  /** Taslak, kaydedilmis halinden farkli mi (Kaydet'i anlamli kilar). */
  degisti: boolean;
  onVazgec: () => void;
  onKaydet: () => void;
  kaydediliyor?: boolean;
  hata?: string | null;
  /** Alani her yonunde `mesafeM` metre buyutur (negatifse kucultur) - PostGIS
   *  ST_Buffer ile. Yalnizca alan tipinde anlamli oldugundan cizgide verilmez. */
  onGenislet?: (mesafeM: number) => void;
  genisletiliyor?: boolean;
  /** Son adimi (kose surukle/ekle/sil, genislet-daralt) geri alir - bastan
   *  degil BIR ONCEKI duruma doner (`CizimPaneli`deki "Geri al" ile ayni
   *  davranis). */
  onGeriAl: () => void;
  /** Geri alinacak bir adim var mi; yoksa dugme devre disi kalir. */
  geriAlinabilir: boolean;
  /** Mobil: panelin ekran dibinden yuksekligi (px), bkz. CizimPaneli. */
  altOfset?: number;
}

/** Bir gorev bolgesinin / guzergahin seklini harita uzerinde duzenlerken
 *  ekranin alt ortasinda acilan panel: canli olcu, kose ipuclari, alani metre
 *  cinsinden genisletme-daraltma ve kaydet/vazgec. Cizim panelinin yumusak
 *  temasini paylasir; ikisi ayni anda gorunmez (sekil duzenleme baslarken
 *  cizim/olcum modlari kapatilir). */
export default function BolgeSekilPaneli({
  duzenleme,
  degisti,
  onVazgec,
  onKaydet,
  kaydediliyor,
  hata,
  onGenislet,
  genisletiliyor,
  onGeriAl,
  geriAlinabilir,
  altOfset,
}: BolgeSekilPaneliProps) {
  const [ozelMesafe, setOzelMesafe] = useState("");
  const cizgi = duzenleme.tip === "cizgi";
  const Ikon = cizgi ? IconRoute : IconLasso;
  const olcu = cizgi
    ? mesafeEtiketi(toplamMesafeMetre(duzenleme.noktalar[0] ?? []))
    : alanEtiketi(cokHalkaliAlanM2(duzenleme.noktalar));
  const noktaSayisi = duzenleme.noktalar.reduce((t, h) => t + h.length, 0);

  const ozelUygula = (yon: 1 | -1) => {
    const deger = Number(ozelMesafe.replace(",", "."));
    if (!Number.isFinite(deger) || deger <= 0) return;
    onGenislet?.(yon * deger);
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4"
      // Mobilde alt sekme cubugunun ustune oturur; verilmezse masaustundeki
      // `bottom-6` gecerlidir (`CizimPaneli` ile ayni kural).
      style={{
        bottom: altOfset
          ? `calc(${altOfset}px + env(safe-area-inset-bottom, 0px))`
          : "1.5rem",
      }}
    >
      {/* Genis + yatay duzen bilincli: bu panel `CizimPaneli` gibi dikey
          yigilirsa (`max-w-sm`) haritanin buyuk kismini kaplar - sekil
          duzenleme tam da haritayi gormeyi gerektiren bir islem. Yatayda
          yayilip dikeyde kisalmak icin genislik masaustunde ekranin buyuk
          bir kismina, satirlar tek satira yakin sigacak sekilde ayarlandi. */}
      <div className="pointer-events-auto flex w-full max-w-3xl flex-col gap-2.5 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <Ikon className="h-3 w-3" />
          </span>
          Şekli Düzenle
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: duzenleme.renk }}
          />
          <span className="ml-1 min-w-0 flex-1 truncate normal-case tracking-normal text-slate-500">
            {duzenleme.ad} · {noktaSayisi} nokta · {olcu}
          </span>
          <button
            onClick={onVazgec}
            title="Şekil düzenlemeyi kapat"
            aria-label="Şekil düzenlemeyi kapat"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            <li>• Köşeyi sürükleyerek taşı.</li>
            <li>• Kenardaki “+” ile yeni köşe ekle.</li>
            <li>• Köşeye sağ tıklayarak sil.</li>
          </ul>

          {/* Alani kenarlara paralel buyutup kucultmek koseleri tek tek
              surukleyerek yapilamaz; PostGIS ST_Buffer ile jeodezik yapilir. */}
          {!cizgi && onGenislet && (
            <div className="flex flex-wrap items-center gap-1.5 border-l border-slate-100 pl-3">
              <span className="text-[11px] font-medium text-slate-600">
                Genişlet/daralt:
              </span>
              {TAMPON_ADIMLARI.map((m) => (
                <span key={m} className="flex overflow-hidden rounded-md border border-slate-200">
                  <button
                    onClick={() => onGenislet(-m)}
                    disabled={genisletiliyor}
                    title={`${m} m daralt`}
                    className="bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-50 hover:text-red-600 disabled:opacity-50"
                  >
                    −
                  </button>
                  <span className="bg-slate-50 px-1 py-0.5 text-[11px] tabular-nums text-slate-600">
                    {m}m
                  </span>
                  <button
                    onClick={() => onGenislet(m)}
                    disabled={genisletiliyor}
                    title={`${m} m genişlet`}
                    className="bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-50 hover:text-emerald-700 disabled:opacity-50"
                  >
                    +
                  </button>
                </span>
              ))}
              <input
                value={ozelMesafe}
                onChange={(e) => setOzelMesafe(e.target.value)}
                inputMode="decimal"
                placeholder="Özel (m)"
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-[11px] outline-none focus:border-violet-500"
              />
              <button
                onClick={() => ozelUygula(-1)}
                disabled={genisletiliyor || !ozelMesafe}
                className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Daralt
              </button>
              <button
                onClick={() => ozelUygula(1)}
                disabled={genisletiliyor || !ozelMesafe}
                className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Genişlet
              </button>
              {genisletiliyor && (
                <span className="text-[11px] text-slate-400">…</span>
              )}
            </div>
          )}
        </div>

        {hata && (
          <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{hata}</p>
        )}

        <div className="flex items-center gap-2 border-t border-slate-100 pt-2.5">
          <button
            onClick={onGeriAl}
            disabled={!geriAlinabilir}
            title="Son adımı geri al"
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Geri al
          </button>
          <button
            onClick={onVazgec}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <IconX className="h-3 w-3" />
            Vazgeç
          </button>
          <button
            onClick={onKaydet}
            disabled={!degisti || kaydediliyor}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <IconCheck className="h-3 w-3" />
            {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
