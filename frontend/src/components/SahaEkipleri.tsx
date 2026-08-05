import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ekibeAta, ekipGorevleri, gorevGeriAl, havuz as havuzGetir } from "../api/saha";
import {
  useDepartmanlar,
  useTurDepartmanEslemesi,
} from "../hooks/useDepartmanlar";
import type { TurDepartmanEslemesi } from "../types/departman";
import {
  ASSET_SOURCE_LABELS,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  TIP_ROZET_SINIFI,
  type AssetSource,
  type AssetType,
} from "../types/asset";
import {
  MAKS_AKTIF_GOREV,
  ATAMA_MESAFE_KADEMELERI_KM,
  MAKS_ATAMA_MESAFE_KM,
  YAKA_KISA,
  yakaEtiketi,
  type EkipGorevleri,
  type GorevOzet,
  type HavuzVarlik,
  type Yaka,
} from "../types/saha";
import { IconInbox, IconRefresh, IconUsers, IconWarning, TIP_IKONU } from "./icons";

/** Bir varlik/gorev icin uygulanabilecek islem. */
type Islem =
  | { tip: "ata"; asset_id: string; worker_id: string }
  | { tip: "havuz"; asset_id: string };

/** Havuz siralamasi: bekleme suresine gore (en eski/en yeni once). */
type HavuzSira = "eski" | "yeni";

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

/** Havuzdaki isin ne zamandir beklediğini okunur verir. `updated_at` kullanilir:
 *  `created_at` kayitli varliklarda kurulus tarihidir. */
function beklemeMetni(iso: string): string {
  const farkSn = (Date.now() - new Date(iso).getTime()) / 1000;
  if (farkSn < 60) return "az önce bakıma alındı";
  if (farkSn < 3600) return `${Math.floor(farkSn / 60)} dk önce bakıma alındı`;
  if (farkSn < 86400) return `${Math.floor(farkSn / 3600)} sa önce bakıma alındı`;
  return `${Math.floor(farkSn / 86400)} gün önce bakıma alındı`;
}

/** Satir basindaki renkli/ikonlu tur rozeti; renk ve ikon ortak paletten gelir. */
function TipRozet({ type }: { type: AssetType }) {
  const Ikon = TIP_IKONU[type];
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${TIP_ROZET_SINIFI[type]}`}
      title={ASSET_TYPE_LABELS[type]}
    >
      <Ikon className="h-4 w-4" />
    </span>
  );
}

/** Gorevin kaynagi: kayitli varlik mi yoksa vatandas talebi mi (kucuk rozet). */
function KaynakRozet({ source }: { source: AssetSource }) {
  const talep = source === "ihbar";
  return (
    <span
      className={`rounded px-1 py-px text-[10px] font-medium ${
        talep ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
      }`}
      title={talep ? "Vatandaş talebinden oluştu" : "Belediyeye kayıtlı varlık"}
    >
      {talep ? "Talep" : "Varlık"}
    </span>
  );
}

/** Yaka rozeti; otomatik atama ayni yaka icinde yapildigi icin gorunur tutulur. */
function YakaRozet({ yaka, koyu }: { yaka: string | null; koyu?: boolean }) {
  if (!yaka) return null;
  const kisa = YAKA_KISA[yaka as Yaka] ?? yaka;
  return (
    <span
      className={`rounded px-1 py-px text-[10px] font-medium ${
        koyu ? "bg-white/15 text-slate-100" : "bg-violet-100 text-violet-700"
      }`}
      title={yakaEtiketi(yaka) ?? undefined}
    >
      {kisa}
    </span>
  );
}

/** Mudurluk rozeti. Ekip kartlarinda kullanilmaz (orada bolum basligi bu isi
 *  gorur); havuz satirlarinda isin TURUNDEN turetilen hedef mudurlugu gosterir:
 *  otomatik atama departmana gore de suzuldugu icin bir isin neden havuzda
 *  bekledigi ancak bu bilgiyle okunur. */
function DepartmanRozet({
  departman,
  adlar,
  koyu,
}: {
  departman: string | null;
  adlar: Record<string, string>;
  koyu?: boolean;
}) {
  if (!departman) return null;
  const ad = adlar[departman] ?? departman;
  // Mudurluk adlari uzun ("Park ve Bahçeler Müdürlüğü"); rozette ilk kelime
  // grubu yeter, tamami title'da durur.
  const kisa = ad.replace(/\s*Müdürlüğü$/, "").replace(/\s*\(.*\)$/, "");
  return (
    <span
      className={`rounded px-1 py-px text-[10px] font-medium ${
        koyu ? "bg-white/15 text-slate-100" : "bg-slate-100 text-slate-600"
      }`}
      title={ad}
    >
      {kisa}
    </span>
  );
}

/** Ekip secim etiketi: yuk + karsi yaka + BASKA DEPARTMAN uyarisi.
 *
 *  Elle atama her iki kisittan da muaftir (yetki personeldedir), ama personel
 *  ne yaptigini gormeli: otomatik dagitimin asla yapmayacagi bir atamayi elle
 *  yaptigini bilerek yapsin. */
function ekipSecenegi(
  e: EkipGorevleri,
  hedefYaka: string | null,
  hedefDepartman: string | undefined,
  departmanAdlari: Record<string, string>
): string {
  const dolu = e.aktif_gorev >= MAKS_AKTIF_GOREV;
  const karsiYaka = Boolean(e.yaka && hedefYaka && e.yaka !== hedefYaka);
  const karsiDep = Boolean(
    e.departman && hedefDepartman && e.departman !== hedefDepartman
  );
  return (
    (e.full_name || e.email) +
    ` (${e.aktif_gorev}/${MAKS_AKTIF_GOREV}` +
    (dolu ? " · dolu)" : ")") +
    (karsiYaka ? ` · ⚠ karşı yaka (${YAKA_KISA[e.yaka as Yaka] ?? e.yaka})` : "") +
    (karsiDep
      ? ` · ⚠ başka departman (${departmanAdlari[e.departman!] ?? e.departman})`
      : "")
  );
}

/** Departman baglami: isin departmani TURUNDEN turetilir (ayri bir alan degil,
 *  iki yerde tutulan bilgi tutarsizlasirdi), ekibinki `users.departman`'dan
 *  gelir. Tek nesne olarak gecirilir - dort bilesene iki ayri prop eklemenin
 *  okunurluk faydasi yok. */
export interface DepBaglami {
  esleme: TurDepartmanEslemesi;
  adlar: Record<string, string>;
  /** Mudurluk rozet renkleri; haritadaki ekip pinleriyle AYNI renk sozlugu
   *  (`departmanlar.renk`) - panodaki bir ekibi haritada bulmak renkten
   *  gecmeli. */
  renkler: Record<string, string>;
}

/** Bir ekibin altindaki tek gorev satiri: baska ekibe tasi ya da havuza al.
 *
 *  Islem acilirI SATIR ACILINCA gorunur. Eskiden her gorevin altinda kalici
 *  bir <select> duruyordu; uc ekip x uc gorev = dokuz acilir, pano "ne var"
 *  yerine "ne yapabilirim" gibi okunuyordu. Islem nadir, okuma sik. */
function GorevSatiri({
  gorev,
  digerEkipler,
  onIslem,
  calisiyor,
  dep,
}: {
  gorev: GorevOzet;
  digerEkipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  calisiyor: boolean;
  dep: DepBaglami;
}) {
  const [acik, setAcik] = useState(false);

  return (
    <li className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <div className="flex items-start gap-2.5">
        <TipRozet type={gorev.type} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium leading-snug text-slate-800">
            {gorev.name}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-500">{ASSET_TYPE_LABELS[gorev.type]}</span>
            <KaynakRozet source={gorev.source} />
            <YakaRozet yaka={gorev.yaka} />
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
        <button
          type="button"
          onClick={() => setAcik((a) => !a)}
          aria-expanded={acik}
          title="Görevi başka ekibe taşı ya da havuza al"
          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition ${
            acik
              ? "border-slate-400 bg-slate-100 text-slate-700"
              : "border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600"
          }`}
        >
          {calisiyor ? "…" : "Taşı"}
        </button>
      </div>
      {acik && (
        <select
          value=""
          disabled={calisiyor}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setAcik(false);
            if (v === "__havuz__") onIslem({ tip: "havuz", asset_id: gorev.asset_id });
            else onIslem({ tip: "ata", asset_id: gorev.asset_id, worker_id: v });
          }}
          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
        >
          <option value="">{calisiyor ? "İşleniyor…" : "Taşı / işlem…"}</option>
          <optgroup label="Başka ekibe taşı">
            {digerEkipler.map((e) => (
              <option
                key={e.id}
                value={e.id}
                disabled={e.aktif_gorev >= MAKS_AKTIF_GOREV}
              >
                {ekipSecenegi(e, gorev.yaka, dep.esleme[gorev.type], dep.adlar)}
              </option>
            ))}
          </optgroup>
          <option value="__havuz__">↩ Havuza al (iptal)</option>
        </select>
      )}
    </li>
  );
}

/** Bir saha ekibi karti: baslik (konum/yuk) + kendine dusen gorev listesi. */
function EkipKarti({
  ekip,
  tumEkipler,
  onIslem,
  islenenAsset,
  dep,
}: {
  ekip: EkipGorevleri;
  tumEkipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  islenenAsset: string | undefined;
  dep: DepBaglami;
}) {
  const t = tazelik(ekip.last_seen_at);
  const dolu = ekip.aktif_gorev >= MAKS_AKTIF_GOREV;
  const diger = tumEkipler.filter((e) => e.id !== ekip.id);

  // Ekip pini haritada mudurlugun rengiyle cizilir; kart da ayni rengi tasir
  // ki panodaki bir ekip haritada renkten bulunabilsin.
  const renk = (ekip.departman && dep.renkler[ekip.departman]) || "#4338ca";

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Acik baslik + solda mudurluk rengi seridi: kart artik iki farkli
          zemin (koyu bant + gri liste) tasimiyor, ic ice gorunmuyor. */}
      <div
        className="flex items-center gap-2.5 border-b border-slate-200 px-3 py-2.5"
        style={{ borderLeft: `3px solid ${renk}` }}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: renk }}
          title={ekip.email}
        >
          <IconUsers className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-slate-800">
            {ekip.full_name || ekip.email}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            <span
              className="inline-block h-2 w-2 rounded-full ring-1 ring-slate-200"
              style={{ background: t.renk }}
            />
            {t.metin}
            <YakaRozet yaka={ekip.yaka} />
          </p>
        </div>
        {/* Yuk: segmentli cubuk + sayi. Cubuk "kac is daha alir"i sayidan once
            okutur; dolu ekip kirmiziya doner. */}
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="flex gap-0.5">
            {Array.from({ length: MAKS_AKTIF_GOREV }, (_, i) => (
              <span
                key={i}
                className="h-1.5 w-3 rounded-full"
                style={{
                  background:
                    i < ekip.aktif_gorev ? (dolu ? "#dc2626" : renk) : "#e2e8f0",
                }}
              />
            ))}
          </span>
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${
              dolu ? "text-red-600" : "text-slate-600"
            }`}
            title={dolu ? "Kapasitesi dolu - otomatik iş atanmaz" : "Yeni iş alabilir"}
          >
            {dolu && <IconWarning className="h-3 w-3" />}
            {ekip.aktif_gorev}/{MAKS_AKTIF_GOREV}
          </span>
        </span>
      </div>

      {ekip.gorevler.length === 0 ? (
        <p className="px-3 py-3 text-center text-xs text-slate-400">
          Aktif görev yok.
        </p>
      ) : (
        <ul className="space-y-1.5 p-2">
          {ekip.gorevler.map((g) => (
            <GorevSatiri
              key={g.assignment_id}
              gorev={g}
              digerEkipler={diger}
              onIslem={onIslem}
              calisiyor={islenenAsset === g.asset_id}
              dep={dep}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ekipler mudurluk mudurluk gruplanir: pano "kim var" sorusuna once
 *  ORGUTLENMEYLE cevap verir, cunku otomatik atama da departman kisitiyla
 *  calisir - bir mudurlugun tek ekibi doluysa isin neden havuzda beklediği
 *  ancak boyle gorunur. Baslik dili BolgePaneli'ndeki bolum baslıklarıyla
 *  ayni: renkli seritli ad + sayac hapi. */
function DepartmanBolumu({
  ad,
  renk,
  ekipler,
  tumEkipler,
  onIslem,
  islenenAsset,
  dep,
}: {
  ad: string;
  renk: string;
  ekipler: EkipGorevleri[];
  tumEkipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  islenenAsset: string | undefined;
  dep: DepBaglami;
}) {
  const aktif = ekipler.reduce((t, e) => t + e.aktif_gorev, 0);
  const kapasite = ekipler.length * MAKS_AKTIF_GOREV;

  return (
    <section>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="h-4 w-1 rounded-full" style={{ background: renk }} />
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {ad}
        </p>
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: `${renk}1a`, color: renk }}
          title={`${ekipler.length} ekip · ${aktif}/${kapasite} görev dolu`}
        >
          {ekipler.length} ekip · {aktif}/{kapasite}
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {ekipler.map((e) => (
          <EkipKarti
            key={e.id}
            ekip={e}
            tumEkipler={tumEkipler}
            onIslem={onIslem}
            islenenAsset={islenenAsset}
            dep={dep}
          />
        ))}
      </div>
    </section>
  );
}

/** Havuzda bekleyen tek varlik satiri: bir ekibe elle atama. */
function HavuzSatiri({
  varlik,
  ekipler,
  onIslem,
  calisiyor,
  dep,
}: {
  varlik: HavuzVarlik;
  ekipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  calisiyor: boolean;
  dep: DepBaglami;
}) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
      <div className="flex items-start gap-2.5">
        <TipRozet type={varlik.type} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium leading-snug text-slate-800">
            {varlik.name}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-500">{ASSET_TYPE_LABELS[varlik.type]}</span>
            <KaynakRozet source={varlik.source} />
            <YakaRozet yaka={varlik.yaka} />
            {/* Isin hangi mudurlugu bekledigi: otomatik atama yalnizca o
                mudurlugun ekiplerine bakar. */}
            <DepartmanRozet
              departman={dep.esleme[varlik.type] ?? null}
              adlar={dep.adlar}
            />
            <span className="rounded-full bg-amber-100 px-1.5 py-px font-medium text-amber-700">
              {beklemeMetni(varlik.updated_at)}
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
        {ekipler.map((e) => (
          <option key={e.id} value={e.id} disabled={e.aktif_gorev >= MAKS_AKTIF_GOREV}>
            {ekipSecenegi(e, varlik.yaka, dep.esleme[varlik.type], dep.adlar)}
          </option>
        ))}
      </select>
    </li>
  );
}

/** Havuzun tek bir kaynak grubu (Kayitli / Talep) - baslik + varlik listesi.
 *  Grup bossa hic render edilmez. */
function HavuzGrup({
  kaynak,
  varliklar,
  ekipler,
  onIslem,
  islenenAsset,
  dep,
}: {
  kaynak: AssetSource;
  varliklar: HavuzVarlik[];
  ekipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  islenenAsset: string | undefined;
  dep: DepBaglami;
}) {
  if (varliklar.length === 0) return null;
  // Kaynaga gore ayirt edici vurgu: kayitli=slate, talep=amber.
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
      <ul className="space-y-1.5">
        {varliklar.map((h) => (
          <HavuzSatiri
            key={h.asset_id}
            varlik={h}
            ekipler={ekipler}
            onIslem={onIslem}
            calisiyor={islenenAsset === h.asset_id}
            dep={dep}
          />
        ))}
      </ul>
    </div>
  );
}

/** Saha ekibi yonetim panosu: hangi ekipte hangi gorevler var, gorevi baska
 *  ekibe tasi / havuza al, havuzdaki isleri elle ata. 20 sn'de bir tazelenir. */
export default function SahaEkipleri() {
  const queryClient = useQueryClient();
  const [durum, setDurum] = useState<{ ok: boolean; metin: string } | null>(null);
  // Havuz filtresi: tipe gore daraltma + bekleme sirasina gore siralama.
  const [havuzTip, setHavuzTip] = useState<AssetType | "hepsi">("hepsi");
  const [havuzSira, setHavuzSira] = useState<HavuzSira>("eski");
  // Otomatik atama kurallarinin uzun aciklamasi katlanmis baslar.
  const [kuralAcik, setKuralAcik] = useState(false);

  const { data: departmanlar } = useDepartmanlar();
  const { data: esleme } = useTurDepartmanEslemesi();
  const dep = useMemo<DepBaglami>(
    () => ({
      esleme: esleme ?? {},
      adlar: Object.fromEntries((departmanlar ?? []).map((d) => [d.kod, d.ad])),
      renkler: Object.fromEntries((departmanlar ?? []).map((d) => [d.kod, d.renk])),
    }),
    [esleme, departmanlar]
  );

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
      // Ekip yukleri, gorev listeleri ve havuz birlikte degisir.
      queryClient.invalidateQueries({ queryKey: ["saha"] });
    },
    onError: (e) => setDurum({ ok: false, metin: (e as Error).message }),
  });

  const ekipler = ekipSorgu.data ?? [];
  const havuz = havuzSorgu.data ?? [];
  /** Ekipler mudurluge gore gruplanir; sozluk sirasi korunur, departmani
   *  olmayanlar en sona ayri bir bolume duser (atama kisiti onlara isi
   *  otomatik goturmez, gorunur olmalilar). */
  const bolumler = useMemo(() => {
    const gruplar = new Map<string, EkipGorevleri[]>();
    for (const e of ekipSorgu.data ?? []) {
      const anahtar = e.departman ?? "";
      const liste = gruplar.get(anahtar);
      if (liste) liste.push(e);
      else gruplar.set(anahtar, [e]);
    }
    const sirali = (departmanlar ?? [])
      .filter((d) => gruplar.has(d.kod))
      .map((d) => ({
        anahtar: d.kod,
        ad: d.ad,
        renk: d.renk,
        ekipler: gruplar.get(d.kod)!,
      }));
    // Sozlukte olmayan kodlar (silinmis/bilinmeyen departman) da kaybolmasin.
    for (const [kod, liste] of gruplar) {
      if (kod && !sirali.some((s) => s.anahtar === kod)) {
        sirali.push({ anahtar: kod, ad: kod, renk: "#64748b", ekipler: liste });
      }
    }
    if (gruplar.has("")) {
      sirali.push({
        anahtar: "",
        ad: "Departmanı atanmamış",
        renk: "#94a3b8",
        ekipler: gruplar.get("")!,
      });
    }
    return sirali;
  }, [ekipSorgu.data, departmanlar]);
  // Once tip filtresi, sonra bekleme sirasina gore siralama uygulanir.
  const havuzFiltreli = havuz
    .filter((h) => havuzTip === "hepsi" || h.type === havuzTip)
    .slice()
    .sort((a, b) => {
      const fark =
        new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      return havuzSira === "eski" ? fark : -fark;
    });
  const havuzKayitli = havuzFiltreli.filter((h) => h.source === "kayitli");
  const havuzTalep = havuzFiltreli.filter((h) => h.source === "ihbar");
  const islenenAsset = islem.isPending ? islem.variables?.asset_id : undefined;
  const yenile = () => {
    ekipSorgu.refetch();
    havuzSorgu.refetch();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">
            Saha Ekipleri{" "}
            <span className="text-xs font-normal text-slate-400">({ekipler.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            Hangi ekipte hangi görevin olduğunu görün; görevleri başka ekibe
            taşıyın, havuza alın veya havuzdaki işleri elle atayın.
          </p>
          {/* Otomatik atamanin kurallari uzun ve HER ACILISTA okunmasi gerekmiyor:
              katlanmis durur, panonun asil isi olan listeyi asagi itmez. */}
          <button
            type="button"
            onClick={() => setKuralAcik((a) => !a)}
            aria-expanded={kuralAcik}
            className="mt-0.5 text-[11px] font-medium text-slate-400 underline-offset-2 transition hover:text-slate-600 hover:underline"
          >
            {kuralAcik ? "Otomatik atama nasıl çalışır? ▴" : "Otomatik atama nasıl çalışır? ▾"}
          </button>
          {kuralAcik && (
            <p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-500">
              Otomatik atama <strong>aynı yakadaki</strong>, <strong>aynı
              müdürlüğe bağlı</strong> en yakın uygun ekibe yapılır: önce ~
              {ATAMA_MESAFE_KADEMELERI_KM[0]} km içine bakılır, o mesafede boş
              ekip yoksa ~{MAKS_ATAMA_MESAFE_KM} km'ye genişletilir. Bir ekip
              Boğaz'ın karşısına otomatik gönderilmez ve konumu bilinmeyen ekibe
              otomatik iş düşmez. Elle atama bu kısıtlardan muaftır; karşı
              yakadaki ve başka müdürlükteki ekipler açılırda ⚠ ile işaretlenir.
            </p>
          )}
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
        <div className="space-y-4">
          {bolumler.map((b) => (
            <DepartmanBolumu
              key={b.anahtar || "__yok__"}
              ad={b.ad}
              renk={b.renk}
              ekipler={b.ekipler}
              tumEkipler={ekipler}
              onIslem={(v) => islem.mutate(v)}
              islenenAsset={islenenAsset}
              dep={dep}
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
          Kendi yakasında ~{MAKS_ATAMA_MESAFE_KM} km içinde uygun (boş, konumu
          bilinen) ekip olmadığı için bekleyen işler. Aynı yakadaki bir ekip
          kapasite açınca ya da menzile girecek şekilde yer değiştirince otomatik
          yönlendirilir; dilerseniz aşağıdan elle atayabilirsiniz.
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
              dep={dep}
            />
            <HavuzGrup
              kaynak="ihbar"
              varliklar={havuzTalep}
              ekipler={ekipler}
              onIslem={(v) => islem.mutate(v)}
              islenenAsset={islenenAsset}
              dep={dep}
            />
          </div>
        )}
      </div>
    </div>
  );
}
