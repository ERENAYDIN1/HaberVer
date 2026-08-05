import { forwardRef, useState } from "react";

import { fotoUrl } from "../api/reports";
import {
  ASSET_TYPE_LABELS,
  TIP_ROZET_SINIFI,
  TIP_ROZET_SINIFI_VARSAYILAN,
  durumEtiketi,
  kalanSilmeGunu,
  type AssetFeature,
} from "../types/asset";
import { SilOnayi } from "./Aksiyonlar";
import FotoBuyutucu from "./FotoBuyutucu";
import { IconPin, TIP_IKONU } from "./icons";

interface VarlikSatiriProps {
  asset: AssetFeature;
  secili: boolean;
  onSec: (id: string) => void;
  onDetay: (asset: AssetFeature) => void;
  /** Verilmezse "Düzenle" butonu gösterilmez (orn. salt-okunur baglamlar). */
  onDuzenle?: (asset: AssetFeature) => void;
  tamCrudYetkisi: boolean;
  onTamirEt: (id: string) => void;
  tamirPending: boolean;
  onSil: (asset: AssetFeature) => void;
  silPending: boolean;
}

/** Varlik listelerinde (Varliklar sekmesi + Talepler > Onaylandi) ortak
 *  kullanilan tek bir satir: ikon/foto, ad, tur, durum rozeti, konum ve
 *  secilince acilan Detay/Tamir Edildi/Duzenle/Sil aksiyonlari. */
const VarlikSatiri = forwardRef<HTMLLIElement, VarlikSatiriProps>(function VarlikSatiri(
  {
    asset,
    secili,
    onSec,
    onDetay,
    onDuzenle,
    tamCrudYetkisi,
    onTamirEt,
    tamirPending,
    onSil,
    silPending,
  },
  ref
) {
  const { id, name, type, status, source, brand_model, photo_url, repaired_at } =
    asset.properties;
  const [lng, lat] = asset.geometry.coordinates;
  const bakim = status === "bakim_lazim";
  const TipIkonu = TIP_IKONU[type] ?? IconPin;
  const foto = fotoUrl(photo_url);
  const [fotoAcik, setFotoAcik] = useState(false);
  // Tamir edilmis talep varliginda otomatik silmeye kalan gun (varsa).
  const kalanGun =
    source === "ihbar" && status === "iyi" ? kalanSilmeGunu(repaired_at) : null;

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
            ? "border-emerald-600 bg-emerald-50"
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
                TIP_ROZET_SINIFI[type] ?? TIP_ROZET_SINIFI_VARSAYILAN
              }`}
            >
              <TipIkonu className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{name}</p>
            <p className="text-xs text-slate-500">
              {ASSET_TYPE_LABELS[type]}
              {brand_model ? ` · ${brand_model}` : ""}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] font-medium ${
                  bakim
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-emerald-300 bg-emerald-50 text-emerald-800"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    bakim ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                />
                {durumEtiketi(status, source)}
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                {lng.toFixed(4)}, {lat.toFixed(4)}
              </span>
            </div>
            {kalanGun !== null && (
              <p className="mt-1 text-[11px] font-medium text-rose-600">
                {kalanGun === 0
                  ? "Bugün otomatik silinecek"
                  : `${kalanGun} gün sonra otomatik silinecek`}
              </p>
            )}
          </div>
        </div>

        {/* Aksiyon satiri her zaman ayni yuksekligi kaplar (h-4) - secili/degil
            ya da varlik durumu/yetki fark etmeksizin satirlar ayni boyutta
            kalsin diye; icerik sadece seciliyken dolar. */}
        <div className="mt-2 flex h-4 gap-3 pl-[34px]">
          {secili && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDetay(asset);
                }}
                className="text-xs font-medium text-slate-600 hover:underline"
              >
                Detay
              </button>
              {bakim && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTamirEt(id);
                  }}
                  disabled={tamirPending}
                  className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
                >
                  Tamir Edildi
                </button>
              )}
              {tamCrudYetkisi && (
                <>
                  {onDuzenle && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuzenle(asset);
                      }}
                      className="text-xs font-medium text-emerald-700 hover:underline"
                    >
                      Düzenle
                    </button>
                  )}
                  <SilOnayi
                    satirIci
                    sifirlaAnahtari={id}
                    siliniyor={silPending}
                    onSil={() => onSil(asset)}
                  />
                </>
              )}
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

export default VarlikSatiri;
