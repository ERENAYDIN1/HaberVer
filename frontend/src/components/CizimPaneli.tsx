import { useEffect, useState } from "react";

import type { TamamlananAlan } from "../types/alan";
import { alanEtiketi, mesafeEtiketi, poligonAlaniM2 } from "../utils/geo";

const RENK_PALETI = [
  "#059669",
  "#2563eb",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#475569",
];

const OZEL_RENK_ANAHTARI = "greenasset-ozel-renkler";

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
  onAlanTamamla: () => void;
  tamamlananAlanlar: TamamlananAlan[];
  onAlanKaldir: (id: string) => void;
  onTumAlanlariTemizle: () => void;

  /** Mesafe olcum araci */
  olcumModu: boolean;
  olcumNoktalari: [number, number][];
  olcumMesafeM: number;
  onOlcumIptal: () => void;
  onOlcumBitir: () => void;
  onOlcumTemizle: () => void;
}

/** Cizim/olcum araclari aktifken ekranin alt ortasinda beliren, etkilesimi
 *  kolaylastiran kucuk ve yumusak temali bir arac paneli. */
export default function CizimPaneli({
  cizimModu,
  cizimNoktalari,
  cizimRengi,
  onCizimRengiSec,
  alanM2,
  alanHatasi,
  alanYukleniyor,
  onAlanIptal,
  onAlanTamamla,
  tamamlananAlanlar,
  onAlanKaldir,
  onTumAlanlariTemizle,
  olcumModu,
  olcumNoktalari,
  olcumMesafeM,
  onOlcumIptal,
  onOlcumBitir,
  onOlcumTemizle,
}: CizimPaneliProps) {
  const alanBitti = !cizimModu && tamamlananAlanlar.length > 0;
  const olcumBitti = !olcumModu && olcumNoktalari.length >= 2;

  if (!cizimModu && !olcumModu && !alanBitti && !olcumBitti) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-sm flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur-sm">
        {cizimModu && (
          <div>
            <p className="mb-2 text-xs text-slate-600">
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
            <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-0.5">
              {tamamlananAlanlar.map((alan, i) => (
                <div
                  key={alan.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2.5 py-1.5"
                >
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: alan.renk }}
                    />
                    {alan.etiket ?? `Alan ${i + 1}`}:{" "}
                    <span className="font-semibold">{alan.sonuc.features.length}</span>{" "}
                    varlık · {alanEtiketi(poligonAlaniM2(alan.noktalar))}
                  </span>
                  <button
                    onClick={() => onAlanKaldir(alan.id)}
                    aria-label="Alanı kaldır"
                    className="shrink-0 text-xs font-medium text-slate-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {tamamlananAlanlar.length > 1 && (
              <button
                onClick={onTumAlanlariTemizle}
                className="self-end text-xs font-medium text-emerald-700 hover:underline"
              >
                Tümünü temizle
              </button>
            )}
          </div>
        )}

        {(cizimModu || alanBitti) && (olcumModu || olcumBitti) && (
          <div className="border-t border-slate-200" />
        )}

        {olcumModu && (
          <div>
            <p className="mb-1 text-xs text-slate-600">
              Haritada tıklayarak bir çizgi boyunca mesafe ölç.
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
                onClick={onOlcumBitir}
                disabled={olcumNoktalari.length < 2}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Bitir
              </button>
            </div>
          </div>
        )}

        {olcumBitti && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-700">
              Toplam mesafe:{" "}
              <span className="font-semibold">{mesafeEtiketi(olcumMesafeM)}</span>
            </span>
            <button
              onClick={onOlcumTemizle}
              className="shrink-0 text-xs font-medium text-blue-700 hover:underline"
            >
              Temizle
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Hazir palet + kullanicinin kendi sectigi/kaydettigi renkler. Kayitlar
 *  tarayicida (localStorage) tutulur, boylece bir sonraki oturumda da durur. */
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
