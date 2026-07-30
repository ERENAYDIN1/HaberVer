import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { konumCozumleToplu, type KonumCozumu } from "../api/sinirlar";
import {
  GRUP_RENGI,
  TIP_GRUBU,
  TIP_GRUPLARI,
  TIP_GRUP_KISA,
} from "../types/asset";
import type { AssetFeature, AssetFeatureCollection } from "../types/asset";
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

const BILINMIYOR = "__bilinmiyor__";

/* Detay seviyesine gore ust seridin rengi/etiketi degisir; boylece genel
   ozetten ilce/mahalle detayina inince gecis net anlasilir. Tam sinif adlari
   (Tailwind JIT sablon dizgilerini yakalayamaz). */
const SEVIYE_STIL = [
  { ad: "Genel Özet", serit: "bg-emerald-600", vurgu: "text-emerald-100" },
  { ad: "İlçe Detayı", serit: "bg-sky-600", vurgu: "text-sky-100" },
  { ad: "Mahalle Detayı", serit: "bg-violet-600", vurgu: "text-violet-100" },
] as const;

interface DashboardProps {
  data?: AssetFeatureCollection;
  /** Alan secimi aktifse baslikta belirtilir. */
  alanSecimiAktif?: boolean;
}

/** Gorunen varliklarin koordinatlarini tek istekte ilce/mahalleye cozumler.
 *  Sonuc, varlik id'sine gore bir haritaya donusturulur (sira bagimsiz). */
function useKonumHaritasi(features: AssetFeature[]) {
  const idler = useMemo(
    () => features.map((f) => f.properties.id).sort(),
    [features]
  );
  return useQuery({
    queryKey: ["konum-toplu", idler],
    queryFn: async () => {
      const sonuc = await konumCozumleToplu(
        features.map((f) => f.geometry.coordinates as [number, number])
      );
      const harita: Record<string, KonumCozumu> = {};
      features.forEach((f, i) => {
        harita[f.properties.id] = sonuc[i];
      });
      return harita;
    },
    enabled: features.length > 0,
    staleTime: Infinity,
  });
}

export default function Dashboard({ data, alanSecimiAktif }: DashboardProps) {
  const [ilceFiltre, setIlceFiltre] = useState<string | null>(null);
  const [mahalleFiltre, setMahalleFiltre] = useState<string | null>(null);

  // useMemo: her render'da yeni bir dizi uretilirse asagidaki `idler` memo'su
  // (ve ona bagli her sey) hicbir zaman onbellege alinamaz.
  const features = useMemo(() => data?.features ?? [], [data]);
  const { data: konumlar, isFetching: konumYukleniyor } =
    useKonumHaritasi(features);

  // Filtre kutularinin secenekleri: veride gercekten bulunan ilce/mahalleler.
  const ilceSecenekleri = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of features) {
      const ilce = konumlar?.[f.properties.id]?.ilce;
      if (ilce) m.set(ilce.kod, ilce.ad);
    }
    return [...m.entries()]
      .map(([kod, ad]) => ({ kod, ad }))
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  }, [features, konumlar]);

  const mahalleSecenekleri = useMemo(() => {
    if (!ilceFiltre) return [];
    const m = new Map<string, string>();
    for (const f of features) {
      const k = konumlar?.[f.properties.id];
      if (k?.ilce?.kod === ilceFiltre && k.mahalle) m.set(k.mahalle.kod, k.mahalle.ad);
    }
    return [...m.entries()]
      .map(([kod, ad]) => ({ kod, ad }))
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  }, [features, konumlar, ilceFiltre]);

  // Secili ilce/mahalleye gore suzulmus varliklar - tum ozet bunlar uzerinden.
  const filtrelenmis = useMemo(() => {
    return features.filter((f) => {
      const k = konumlar?.[f.properties.id];
      if (ilceFiltre && k?.ilce?.kod !== ilceFiltre) return false;
      if (mahalleFiltre && k?.mahalle?.kod !== mahalleFiltre) return false;
      return true;
    });
  }, [features, konumlar, ilceFiltre, mahalleFiltre]);

  // Kirilim: ilce secili degilse ilceye gore, seciliyse (drill-down) o ilcenin
  // mahallelerine gore. Her satirda toplam + bakim sayisi.
  const kirilim = useMemo(() => {
    const sayac = new Map<string, { ad: string; toplam: number; bakim: number }>();
    for (const f of features) {
      const k = konumlar?.[f.properties.id];
      let anahtar: string;
      let ad: string;
      if (ilceFiltre) {
        if (k?.ilce?.kod !== ilceFiltre) continue;
        anahtar = k?.mahalle?.kod ?? BILINMIYOR;
        ad = k?.mahalle?.ad ?? "Bilinmiyor";
      } else {
        anahtar = k?.ilce?.kod ?? BILINMIYOR;
        ad = k?.ilce?.ad ?? "Bilinmiyor";
      }
      const kayit = sayac.get(anahtar) ?? { ad, toplam: 0, bakim: 0 };
      kayit.toplam += 1;
      if (f.properties.status === "bakim_lazim") kayit.bakim += 1;
      sayac.set(anahtar, kayit);
    }
    return [...sayac.entries()]
      .map(([kod, v]) => ({ kod, ...v }))
      .sort((a, b) => b.toplam - a.toplam);
  }, [features, konumlar, ilceFiltre]);

  if (!data) {
    return <p className="p-4 text-sm text-slate-500">Yükleniyor...</p>;
  }

  const toplam = filtrelenmis.length;
  const bakimGerekli = filtrelenmis.filter(
    (f) => f.properties.status === "bakim_lazim"
  ).length;
  const bakimOrani = toplam === 0 ? 0 : Math.round((bakimGerekli / toplam) * 100);

  // 13 tur duz bir grafikte okunamiyor: dagilim TUR GRUBUNA gore (5 bar)
  // gosterilir ve her bar grubun HARITADAKI rengini tasir. Bir grubun icindeki
  // tur dagilimi soldaki listenin tur filtresinden okunur.
  const tipDagilimi = TIP_GRUPLARI.map((g) => ({
    tip: TIP_GRUP_KISA[g],
    renk: GRUP_RENGI[g],
    sayi: filtrelenmis.filter((f) => TIP_GRUBU[f.properties.type] === g).length,
  }));
  const enBuyuk = Math.max(...tipDagilimi.map((d) => d.sayi), 1);

  // Dışa/aktarma ve tetikleme filtrelenmis alt kumeyi kullanir.
  const filtreliKoleksiyon: AssetFeatureCollection = {
    type: "FeatureCollection",
    features: filtrelenmis,
  };

  const enBuyukKirilim = Math.max(...kirilim.map((k) => k.toplam), 1);
  const filtreAktif = ilceFiltre !== null || mahalleFiltre !== null;
  const seciliIlceAd = ilceSecenekleri.find((i) => i.kod === ilceFiltre)?.ad;
  const seciliMahalleAd = mahalleSecenekleri.find((m) => m.kod === mahalleFiltre)?.ad;
  const seviye = mahalleFiltre ? 2 : ilceFiltre ? 1 : 0;
  const stil = SEVIYE_STIL[seviye];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      {/* Seviyeye gore rengi/etiketi degisen ust breadcrumb seridi - genel
          ozetten detaya inince gecis buradan net anlasilir. */}
      <div
        key={seviye}
        className={`ozet-giris sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-2.5 text-white ${stil.serit}`}
      >
        <div className="min-w-0">
          <p className={`text-[11px] font-medium uppercase tracking-wide ${stil.vurgu}`}>
            {stil.ad}
          </p>
          <nav className="flex items-center gap-1 text-sm font-semibold">
            <button
              onClick={() => {
                setIlceFiltre(null);
                setMahalleFiltre(null);
              }}
              className="truncate hover:underline"
            >
              İstanbul
            </button>
            {ilceFiltre && (
              <>
                <span className={stil.vurgu}>›</span>
                <button
                  onClick={() => setMahalleFiltre(null)}
                  className="truncate hover:underline"
                >
                  {seciliIlceAd ?? "İlçe"}
                </button>
              </>
            )}
            {mahalleFiltre && (
              <>
                <span className={stil.vurgu}>›</span>
                <span className="truncate">{seciliMahalleAd ?? "Mahalle"}</span>
              </>
            )}
          </nav>
        </div>
        <div className="shrink-0 text-right leading-tight">
          <p className="text-lg font-semibold">{toplam}</p>
          <p className={`text-[11px] ${stil.vurgu}`}>varlık</p>
        </div>
      </div>

      <div key={`${ilceFiltre}-${mahalleFiltre}`} className="ozet-giris p-4">
      {alanSecimiAktif && (
        <p className="mb-3 border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Seçili alandaki varlıklar gösteriliyor.
        </p>
      )}

      {/* Ilce / mahalle filtresi */}
      <div className="mb-5 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-600">Konuma göre filtrele</p>
          {filtreAktif && (
            <button
              onClick={() => {
                setIlceFiltre(null);
                setMahalleFiltre(null);
              }}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
            >
              Temizle
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={ilceFiltre ?? ""}
            onChange={(e) => {
              setIlceFiltre(e.target.value || null);
              setMahalleFiltre(null);
            }}
            className="w-full border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Tüm ilçeler</option>
            {ilceSecenekleri.map((i) => (
              <option key={i.kod} value={i.kod}>
                {i.ad}
              </option>
            ))}
          </select>
          <select
            value={mahalleFiltre ?? ""}
            onChange={(e) => setMahalleFiltre(e.target.value || null)}
            disabled={!ilceFiltre}
            className="w-full border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">
              {ilceFiltre ? "Tüm mahalleler" : "Önce ilçe seçin"}
            </option>
            {mahalleSecenekleri.map((m) => (
              <option key={m.kod} value={m.kod}>
                {m.ad}
              </option>
            ))}
          </select>
        </div>
        {konumYukleniyor && (
          <p className="text-[11px] text-slate-400">Konumlar çözümleniyor…</p>
        )}
      </div>

      {/* Hero figur - gorunumdeki tek buyuk sayi */}
      <div className="mb-5">
        <p className="text-xs text-slate-500">
          {filtreAktif ? "Seçili konumdaki varlık" : "Toplam varlık"}
        </p>
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
          className="h-2.5 w-full overflow-hidden rounded-full"
          style={{ background: RENK.uyariTrack }}
          role="img"
          aria-label={`Bakım gerektiren varlık oranı yüzde ${bakimOrani}`}
        >
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${bakimOrani}%`, background: RENK.uyari }}
          />
        </div>
      </div>

      {/* Tur grubuna gore dagilim - barlar haritadaki grup renklerini tasir,
          degerler ucta dogrudan etiketli */}
      <div className="mb-6">
        <p className="mb-2 text-xs font-medium text-slate-600">
          Tür grubuna göre dağılım
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
                width={78}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: RENK.ikincilMetin }}
              />
              <Bar
                dataKey="sayi"
                barSize={18}
                radius={[9, 9, 9, 9]}
                isAnimationActive
                animationDuration={550}
                animationEasing="ease-out"
              >
                {tipDagilimi.map((d) => (
                  <Cell key={d.tip} fill={d.renk} />
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

      {/* Konum kirilimi - ilce (veya secili ilcede mahalle) bazinda dagilim.
          Satira tiklamak o konumu filtreler (drill-down). */}
      <div className="mb-6">
        <p className="mb-2 text-xs font-medium text-slate-600">
          {ilceFiltre
            ? `Mahalle dağılımı${seciliIlceAd ? ` · ${seciliIlceAd}` : ""}`
            : "İlçe dağılımı"}
        </p>
        {kirilim.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">
            {konumYukleniyor ? "Çözümleniyor…" : "Gösterilecek veri yok."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {kirilim.map((k) => {
              const tiklanabilir = k.kod !== BILINMIYOR;
              const secili = ilceFiltre
                ? mahalleFiltre === k.kod
                : false;
              return (
                <li key={k.kod}>
                  <button
                    disabled={!tiklanabilir}
                    onClick={() => {
                      if (ilceFiltre) {
                        setMahalleFiltre((m) => (m === k.kod ? null : k.kod));
                      } else {
                        setIlceFiltre(k.kod);
                        setMahalleFiltre(null);
                      }
                    }}
                    className={`w-full rounded-lg border px-2.5 py-1.5 text-left transition ${
                      secili
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    } ${tiklanabilir ? "" : "cursor-default opacity-70"}`}
                  >
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-medium text-slate-700">
                        {k.ad}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {k.toplam}
                        {k.bakim > 0 && (
                          <span className="ml-1 text-amber-700">· {k.bakim} bakım</span>
                        )}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${(k.toplam / enBuyukKirilim) * 100}%`,
                          background: RENK.seri,
                        }}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Disa aktarma - ekranda gorunen (filtrelenmis) kaydi disa aktarir */}
      <div className="border-t border-slate-200 pt-4">
        <p className="mb-2 text-xs font-medium text-slate-600">
          Dışa aktar
          <span className="ml-1 font-normal text-slate-400">
            ({toplam} kayıt)
          </span>
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => csvIndir(filtreliKoleksiyon)}
            disabled={toplam === 0}
            className="flex-1 border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            CSV indir
          </button>
          <button
            onClick={() => jsonIndir(filtreliKoleksiyon)}
            disabled={toplam === 0}
            className="flex-1 border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            GeoJSON indir
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
