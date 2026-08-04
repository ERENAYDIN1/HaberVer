import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forwardRef, useEffect, useRef, useState } from "react";

import { bolgeAta, bolgeGuncelle, bolgeSil, bolgeler as bolgeleriGetir } from "../api/bolgeler";
import type { Bolge } from "../types/bolge";
import type { EkipOzet } from "../types/saha";
import { YAKA_KISA, type Yaka } from "../types/saha";
import { alanEtiketi, mesafeEtiketi } from "../utils/geo";
import { RENK_PALETI } from "./CizimPaneli";
import { IconCheck, IconLasso, IconRoute, IconUsers, IconX } from "./icons";

/** Panelin listeledigi kayit turu: gorev bolgesi (alan) ya da guzergah
 *  (cizgi). Ikisi ayri sekme ve ayri harita katmanidir. */
export type BolgePanelTipi = "alan" | "cizgi";

/** Tipe bagli tum metin/gorunum farklari tek yerde. */
const TIP_GORUNUMU: Record<
  BolgePanelTipi,
  {
    baslik: string;
    altBaslik: string;
    aciklama: string;
    bos: string;
    bosIpucu: string;
    katmanAdi: string;
    renk: keyof typeof BOLUM_RENKLERI;
    ikon: (p: { className?: string }) => React.ReactElement;
  }
> = {
  alan: {
    baslik: "Görev Bölgeleri",
    altBaslik: "Ekibin çalışacağı alan",
    aciklama:
      "Haritada çizdiğin alanları buraya kaydet; bir saha ekibine görev bölgesi olarak atayabilirsin.",
    bos: "Kayıtlı alan yok.",
    bosIpucu:
      'Üst bardaki "Alan seç" ile bir alan çiz, tamamladıktan sonra alt paneldeki "Kaydet" ile buraya ekle.',
    katmanAdi: "Bölgeler",
    renk: "violet",
    ikon: IconLasso,
  },
  cizgi: {
    baslik: "Güzergâhlar",
    altBaslik: "Ekibin izleyeceği hat",
    aciklama:
      "Haritada ölçtüğün çizgileri buraya kaydet; bir saha ekibine güzergâh olarak atayabilirsin.",
    bos: "Kayıtlı güzergâh yok.",
    bosIpucu:
      'Üst bardaki "Ölç" ile bir hat çiz, bitirdikten sonra alt paneldeki "Kaydet" ile buraya ekle.',
    katmanAdi: "Güzergâhlar",
    renk: "blue",
    ikon: IconRoute,
  },
};

interface BolgePaneliProps {
  tip: BolgePanelTipi;
  /** Atama listesini besleyen saha ekipleri. */
  ekipler?: EkipOzet[];
  /** Haritada gizlenmis bolgelerin id'leri (varsayilan: hepsi gorunur). */
  gizliler: Set<string>;
  onGorunurlukDegis: (id: string) => void;
  /** Id'ler panelin kendi (tipe suzulmus) listesinden gecirilir; App'te ayri
   *  bir kopya bayatlamasin ve diger turun gorunurlugu bozulmasin. */
  onTumunuGoster: (idler: string[]) => void;
  onTumunuGizle: (idler: string[]) => void;
  /** Bu turun harita katmani acik mi; kapaliyken panel uyari gosterir. */
  katmanAcik?: boolean;
  onKatmaniAc?: () => void;
  onBolgeyeGit: (bolge: Bolge) => void;
  /** Sekil duzenleme harita uzerinde yapildigi icin App'e devredilir. */
  onSekilDuzenle?: (bolge: Bolge) => void;
  sekilDuzenlenenId?: string | null;
  /** Haritada secili kayit: karti vurgular ve gorunur alana kaydirir. */
  seciliId?: string | null;
  onDetay?: (bolge: Bolge) => void;
  /** Haritada bir alan (ilce/mahalle ya da cizilen poligon) seciliyse liste de
   *  o sinirla daralir: kaydin koselerinden biri alanin icindeyse gorunur. */
  alanda?: ((bolge: Bolge) => boolean) | null;
}

/** Kaydedilmis bolgeler/guzergahlar paneli: listeler, ad/renk/aciklama
 *  duzenler, siler ve bir saha ekibine atar. Atanan kayit ekibin kendi
 *  ekraninda gorunur, bitirince burada "Tamamlandı" rozeti alir. */
export default function BolgePaneli({
  tip,
  ekipler,
  gizliler,
  onGorunurlukDegis,
  onTumunuGoster,
  onTumunuGizle,
  katmanAcik = true,
  onKatmaniAc,
  onBolgeyeGit,
  onSekilDuzenle,
  sekilDuzenlenenId,
  seciliId,
  onDetay,
  alanda,
}: BolgePaneliProps) {
  const queryClient = useQueryClient();
  const sorgu = useQuery({ queryKey: ["bolgeler"], queryFn: bolgeleriGetir });
  const [duzenlenen, setDuzenlenen] = useState<string | null>(null);
  const [silinecek, setSilinecek] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const seciliRef = useRef<HTMLLIElement>(null);

  // Haritadan secim yapilinca ilgili karti gorunur alana kaydir.
  useEffect(() => {
    seciliRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [seciliId]);

  const tazele = () => queryClient.invalidateQueries({ queryKey: ["bolgeler"] });

  const atamaMutasyonu = useMutation({
    mutationFn: ({ id, workerId }: { id: string; workerId: string | null }) =>
      bolgeAta(id, workerId),
    onSuccess: () => {
      setHata(null);
      tazele();
    },
    onError: (e: Error) => setHata(e.message),
  });

  const silMutasyonu = useMutation({
    mutationFn: (id: string) => bolgeSil(id),
    onSuccess: () => {
      setSilinecek(null);
      setHata(null);
      tazele();
    },
    onError: (e: Error) => setHata(e.message),
  });

  // Panel yalnizca kendi turunu listeler.
  const gorunum = TIP_GORUNUMU[tip];
  const bolgeler = (sorgu.data ?? []).filter(
    (b) => b.tip === tip && (!alanda || alanda(b))
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-slate-200 px-3.5 py-2.5">
        <p className="text-xs text-slate-500">{gorunum.aciklama}</p>
        {bolgeler.length > 0 && (
          <div className="mt-2 flex items-center gap-3 text-xs">
            <button
              onClick={() => onTumunuGoster(bolgeler.map((b) => b.id))}
              className="font-medium text-emerald-700 hover:underline"
            >
              Tümünü göster
            </button>
            <button
              onClick={() => onTumunuGizle(bolgeler.map((b) => b.id))}
              className="font-medium text-slate-500 hover:underline"
            >
              Tümünü gizle
            </button>
          </div>
        )}
        {!katmanAcik && bolgeler.length > 0 && (
          <p className="mt-2 flex items-center justify-between gap-2 border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
            <span>"{gorunum.katmanAdi}" katmanı haritada kapalı.</span>
            {onKatmaniAc && (
              <button
                onClick={onKatmaniAc}
                className="shrink-0 font-semibold underline"
              >
                Aç
              </button>
            )}
          </p>
        )}
        {hata && (
          <p className="mt-2 border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
            {hata}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {sorgu.isLoading ? (
          <p className="text-xs text-slate-400">Yükleniyor…</p>
        ) : sorgu.isError ? (
          <p className="text-xs text-red-600">
            Bölgeler yüklenemedi: {(sorgu.error as Error).message}
          </p>
        ) : bolgeler.length === 0 ? (
          <p className="text-xs text-slate-400">
            {gorunum.bos} {gorunum.bosIpucu}
          </p>
        ) : (
          <Bolum
            baslik={gorunum.baslik}
            altBaslik={gorunum.altBaslik}
            ikon={gorunum.ikon}
            renk={gorunum.renk}
            bolgeler={bolgeler}
            bos={gorunum.bos}
            render={(b) => (
              <BolgeKarti
                key={b.id}
                ref={seciliId === b.id ? seciliRef : undefined}
                bolge={b}
                ekipler={ekipler}
                secili={seciliId === b.id}
                onDetay={onDetay && (() => onDetay(b))}
                gizli={gizliler.has(b.id)}
                duzenleniyor={duzenlenen === b.id}
                silinecek={silinecek === b.id}
                atamaBekliyor={
                  atamaMutasyonu.isPending && atamaMutasyonu.variables?.id === b.id
                }
                siliniyor={silMutasyonu.isPending && silMutasyonu.variables === b.id}
                onGorunurlukDegis={() => onGorunurlukDegis(b.id)}
                onGit={() => onBolgeyeGit(b)}
                onDuzenle={() => setDuzenlenen(duzenlenen === b.id ? null : b.id)}
                onKaydedildi={() => {
                  setDuzenlenen(null);
                  tazele();
                }}
                onSilIste={() => setSilinecek(silinecek === b.id ? null : b.id)}
                onSilOnayla={() => silMutasyonu.mutate(b.id)}
                onAta={(workerId) => atamaMutasyonu.mutate({ id: b.id, workerId })}
                onSekilDuzenle={onSekilDuzenle && (() => onSekilDuzenle(b))}
                sekilDuzenleniyor={sekilDuzenlenenId === b.id}
              />
            )}
          />
        )}
      </div>
    </div>
  );
}

/** Bolum renkleri; Tailwind JIT sablon dizgilerini taramadigi icin aciktir. */
const BOLUM_RENKLERI = {
  violet: {
    rozet: "bg-violet-600 text-white shadow-violet-600/30",
    cizgi: "border-violet-200",
    sayac: "bg-violet-100 text-violet-700",
  },
  blue: {
    rozet: "bg-blue-600 text-white shadow-blue-600/30",
    cizgi: "border-blue-200",
    sayac: "bg-blue-100 text-blue-700",
  },
};

/** Bolum kabugu: renkli ikon rozeti + baslik + sayac + ayirici cizgi. */
function Bolum({
  baslik,
  altBaslik,
  ikon: Ikon,
  renk,
  bolgeler,
  bos,
  render,
}: {
  baslik: string;
  altBaslik: string;
  ikon: (p: { className?: string }) => React.ReactElement;
  renk: keyof typeof BOLUM_RENKLERI;
  bolgeler: Bolge[];
  bos: string;
  render: (b: Bolge) => React.ReactNode;
}) {
  const r = BOLUM_RENKLERI[renk];
  return (
    <section>
      <div className={`mb-2 flex items-center gap-2 border-b-2 pb-1.5 ${r.cizgi}`}>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg shadow-sm ${r.rozet}`}
        >
          <Ikon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-sm font-bold tracking-tight text-slate-900">
            {baslik}
          </span>
          <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {altBaslik}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${r.sayac}`}
        >
          {bolgeler.length}
        </span>
      </div>
      {bolgeler.length === 0 ? (
        <p className="text-xs text-slate-400">{bos}</p>
      ) : (
        <ul className="space-y-2">{bolgeler.map(render)}</ul>
      )}
    </section>
  );
}

interface KartProps {
  bolge: Bolge;
  ekipler?: EkipOzet[];
  /** Haritada secili kayit - kart belirgin bir kenarlikla isaretlenir. */
  secili?: boolean;
  /** Detay kartini acar (verilmezse dugme cikmaz). */
  onDetay?: () => void;
  gizli: boolean;
  duzenleniyor: boolean;
  silinecek: boolean;
  siliniyor?: boolean;
  atamaBekliyor?: boolean;
  onGorunurlukDegis: () => void;
  onGit: () => void;
  onDuzenle: () => void;
  onKaydedildi: () => void;
  onSilIste: () => void;
  onSilOnayla: () => void;
  onAta?: (workerId: string | null) => void;
  onSekilDuzenle?: () => void;
  sekilDuzenleniyor?: boolean;
}

const BolgeKarti = forwardRef<HTMLLIElement, KartProps>(function BolgeKarti(
  {
    bolge,
    ekipler,
    secili,
    onDetay,
    gizli,
    duzenleniyor,
    silinecek,
    siliniyor,
    atamaBekliyor,
    onGorunurlukDegis,
    onGit,
    onDuzenle,
    onKaydedildi,
    onSilIste,
    onSilOnayla,
    onAta,
    onSekilDuzenle,
    sekilDuzenleniyor,
  },
  ref
) {
  const alan = bolge.tip === "alan";
  const olcu = alan
    ? bolge.alan_m2 != null
      ? alanEtiketi(bolge.alan_m2)
      : null
    : bolge.uzunluk_m != null
      ? mesafeEtiketi(bolge.uzunluk_m)
      : null;

  return (
    <li
      ref={ref}
      className={`border bg-white transition ${
        secili
          ? "border-l-2 border-slate-300 border-l-violet-600 bg-violet-50/60"
          : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-2 p-2.5">
        <button
          onClick={onGorunurlukDegis}
          title={gizli ? "Haritada göster" : "Haritada gizle"}
          aria-label={gizli ? "Haritada göster" : "Haritada gizle"}
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 transition ${
            gizli ? "border-slate-300 bg-transparent" : "border-transparent"
          }`}
          style={gizli ? undefined : { background: bolge.renk }}
        />
        <button onClick={onGit} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-slate-800">{bolge.ad}</p>
          <p className="text-xs text-slate-500">
            {olcu ?? (alan ? "Alan" : "Güzergâh")}
            {gizli && " · haritada gizli"}
          </p>
          {bolge.aciklama && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
              {bolge.aciklama}
            </p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-1">
            {bolge.worker_ad ? (
              <span className="inline-flex items-center gap-1 bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">
                <IconUsers className="h-3 w-3" />
                {bolge.worker_ad}
              </span>
            ) : (
              <span className="inline-flex items-center bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                Atanmamış
              </span>
            )}
            {bolge.tamamlandi_at && (
              <span
                className="inline-flex items-center gap-1 bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700"
                title={new Date(bolge.tamamlandi_at).toLocaleString("tr-TR")}
              >
                <IconCheck className="h-3 w-3" />
                Tamamlandı
              </span>
            )}
          </p>
        </button>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {onDetay && (
            <button
              onClick={onDetay}
              className="text-[11px] font-medium text-slate-500 hover:text-violet-700 hover:underline"
            >
              Detay
            </button>
          )}
          <button
            onClick={onDuzenle}
            className="text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:underline"
          >
            {duzenleniyor ? "Kapat" : "Düzenle"}
          </button>
          {/* Sekil harita uzerinde duzenlenir; kayit yerinde guncellenir. */}
          {onSekilDuzenle && (
            <button
              onClick={onSekilDuzenle}
              title={alan ? "Alanı haritada düzenle" : "Güzergâhı haritada düzenle"}
              className={`text-[11px] font-medium hover:underline ${
                sekilDuzenleniyor
                  ? "text-violet-700"
                  : "text-slate-500 hover:text-violet-700"
              }`}
            >
              {sekilDuzenleniyor ? "Şekil açık" : "Şekli düzenle"}
            </button>
          )}
          <button
            onClick={onSilIste}
            className="text-[11px] font-medium text-slate-400 hover:text-red-600"
          >
            Sil
          </button>
        </span>
      </div>

      {onAta && (
        <div className="flex items-center gap-2 border-t border-slate-100 px-2.5 py-2">
          <label className="text-[11px] text-slate-500">
            {alan ? "Görev ekibi" : "Güzergâh ekibi"}
          </label>
          <select
            value={bolge.worker_id ?? ""}
            disabled={atamaBekliyor}
            onChange={(e) => onAta(e.target.value || null)}
            className="min-w-0 flex-1 border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-emerald-500 disabled:opacity-50"
          >
            <option value="">Atanmamış</option>
            {(ekipler ?? []).map((ekip) => (
              <option key={ekip.id} value={ekip.id}>
                {ekip.full_name || ekip.email}
                {ekip.yaka ? ` · ${YAKA_KISA[ekip.yaka as Yaka] ?? ekip.yaka}` : ""}
              </option>
            ))}
          </select>
          {atamaBekliyor && <span className="text-[11px] text-slate-400">…</span>}
        </div>
      )}

      {duzenleniyor && (
        <DuzenleFormu bolge={bolge} onBitti={onKaydedildi} />
      )}

      {silinecek && (
        <div className="flex items-center justify-between gap-2 border-t border-red-100 bg-red-50 px-2.5 py-2">
          <span className="text-[11px] text-red-700">
            "{bolge.ad}" kalıcı olarak silinsin mi?
          </span>
          <span className="flex shrink-0 gap-1.5">
            <button
              onClick={onSilIste}
              className="border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600"
            >
              Vazgeç
            </button>
            <button
              onClick={onSilOnayla}
              disabled={siliniyor}
              className="bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-60"
            >
              {siliniyor ? "Siliniyor…" : "Sil"}
            </button>
          </span>
        </div>
      )}
    </li>
  );
});

/** Ad / aciklama / renk formu. Geometri burada degil, harita uzerinde
 *  "Şekli düzenle" ile degistirilir. */
function DuzenleFormu({ bolge, onBitti }: { bolge: Bolge; onBitti: () => void }) {
  const [ad, setAd] = useState(bolge.ad);
  const [aciklama, setAciklama] = useState(bolge.aciklama ?? "");
  const [renk, setRenk] = useState(bolge.renk);
  const [hata, setHata] = useState<string | null>(null);

  const mutasyon = useMutation({
    mutationFn: () =>
      bolgeGuncelle(bolge.id, {
        ad: ad.trim(),
        aciklama: aciklama.trim() || null,
        renk,
      }),
    onSuccess: onBitti,
    onError: (e: Error) => setHata(e.message),
  });

  return (
    <div className="space-y-2 border-t border-slate-100 bg-slate-50 p-2.5">
      <input
        value={ad}
        onChange={(e) => setAd(e.target.value)}
        maxLength={120}
        placeholder="Ad"
        className="w-full border border-slate-300 px-2 py-1 text-xs outline-none focus:border-emerald-500"
      />
      <textarea
        value={aciklama}
        onChange={(e) => setAciklama(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Açıklama (isteğe bağlı)"
        className="w-full resize-none border border-slate-300 px-2 py-1 text-xs outline-none focus:border-emerald-500"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {RENK_PALETI.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => setRenk(hex)}
            title={hex}
            aria-label={hex}
            className={`h-5 w-5 rounded-full border-2 transition ${
              renk === hex ? "border-slate-800" : "border-white ring-1 ring-slate-300"
            }`}
            style={{ background: hex }}
          />
        ))}
        <label className="relative flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-dashed border-slate-400 text-[10px] leading-none text-slate-500">
          +
          <input
            type="color"
            value={renk}
            onChange={(e) => setRenk(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
      {hata && <p className="text-[11px] text-red-600">{hata}</p>}
      <div className="flex justify-end gap-1.5">
        <button
          onClick={onBitti}
          className="flex items-center gap-1 border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600"
        >
          <IconX className="h-3 w-3" />
          Vazgeç
        </button>
        <button
          onClick={() => mutasyon.mutate()}
          disabled={!ad.trim() || mutasyon.isPending}
          className="flex items-center gap-1 bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white disabled:bg-slate-300"
        >
          <IconCheck className="h-3 w-3" />
          {mutasyon.isPending ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
