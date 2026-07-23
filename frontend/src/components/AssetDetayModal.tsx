import { fotoUrl } from "../api/reports";
import { useKonumCozumu } from "../hooks/useSinirlar";
import {
  ASSET_SOURCE_LABELS,
  ASSET_STATUS_LABELS,
  ASSET_TYPE_LABELS,
  type AssetFeature,
} from "../types/asset";
import Modal from "./Modal";

interface AssetDetayModalProps {
  asset: AssetFeature | null;
  onKapat: () => void;
}

/** Bir varligin tum detaylarini (foto dahil) kucuk bir pop up icinde gosterir.
 *  Saha calisaninin ihbar edilen varligi sahada bulmasini kolaylastirmak icin
 *  fotograf her zaman (varsa) gorunur olur. */
export default function AssetDetayModal({ asset, onKapat }: AssetDetayModalProps) {
  const koord = asset ? asset.geometry.coordinates : null;
  const { data: konum } = useKonumCozumu(koord ? koord[1] : null, koord ? koord[0] : null);

  if (!asset) return null;
  const p = asset.properties;
  const [lng, lat] = asset.geometry.coordinates;
  const bakim = p.status === "bakim_lazim";
  const fotoSrc = fotoUrl(p.photo_url);
  const konumMetni = konum
    ? [konum.mahalle?.ad, konum.ilce?.ad].filter(Boolean).join(", ")
    : "";

  return (
    <Modal acik={asset !== null} baslik="Varlık Detayı" onKapat={onKapat}>
      <div className="space-y-3">
        {fotoSrc && (
          <img
            src={fotoSrc}
            alt=""
            className="max-h-52 w-full border border-slate-200 object-cover"
          />
        )}

        <div>
          <h3 className="text-base font-semibold text-slate-900">{p.name}</h3>
          <p className="text-xs text-slate-500">{ASSET_TYPE_LABELS[p.type]}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] font-medium ${
              bakim
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-emerald-300 bg-emerald-50 text-emerald-800"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${bakim ? "bg-amber-500" : "bg-emerald-500"}`}
            />
            {ASSET_STATUS_LABELS[p.status]}
          </span>
          <span
            className={`inline-flex items-center border px-1.5 py-0.5 text-[11px] font-medium ${
              p.source === "ihbar"
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-emerald-300 bg-emerald-50 text-emerald-800"
            }`}
          >
            {ASSET_SOURCE_LABELS[p.source]}
          </span>
        </div>

        <dl className="space-y-1.5 text-xs">
          {p.brand_model && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Marka / Model</dt>
              <dd className="text-right text-slate-800">{p.brand_model}</dd>
            </div>
          )}
          {p.install_date && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Kurulum Tarihi</dt>
              <dd className="text-slate-800">{p.install_date}</dd>
            </div>
          )}
          {konumMetni && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">İlçe / Mahalle</dt>
              <dd className="text-right text-slate-800">{konumMetni}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Koordinat</dt>
            <dd className="font-mono text-slate-800">
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Eklenme Tarihi</dt>
            <dd className="text-slate-800">
              {new Date(p.created_at).toLocaleString("tr-TR")}
            </dd>
          </div>
        </dl>
      </div>
    </Modal>
  );
}
