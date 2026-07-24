import { type ReactElement } from "react";

import { fotoUrl } from "../api/reports";
import { useKonumCozumu } from "../hooks/useSinirlar";
import {
  ASSET_SOURCE_LABELS,
  ASSET_STATUS_LABELS,
  ASSET_TYPE_LABELS,
  type AssetFeature,
  type AssetType,
} from "../types/asset";
import { IconBench, IconChevronRight, IconLamp, IconPin, IconTree, IconX } from "./icons";

/** Haritadaki isaretci renkleriyle ayni palet. */
const TIP_RENGI: Record<AssetType, string> = {
  agac: "#059669",
  bank: "#d97706",
  direk: "#0284c7",
};

const TIP_IKONU: Record<AssetType, (p: { className?: string }) => ReactElement> = {
  agac: IconTree,
  bank: IconBench,
  direk: IconLamp,
};

interface VarlikDetayKartiProps {
  asset: AssetFeature;
  onKapat: () => void;
  /** "Detayları Gör" - tam detay modalini acar. */
  onDetay: () => void;
  /** Sol taraftaki liste paneli acikken kart onun sagina kayar (ust uste
   *  binmesin diye). */
  solKaydir?: boolean;
}

/**
 * Bir varlik secilince haritanin sol-altinda acilan zengin ozet karti
 * (referans dashboard'daki alttaki bilgi karti). Marker rengi/ikonu, ad, kimlik,
 * ilce/mahalle, durum rozeti ve dort hucreli hizli bilgi tablosu gosterir;
 * "Detayları Gör" ile tam modale gecilir.
 */
export default function VarlikDetayKarti({
  asset,
  onKapat,
  onDetay,
  solKaydir,
}: VarlikDetayKartiProps) {
  const p = asset.properties;
  const [lng, lat] = asset.geometry.coordinates;
  const { data: konum } = useKonumCozumu(lat, lng);
  const konumMetni = konum
    ? [konum.mahalle?.ad, konum.ilce?.ad].filter(Boolean).join(", ")
    : "";

  const bakim = p.status === "bakim_lazim";
  const renk = TIP_RENGI[p.type] ?? "#64748b";
  const Ikon = TIP_IKONU[p.type] ?? IconPin;
  const foto = fotoUrl(p.photo_url);
  // Kimlik etiketi: uzun UUID yerine kisa, okunur bir parca.
  const kimlik = `#${p.id.slice(0, 8).toUpperCase()}`;

  return (
    <div
      className={`absolute bottom-4 z-20 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-sm transition-[left] duration-200 ${
        solKaydir ? "left-[392px]" : "left-4"
      }`}
    >
      {/* Ust bant: ikon + ad + kimlik + durum + kapat */}
      <div className="flex items-start gap-3 border-b border-slate-100 p-3.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-2 ring-white"
          style={{ backgroundColor: renk }}
        >
          <Ikon className="h-5 w-5 text-white" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900">{p.name}</h3>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                bakim
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {ASSET_STATUS_LABELS[p.status]}
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-mono">{kimlik}</span>
            {konumMetni && (
              <>
                <span className="text-slate-300">·</span>
                <IconPin className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="truncate">{konumMetni}</span>
              </>
            )}
          </p>
        </div>

        <button
          onClick={onKapat}
          aria-label="Kartı kapat"
          title="Kapat"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>

      {foto && (
        <img
          src={foto}
          alt=""
          className="h-28 w-full border-b border-slate-100 object-cover"
        />
      )}

      {/* Dort hucreli hizli bilgi (referanstaki Tur/Yas/Boy/Son Kontrol yerine
          bizim gercek alanlarimiz). */}
      <div className="grid grid-cols-2 gap-px bg-slate-100">
        <Hucre etiket="Tür" deger={ASSET_TYPE_LABELS[p.type]} />
        <Hucre etiket="Kaynak" deger={ASSET_SOURCE_LABELS[p.source]} />
        <Hucre etiket="Marka / Model" deger={p.brand_model || "—"} />
        <Hucre etiket="Kurulum" deger={p.install_date || "—"} />
      </div>

      <div className="flex items-center justify-between px-3.5 py-2.5">
        <span className="font-mono text-[11px] text-slate-400">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </span>
        <button
          onClick={onDetay}
          className="flex items-center gap-1 text-xs font-semibold text-emerald-700 transition hover:text-emerald-800"
        >
          Detayları Gör
          <IconChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function Hucre({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="bg-white px-3.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {etiket}
      </p>
      <p className="truncate text-xs font-semibold text-slate-800" title={deger}>
        {deger}
      </p>
    </div>
  );
}
