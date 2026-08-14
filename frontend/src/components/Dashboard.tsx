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
  useDepartmanlar,
  useTurDepartmanEslemesi,
} from "../hooks/useDepartmanlar";
import type { AssetFeatureCollection } from "../types/asset";
import {
  TALEP_DURUM_RENGI,
  TALEP_GORUNUMLERI,
  TALEP_DURUM_ETIKETLERI,
  talepNoktasi,
} from "../types/talep";
import type { TalepFeature, TalepGorunumu } from "../types/talep";
import {
  csvIndir,
  jsonIndir,
  talepCsvIndir,
  talepJsonIndir,
} from "../utils/export";

/* Yesil/amber cifti renk korlugunde ayirt edilemez (CVD ΔE 7.9), bu yuzden
   her yerde metin etiketiyle birlikte kullanilir. */
const RENK = {
  seri: "#059669",
  uyari: "#d97706",
  uyariTrack: "#fde8c8",
  ikincilMetin: "#52514e",
  soluk: "#898781",
} as const;

const BILINMIYOR = "__bilinmiyor__";

// Tam sinif adlari (Tailwind JIT sablon dizgilerini yakalayamaz).
const SEVIYE_STIL = [
  { ad: "Genel Özet", serit: "bg-emerald-600", vurgu: "text-emerald-100" },
  { ad: "İlçe Detayı", serit: "bg-sky-600", vurgu: "text-sky-100" },
  { ad: "Mahalle Detayı", serit: "bg-violet-600", vurgu: "text-violet-100" },
] as const;

interface DashboardProps {
  data?: AssetFeatureCollection;
  talepGorunumleri?: Record<TalepGorunumu, TalepFeature[]>;
  alanSecimiAktif?: boolean;
}

interface Konumlu {
  id: string;
  koordinat: [number, number] | null;
}

/** Gorunen kayitlarin koordinatlarini tek istekte ilce/mahalleye cozumler. */
function useKonumHaritasi(kayitlar: Konumlu[]) {
  const konumlular = useMemo(
    () => kayitlar.filter((k): k is Konumlu & { koordinat: [number, number] } => k.koordinat !== null),
    [kayitlar]
  );
  const idler = useMemo(() => konumlular.map((k) => k.id).sort(), [konumlular]);
  return useQuery({
    queryKey: ["konum-toplu", idler],
    queryFn: async () => {
      const sonuc = await konumCozumleToplu(konumlular.map((k) => k.koordinat));
      const harita: Record<string, KonumCozumu> = {};
      konumlular.forEach((k, i) => {
        harita[k.id] = sonuc[i];
      });
      return harita;
    },
    enabled: konumlular.length > 0,
    staleTime: Infinity,
  });
}

/** İlçe/mahalle secici cifti - iki sekme de ayni gorseli kullanir. */
function KonumFiltresi({
  ilceFiltre,
  mahalleFiltre,
  ilceSecenekleri,
  mahalleSecenekleri,
  konumYukleniyor,
  onIlceDegis,
  onMahalleDegis,
  onTemizle,
}: {
  ilceFiltre: string | null;
  mahalleFiltre: string | null;
  ilceSecenekleri: { kod: string; ad: string }[];
  mahalleSecenekleri: { kod: string; ad: string }[];
  konumYukleniyor: boolean;
  onIlceDegis: (kod: string | null) => void;
  onMahalleDegis: (kod: string | null) => void;
  onTemizle: () => void;
}) {
  const filtreAktif = ilceFiltre !== null || mahalleFiltre !== null;
  return (
    <div className="mb-5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-600">Konuma göre filtrele</p>
        {filtreAktif && (
          <button
            onClick={onTemizle}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
          >
            Temizle
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={ilceFiltre ?? ""}
          onChange={(e) => onIlceDegis(e.target.value || null)}
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
          onChange={(e) => onMahalleDegis(e.target.value || null)}
          disabled={!ilceFiltre}
          className="w-full border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
        >
          <option value="">{ilceFiltre ? "Tüm mahalleler" : "Önce ilçe seçin"}</option>
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
  );
}

/** Yatay bar grafik govdesi; baslik disaridan cizilir. */
function DagilimGrafigi({
  veri,
  altYazi,
}: {
  veri: DagilimVerisi[];
  altYazi?: string;
}) {
  const enBuyuk = Math.max(...veri.map((d) => d.sayi), 1);
  const genislikEn = Math.max(...veri.map((d) => d.etiket.length), 4) * 6.5 + 20;
  return (
    <>
      {veri.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">Gösterilecek veri yok.</p>
      ) : (
        <ResponsiveContainer width="100%" height={veri.length * 42}>
          <BarChart
            data={veri}
            layout="vertical"
            margin={{ top: 0, right: 28, bottom: 0, left: 0 }}
            barCategoryGap="28%"
          >
            <XAxis type="number" hide domain={[0, enBuyuk]} />
            <YAxis
              type="category"
              dataKey="etiket"
              width={Math.min(genislikEn, 140)}
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
              {veri.map((d) => (
                <Cell key={d.anahtar} fill={d.renk} />
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
      {altYazi && <p className="mt-1 text-[11px] text-slate-400">{altYazi}</p>}
    </>
  );
}

/** Baslikli tek-kirilim grafik (orn. talep durum dagilimi). */
function DagilimBarlari({
  baslik,
  veri,
  altYazi,
}: {
  baslik: string;
  veri: DagilimVerisi[];
  altYazi?: string;
}) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-medium text-slate-600">{baslik}</p>
      <DagilimGrafigi veri={veri} altYazi={altYazi} />
    </div>
  );
}

interface DagilimVerisi {
  anahtar: string;
  etiket: string;
  renk: string;
  sayi: number;
}

interface Kirilim {
  kod: string;
  ad: string;
  toplam: number;
  vurgu: number;
}

/** Ilce/mahalle konum kirilimi - satira tiklamak drill-down yapar. */
function KonumKirilimi({
  baslik,
  kirilim,
  vurguEtiket,
  ilceFiltre,
  mahalleFiltre,
  konumYukleniyor,
  onIlceSec,
  onMahalleSec,
}: {
  baslik: string;
  kirilim: Kirilim[];
  vurguEtiket: string;
  ilceFiltre: string | null;
  mahalleFiltre: string | null;
  konumYukleniyor: boolean;
  onIlceSec: (kod: string) => void;
  onMahalleSec: (kod: string) => void;
}) {
  const enBuyukKirilim = Math.max(...kirilim.map((k) => k.toplam), 1);
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-medium text-slate-600">{baslik}</p>
      {kirilim.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">
          {konumYukleniyor ? "Çözümleniyor…" : "Gösterilecek veri yok."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {kirilim.map((k) => {
            const tiklanabilir = k.kod !== BILINMIYOR;
            const secili = ilceFiltre ? mahalleFiltre === k.kod : false;
            return (
              <li key={k.kod}>
                <button
                  disabled={!tiklanabilir}
                  onClick={() => (ilceFiltre ? onMahalleSec(k.kod) : onIlceSec(k.kod))}
                  className={`w-full rounded-lg border px-2.5 py-1.5 text-left transition ${
                    secili
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  } ${tiklanabilir ? "" : "cursor-default opacity-70"}`}
                >
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-slate-700">{k.ad}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {k.toplam}
                      {k.vurgu > 0 && (
                        <span className="ml-1 text-amber-700">
                          · {k.vurgu} {vurguEtiket}
                        </span>
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
  );
}

function DisaAktar({
  toplam,
  onCsv,
  onJson,
}: {
  toplam: number;
  onCsv: () => void;
  onJson: () => void;
}) {
  return (
    <div className="border-t border-slate-200 pt-4">
      <p className="mb-2 text-xs font-medium text-slate-600">
        Dışa aktar
        <span className="ml-1 font-normal text-slate-400">({toplam} kayıt)</span>
      </p>
      <div className="flex gap-2">
        <button
          onClick={onCsv}
          disabled={toplam === 0}
          className="flex-1 border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          CSV indir
        </button>
        <button
          onClick={onJson}
          disabled={toplam === 0}
          className="flex-1 border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          GeoJSON indir
        </button>
      </div>
    </div>
  );
}

/** Ust breadcrumb seridi - seviyeye gore rengi/etiketi degisir. */
function UstSerit({
  seviye,
  ilceFiltre,
  mahalleFiltre,
  seciliIlceAd,
  seciliMahalleAd,
  onKok,
  onIlceyeDon,
  sayi,
  sayiEtiket,
}: {
  seviye: 0 | 1 | 2;
  ilceFiltre: string | null;
  mahalleFiltre: string | null;
  seciliIlceAd?: string;
  seciliMahalleAd?: string;
  onKok: () => void;
  onIlceyeDon: () => void;
  sayi: number;
  sayiEtiket: string;
}) {
  const stil = SEVIYE_STIL[seviye];
  return (
    <div
      key={seviye}
      className={`ozet-giris sticky top-10 z-10 flex items-center justify-between gap-2 px-4 py-2.5 text-white ${stil.serit}`}
    >
      <div className="min-w-0">
        <p className={`text-[11px] font-medium uppercase tracking-wide ${stil.vurgu}`}>
          {stil.ad}
        </p>
        <nav className="flex items-center gap-1 text-sm font-semibold">
          <button onClick={onKok} className="truncate hover:underline">
            İstanbul
          </button>
          {ilceFiltre && (
            <>
              <span className={stil.vurgu}>›</span>
              <button onClick={onIlceyeDon} className="truncate hover:underline">
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
        <p className="text-lg font-semibold">{sayi}</p>
        <p className={`text-[11px] ${stil.vurgu}`}>{sayiEtiket}</p>
      </div>
    </div>
  );
}

type OzetSekmesi = "varliklar" | "talepler";

const SEKMELER: { anahtar: OzetSekmesi; etiket: string }[] = [
  { anahtar: "varliklar", etiket: "Varlıklar" },
  { anahtar: "talepler", etiket: "Talepler" },
];

export default function Dashboard({
  data,
  talepGorunumleri,
  alanSecimiAktif,
}: DashboardProps) {
  const [sekme, setSekme] = useState<OzetSekmesi>("varliklar");

  const talepVarMi = talepGorunumleri !== undefined;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      {talepVarMi && (
        <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
          {SEKMELER.map((s) => (
            <button
              key={s.anahtar}
              onClick={() => setSekme(s.anahtar)}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
                sekme === s.anahtar
                  ? "border-b-2 border-emerald-600 text-emerald-700"
                  : "border-b-2 border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {s.etiket}
            </button>
          ))}
        </div>
      )}
      {sekme === "varliklar" || !talepVarMi ? (
        <VarlikOzeti data={data} alanSecimiAktif={alanSecimiAktif} />
      ) : (
        <TalepOzeti gorunumler={talepGorunumleri} alanSecimiAktif={alanSecimiAktif} />
      )}
    </div>
  );
}

function VarlikOzeti({
  data,
  alanSecimiAktif,
}: {
  data?: AssetFeatureCollection;
  alanSecimiAktif?: boolean;
}) {
  const [ilceFiltre, setIlceFiltre] = useState<string | null>(null);
  const [mahalleFiltre, setMahalleFiltre] = useState<string | null>(null);

  const features = useMemo(() => data?.features ?? [], [data]);
  const konumluKayitlar = useMemo(
    () =>
      features.map((f) => ({
        id: f.properties.id,
        koordinat: f.geometry.coordinates as [number, number],
      })),
    [features]
  );
  const { data: konumlar, isFetching: konumYukleniyor } = useKonumHaritasi(konumluKayitlar);
  const { data: departmanlar } = useDepartmanlar();
  const { data: esleme } = useTurDepartmanEslemesi();

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

  const filtrelenmis = useMemo(() => {
    return features.filter((f) => {
      const k = konumlar?.[f.properties.id];
      if (ilceFiltre && k?.ilce?.kod !== ilceFiltre) return false;
      if (mahalleFiltre && k?.mahalle?.kod !== mahalleFiltre) return false;
      return true;
    });
  }, [features, konumlar, ilceFiltre, mahalleFiltre]);

  const kirilim = useMemo<Kirilim[]>(() => {
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
      .map(([kod, v]) => ({ kod, ad: v.ad, toplam: v.toplam, vurgu: v.bakim }))
      .sort((a, b) => b.toplam - a.toplam);
  }, [features, konumlar, ilceFiltre]);

  if (!data) {
    return <p className="p-4 text-sm text-slate-500">Yükleniyor...</p>;
  }

  const toplam = filtrelenmis.length;
  const bakimGerekli = filtrelenmis.filter((f) => f.properties.status === "bakim_lazim").length;
  const bakimOrani = toplam === 0 ? 0 : Math.round((bakimGerekli / toplam) * 100);

  const departmanDagilimi = (departmanlar ?? [])
    .map((d) => ({
      anahtar: d.kod,
      etiket: d.ad.replace(/\s*Müdürlüğü$/, ""),
      renk: d.renk,
      sayi: filtrelenmis.filter((f) => esleme?.[f.properties.type] === d.kod).length,
      bakim: filtrelenmis.filter(
        (f) => esleme?.[f.properties.type] === d.kod && f.properties.status === "bakim_lazim"
      ).length,
    }))
    .filter((d) => d.sayi > 0)
    .sort((a, b) => b.sayi - a.sayi);

  const filtreliKoleksiyon: AssetFeatureCollection = {
    type: "FeatureCollection",
    features: filtrelenmis,
  };

  const filtreAktif = ilceFiltre !== null || mahalleFiltre !== null;
  const seciliIlceAd = ilceSecenekleri.find((i) => i.kod === ilceFiltre)?.ad;
  const seciliMahalleAd = mahalleSecenekleri.find((m) => m.kod === mahalleFiltre)?.ad;
  const seviye = mahalleFiltre ? 2 : ilceFiltre ? 1 : 0;

  return (
    <>
      <UstSerit
        seviye={seviye}
        ilceFiltre={ilceFiltre}
        mahalleFiltre={mahalleFiltre}
        seciliIlceAd={seciliIlceAd}
        seciliMahalleAd={seciliMahalleAd}
        onKok={() => {
          setIlceFiltre(null);
          setMahalleFiltre(null);
        }}
        onIlceyeDon={() => setMahalleFiltre(null)}
        sayi={toplam}
        sayiEtiket="varlık"
      />

      <div key={`${ilceFiltre}-${mahalleFiltre}`} className="ozet-giris p-4">
        {alanSecimiAktif && (
          <p className="mb-3 border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Seçili alandaki varlıklar gösteriliyor.
          </p>
        )}

        <KonumFiltresi
          ilceFiltre={ilceFiltre}
          mahalleFiltre={mahalleFiltre}
          ilceSecenekleri={ilceSecenekleri}
          mahalleSecenekleri={mahalleSecenekleri}
          konumYukleniyor={konumYukleniyor}
          onIlceDegis={(kod) => {
            setIlceFiltre(kod);
            setMahalleFiltre(null);
          }}
          onMahalleDegis={setMahalleFiltre}
          onTemizle={() => {
            setIlceFiltre(null);
            setMahalleFiltre(null);
          }}
        />

        <div className="mb-5">
          <p className="text-xs text-slate-500">
            {filtreAktif ? "Seçili konumdaki varlık" : "Toplam varlık"}
          </p>
          <p className="text-5xl font-semibold leading-tight text-slate-900">{toplam}</p>
        </div>

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

        {departmanDagilimi.length > 0 && (
          <DagilimBarlari
            baslik="Departmana göre dağılım"
            veri={departmanDagilimi}
            altYazi={`Bakım bekleyen: ${
              departmanDagilimi
                .filter((d) => d.bakim > 0)
                .map((d) => `${d.etiket} ${d.bakim}`)
                .join(" · ") || "yok"
            }`}
          />
        )}

        <KonumKirilimi
          baslik={
            ilceFiltre
              ? `Mahalle dağılımı${seciliIlceAd ? ` · ${seciliIlceAd}` : ""}`
              : "İlçe dağılımı"
          }
          kirilim={kirilim}
          vurguEtiket="bakım"
          ilceFiltre={ilceFiltre}
          mahalleFiltre={mahalleFiltre}
          konumYukleniyor={konumYukleniyor}
          onIlceSec={(kod) => {
            setIlceFiltre(kod);
            setMahalleFiltre(null);
          }}
          onMahalleSec={(kod) => setMahalleFiltre((m) => (m === kod ? null : kod))}
        />

        <DisaAktar
          toplam={toplam}
          onCsv={() => csvIndir(filtreliKoleksiyon)}
          onJson={() => jsonIndir(filtreliKoleksiyon)}
        />
      </div>
    </>
  );
}

function TalepOzeti({
  gorunumler,
  alanSecimiAktif,
}: {
  gorunumler?: Record<TalepGorunumu, TalepFeature[]>;
  alanSecimiAktif?: boolean;
}) {
  const [ilceFiltre, setIlceFiltre] = useState<string | null>(null);
  const [mahalleFiltre, setMahalleFiltre] = useState<string | null>(null);

  const features = useMemo(
    () => (gorunumler ? TALEP_GORUNUMLERI.flatMap((g) => gorunumler[g]) : []),
    [gorunumler]
  );
  const konumluKayitlar = useMemo(
    () => features.map((f) => ({ id: f.properties.id, koordinat: talepNoktasi(f) })),
    [features]
  );
  const { data: konumlar, isFetching: konumYukleniyor } = useKonumHaritasi(konumluKayitlar);
  const { data: departmanlar } = useDepartmanlar();
  const { data: esleme } = useTurDepartmanEslemesi();

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

  const filtrelenmis = useMemo(() => {
    return features.filter((f) => {
      const k = konumlar?.[f.properties.id];
      if (ilceFiltre && k?.ilce?.kod !== ilceFiltre) return false;
      if (mahalleFiltre && k?.mahalle?.kod !== mahalleFiltre) return false;
      return true;
    });
  }, [features, konumlar, ilceFiltre, mahalleFiltre]);

  const kirilim = useMemo<Kirilim[]>(() => {
    const sayac = new Map<string, { ad: string; toplam: number; bekleyen: number }>();
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
      const kayit = sayac.get(anahtar) ?? { ad, toplam: 0, bekleyen: 0 };
      kayit.toplam += 1;
      if (f.properties.gorunum === "beklemede") kayit.bekleyen += 1;
      sayac.set(anahtar, kayit);
    }
    return [...sayac.entries()]
      .map(([kod, v]) => ({ kod, ad: v.ad, toplam: v.toplam, vurgu: v.bekleyen }))
      .sort((a, b) => b.toplam - a.toplam);
  }, [features, konumlar, ilceFiltre]);

  if (!gorunumler) {
    return <p className="p-4 text-sm text-slate-500">Yükleniyor...</p>;
  }

  const toplam = filtrelenmis.length;

  const durumDagilimi = TALEP_GORUNUMLERI.map((g) => ({
    anahtar: g,
    etiket: TALEP_DURUM_ETIKETLERI[g],
    renk: TALEP_DURUM_RENGI[g],
    sayi: filtrelenmis.filter((f) => f.properties.gorunum === g).length,
  }));

  const departmanDagilimi = (departmanlar ?? [])
    .map((d) => ({
      anahtar: d.kod,
      etiket: d.ad.replace(/\s*Müdürlüğü$/, ""),
      renk: d.renk,
      sayi: filtrelenmis.filter((f) => esleme?.[f.properties.type] === d.kod).length,
      bekleyen: filtrelenmis.filter(
        (f) => esleme?.[f.properties.type] === d.kod && f.properties.gorunum === "beklemede"
      ).length,
    }))
    .filter((d) => d.sayi > 0)
    .sort((a, b) => b.sayi - a.sayi);

  const filtreliKoleksiyon = { type: "FeatureCollection" as const, features: filtrelenmis };

  const filtreAktif = ilceFiltre !== null || mahalleFiltre !== null;
  const seciliIlceAd = ilceSecenekleri.find((i) => i.kod === ilceFiltre)?.ad;
  const seciliMahalleAd = mahalleSecenekleri.find((m) => m.kod === mahalleFiltre)?.ad;
  const seviye = mahalleFiltre ? 2 : ilceFiltre ? 1 : 0;

  return (
    <>
      <UstSerit
        seviye={seviye}
        ilceFiltre={ilceFiltre}
        mahalleFiltre={mahalleFiltre}
        seciliIlceAd={seciliIlceAd}
        seciliMahalleAd={seciliMahalleAd}
        onKok={() => {
          setIlceFiltre(null);
          setMahalleFiltre(null);
        }}
        onIlceyeDon={() => setMahalleFiltre(null)}
        sayi={toplam}
        sayiEtiket="talep"
      />

      <div key={`${ilceFiltre}-${mahalleFiltre}`} className="ozet-giris p-4">
        {alanSecimiAktif && (
          <p className="mb-3 border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Seçili alandaki talepler gösteriliyor.
          </p>
        )}

        <KonumFiltresi
          ilceFiltre={ilceFiltre}
          mahalleFiltre={mahalleFiltre}
          ilceSecenekleri={ilceSecenekleri}
          mahalleSecenekleri={mahalleSecenekleri}
          konumYukleniyor={konumYukleniyor}
          onIlceDegis={(kod) => {
            setIlceFiltre(kod);
            setMahalleFiltre(null);
          }}
          onMahalleDegis={setMahalleFiltre}
          onTemizle={() => {
            setIlceFiltre(null);
            setMahalleFiltre(null);
          }}
        />

        <div className="mb-6">
          <p className="text-xs text-slate-500">
            {filtreAktif ? "Seçili konumdaki talep" : "Toplam talep"}
          </p>
          <p className="text-5xl font-semibold leading-tight text-slate-900">{toplam}</p>
        </div>

        <DagilimBarlari baslik="Duruma göre dağılım" veri={durumDagilimi} />

        {departmanDagilimi.length > 0 && (
          <DagilimBarlari
            baslik="Departmana göre dağılım"
            veri={departmanDagilimi}
            altYazi={`Bekleyen: ${
              departmanDagilimi
                .filter((d) => d.bekleyen > 0)
                .map((d) => `${d.etiket} ${d.bekleyen}`)
                .join(" · ") || "yok"
            }`}
          />
        )}

        <KonumKirilimi
          baslik={
            ilceFiltre
              ? `Mahalle dağılımı${seciliIlceAd ? ` · ${seciliIlceAd}` : ""}`
              : "İlçe dağılımı"
          }
          kirilim={kirilim}
          vurguEtiket="bekliyor"
          ilceFiltre={ilceFiltre}
          mahalleFiltre={mahalleFiltre}
          konumYukleniyor={konumYukleniyor}
          onIlceSec={(kod) => {
            setIlceFiltre(kod);
            setMahalleFiltre(null);
          }}
          onMahalleSec={(kod) => setMahalleFiltre((m) => (m === kod ? null : kod))}
        />

        <DisaAktar
          toplam={toplam}
          onCsv={() => talepCsvIndir(filtreliKoleksiyon)}
          onJson={() => talepJsonIndir(filtreliKoleksiyon)}
        />
      </div>
    </>
  );
}
