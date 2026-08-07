import { useEffect, useState } from "react";

import type { AlanOlcusu } from "../api/geo";
import type { TamamlananAlan } from "../types/alan";
import { alanEtiketi, cokHalkaliAlanM2, mesafeEtiketi } from "../utils/geo";
import { IconLasso, IconPlus, IconRuler, IconX } from "./icons";

const RENK_PALETI = [
  "#059669",
  "#2563eb",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#475569",
];

const OZEL_RENK_ANAHTARI = "greenasset-ozel-renkler";

/** Net alan kendi alanindan bu orandan kucukse "cakisiyor" sayilir. Tam
 *  esitlik aranmaz: jeodezik olcude son hanede kayan nokta gurultusu olur. */
const CAKISMA_ESIGI = 0.999;

interface CizimPaneliProps {
  /** Alan (poligon) secim araci */
  cizimModu: boolean;
  cizimNoktalari: [number, number][];
  cizimRengi: string;
  onCizimRengiSec: (hex: string) => void;
  alanM2: number;
  alanHatasi: string | null;
  alanYukleniyor: boolean;
  onAlanIptal: () => void;
  /** Son konan koseyi geri alir (yanlis tiklama tum cizimi yaktirmasin). */
  onAlanGeriAl: () => void;
  onAlanTamamla: () => void;
  tamamlananAlanlar: TamamlananAlan[];
  onAlanKaldir: (id: string) => void;
  onTumAlanlariTemizle: () => void;
  /** PostGIS'ten gelen olculer (id -> kendi/net m2). Gelmezse yerel hesaba
   *  dusulur. */
  alanOlculeri?: Record<string, AlanOlcusu>;
  /** Cakismalar tek kez sayilmis toplam (birlesim alani). */
  toplamNetM2?: number;
  /** Cakisma dusulmeden onceki ham toplam. */
  hamToplamM2?: number;
  /** Bolge kaydetme yetkisi (personel). */
  kaydedebilir?: boolean;
  onAlanKaydet?: (alan: TamamlananAlan, sira: number) => void;
  onOlcumKaydet?: () => void;

  /** Mesafe olcum araci */
  olcumModu: boolean;
  olcumNoktalari: [number, number][];
  olcumMesafeM: number;
  onOlcumIptal: () => void;
  onOlcumGeriAl: () => void;
  onOlcumBitir: () => void;
  onOlcumTemizle: () => void;
  /** Mobil: panelin ekran dibinden yuksekligi (px). Alt sekme cubugunun
   *  ustune oturmasi icin verilir; verilmezse masaustundeki 1.5rem gecerli. */
  altOfset?: number;
}

/** Cizim/olcum araclari aktifken ekranin alt ortasinda beliren arac paneli. */
export default function CizimPaneli({
  cizimModu,
  cizimNoktalari,
  cizimRengi,
  onCizimRengiSec,
  alanM2,
  alanHatasi,
  alanYukleniyor,
  onAlanIptal,
  onAlanGeriAl,
  onAlanTamamla,
  tamamlananAlanlar,
  onAlanKaldir,
  onTumAlanlariTemizle,
  alanOlculeri,
  toplamNetM2,
  hamToplamM2,
  kaydedebilir,
  onAlanKaydet,
  onOlcumKaydet,
  olcumModu,
  olcumNoktalari,
  olcumMesafeM,
  onOlcumIptal,
  onOlcumGeriAl,
  onOlcumBitir,
  onOlcumTemizle,
  altOfset,
}: CizimPaneliProps) {
  const alanBitti = !cizimModu && tamamlananAlanlar.length > 0;
  const olcumBitti = !olcumModu && olcumNoktalari.length >= 2;

  if (!cizimModu && !olcumModu && !alanBitti && !olcumBitti) return null;

  // Toplam, alanlarin basit toplami degil birlesim alanidir: ayni yerin
  // uzerinden ikinci kez gecmek toplami buyutmez.
  const cakismaM2 =
    toplamNetM2 != null && hamToplamM2 != null
      ? Math.max(0, hamToplamM2 - toplamNetM2)
      : 0;
  const cakismaVar = toplamNetM2 != null && cakismaM2 > toplamNetM2 * (1 - CAKISMA_ESIGI);
  const yerelToplam = tamamlananAlanlar.reduce(
    (t, a) => t + cokHalkaliAlanM2(a.noktalar),
    0
  );

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4"
      // Mobilde alt sekme cubugu ekranin dibini kapliyor; panel onun ustune
      // oturmali. Verilmezse masaustundeki `bottom-6` gecerlidir.
      style={{
        bottom: altOfset
          ? `calc(${altOfset}px + env(safe-area-inset-bottom, 0px))`
          : "1.5rem",
      }}
    >
      <div className="pointer-events-auto flex w-full max-w-sm flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur-sm">
        {cizimModu && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <IconLasso className="h-3 w-3" />
              </span>
              Alan Seçimi
            </div>
            <p className="mb-2 rounded-lg bg-emerald-50/70 px-2.5 py-1.5 text-xs text-slate-600">
              Haritada köşe noktalarına tıklayarak bir alan çiz.
              <span className="mt-1 block text-sm font-medium text-slate-800">
                {cizimNoktalari.length} nokta
                {cizimNoktalari.length < 3
                  ? " (en az 3 gerekli)"
                  : ` · ${alanEtiketi(alanM2)}`}
              </span>
            </p>

            <RenkSecici secili={cizimRengi} onSec={onCizimRengiSec} />

            {alanHatasi && (
              <p className="mb-2 mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
                {alanHatasi}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={onAlanIptal}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                İptal
              </button>
              <button
                onClick={onAlanGeriAl}
                disabled={cizimNoktalari.length === 0}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Geri al
              </button>
              <button
                onClick={onAlanTamamla}
                disabled={cizimNoktalari.length < 3 || alanYukleniyor}
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {alanYukleniyor ? "Sorgulanıyor..." : "Tamamla"}
              </button>
            </div>
          </div>
        )}

        {alanBitti && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <IconLasso className="h-3 w-3" />
              </span>
              Seçili Alanlar
              {/* Secimden cikis; kaydedilmis bolgeleri etkilemez. */}
              <button
                onClick={onTumAlanlariTemizle}
                title="Alan seçiminden çık"
                className="ml-auto flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium normal-case tracking-normal text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
              >
                <IconX className="h-3 w-3" />
                Çıkış
              </button>
            </div>
            <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-0.5">
              {tamamlananAlanlar.map((alan, i) => {
                const olcu = alanOlculeri?.[alan.id];
                const kendiM2 = olcu?.kendi_m2 ?? cokHalkaliAlanM2(alan.noktalar);
                // Net katki: oncekilerle cakisan kismi dusulmus alan.
                const netM2 = olcu?.net_m2;
                const cakisiyor = netM2 != null && netM2 < kendiM2 * CAKISMA_ESIGI;
                return (
                  <div
                    key={alan.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5"
                  >
                    <span className="min-w-0 text-sm text-slate-700">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: alan.renk }}
                        />
                        <span className="truncate">
                          {alan.etiket ?? `Alan ${i + 1}`}:{" "}
                          <span className="font-semibold">
                            {alan.sonuc.features.length}
                          </span>{" "}
                          varlık · {alanEtiketi(kendiM2)}
                        </span>
                      </span>
                      {cakisiyor && (
                        <span className="mt-0.5 block text-[11px] text-amber-700">
                          {netM2 < 1
                            ? "tamamen önceki alanlarla çakışıyor · net katkı yok"
                            : `çakışma düşülünce net ${alanEtiketi(netM2)}`}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {kaydedebilir && onAlanKaydet && (
                        <button
                          onClick={() => onAlanKaydet(alan, i)}
                          title="Bölge olarak kaydet"
                          aria-label="Bölge olarak kaydet"
                          className="rounded-md px-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          Kaydet
                        </button>
                      )}
                      <button
                        onClick={() => onAlanKaldir(alan.id)}
                        aria-label="Alanı kaldır"
                        className="text-xs font-medium text-slate-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Toplam: cakisan yerler TEK KEZ sayilir (birlesim alani). */}
            <div className="flex items-baseline justify-between gap-2 border-t border-slate-100 pt-1.5 text-xs">
              <span className="text-slate-500">
                Toplam{tamamlananAlanlar.length > 1 ? " (çakışmasız)" : ""}
              </span>
              <span className="font-semibold text-slate-800">
                {alanEtiketi(toplamNetM2 ?? yerelToplam)}
              </span>
            </div>
            {cakismaVar && (
              <p className="text-[11px] text-amber-700">
                Üst üste binen {alanEtiketi(cakismaM2)} toplamdan düşüldü.
              </p>
            )}

            <p className="text-[11px] text-slate-400">
              Alan seçimi haritada kalır; bitirmek için "Çıkış".
            </p>
          </div>
        )}

        {(cizimModu || alanBitti) && (olcumModu || olcumBitti) && (
          <div className="border-t border-slate-200" />
        )}

        {olcumModu && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <IconRuler className="h-3 w-3" />
              </span>
              Çizgi Çizimi
            </div>
            <p className="mb-1 rounded-lg bg-blue-50/70 px-2.5 py-1.5 text-xs text-slate-600">
              Haritada tıklayarak bir hat çiz; uzunluğu anlık hesaplanır.
              <span className="mt-1 block text-sm font-medium text-slate-800">
                {olcumNoktalari.length} nokta
                {olcumNoktalari.length >= 2 && ` · ${mesafeEtiketi(olcumMesafeM)}`}
              </span>
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={onOlcumIptal}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                İptal
              </button>
              <button
                onClick={onOlcumGeriAl}
                disabled={olcumNoktalari.length === 0}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Geri al
              </button>
              <button
                onClick={onOlcumBitir}
                disabled={olcumNoktalari.length < 2}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Tamamla
              </button>
            </div>
          </div>
        )}

        {olcumBitti && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-blue-50/70 px-2.5 py-1.5">
            <span className="flex items-center gap-1.5 text-sm text-slate-700">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <IconRuler className="h-3 w-3" />
              </span>
              Toplam mesafe:{" "}
              <span className="font-semibold">{mesafeEtiketi(olcumMesafeM)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {kaydedebilir && onOlcumKaydet && (
                <button
                  onClick={onOlcumKaydet}
                  className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                >
                  <IconPlus className="h-3 w-3" />
                  Kaydet
                </button>
              )}
              <button
                onClick={onOlcumTemizle}
                className="text-xs font-medium text-slate-500 hover:underline"
              >
                Temizle
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Hazir palet + kullanicinin kaydettigi renkler (localStorage'da tutulur). */
function RenkSecici({
  secili,
  onSec,
}: {
  secili: string;
  onSec: (hex: string) => void;
}) {
  const [ozelRenkler, setOzelRenkler] = useState<string[]>(() => {
    try {
      const kayit = localStorage.getItem(OZEL_RENK_ANAHTARI);
      return kayit ? (JSON.parse(kayit) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(OZEL_RENK_ANAHTARI, JSON.stringify(ozelRenkler));
  }, [ozelRenkler]);

  const tumRenkler = [...RENK_PALETI, ...ozelRenkler];
  const kayitli = tumRenkler.includes(secili);

  const renkKaydet = () => {
    setOzelRenkler((r) => (r.includes(secili) ? r : [...r, secili].slice(-8)));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tumRenkler.map((hex) => (
        <button
          key={hex}
          onClick={() => onSec(hex)}
          title={hex}
          aria-label={hex}
          className={`h-5 w-5 rounded-full border-2 transition ${
            secili === hex ? "border-slate-800" : "border-white ring-1 ring-slate-300"
          }`}
          style={{ background: hex }}
        />
      ))}

      <label
        title="Özel renk seç"
        className="relative flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-dashed border-slate-400 text-[10px] leading-none text-slate-500 hover:border-slate-600"
      >
        +
        <input
          type="color"
          value={secili}
          onChange={(e) => onSec(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>

      {!kayitli && (
        <button
          onClick={renkKaydet}
          className="text-[11px] font-medium text-slate-500 underline hover:text-slate-700"
        >
          Rengi kaydet
        </button>
      )}
    </div>
  );
}

/** Bolge kaydetme formu da ayni paleti kullanir. */
export { RENK_PALETI };
