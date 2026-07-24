import { fotoUrl } from "../api/reports";
import { useKonumCozumu } from "../hooks/useSinirlar";
import { ASSET_TYPE_LABELS } from "../types/asset";
import type { ReportFeature } from "../types/report";
import IhbarDurumRozeti from "./IhbarDurumRozeti";
import Modal from "./Modal";

interface ReportDetayModalProps {
  report: ReportFeature | null;
  onKapat: () => void;
}

/** Bir ihbarin (bekleyen/onaylanmis/reddedilen) tum detaylarini (foto dahil)
 *  kucuk bir pop up icinde gosterir - AssetDetayModal ile ayni tasarim
 *  dilini kullanir, boylece "Detay" her yerde tek, tutarli bir modal acar. */
export default function ReportDetayModal({ report, onKapat }: ReportDetayModalProps) {
  const koord = report ? report.geometry.coordinates : null;
  const { data: konum } = useKonumCozumu(koord ? koord[1] : null, koord ? koord[0] : null);

  if (!report) return null;
  const p = report.properties;
  const [lng, lat] = report.geometry.coordinates;
  const fotoSrc = fotoUrl(p.photo_url);
  const konumMetni = konum
    ? [konum.mahalle?.ad, konum.ilce?.ad].filter(Boolean).join(", ")
    : "";

  return (
    <Modal acik={report !== null} baslik="İhbar Detayı" onKapat={onKapat}>
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

        <IhbarDurumRozeti durum={p.status} />

        <dl className="space-y-1.5 text-xs">
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
            <dt className="text-slate-500">Bildirim Tarihi</dt>
            <dd className="text-slate-800">
              {new Date(p.created_at).toLocaleString("tr-TR")}
            </dd>
          </div>
        </dl>

        {(p.note || p.review_note) && (
          <div className="space-y-1.5 border-t border-slate-100 pt-2.5 text-xs">
            {p.note && (
              <p>
                <span className="font-medium text-slate-500">Açıklama: </span>
                <span className="text-slate-700">{p.note}</span>
              </p>
            )}
            {p.status === "reddedildi" && p.review_note && (
              <p>
                <span className="font-medium text-red-500">Ret nedeni: </span>
                <span className="text-red-600">{p.review_note}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
