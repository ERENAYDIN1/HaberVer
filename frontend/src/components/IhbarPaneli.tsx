import { useEffect, useState } from "react";

import {
  approveReport,
  fotoUrl,
  listReports,
  rejectReport,
} from "../api/reports";
import { ASSET_TYPE_LABELS } from "../types/asset";
import {
  REPORT_STATUS_LABELS,
  REPORT_STATUSES,
  type ReportFeature,
  type ReportStatus,
} from "../types/report";
import IhbarDurumRozeti from "./IhbarDurumRozeti";

interface IhbarPaneliProps {
  /** Bir ihbar onaylanip varliga donusunce ana varlik listesini tazelemek icin. */
  onVarlikOlustu?: () => void;
}

export default function IhbarPaneli({ onVarlikOlustu }: IhbarPaneliProps) {
  const [durum, setDurum] = useState<ReportStatus>("beklemede");
  const [ihbarlar, setIhbarlar] = useState<ReportFeature[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [islemdeki, setIslemdeki] = useState<string | null>(null);

  const yukle = (d: ReportStatus) => {
    setYukleniyor(true);
    setHata(null);
    listReports(d)
      .then((r) => setIhbarlar(r.features))
      .catch((e) => setHata((e as Error).message))
      .finally(() => setYukleniyor(false));
  };

  useEffect(() => {
    yukle(durum);
  }, [durum]);

  const onayla = async (id: string) => {
    setIslemdeki(id);
    setHata(null);
    try {
      await approveReport(id);
      yukle(durum);
      onVarlikOlustu?.();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setIslemdeki(null);
    }
  };

  const reddet = async (id: string) => {
    const neden = window.prompt("Ret nedeni (opsiyonel):") ?? undefined;
    setIslemdeki(id);
    setHata(null);
    try {
      await rejectReport(id, neden || undefined);
      yukle(durum);
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setIslemdeki(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Durum filtresi */}
      <div className="flex gap-1 border-b border-slate-200 px-4 py-2">
        {REPORT_STATUSES.map((d) => (
          <button
            key={d}
            onClick={() => setDurum(d)}
            className={`border px-2.5 py-1 text-xs font-medium transition ${
              durum === d
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {REPORT_STATUS_LABELS[d]}
          </button>
        ))}
      </div>

      {hata && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {hata}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {yukleniyor && <p className="p-4 text-sm text-slate-500">Yükleniyor…</p>}
        {!yukleniyor && ihbarlar.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">
            Bu durumda ihbar yok.
          </p>
        )}

        <ul className="divide-y divide-slate-100">
          {ihbarlar.map((ih) => {
            const p = ih.properties;
            const [lng, lat] = ih.geometry.coordinates;
            const fotoSrc = fotoUrl(p.photo_url);
            const bekliyor = p.status === "beklemede";
            return (
              <li key={p.id} className="p-4">
                <div className="flex gap-3">
                  {fotoSrc ? (
                    <a href={fotoSrc} target="_blank" rel="noreferrer" className="shrink-0">
                      <img
                        src={fotoSrc}
                        alt=""
                        className="h-16 w-16 border border-slate-200 object-cover"
                      />
                    </a>
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-dashed border-slate-200 text-[10px] text-slate-400">
                      Fotoğraf yok
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {p.name}
                      </p>
                      <IhbarDurumRozeti durum={p.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {ASSET_TYPE_LABELS[p.type]} ·{" "}
                      <span className="font-mono">
                        {lat.toFixed(4)}, {lng.toFixed(4)}
                      </span>
                    </p>
                    {p.note && (
                      <p className="mt-1 text-xs text-slate-600">{p.note}</p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {new Date(p.created_at).toLocaleString("tr-TR")}
                    </p>

                    {bekliyor && (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => onayla(p.id)}
                          disabled={islemdeki === p.id}
                          className="border border-emerald-600 bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Onayla
                        </button>
                        <button
                          onClick={() => reddet(p.id)}
                          disabled={islemdeki === p.id}
                          className="border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          Reddet
                        </button>
                      </div>
                    )}
                    {p.status === "reddedildi" && p.review_note && (
                      <p className="mt-1 text-xs text-red-600">
                        Ret nedeni: {p.review_note}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
