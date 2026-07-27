import { forwardRef, useState, type ReactElement } from "react";

import { fotoUrl } from "../api/reports";
import { ASSET_TYPE_LABELS, type AssetType } from "../types/asset";
import type { ReportFeature } from "../types/report";
import FotoBuyutucu from "./FotoBuyutucu";
import { IconBench, IconDrop, IconLamp, IconPin, IconTree } from "./icons";
import IhbarDurumRozeti from "./IhbarDurumRozeti";

const TIP_IKONU: Record<AssetType, (props: { className?: string }) => ReactElement> = {
  agac: IconTree,
  bank: IconBench,
  direk: IconLamp,
  sulama: IconDrop,
};

const TIP_RENGI: Record<AssetType, string> = {
  agac: "border-emerald-200 bg-emerald-50 text-emerald-700",
  bank: "border-amber-200 bg-amber-50 text-amber-700",
  direk: "border-sky-200 bg-sky-50 text-sky-700",
  sulama: "border-cyan-200 bg-cyan-50 text-cyan-700",
};

interface IhbarSatiriProps {
  report: ReportFeature;
  secili: boolean;
  onSec: (id: string) => void;
  /** Sadece "beklemede" durumundaki ihbarlarda ve yetkili roller icin gosterilir. */
  onayReddetYetkisi: boolean;
  onOnayla: (id: string) => void;
  onReddet: (id: string) => void;
  islemPending: boolean;
}

/** Varlik listesindeki (VarlikSatiri) ile ayni sablonu kullanan ihbar satiri:
 *  ikon/foto, ad, tur, durum rozeti, konum ve secilince acilan Onayla/Reddet
 *  aksiyonu. Boylece "Bekleyen"/"Reddedildi" sekmeleri "Onaylandı" (varlik
 *  listesi) ve "Varlıklar" sekmesiyle gorsel olarak birebir tutarli olur;
 *  fotograf/not/ret nedeni gibi ek detaylar ReportDetayModal'da gosterilir. */
const IhbarSatiri = forwardRef<HTMLLIElement, IhbarSatiriProps>(function IhbarSatiri(
  { report, secili, onSec, onayReddetYetkisi, onOnayla, onReddet, islemPending },
  ref
) {
  const { id, name, type, status, photo_url } = report.properties;
  const [lng, lat] = report.geometry.coordinates;
  const TipIkonu = TIP_IKONU[type] ?? IconPin;
  const bekliyor = status === "beklemede";
  const foto = fotoUrl(photo_url);
  const [fotoAcik, setFotoAcik] = useState(false);

  return (
    <li ref={ref}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSec(id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSec(id);
          }
        }}
        className={`w-full cursor-pointer border-l-2 px-4 py-2.5 text-left transition ${
          secili
            ? "border-purple-600 bg-purple-50"
            : "border-transparent hover:bg-slate-50"
        }`}
      >
        <div className="flex items-start gap-2.5">
          {foto ? (
            <img
              src={foto}
              alt=""
              onClick={(e) => {
                e.stopPropagation();
                setFotoAcik(true);
              }}
              className="h-6 w-6 shrink-0 cursor-zoom-in border border-slate-200 object-cover"
            />
          ) : (
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center border ${
                TIP_RENGI[type] ?? "border-slate-200 bg-slate-50 text-slate-500"
              }`}
            >
              <TipIkonu className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{name}</p>
            <p className="text-xs text-slate-500">{ASSET_TYPE_LABELS[type]}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <IhbarDurumRozeti durum={status} />
              <span className="font-mono text-[11px] text-slate-400">
                {lng.toFixed(4)}, {lat.toFixed(4)}
              </span>
            </div>
          </div>
        </div>

        {/* Aksiyon satiri her zaman ayni yuksekligi kaplar (h-4) - secili/degil
            ya da durum (beklemede/reddedildi) fark etmeksizin satirlar ayni
            boyutta kalsin diye; icerik sadece secili+beklemede+yetkiliyken dolar. */}
        <div className="mt-2 flex h-4 gap-3 pl-[34px]">
          {secili && bekliyor && onayReddetYetkisi && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOnayla(id);
                }}
                disabled={islemPending}
                className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
              >
                Onayla
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReddet(id);
                }}
                disabled={islemPending}
                className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                Reddet
              </button>
            </>
          )}
        </div>
      </div>
      {fotoAcik && foto && (
        <FotoBuyutucu src={foto} onKapat={() => setFotoAcik(false)} />
      )}
    </li>
  );
});

export default IhbarSatiri;
