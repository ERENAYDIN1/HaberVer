import { useState, type ReactElement } from "react";

import { useIlceler, useMahalleler } from "../hooks/useSinirlar";
import { IDARI_ALAN_RENK } from "../hooks/useAlanSecimi";
import { ISTANBUL_IL_KODU } from "../utils/istanbulMaskesi";
import {
  IconCheck,
  IconChevronRight,
  IconInbox,
  IconLasso,
  IconLayers,
  IconLegend,
  IconPin,
  IconRoute,
  IconUsers,
} from "./icons";

/** Haritada bagimsiz olarak acilip kapatilabilen genel-bakis katmanlari. */
export type KatmanAnahtari =
  | "varliklar"
  | "talepler"
  | "bolgeler"
  | "guzergahlar"
  | "ekipler";

export type KatmanGorunurluk = Record<KatmanAnahtari, boolean>;

/** Bir ana katmanin altindaki tekil filtre secenegi (varlik turu / talep durumu). */
export interface AltFiltre {
  anahtar: string;
  etiket: string;
  /** Haritadaki isaretci rengiyle ayni renk noktasi (lejant). */
  renk: string;
  /** Haritada tek renkle cizilmeyen secenekler icin dilimli swatch (varlik
   *  durumlarinda dolgu her zaman tur rengidir). Verilirse dolgu dilimlerden
   *  olusur ve `renk` kenarliga duser. */
  renkler?: string[];
  secili: boolean;
  sayi: number;
}

/** Alt-filtrelerin bir kirilimi. Varliklarda iki grup (tur/durum), taleplerde
 *  tek grup vardir; tek grupta baslik gereksiz oldugu icin opsiyoneldir. */
export interface AltGrup {
  baslik?: string;
  /** Basligin kendi rengi (or. mudurluk rengi). Seceneklerin swatch'i bundan
   *  BAGIMSIZDIR: baslik "kime gidiyor", swatch "haritada nasil gorunuyor"
   *  der ve ikisi ortusmek zorunda degildir. */
  baslikRengi?: string;
  /** Basligin kendi kutucugunun durumu. Verilirse baslik bir ac/kapat
   *  dugmesine doner ve altindaki TUM secenekleri birlikte tersler - "hangi
   *  mudurluk gorunsun" sorusu tur tur tiklamayi gerektirmemeli. */
  baslikDurumu?: "hepsi" | "kismi" | "hicbiri";
  /** Basliktaki toplam sayi (secenek sayaclarinin toplami degil, cagiranin
   *  hesabi - grup kapatilinca da dogru kalsin diye). */
  baslikSayisi?: number;
  onBaslikSec?: () => void;
  secenekler: AltFiltre[];
  onSec: (anahtar: string) => void;
  /** Bu grup baska bir alt-filtreye BAGIMLIYSA (or. talep mudurluk kirilimi,
   *  ancak kendi durum satiri acikken anlamlidir), o bagimliligin o an acik
   *  olup olmadigi. Verilmezse (`undefined`) grup her zaman aktif sayilir -
   *  varsayilan, bagimsiz gruplarin (varliklar/ekipler/bolgeler) davranisini
   *  degistirmez. `false` iken grup gizlenir: kapali bir durumun altinda
   *  tiklanabilir ama etkisiz kutucuklar durmasin. */
  aktif?: boolean;
  /** Basliksiz bir grubu normalden fazla sola-girintili gosterir: "bu grup
   *  YUKARIDAKİ satirin alt-filtresidir" der, ayrica bir baslik yazmadan
   *  (or. talep mudurluk kirilimi kendi durum satirinin hemen altinda). */
  girintili?: boolean;
}

/** Birden fazla rengi keskin geciste yan yana dizen swatch arka plani. */
function dilimliArkaPlan(renkler: string[]): string {
  const dilim = 100 / renkler.length;
  const duraklar = renkler
    .map((r, i) => `${r} ${i * dilim}% ${(i + 1) * dilim}%`)
    .join(", ");
  return `linear-gradient(135deg, ${duraklar})`;
}

interface KatmanTanimi {
  anahtar: KatmanAnahtari;
  etiket: string;
  /** Haritadaki isaretci rengiyle birebir ayni (marker paletiyle uyumlu). */
  renk: string;
  ikon: (p: { className?: string }) => ReactElement;
}

/** Katman sirasi ve etiketleri. Buradaki renkler ana katman kimligidir
 *  (lejant ikonu), tekil isaretcilerin rengi degil. Bolgeler/guzergahlar
 *  bilincli olarak taleplerle ekipler arasinda durur: ustteki ikisi "is",
 *  alttaki "kim", bolge de ikisini baglayan calisma alani. */
const KATMANLAR: KatmanTanimi[] = [
  { anahtar: "varliklar", etiket: "Varlıklar", renk: "#059669", ikon: IconPin },
  { anahtar: "talepler", etiket: "Talepler", renk: "#9333ea", ikon: IconInbox },
  { anahtar: "bolgeler", etiket: "Bölgeler", renk: "#7c3aed", ikon: IconLayers },
  { anahtar: "guzergahlar", etiket: "Güzergâhlar", renk: "#2563eb", ikon: IconRoute },
  { anahtar: "ekipler", etiket: "Saha Ekipleri", renk: "#4f46e5", ikon: IconUsers },
];

/** Lejantin altindaki idari sinir (ilce/mahalle) filtresi. Ayni state'i
 *  `AssetList`'teki acilirlarla paylasir: iki yuzeyden biri degistirince
 *  digeri de aninda ayni secimi gosterir. */
export interface BolgeFiltresi {
  ilceKodu: string | null;
  onIlceSec: (kod: string | null) => void;
  mahalleKodu: string | null;
  onMahalleSec: (kod: string | null) => void;
}

interface KatmanKontroluProps {
  gorunur: KatmanGorunurluk;
  onDegistir: (anahtar: KatmanAnahtari) => void;
  /** Her katmanin o an haritadaki adedi (rozet). */
  sayilar: Record<KatmanAnahtari, number>;
  /** Katman basina alt-filtre kirilimlari; anahtari olmayan katman yalnizca
   *  acilip kapatilir. (Varliklar: tur + durum, Talepler: gorunum, Saha
   *  Ekipleri: departman.) */
  altlar: Partial<Record<KatmanAnahtari, AltGrup[]>>;
  /** Verilirse lejantin altinda ilce/mahalle filtresi gorunur. */
  bolge?: BolgeFiltresi;
  /** Mobil: kart yuzen bir kutu degil, acan sheet'in govdesi olarak cizilir -
   *  kendi konumlandirmasi, daraltma dugmesi ve golgesi olmaz. */
  gomulu?: boolean;
}

const selectClass =
  "w-full rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-700 focus:border-cyan-500 focus:outline-none";

/** Lejantin ilce/mahalle bolumu. Acilirlarin verisi `AssetList` ile ayni
 *  react-query anahtarlarindan gelir, ek istek dogurmaz. */
function BolgeBolumu({ bolge }: { bolge: BolgeFiltresi }) {
  const { ilceKodu, onIlceSec, mahalleKodu, onMahalleSec } = bolge;
  // Secim varken acik baslar: kullanici hangi sinirin uygulandigini gormeli.
  const [acik, setAcik] = useState(ilceKodu != null);
  const ilcelerSorgu = useIlceler(ISTANBUL_IL_KODU);
  // Mahalleler yalnizca bir ilce secildiginde getirilir (kademeli filtre).
  const mahallelerSorgu = useMahalleler(ilceKodu);
  const seciliIlce = ilcelerSorgu.data?.find((i) => i.kod === ilceKodu);
  const seciliMahalle = mahallelerSorgu.data?.find((m) => m.kod === mahalleKodu);
  const aktif = ilceKodu != null;
  const ozet = seciliMahalle
    ? `${seciliMahalle.ad} · ${seciliIlce?.ad ?? ""}`
    : (seciliIlce?.ad ?? "Tüm İstanbul");

  return (
    <div className="border-t border-slate-200/70 p-1.5">
      <div className="flex items-center gap-1.5 rounded-xl pr-1 transition hover:bg-slate-50">
        {/* Kutucuk: secim varken dolu; tiklayinca sinir filtresini kaldirir. */}
        <button
          onClick={() => (aktif ? onIlceSec(null) : setAcik((a) => !a))}
          aria-pressed={aktif}
          title={aktif ? "Sınır filtresini kaldır" : "İlçe / mahalle seç"}
          className="flex items-center gap-2 py-2 pl-2"
        >
          <span
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-2 transition"
            style={{
              borderColor: aktif ? IDARI_ALAN_RENK : "#cbd5e1",
              backgroundColor: aktif ? IDARI_ALAN_RENK : "transparent",
            }}
          >
            <IconLasso
              className={`h-3.5 w-3.5 ${aktif ? "text-white" : "text-slate-400"}`}
            />
          </span>
        </button>

        <button
          onClick={() => setAcik((a) => !a)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span
              className={`block text-[13px] font-semibold leading-tight ${
                aktif ? "text-slate-800" : "text-slate-400"
              }`}
            >
              Bölge
            </span>
            <span
              className="block truncate text-[11px] font-medium leading-tight"
              style={{ color: aktif ? IDARI_ALAN_RENK : "#94a3b8" }}
              title={ozet}
            >
              {ozet}
            </span>
          </span>
          <IconChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${
              acik ? "rotate-90" : ""
            }`}
          />
        </button>
      </div>

      {acik && (
        <div className="mb-1 ml-4 space-y-1 border-l border-slate-200 pl-1.5">
          <select
            className={selectClass}
            value={ilceKodu ?? ""}
            onChange={(e) => onIlceSec(e.target.value || null)}
          >
            <option value="">Tüm ilçeler (İstanbul)</option>
            {ilcelerSorgu.data?.map((ilce) => (
              <option key={ilce.kod} value={ilce.kod}>
                {ilce.ad}
              </option>
            ))}
          </select>

          {/* Mahalle secimi yalnizca bir ilce secildiginde gorunur. */}
          {ilceKodu && (
            <select
              className={selectClass}
              value={mahalleKodu ?? ""}
              onChange={(e) => onMahalleSec(e.target.value || null)}
              disabled={mahallelerSorgu.isLoading}
            >
              <option value="">
                {mahallelerSorgu.isLoading ? "Yükleniyor…" : "Tüm mahalleler"}
              </option>
              {mahallelerSorgu.data?.map((mahalle) => (
                <option key={mahalle.kod} value={mahalle.kod}>
                  {mahalle.ad}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

/** Alt-filtre grubunun tiklanabilir basligi (mudurluk). Kirilim uc kademeli
 *  okunur: Varlıklar → Müdürlükler → Türler. Baslik kutucugu altindaki tum
 *  turleri birlikte acip kapatir; bazisi acikken "kismi" gorunur (dolgu var,
 *  tik yerine cizgi) - yalan soylememesi icin bosla dolu arasinda bir ucuncu
 *  hal gerekir. */
function GrupBasligi({
  grup,
  katmanAcik,
  onSec,
}: {
  grup: AltGrup;
  katmanAcik: boolean;
  onSec: () => void;
}) {
  const renk = grup.baslikRengi ?? "#64748b";
  const durum = grup.baslikDurumu ?? "hepsi";
  const dolu = durum !== "hicbiri";

  return (
    <button
      type="button"
      onClick={onSec}
      disabled={!katmanAcik}
      aria-pressed={durum === "hepsi"}
      title={
        dolu ? `${grup.baslik}: tüm türleri kapat` : `${grup.baslik}: tüm türleri aç`
      }
      className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition ${
        katmanAcik ? "hover:brightness-95" : "cursor-not-allowed opacity-50"
      }`}
      style={{
        color: dolu ? renk : "#94a3b8",
        backgroundColor: `${renk}14`,
        boxShadow: `inset 2px 0 0 ${renk}`,
      }}
    >
      <span
        className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border-2 transition"
        style={{
          borderColor: dolu ? renk : "#cbd5e1",
          backgroundColor: durum === "hepsi" ? renk : "transparent",
        }}
      >
        {durum === "hepsi" && <IconCheck className="h-2.5 w-2.5 text-white" />}
        {durum === "kismi" && (
          <span
            className="h-[2px] w-[7px] rounded-full"
            style={{ backgroundColor: renk }}
          />
        )}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-[11px] font-bold leading-tight"
        title={grup.baslik}
      >
        {grup.baslik}
      </span>
      {grup.baslikSayisi != null && (
        <span className="shrink-0 text-[11px] font-bold tabular-nums">
          {grup.baslikSayisi.toLocaleString("tr-TR")}
        </span>
      )}
    </button>
  );
}

/**
 * Haritanin sag-ust kosesindeki lejant + katman filtresi. Kullanici varlik,
 * talep ve saha ekibi katmanlarini "tik atarak" bagimsizca acip kapatabilir;
 * ayrica Varliklar (tur + durum) ve Talepler (durum) katmanlarini kendi icinde ince
 * filtreleyebilir. Kart dar tutulur, alt-filtreler dikey olarak acilir - yazi
 * sikismaz/kaymaz. Baslik satirindan tumu kucuk bir dugmeye indirilebilir.
 */
export default function KatmanKontrolu({
  gorunur,
  onDegistir,
  sayilar,
  altlar: altFiltreler,
  bolge,
  gomulu,
}: KatmanKontroluProps) {
  const [acik, setAcik] = useState(true);
  // Hangi ana katmanlarin alt-filtresi genisletilmis (varsayilan: kapali).
  const [genis, setGenis] = useState<Record<string, boolean>>({});
  const acikSayisi = KATMANLAR.filter((k) => gorunur[k.anahtar]).length;

  const genisletmeDegistir = (anahtar: string) =>
    setGenis((g) => ({ ...g, [anahtar]: !g[anahtar] }));

  // Gomulu kipte kart bir yuzen kutu degil, acan/kapatan sheet'in govdesidir:
  // kendi kapatma dugmesi ve daraltilmis hali olmaz.
  if (!acik && !gomulu) {
    return (
      <div className="absolute right-3 top-3 z-20">
        <button
          onClick={() => setAcik(true)}
          title="Katmanlar"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white/90 text-slate-600 shadow-lg shadow-slate-900/5 backdrop-blur-md transition hover:text-slate-900"
        >
          <IconLegend className="h-5 w-5" />
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {acikSayisi}
          </span>
        </button>
      </div>
    );
  }

  return (
    // Genislik mudurluk adlarina gore: "Park ve Bahçeler Müdürlüğü" lejantin
    // ana basligi oldugundan w-52'de her satir kirpiliyordu.
    <div
      className={
        gomulu
          ? "w-full"
          : "absolute right-3 top-3 z-20 w-60 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-xl shadow-slate-900/10 backdrop-blur-md"
      }
    >
      {!gomulu && (
        <button
          onClick={() => setAcik(false)}
          className="flex w-full items-center gap-2 border-b border-slate-200/70 px-3 py-2.5 text-left transition hover:bg-slate-50/70"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <IconLegend className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1 text-sm font-semibold text-slate-800">Katmanlar</span>
          <IconChevronRight className="h-4 w-4 -rotate-90 text-slate-400" />
        </button>
      )}

      <div className="p-1.5">
        {KATMANLAR.map((katman) => {
          const secili = gorunur[katman.anahtar];
          const Ikon = katman.ikon;
          // Bos gelen kirilim (orn. hic saha ekibi yoksa) hic yokmus gibi
          // davranir: acilinca bos bir kutu gosteren ok kafa karistirir.
          const altlarHam = altFiltreler[katman.anahtar];
          const altlar =
            altlarHam && altlarHam.some((g) => g.secenekler.length > 0)
              ? altlarHam
              : null;
          const genisletilmis = altlar ? genis[katman.anahtar] : false;

          return (
            <div key={katman.anahtar}>
              <div className="flex items-center gap-1.5 rounded-xl pr-1 transition hover:bg-slate-50">
                {/* Renkli kutucuk + ikon: katmani ac/kapat (tek dokunusluk). */}
                <button
                  onClick={() => onDegistir(katman.anahtar)}
                  aria-pressed={secili}
                  title={secili ? "Katmanı gizle" : "Katmanı göster"}
                  className="flex items-center gap-2 py-2 pl-2"
                >
                  <span
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-2 transition"
                    style={{
                      borderColor: secili ? katman.renk : "#cbd5e1",
                      backgroundColor: secili ? katman.renk : "transparent",
                    }}
                  >
                    <Ikon
                      className={`h-3.5 w-3.5 ${secili ? "text-white" : "text-slate-400"}`}
                    />
                  </span>
                </button>

                {/* Etiket + sayi + (alt-filtre varsa) genislet oku: bu bolge
                    alt-filtreleri acar/kapar; alt-filtresi olmayan katmanda
                    yine katmani ac/kapatir. */}
                <button
                  onClick={() =>
                    altlar ? genisletmeDegistir(katman.anahtar) : onDegistir(katman.anahtar)
                  }
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left"
                >
                  <span
                    title={katman.etiket}
                    className={`min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight ${
                      secili ? "text-slate-800" : "text-slate-400"
                    }`}
                  >
                    {katman.etiket}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums transition ${
                      secili ? "bg-slate-100 text-slate-700" : "bg-slate-50 text-slate-300"
                    }`}
                  >
                    {sayilar[katman.anahtar].toLocaleString("tr-TR")}
                  </span>
                  {altlar && (
                    <IconChevronRight
                      className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${
                        genisletilmis ? "rotate-90" : ""
                      }`}
                    />
                  )}
                </button>
              </div>

              {/* Alt-filtreler: dikey liste, sola girintili, hafif ayrac cizgisiyle. */}
              {altlar && genisletilmis && (
                // 13 varlik turu + durumlar listeyi uzattigindan kaydirmali.
                <div className="mb-1 ml-3 max-h-[17rem] space-y-1.5 overflow-y-auto pl-0.5">
                  {altlar.map((grup, i) => {
                    // Bagimli bir grup (or. talep mudurluk kirilimi) kendi
                    // durum satiri kapaliyken hic gorunmez - alt-filtre
                    // olmasinin anlami budur, tiklanabilir ama etkisiz bir
                    // kutucuk kafa karistirir.
                    if (grup.aktif === false) return null;
                    return (
                    <div key={i}>
                      {/* Mudurluk basligi: adin tamami ("… Müdürlüğü"), kendi
                          renginde bir seritle. Basligin altindaki turler o
                          mudurlugun isleridir; swatch'lari ise haritada
                          basilan grup rengidir - ikisi ortusmek zorunda
                          degil (bkz. CLAUDE.md, lejant kurali). */}
                      {grup.baslik &&
                        (grup.onBaslikSec ? (
                          <GrupBasligi
                            grup={grup}
                            katmanAcik={secili}
                            onSec={grup.onBaslikSec}
                          />
                        ) : (
                          <p
                            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-bold leading-tight"
                            style={{
                              color: grup.baslikRengi ?? "#64748b",
                              backgroundColor: `${grup.baslikRengi ?? "#64748b"}14`,
                              boxShadow: `inset 2px 0 0 ${grup.baslikRengi ?? "#94a3b8"}`,
                            }}
                          >
                            <span className="min-w-0 truncate" title={grup.baslik}>
                              {grup.baslik}
                            </span>
                          </p>
                        ))}
                      <div
                        className={
                          grup.girintili
                            ? "pl-3"
                            : grup.baslik
                              ? "mt-0.5 pl-1"
                              : undefined
                        }
                      >
                        {grup.secenekler.map((alt) => (
                        <button
                          key={alt.anahtar}
                          onClick={() => grup.onSec(alt.anahtar)}
                          aria-pressed={alt.secili}
                          disabled={!secili}
                          className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition ${
                            secili ? "hover:bg-slate-50" : "cursor-not-allowed opacity-50"
                          }`}
                        >
                          <span
                            className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border transition"
                            style={{
                              borderColor: alt.secili ? alt.renk : "#cbd5e1",
                              ...(alt.renkler
                                ? {
                                    background: alt.secili
                                      ? dilimliArkaPlan(alt.renkler)
                                      : "transparent",
                                  }
                                : {
                                    backgroundColor: alt.secili ? alt.renk : "transparent",
                                  }),
                            }}
                          >
                            {alt.secili && <IconCheck className="h-2.5 w-2.5 text-white" />}
                          </span>
                          {/* Uzun mudurluk/tur adlari sayaci satirdan itiyordu:
                              ad kirpilir (tam hali tooltip'te), sayi her zaman
                              gorunur kalir - lejantin isi zaten saydirmak. */}
                          <span
                            title={alt.etiket}
                            className={`min-w-0 flex-1 truncate text-[12px] font-medium leading-tight ${
                              alt.secili ? "text-slate-700" : "text-slate-400"
                            }`}
                          >
                            {alt.etiket}
                          </span>
                          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">
                            {alt.sayi.toLocaleString("tr-TR")}
                          </span>
                        </button>
                        ))}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Idari sinir filtresi: katman listesinin altinda, kendi seridinde. */}
      {bolge && <BolgeBolumu bolge={bolge} />}
    </div>
  );
}
