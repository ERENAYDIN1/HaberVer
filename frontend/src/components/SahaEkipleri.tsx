import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ekibeAta, ekipGorevleri, gorevGeriAl, havuz as havuzGetir } from "../api/saha";
import {
  ASSET_SOURCE_LABELS,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  type AssetSource,
  type AssetType,
} from "../types/asset";
import {
  MAKS_AKTIF_GOREV,
  MAKS_ATAMA_MESAFE_KM,
  type EkipGorevleri,
  type GorevOzet,
  type HavuzVarlik,
} from "../types/saha";
import {
  IconBench,
  IconInbox,
  IconLamp,
  IconRefresh,
  IconTree,
  IconUsers,
  IconWarning,
} from "./icons";

/** Bir varlik/gorev icin uygulanabilecek islem. */
type Islem =
  | { tip: "ata"; asset_id: string; worker_id: string }
  | { tip: "havuz"; asset_id: string };

/** Havuz siralamasi: bekleme suresine gore (en eski/en yeni once). */
type HavuzSira = "eski" | "yeni";

/** Her varlik tipine ayirt edici renk + ikon: ilk bakista tur farki anlasilsin
 *  diye rozet arka plani da tipe gore degisir (issue: renkler aynidir sikayeti). */
const TIP_STILI: Record<
  AssetType,
  { ikon: (p: { className?: string }) => React.ReactElement; rozet: string }
> = {
  agac: { ikon: IconTree, rozet: "bg-emerald-100 text-emerald-700" },
  bank: { ikon: IconBench, rozet: "bg-amber-100 text-amber-700" },
  direk: { ikon: IconLamp, rozet: "bg-sky-100 text-sky-700" },
};

/** Son gorulme tazeligine gore renk + insana okunur metin. */
function tazelik(iso: string | null): { renk: string; metin: string } {
  if (!iso) return { renk: "#94a3b8", metin: "konum yok" };
  const farkSn = (Date.now() - new Date(iso).getTime()) / 1000;
  const metin =
    farkSn < 60
      ? "az önce"
      : farkSn < 3600
        ? `${Math.floor(farkSn / 60)} dk önce`
        : farkSn < 86400
          ? `${Math.floor(farkSn / 3600)} sa önce`
          : new Date(iso).toLocaleDateString("tr-TR");
  const renk = farkSn < 120 ? "#059669" : farkSn < 900 ? "#d97706" : "#94a3b8";
  return { renk, metin };
}

/** Havuzdaki bir isin ne kadar suredir bekledigini insana okunur verir. */
function beklemeMetni(iso: string): string {
  const farkSn = (Date.now() - new Date(iso).getTime()) / 1000;
  if (farkSn < 60) return "az önce eklendi";
  if (farkSn < 3600) return `${Math.floor(farkSn / 60)} dk bekliyor`;
  if (farkSn < 86400) return `${Math.floor(farkSn / 3600)} sa bekliyor`;
  return `${Math.floor(farkSn / 86400)} gün bekliyor`;
}

/** Tipe gore renkli, ikonlu kare rozet (satirlarin basinda). */
function TipRozet({ type }: { type: AssetType }) {
  const s = TIP_STILI[type];
  const Ikon = s.ikon;
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${s.rozet}`}
      title={ASSET_TYPE_LABELS[type]}
    >
      <Ikon className="h-4 w-4" />
    </span>
  );
}

/** Bir ekibin altindaki tek gorev satiri: baska ekibe tasi ya da havuza al. */
function GorevSatiri({
  gorev,
  digerEkipler,
  onIslem,
  calisiyor,
}: {
  gorev: GorevOzet;
  digerEkipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  calisiyor: boolean;
}) {
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <TipRozet type={gorev.type} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium leading-snug text-slate-800">
            {gorev.name}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-500">{ASSET_TYPE_LABELS[gorev.type]}</span>
            <span
              className={`rounded-full px-1.5 py-px font-medium ${
                gorev.otomatik
                  ? "bg-slate-100 text-slate-500"
                  : "bg-indigo-100 text-indigo-600"
              }`}
            >
              {gorev.otomatik ? "otomatik" : "elle"}
            </span>
          </p>
        </div>
      </div>
      <select
        value=""
        disabled={calisiyor}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          if (v === "__havuz__") onIslem({ tip: "havuz", asset_id: gorev.asset_id });
          else onIslem({ tip: "ata", asset_id: gorev.asset_id, worker_id: v });
        }}
        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
      >
        <option value="">{calisiyor ? "İşleniyor…" : "Taşı / işlem…"}</option>
        <optgroup label="Başka ekibe taşı">
          {digerEkipler.map((e) => {
            const dolu = e.aktif_gorev >= MAKS_AKTIF_GOREV;
            return (
              <option key={e.id} value={e.id} disabled={dolu}>
                {(e.full_name || e.email) +
                  ` (${e.aktif_gorev}/${MAKS_AKTIF_GOREV}` +
                  (dolu ? " · dolu)" : ")")}
              </option>
            );
          })}
        </optgroup>
        <option value="__havuz__">↩ Havuza al (iptal)</option>
      </select>
    </li>
  );
}

/** Bir saha ekibi karti: baslik (konum/yuk) + kendine dusen gorev listesi. */
function EkipKarti({
  ekip,
  tumEkipler,
  onIslem,
  islenenAsset,
}: {
  ekip: EkipGorevleri;
  tumEkipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  islenenAsset: string | undefined;
}) {
  const t = tazelik(ekip.last_seen_at);
  const dolu = ekip.aktif_gorev >= MAKS_AKTIF_GOREV;
  const diger = tumEkipler.filter((e) => e.id !== ekip.id);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600"
          title={ekip.email}
        >
          <IconUsers className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">
            {ekip.full_name || ekip.email}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: t.renk }}
            />
            {t.metin}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            dolu ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {dolu && <IconWarning className="h-3 w-3" />}
          {ekip.aktif_gorev}/{MAKS_AKTIF_GOREV} görev
        </span>
      </div>

      {ekip.gorevler.length === 0 ? (
        <p className="px-3 py-3 text-xs text-slate-400">Aktif görev yok.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {ekip.gorevler.map((g) => (
            <GorevSatiri
              key={g.assignment_id}
              gorev={g}
              digerEkipler={diger}
              onIslem={onIslem}
              calisiyor={islenenAsset === g.asset_id}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Havuzda bekleyen tek varlik satiri: bir ekibe elle atama. */
function HavuzSatiri({
  varlik,
  ekipler,
  onIslem,
  calisiyor,
}: {
  varlik: HavuzVarlik;
  ekipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  calisiyor: boolean;
}) {
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <TipRozet type={varlik.type} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium leading-snug text-slate-800">
            {varlik.name}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-500">{ASSET_TYPE_LABELS[varlik.type]}</span>
            <span className="rounded-full bg-amber-100 px-1.5 py-px font-medium text-amber-700">
              {beklemeMetni(varlik.created_at)}
            </span>
          </p>
        </div>
      </div>
      <select
        value=""
        disabled={calisiyor}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onIslem({ tip: "ata", asset_id: varlik.asset_id, worker_id: v });
        }}
        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
      >
        <option value="">{calisiyor ? "İşleniyor…" : "Ekibe ata…"}</option>
        {ekipler.map((e) => {
          const dolu = e.aktif_gorev >= MAKS_AKTIF_GOREV;
          return (
            <option key={e.id} value={e.id} disabled={dolu}>
              {(e.full_name || e.email) +
                ` (${e.aktif_gorev}/${MAKS_AKTIF_GOREV}` +
                (dolu ? " · dolu)" : ")")}
            </option>
          );
        })}
      </select>
    </li>
  );
}

/** Havuzun tek bir kaynak grubu (Kayitli / Ihbar) - baslik + varlik listesi.
 *  Grup bossa hic render edilmez. */
function HavuzGrup({
  kaynak,
  varliklar,
  ekipler,
  onIslem,
  islenenAsset,
}: {
  kaynak: AssetSource;
  varliklar: HavuzVarlik[];
  ekipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  islenenAsset: string | undefined;
}) {
  if (varliklar.length === 0) return null;
  // Kaynaga gore ayirt edici vurgu: kayitli=slate, ihbar=amber.
  const vurgu =
    kaynak === "ihbar"
      ? { cizgi: "bg-amber-400", rozet: "bg-amber-100 text-amber-700" }
      : { cizgi: "bg-slate-400", rozet: "bg-slate-200 text-slate-600" };
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`h-4 w-1 rounded-full ${vurgu.cizgi}`} />
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {ASSET_SOURCE_LABELS[kaynak]}
        </p>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${vurgu.rozet}`}
        >
          {varliklar.length}
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {varliklar.map((h) => (
          <HavuzSatiri
            key={h.asset_id}
            varlik={h}
            ekipler={ekipler}
            onIslem={onIslem}
            calisiyor={islenenAsset === h.asset_id}
          />
        ))}
      </ul>
    </div>
  );
}

/** Personel icin saha ekibi yonetim panosu: hangi ekipte hangi gorevler var,
 *  gorevleri baska ekibe tasi / havuza al, havuzdaki isleri elle ata. Canli
 *  konum haritada; buradaki yuk/gorevler 20sn'de bir tazelenir. */
export default function SahaEkipleri() {
  const queryClient = useQueryClient();
  const [durum, setDurum] = useState<{ ok: boolean; metin: string } | null>(null);
  // Havuz filtresi: tipe gore daraltma + bekleme sirasina gore siralama.
  const [havuzTip, setHavuzTip] = useState<AssetType | "hepsi">("hepsi");
  const [havuzSira, setHavuzSira] = useState<HavuzSira>("eski");

  const ekipSorgu = useQuery({
    queryKey: ["saha", "ekip-gorevleri"],
    queryFn: ekipGorevleri,
    refetchInterval: 20000,
  });
  const havuzSorgu = useQuery({
    queryKey: ["saha", "havuz"],
    queryFn: havuzGetir,
    refetchInterval: 20000,
  });

  const islem = useMutation({
    mutationFn: (v: Islem) =>
      v.tip === "ata" ? ekibeAta(v.asset_id, v.worker_id) : gorevGeriAl(v.asset_id),
    onSuccess: (_d, v) => {
      setDurum({
        ok: true,
        metin: v.tip === "ata" ? "Görev ilgili ekibe taşındı." : "Görev havuza alındı.",
      });
      // Ekip yukleri (harita rozetleri dahil), gorev listeleri ve havuz degisti.
      queryClient.invalidateQueries({ queryKey: ["saha"] });
    },
    onError: (e) => setDurum({ ok: false, metin: (e as Error).message }),
  });

  const ekipler = ekipSorgu.data ?? [];
  const havuz = havuzSorgu.data ?? [];
  // Once tip filtresi, sonra bekleme sirasina gore siralama uygulanir.
  const havuzFiltreli = havuz
    .filter((h) => havuzTip === "hepsi" || h.type === havuzTip)
    .slice()
    .sort((a, b) => {
      const fark =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return havuzSira === "eski" ? fark : -fark;
    });
  const havuzKayitli = havuzFiltreli.filter((h) => h.source === "kayitli");
  const havuzIhbar = havuzFiltreli.filter((h) => h.source === "ihbar");
  const islenenAsset = islem.isPending ? islem.variables?.asset_id : undefined;
  const yenile = () => {
    ekipSorgu.refetch();
    havuzSorgu.refetch();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Saha Ekipleri{" "}
            <span className="text-xs font-normal text-slate-400">({ekipler.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            Hangi ekipte hangi görevin olduğunu görün; görevleri başka ekibe taşıyın,
            havuza alın veya havuzdaki işleri elle atayın. Otomatik atama ~
            {MAKS_ATAMA_MESAFE_KM} km içindeki en yakın uygun ekibe yapılır.
          </p>
        </div>
        <button
          onClick={yenile}
          title="Yenile"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <IconRefresh className="h-4 w-4" />
        </button>
      </div>

      {durum && (
        <p
          className={`mb-3 border px-3 py-1.5 text-xs ${
            durum.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {durum.metin}
        </p>
      )}

      {ekipSorgu.isLoading ? (
        <p className="text-xs text-slate-400">Yükleniyor…</p>
      ) : ekipSorgu.isError ? (
        <p className="text-xs text-red-600">
          Ekipler yüklenemedi: {(ekipSorgu.error as Error).message}
        </p>
      ) : ekipler.length === 0 ? (
        <p className="text-xs text-slate-400">
          Henüz saha çalışanı hesabı yok. Personel yönetiminden ekleyebilirsiniz.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {ekipler.map((e) => (
            <EkipKarti
              key={e.id}
              ekip={e}
              tumEkipler={ekipler}
              onIslem={(v) => islem.mutate(v)}
              islenenAsset={islenenAsset}
            />
          ))}
        </div>
      )}

      {/* Havuz: menzilde uygun ekip bulunamadigi icin bekleyen isler. */}
      <div className="mt-4 border-t border-slate-200 pt-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <IconInbox className="h-4 w-4 text-slate-400" />
          Havuzda Bekleyen{" "}
          <span className="text-xs font-normal text-slate-400">({havuz.length})</span>
        </h3>
        <p className="mb-2 text-xs text-slate-500">
          Menzilde uygun (boş) ekip olmadığı için bekleyen işler. Bir ekip kapasite
          açınca otomatik yönlendirilir; dilerseniz aşağıdan elle atayabilirsiniz.
        </p>

        {havuz.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <button
                onClick={() => setHavuzTip("hepsi")}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  havuzTip === "hepsi"
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Tümü
              </button>
              {ASSET_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setHavuzTip(t)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    havuzTip === t
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {ASSET_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <select
              value={havuzSira}
              onChange={(e) => setHavuzSira(e.target.value as HavuzSira)}
              className="ml-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="eski">En eski önce (bekleme sırası)</option>
              <option value="yeni">En yeni önce</option>
            </select>
          </div>
        )}

        {havuzSorgu.isLoading ? (
          <p className="text-xs text-slate-400">Yükleniyor…</p>
        ) : havuz.length === 0 ? (
          <p className="text-xs text-slate-400">Havuzda bekleyen iş yok.</p>
        ) : havuzFiltreli.length === 0 ? (
          <p className="text-xs text-slate-400">
            Bu türe uygun bekleyen iş yok.
          </p>
        ) : (
          <div className="space-y-3">
            <HavuzGrup
              kaynak="kayitli"
              varliklar={havuzKayitli}
              ekipler={ekipler}
              onIslem={(v) => islem.mutate(v)}
              islenenAsset={islenenAsset}
            />
            <HavuzGrup
              kaynak="ihbar"
              varliklar={havuzIhbar}
              ekipler={ekipler}
              onIslem={(v) => islem.mutate(v)}
              islenenAsset={islenenAsset}
            />
          </div>
        )}
      </div>
    </div>
  );
}
