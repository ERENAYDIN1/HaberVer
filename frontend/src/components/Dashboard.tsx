import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { ASSET_TYPES, ASSET_TYPE_LABELS } from "../types/asset";
import type { AssetFeatureCollection } from "../types/asset";
import { csvIndir, jsonIndir } from "../utils/export";

/* Renk rolleri - uygulamanin mevcut dilini korur.
   Not: yesil/amber cifti renk korlugunde ayirt edilemeyecek kadar yakin
   (dogrulayici: CVD ΔE 7.9), bu yuzden her yerde metin etiketiyle birlikte
   kullanilir; renk tek basina anlam tasimaz. */
const RENK = {
  seri: "#059669", // tek hue - buyukluk karsilastirmasi
  uyari: "#d97706", // bakim gerekli (durum rengi)
  uyariTrack: "#fde8c8", // meter'in bos kismi: ayni ramp'in acik adimi
  ikincilMetin: "#52514e",
  soluk: "#898781",
} as const;

interface DashboardProps {
  data?: AssetFeatureCollection;
  /** Alan secimi aktifse baslikta belirtilir. */
  alanSecimiAktif?: boolean;
}

export default function Dashboard({ data, alanSecimiAktif }: DashboardProps) {
  if (!data) {
    return <p className="p-4 text-sm text-slate-500">Yükleniyor...</p>;
  }

  const toplam = data.features.length;
  const bakimGerekli = data.features.filter(
    (f) => f.properties.status === "bakim_lazim"
  ).length;
  const bakimOrani = toplam === 0 ? 0 : Math.round((bakimGerekli / toplam) * 100);

  const tipDagilimi = ASSET_TYPES.map((t) => ({
    tip: ASSET_TYPE_LABELS[t],
    sayi: data.features.filter((f) => f.properties.type === t).length,
  }));

  const enBuyuk = Math.max(...tipDagilimi.map((d) => d.sayi), 1);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {alanSecimiAktif && (
        <p className="mb-3 border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Seçili alandaki varlıklar gösteriliyor.
        </p>
      )}

      {/* Hero figur - gorunumdeki tek buyuk sayi */}
      <div className="mb-5">
        <p className="text-xs text-slate-500">Toplam varlık</p>
        <p className="text-5xl font-semibold leading-tight text-slate-900">
          {toplam}
        </p>
      </div>

      {/* Bakim orani - meter (dolgu severity, track ayni ramp'in acik adimi) */}
      <div className="mb-6">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs text-slate-500">Bakım gerektiren</span>
          <span className="text-sm font-semibold text-slate-800">
            {bakimGerekli}
            <span className="ml-1 text-xs font-normal text-slate-500">
              / {toplam} · %{bakimOrani}
            </span>
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden border border-slate-200"
          style={{ background: RENK.uyariTrack }}
          role="img"
          aria-label={`Bakım gerektiren varlık oranı yüzde ${bakimOrani}`}
        >
          <div
            className="h-full transition-all"
            style={{ width: `${bakimOrani}%`, background: RENK.uyari }}
          />
        </div>
      </div>

      {/* Tipe gore dagilim - tek seri, tek hue, degerler ucta dogrudan etiketli */}
      <div className="mb-6">
        <p className="mb-2 text-xs font-medium text-slate-600">
          Tipe göre dağılım
        </p>
        {toplam === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">
            Gösterilecek veri yok.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={tipDagilimi.length * 42}>
            <BarChart
              data={tipDagilimi}
              layout="vertical"
              margin={{ top: 0, right: 28, bottom: 0, left: 0 }}
              barCategoryGap="28%"
            >
              <XAxis type="number" hide domain={[0, enBuyuk]} />
              <YAxis
                type="category"
                dataKey="tip"
                width={54}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: RENK.ikincilMetin }}
              />
              <Bar dataKey="sayi" barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {tipDagilimi.map((d) => (
                  <Cell key={d.tip} fill={RENK.seri} />
                ))}
                <LabelList
                  dataKey="sayi"
                  position="right"
                  offset={8}
                  style={{ fontSize: 12, fill: RENK.ikincilMetin, fontWeight: 500 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Disa aktarma - ekranda gorunen kaydi disa aktarir */}
      <div className="border-t border-slate-200 pt-4">
        <p className="mb-2 text-xs font-medium text-slate-600">
          Dışa aktar
          <span className="ml-1 font-normal text-slate-400">
            ({toplam} kayıt)
          </span>
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => csvIndir(data)}
            disabled={toplam === 0}
            className="flex-1 border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            CSV indir
          </button>
          <button
            onClick={() => jsonIndir(data)}
            disabled={toplam === 0}
            className="flex-1 border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            GeoJSON indir
          </button>
        </div>
      </div>
    </div>
  );
}
