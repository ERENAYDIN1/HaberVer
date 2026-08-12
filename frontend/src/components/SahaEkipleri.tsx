import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { bolgeAta } from "../api/bolgeler";
import {
  ekibeAta,
  ekipGorevleri,
  gorevGeriAl,
  havuz as havuzGetir,
  havuzDagit,
} from "../api/saha";
import { YEDEK_YOKLAMA_MS } from "../hooks/useCanliGuncelleme";
import {
  useDepartmanlar,
  useTurDepartmanEslemesi,
} from "../hooks/useDepartmanlar";
import type { TurDepartmanEslemesi } from "../types/departman";
import { turAdi, turKodlari, turRozetSinifi } from "../data/turSozlugu";
import {
  ASSET_SOURCE_LABELS,
  type AssetSource,
  type AssetType,
} from "../types/asset";
import {
  MAKS_AKTIF_GOREV,
  ATAMA_MESAFE_KADEMELERI_KM,
  MAKS_ATAMA_MESAFE_KM,
  YAKA_KISA,
  yakaEtiketi,
  type BolgeGorevOzet,
  type EkipGorevleri,
  type GorevOzet,
  type HavuzVarlik,
  type Yaka,
} from "../types/saha";
import {
  IconInbox,
  IconLasso,
  IconRefresh,
  IconRoute,
  IconUsers,
  IconWarning,
  tipIkonu,
} from "./icons";

/** Bir varlik/gorev icin uygulanabilecek islem. */
type Islem =
  | { tip: "ata"; asset_id: string; worker_id: string }
  | { tip: "havuz"; asset_id: string }
  | { tip: "bolge-ata"; bolge_id: string; worker_id: string | null };

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
  const Ikon = tipIkonu(type);
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${turRozetSinifi(type)}`}
      title={turAdi(type)}
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

/** Ekip secim etiketi: dolu kuyruk + karsi yaka + baska departman uyarisi.
 *  Elle atama uc kisittan da muaftir; dolu ekip bu yuzden `disabled` degildir,
 *  yalnizca uyarilir (bkz. EkipSecici, ayni karar). */
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

/** Departman baglami: isin departmani turunden turetilir, ekibinki
 *  `users.departman`'dan gelir. Tek nesne olarak gecirilir. */
export interface DepBaglami {
  esleme: TurDepartmanEslemesi;
  adlar: Record<string, string>;
  /** Mudurluk rozet renkleri; haritadaki ekip pinleriyle ayni renk sozlugu. */
  renkler: Record<string, string>;
}

/** Bir ekibin uzerindeki gorev bolgesi / guzergah satiri: tekil bakim isiyle
 *  ayni listede durur (ayni kota) ve ayni tasi/havuza-al islemini paylasir
 *  (`POST /bolgeler/{id}/ata`). Govdeye tiklamak detay acar, sag ustteki
 *  "Tasi" ayri bir hedeftir. Departman bilgisi `BolgeGorevOzet`'te yok, bu
 *  yuzden `ekipSecenegi` burada yalniz karsi-yaka uyarisi verir. */
function BolgeGorevSatiri({
  gorev,
  digerEkipler,
  onIslem,
  calisiyor,
  dep,
  onBolgeDetay,
}: {
  gorev: BolgeGorevOzet;
  digerEkipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  calisiyor: boolean;
  dep: DepBaglami;
  onBolgeDetay?: (bolgeId: string) => void;
}) {
  const [acik, setAcik] = useState(false);
  const alan = gorev.tip === "alan";

  return (
    <li className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <div
        className="flex items-start gap-2 rounded-md transition hover:bg-slate-50"
        role={onBolgeDetay ? "button" : undefined}
        tabIndex={onBolgeDetay ? 0 : undefined}
        onClick={() => onBolgeDetay?.(gorev.bolge_id)}
        onKeyDown={(e) => {
          if (onBolgeDetay && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onBolgeDetay(gorev.bolge_id);
          }
        }}
      >
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white"
          style={{ background: gorev.renk }}
          title={alan ? "Görev bölgesi" : "Güzergâh"}
        >
          {alan ? (
            <IconLasso className="h-3.5 w-3.5" />
          ) : (
            <IconRoute className="h-3.5 w-3.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-[13px] font-medium leading-snug text-slate-800">
            {gorev.ad}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="text-slate-500">
              {alan ? "Görev bölgesi" : "Güzergâh"}
            </span>
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
          onClick={(e) => {
            e.stopPropagation();
            setAcik((a) => !a);
          }}
          aria-expanded={acik}
          title="Başka ekibe taşı ya da havuza al"
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
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setAcik(false);
            onIslem({
              tip: "bolge-ata",
              bolge_id: gorev.bolge_id,
              worker_id: v === "__havuz__" ? null : v,
            });
          }}
          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
        >
          <option value="">{calisiyor ? "İşleniyor…" : "Taşı / işlem…"}</option>
          <optgroup label="Başka ekibe taşı">
            {digerEkipler.map((e) => (
              <option key={e.id} value={e.id}>
                {ekipSecenegi(e, gorev.yaka, undefined, dep.adlar)}
              </option>
            ))}
          </optgroup>
          <option value="__havuz__">↩ Havuza al (atamayı kaldır)</option>
        </select>
      )}
    </li>
  );
}

function GorevSatiri({
  gorev,
  digerEkipler,
  onIslem,
  calisiyor,
  dep,
  onVarlikDetay,
}: {
  gorev: GorevOzet;
  digerEkipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  calisiyor: boolean;
  dep: DepBaglami;
  onVarlikDetay?: (assetId: string) => void;
}) {
  const [acik, setAcik] = useState(false);

  return (
    <li className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <div
        className="flex items-start gap-2 rounded-md transition hover:bg-slate-50"
        role={onVarlikDetay ? "button" : undefined}
        tabIndex={onVarlikDetay ? 0 : undefined}
        onClick={() => onVarlikDetay?.(gorev.asset_id)}
        onKeyDown={(e) => {
          if (onVarlikDetay && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onVarlikDetay(gorev.asset_id);
          }
        }}
      >
        <TipRozet type={gorev.type} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-[13px] font-medium leading-snug text-slate-800">
            {gorev.name}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="text-slate-500">{turAdi(gorev.type)}</span>
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
          onClick={(e) => {
            e.stopPropagation();
            setAcik((a) => !a);
          }}
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
          onClick={(e) => e.stopPropagation()}
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
              <option key={e.id} value={e.id}>
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
  islenenBolge,
  dep,
  onVarlikDetay,
  onBolgeDetay,
}: {
  ekip: EkipGorevleri;
  tumEkipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  islenenAsset: string | undefined;
  islenenBolge: string | undefined;
  dep: DepBaglami;
  onVarlikDetay?: (assetId: string) => void;
  onBolgeDetay?: (bolgeId: string) => void;
}) {
  const t = tazelik(ekip.last_seen_at);
  const dolu = ekip.aktif_gorev >= MAKS_AKTIF_GOREV;
  const diger = tumEkipler.filter((e) => e.id !== ekip.id);

  // Ekip pini haritada mudurlugun rengiyle cizilir; kart da ayni rengi tasir.
  const renk = (ekip.departman && dep.renkler[ekip.departman]) || "#4338ca";

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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

      {/* Tekil bakim isleri ve bolge/guzergahlar ayni listede: ucu de ayni
          kotayi paylasan gorevlerdir. */}
      {ekip.gorevler.length === 0 && (ekip.bolge_gorevleri?.length ?? 0) === 0 ? (
        <p className="px-3 py-3 text-center text-xs text-slate-400">
          Aktif görev yok.
        </p>
      ) : (
        <ul className="space-y-1 p-1.5">
          {ekip.gorevler.map((g) => (
            <GorevSatiri
              key={g.assignment_id}
              gorev={g}
              digerEkipler={diger}
              onIslem={onIslem}
              calisiyor={islenenAsset === g.asset_id}
              dep={dep}
              onVarlikDetay={onVarlikDetay}
            />
          ))}
          {(ekip.bolge_gorevleri ?? []).map((b) => (
            <BolgeGorevSatiri
              key={b.bolge_id}
              gorev={b}
              digerEkipler={diger}
              onIslem={onIslem}
              calisiyor={islenenBolge === b.bolge_id}
              dep={dep}
              onBolgeDetay={onBolgeDetay}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ekipler mudurluk mudurluk gruplanir: otomatik atama da departman kisitiyla
 *  calistigindan bir mudurlugun tek ekibi doluysa isin neden havuzda beklediği
 *  ancak boyle gorunur. */
function DepartmanBolumu({
  ad,
  renk,
  ekipler,
  tumEkipler,
  onIslem,
  islenenAsset,
  islenenBolge,
  dep,
  onVarlikDetay,
  onBolgeDetay,
}: {
  ad: string;
  renk: string;
  ekipler: EkipGorevleri[];
  tumEkipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  islenenAsset: string | undefined;
  islenenBolge: string | undefined;
  dep: DepBaglami;
  onVarlikDetay?: (assetId: string) => void;
  onBolgeDetay?: (bolgeId: string) => void;
}) {
  const aktif = ekipler.reduce((t, e) => t + e.aktif_gorev, 0);
  const kapasite = ekipler.length * MAKS_AKTIF_GOREV;

  return (
    <section>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="h-4 w-1 rounded-full" style={{ background: renk }} />
        <p className="min-w-0 truncate text-[13px] font-bold" style={{ color: renk }}>
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
            islenenBolge={islenenBolge}
            dep={dep}
            onVarlikDetay={onVarlikDetay}
            onBolgeDetay={onBolgeDetay}
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
  onVarlikDetay,
}: {
  varlik: HavuzVarlik;
  ekipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  calisiyor: boolean;
  dep: DepBaglami;
  onVarlikDetay?: (assetId: string) => void;
}) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
      <div
        className="flex items-start gap-2.5 rounded-md transition hover:bg-slate-50"
        role={onVarlikDetay ? "button" : undefined}
        tabIndex={onVarlikDetay ? 0 : undefined}
        onClick={() => onVarlikDetay?.(varlik.asset_id)}
        onKeyDown={(e) => {
          if (onVarlikDetay && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onVarlikDetay(varlik.asset_id);
          }
        }}
      >
        <TipRozet type={varlik.type} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium leading-snug text-slate-800">
            {varlik.name}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-500">{turAdi(varlik.type)}</span>
            <KaynakRozet source={varlik.source} />
            <YakaRozet yaka={varlik.yaka} />
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
          <option key={e.id} value={e.id}>
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
  onVarlikDetay,
}: {
  kaynak: AssetSource;
  varliklar: HavuzVarlik[];
  ekipler: EkipGorevleri[];
  onIslem: (v: Islem) => void;
  islenenAsset: string | undefined;
  dep: DepBaglami;
  onVarlikDetay?: (assetId: string) => void;
}) {
  if (varliklar.length === 0) return null;
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
            onVarlikDetay={onVarlikDetay}
          />
        ))}
      </ul>
    </div>
  );
}

/** Saha ekibi yonetim panosunun disa acik proplari. Ikisi de opsiyoneldir. */
export interface SahaEkipleriProps {
  /** Bir gorev/havuz satirinin govdesine tiklaninca varligin detayini acar. */
  onVarlikDetay?: (assetId: string) => void;
  /** Bir bolge/guzergah satirinin govdesine tiklaninca kaydin detayini acar. */
  onBolgeDetay?: (bolgeId: string) => void;
}

/** Saha ekibi yonetim panosu: hangi ekipte hangi gorevler var, gorevi baska
 *  ekibe tasi / havuza al, havuzdaki isleri elle ata. 20 sn'de bir tazelenir. */
export default function SahaEkipleri({
  onVarlikDetay,
  onBolgeDetay,
}: SahaEkipleriProps = {}) {
  const queryClient = useQueryClient();
  const [durum, setDurum] = useState<{ ok: boolean; metin: string } | null>(null);
  const [havuzTip, setHavuzTip] = useState<AssetType | "hepsi">("hepsi");
  const [havuzSira, setHavuzSira] = useState<HavuzSira>("eski");
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

  // Tazeleme ana yolu canli kanal (SSE); asagidaki periyot yalnizca kanal
  // olursa devreye giren yedektir.
  const ekipSorgu = useQuery({
    queryKey: ["saha", "ekip-gorevleri"],
    queryFn: ekipGorevleri,
    refetchInterval: YEDEK_YOKLAMA_MS,
  });
  const havuzSorgu = useQuery({
    queryKey: ["saha", "havuz"],
    queryFn: havuzGetir,
    refetchInterval: YEDEK_YOKLAMA_MS,
  });

  const islem = useMutation({
    mutationFn: (v: Islem): Promise<unknown> => {
      if (v.tip === "ata") return ekibeAta(v.asset_id, v.worker_id);
      if (v.tip === "havuz") return gorevGeriAl(v.asset_id);
      return bolgeAta(v.bolge_id, v.worker_id);
    },
    onSuccess: (_d, v) => {
      const metin =
        v.tip === "ata"
          ? "Görev ilgili ekibe taşındı."
          : v.tip === "havuz"
            ? "Görev havuza alındı."
            : v.worker_id
              ? "Görev bölgesi/güzergâh ilgili ekibe taşındı."
              : "Görev bölgesi/güzergâhın ataması kaldırıldı.";
      setDurum({ ok: true, metin });
      queryClient.invalidateQueries({ queryKey: ["saha"] });
      if (v.tip === "bolge-ata") {
        queryClient.invalidateQueries({ queryKey: ["bolgeler"] });
      }
    },
    onError: (e) => setDurum({ ok: false, metin: (e as Error).message }),
  });

  const dagitKontrol = useMutation({
    mutationFn: havuzDagit,
    onSuccess: ({ dagitilan }) => {
      setDurum(
        dagitilan > 0
          ? { ok: true, metin: `${dagitilan} görev ekiplere atandı.` }
          : { ok: true, metin: "Havuzda uygun ekibi bulunan iş yok." }
      );
      queryClient.invalidateQueries({ queryKey: ["saha"] });
      queryClient.invalidateQueries({ queryKey: ["bolgeler"] });
    },
    onError: (e) => setDurum({ ok: false, metin: (e as Error).message }),
  });

  const ekipler = ekipSorgu.data ?? [];
  const havuz = havuzSorgu.data ?? [];
  /** Ekipler mudurluge gore gruplanir; departmani olmayanlar en sona ayri bir
   *  bolume duser. */
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
    // Sozlukte olmayan kodlar da kaybolmasin.
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
  const islenenVar = islem.isPending ? islem.variables : undefined;
  const islenenAsset =
    islenenVar?.tip === "ata" || islenenVar?.tip === "havuz"
      ? islenenVar.asset_id
      : undefined;
  const islenenBolge =
    islenenVar?.tip === "bolge-ata" ? islenenVar.bolge_id : undefined;
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
              islenenBolge={islenenBolge}
              dep={dep}
              onVarlikDetay={onVarlikDetay}
              onBolgeDetay={onBolgeDetay}
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
        <p className="mt-0.5 text-xs text-slate-500">
          Kendi yakasında ~{MAKS_ATAMA_MESAFE_KM} km içinde uygun (boş, konumu
          bilinen) ekip olmadığı için bekleyen işler. Aynı yakadaki bir ekip
          kapasite açınca ya da menzile girecek şekilde yer değiştirince otomatik
          yönlendirilir; dilerseniz aşağıdan elle atayabilirsiniz.
        </p>

        <button
          type="button"
          onClick={() => dagitKontrol.mutate()}
          disabled={dagitKontrol.isPending}
          title="Havuzu ve bekleyen bölge/güzergâhları şimdi yeniden dağıtmayı dener"
          className="my-3 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <IconRefresh className={`h-3.5 w-3.5 ${dagitKontrol.isPending ? "animate-spin" : ""}`} />
          {dagitKontrol.isPending ? "Kontrol ediliyor…" : "Atamayı Kontrol Et"}
        </button>

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
              {turKodlari().map((t) => (
                <button
                  key={t}
                  onClick={() => setHavuzTip(t)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    havuzTip === t
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {turAdi(t)}
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
              onVarlikDetay={onVarlikDetay}
            />
            <HavuzGrup
              kaynak="ihbar"
              varliklar={havuzTalep}
              ekipler={ekipler}
              onIslem={(v) => islem.mutate(v)}
              islenenAsset={islenenAsset}
              dep={dep}
              onVarlikDetay={onVarlikDetay}
            />
          </div>
        )}
      </div>
    </div>
  );
}
