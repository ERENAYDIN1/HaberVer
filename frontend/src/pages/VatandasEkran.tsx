import { useEffect, useMemo, useRef, useState } from "react";

import { createReport, fotoUrl, hideReport, myReports } from "../api/reports";
import { useAuth } from "../auth/AuthContext";
import TalepDurumRozeti from "../components/TalepDurumRozeti";
import KonumSecMap, { type CizimAyari } from "../components/KonumSecMap";
import { inputClass, labelClass } from "../utils/formSiniflari";
import {
  IconCamera,
  IconChevronRight,
  IconLogout,
  IconMenu,
  IconPin,
  IconTree,
} from "../components/icons";
import TipSecenekleri from "../components/TipSecenekleri";
import {
  useDepartmanlar,
  useTurDepartmanEslemesi,
} from "../hooks/useDepartmanlar";
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  GRUP_RENGI,
  TIP_GRUBU,
  type AssetType,
} from "../types/asset";
import { departmanAdi } from "../types/departman";
import {
  MAKS_TALEP_NOKTASI,
  TALEP_SEKILLERI,
  TALEP_SEKIL_ACIKLAMASI,
  TALEP_SEKIL_ETIKETLERI,
  talepGorunumu,
  type ReportFeature,
  type TalepGeometrisi,
  type TalepSekilTipi,
} from "../types/report";
import {
  alanEtiketi,
  mesafeEtiketi,
  poligonAlaniM2,
  toplamMesafeMetre,
} from "../utils/geo";

/** Talep listesinin acik/kapali tercihi kalicidir: vatandas listeyi bir kez
 *  kapattiysa her girisinde tekrar kapatmak zorunda kalmamali. */
const LISTE_ANAHTARI = "greenasset.taleplerim.acik";

/** Bir sekil tipinin gecerli olmasi icin gereken en az kose sayisi. */
const EN_AZ_NOKTA: Record<TalepSekilTipi, number> = {
  Point: 1,
  LineString: 2,
  Polygon: 3,
};

export default function VatandasEkran() {
  const { user, cikisYap } = useAuth();
  const { data: departmanlar } = useDepartmanlar();
  const { data: esleme } = useTurDepartmanEslemesi();

  const [ad, setAd] = useState("");
  // Bilincli olarak BOS baslar: 13 tur arasinda sessiz bir varsayilan (eskiden
  // "agac"), kullanici tur alanini hic fark etmeden gonderdiginde yanlis
  // veri uretiyordu. Gonderimde zorunlu alan olarak dogrulanir.
  const [tip, setTip] = useState<AssetType | "">("");
  const [not, setNot] = useState("");

  // Konum iki bicimde tutulur: tek nokta secimi ile cok noktali cizim ayri
  // durumlardir. Sekil tipi degisince ikisi de sifirlanir - yarim kalmis bir
  // cizginin alan olarak devam etmesi kullaniciyi yaniltirdi.
  const [sekil, setSekil] = useState<TalepSekilTipi>("Point");
  const [konum, setKonum] = useState<[number, number] | null>(null);
  const [noktalar, setNoktalar] = useState<[number, number][]>([]);
  // Cizimin bittigi acik bir an: "Tamamla"ya basilana kadar haritadaki her
  // tiklama kose ekler. Bayrak olmadan kullanici formu doldururken haritaya
  // degdiginde seklini farkinda olmadan buyutuyordu.
  const [cizimTamam, setCizimTamam] = useState(false);

  const [ucus, setUcus] = useState<{
    anahtar: string;
    merkez: [number, number];
    zoom?: number;
  } | null>(null);
  const [konumHatasi, setKonumHatasi] = useState<string | null>(null);
  const [konumAraniyor, setKonumAraniyor] = useState(false);
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoOnizleme, setFotoOnizleme] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const [hata, setHata] = useState<string | null>(null);
  const [basari, setBasari] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const [taleplerim, setTaleplerim] = useState<ReportFeature[]>([]);
  const [listeAcik, setListeAcik] = useState(
    () => localStorage.getItem(LISTE_ANAHTARI) !== "0"
  );
  const [kaldirilan, setKaldirilan] = useState<string | null>(null);
  const [panelAcik, setPanelAcik] = useState(true);

  const talepleriYukle = () => {
    myReports()
      .then((d) => setTaleplerim(d.features))
      .catch(() => {});
  };
  useEffect(talepleriYukle, []);

  useEffect(() => {
    localStorage.setItem(LISTE_ANAHTARI, listeAcik ? "1" : "0");
  }, [listeAcik]);

  // Foto secilince onizleme URL'si uret ve temizle.
  useEffect(() => {
    if (!foto) {
      setFotoOnizleme(null);
      return;
    }
    const url = URL.createObjectURL(foto);
    setFotoOnizleme(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  // Cizim rengi turun grup rengidir: form ile haritadaki sekil ayni sinyali
  // tasisin (tur secilmemisken notr yesil).
  const cizimRengi = tip ? GRUP_RENGI[TIP_GRUBU[tip]] : "#059669";

  const cizim: CizimAyari | null = useMemo(() => {
    if (sekil === "Point") return null;
    return {
      tip: sekil,
      noktalar,
      onDegis: (yeni) => {
        // Sinir backend'de de uygulanir; burada sessizce yok saymak, elle
        // cizimde ulasilamayacak bir sinir icin hata mesaji gostermekten iyi.
        if (yeni.length > MAKS_TALEP_NOKTASI) return;
        setNoktalar(yeni);
      },
      renk: cizimRengi,
      tamamlandi: cizimTamam,
    };
  }, [sekil, noktalar, cizimRengi, cizimTamam]);

  /** Cizimin anlik olcusu: kullanici ne kadarlik bir yer isaretledigini
   *  gondermeden once gormeli. */
  const olcu = useMemo(() => {
    if (sekil === "LineString" && noktalar.length >= 2) {
      return mesafeEtiketi(toplamMesafeMetre(noktalar));
    }
    if (sekil === "Polygon" && noktalar.length >= 3) {
      return alanEtiketi(poligonAlaniM2(noktalar));
    }
    return null;
  }, [sekil, noktalar]);

  const hedefDepartman = tip ? esleme?.[tip] : undefined;

  /** Cizim icin gereken en az kose sayisi saglandi mi. */
  const cizimYeterli = sekil !== "Point" && noktalar.length >= EN_AZ_NOKTA[sekil];

  const sekilDegistir = (yeni: TalepSekilTipi) => {
    setSekil(yeni);
    setKonum(null);
    setNoktalar([]);
    setCizimTamam(false);
    setKonumHatasi(null);
  };

  const konumumuKullan = () => {
    setKonumHatasi(null);
    if (!navigator.geolocation) {
      setKonumHatasi("Tarayıcınız konum servisini desteklemiyor");
      return;
    }
    setKonumAraniyor(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nokta: [number, number] = [
          Number(pos.coords.longitude.toFixed(6)),
          Number(pos.coords.latitude.toFixed(6)),
        ];
        if (sekil === "Point") setKonum(nokta);
        else setNoktalar((n) => [...n, nokta]);
        setUcus({ anahtar: crypto.randomUUID(), merkez: nokta, zoom: 16 });
        setKonumAraniyor(false);
      },
      () => {
        setKonumHatasi(
          "Konum alınamadı. Lütfen izin verin veya haritadan işaretleyin."
        );
        setKonumAraniyor(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const formuSifirla = () => {
    setAd("");
    setTip("");
    setNot("");
    setSekil("Point");
    setKonum(null);
    setNoktalar([]);
    setCizimTamam(false);
    setFoto(null);
    if (fotoInputRef.current) fotoInputRef.current.value = "";
  };

  /** Form durumundan gonderilecek GeoJSON; eksikse null. */
  const geometri = (): TalepGeometrisi | null => {
    if (sekil === "Point") {
      return konum ? { type: "Point", coordinates: konum } : null;
    }
    if (noktalar.length < EN_AZ_NOKTA[sekil]) return null;
    if (sekil === "LineString") {
      return { type: "LineString", coordinates: noktalar };
    }
    // Halkayi backend kapatir; burada acik gonderilir.
    return { type: "Polygon", coordinates: [noktalar] };
  };

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata(null);
    setBasari(false);
    if (!ad.trim()) return setHata("Lütfen bir başlık/isim girin");
    if (!tip) return setHata("Lütfen bir tür seçin");
    if (!not.trim()) return setHata("Lütfen bir açıklama girin");
    const geo = geometri();
    if (!geo) {
      return setHata(
        sekil === "Point"
          ? "Lütfen bir konum seçin"
          : `Lütfen haritada en az ${EN_AZ_NOKTA[sekil]} nokta işaretleyin`
      );
    }
    // Cizim "Tamamla" ile kapatilmadan gonderilmez: yarim birakilmis bir hat
    // ile bitirilmis bir hat ayni veriyi uretir, ama kullanicinin sekli
    // bitirdigini onaylamasi tek adimda yanlis gonderimi engeller.
    if (sekil !== "Point" && !cizimTamam) {
      return setHata(
        `Lütfen haritanın altındaki “Tamamla” ile ${
          sekil === "LineString" ? "hattı" : "alanı"
        } bitirin`
      );
    }
    if (!foto) return setHata("Lütfen bir fotoğraf ekleyin");

    setGonderiliyor(true);
    try {
      await createReport({
        name: ad.trim(),
        type: tip,
        geometry: geo,
        note: not.trim(),
        photo: foto,
      });
      formuSifirla();
      setBasari(true);
      talepleriYukle();
    } catch (err) {
      setHata((err as Error).message);
    } finally {
      setGonderiliyor(false);
    }
  };

  const listedenKaldir = async (id: string) => {
    setKaldirilan(id);
    try {
      await hideReport(id);
      setTaleplerim((t) => t.filter((f) => f.properties.id !== id));
    } catch (err) {
      setHata((err as Error).message);
    } finally {
      setKaldirilan(null);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100">
      {/* Ust bar */}
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setPanelAcik((v) => !v)}
            aria-label="Talep panelini aç/kapat"
            aria-pressed={panelAcik}
            title="Talep paneli"
            className="flex h-9 w-9 items-center justify-center text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <IconMenu className="h-5 w-5" />
          </button>

          <div className="flex h-8 w-8 items-center justify-center border border-emerald-700 bg-emerald-600">
            <IconTree className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold tracking-tight text-slate-900">
              GreenAsset · Talep
            </h1>
            <p className="text-[11px] text-slate-500">Vatandaş Bildirim Ekranı</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {user?.full_name || user?.email}
          </span>
          <button
            onClick={cikisYap}
            className="flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <IconLogout className="h-3.5 w-3.5" />
            Çıkış
          </button>
        </div>
      </header>

      {/* Panel haritanin uzerine biner: akista olsaydi acilip kapanmasi
          haritayi yeniden boyutlandirir ve goruntu titrerdi. */}
      <div className="relative min-h-0 flex-1">
        {/* Sol: form + taleplerim */}
        <aside
          className={`absolute inset-y-0 left-0 z-30 flex flex-col overflow-y-auto overflow-x-hidden border-r bg-white transition-[width] duration-200 ease-out ${
            panelAcik
              ? "w-[380px] border-slate-300 shadow-lg"
              : "w-0 border-transparent"
          }`}
        >
         <div className="flex min-h-full w-[380px] shrink-0 flex-col">
          <form
            onSubmit={gonder}
            className="space-y-4 border-b border-slate-200 p-4"
            noValidate
          >
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Yeni Talep</h2>
              <p className="text-xs text-slate-500">
                Bakıma muhtaç gördüğünüz bir şeyi bildirin. Onaylandıktan sonra
                ilgili müdürlüğün iş listesine düşer.
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="ad">
                Başlık <span className="text-red-500">*</span>
              </label>
              <input
                id="ad"
                className={inputClass}
                placeholder="Örn. Kurumuş ağaç"
                value={ad}
                onChange={(e) => setAd(e.target.value)}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="tip">
                Tür <span className="text-red-500">*</span>
              </label>
              <select
                id="tip"
                className={inputClass}
                value={tip}
                onChange={(e) => setTip(e.target.value as AssetType | "")}
              >
                <option value="">Seçiniz…</option>
                <TipSecenekleri turler={ASSET_TYPES} />
              </select>
              {/* Talebin nereye gidecegi SECIM ANINDA soylenir: vatandas
                  "kime bildirdim" sorusunu gonderdikten sonra sormasin. */}
              {hedefDepartman && (
                <p className="mt-1 text-xs text-emerald-700">
                  → {departmanAdi(departmanlar, hedefDepartman)}’ne iletilecek
                </p>
              )}
              {tip === "diger" && (
                <p className="mt-1 text-xs text-slate-500">
                  Listede bulamadıysanız sorun değil — ne olduğunu başlıkta ve
                  açıklamada yazmanız yeterli, doğru müdürlüğe biz yönlendiririz.
                </p>
              )}
            </div>

            <div>
              <label className={labelClass} htmlFor="not">
                Açıklama <span className="text-red-500">*</span>
              </label>
              <textarea
                id="not"
                rows={3}
                className={inputClass}
                placeholder="Sorunu kısaca anlatın…"
                value={not}
                onChange={(e) => setNot(e.target.value)}
              />
            </div>

            <div>
              <label className={labelClass}>
                Fotoğraf <span className="text-red-500">*</span>
              </label>
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              />
              {fotoOnizleme ? (
                <div className="relative">
                  <img
                    src={fotoOnizleme}
                    alt="Önizleme"
                    className="max-h-40 w-full border border-slate-200 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setFoto(null)}
                    className="absolute right-2 top-2 border border-slate-300 bg-white/90 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-white"
                  >
                    Kaldır
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fotoInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 border border-dashed border-slate-300 bg-slate-50 py-4 text-sm text-slate-500 transition hover:border-emerald-400 hover:text-emerald-700"
                >
                  <IconCamera className="h-4 w-4" />
                  Fotoğraf ekle
                </button>
              )}
            </div>

            {/* Konum: once NE BICIMDE isaretlenecegi secilir. Ucu de
                haritaciligin standart sekilleridir (nokta/cizgi/poligon) ama
                etiketler teknik adlarla degil ne ise yaradiklariyla yazilir. */}
            <div>
              <label className={labelClass}>
                Konum <span className="text-red-500">*</span>
              </label>
              <div className="mb-2 grid grid-cols-3 gap-1">
                {TALEP_SEKILLERI.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sekilDegistir(s)}
                    aria-pressed={sekil === s}
                    className={`flex flex-col items-center gap-0.5 border px-1 py-1.5 text-center transition ${
                      sekil === s
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <SekilSimgesi tip={s} />
                    <span className="text-xs font-medium">
                      {TALEP_SEKIL_ETIKETLERI[s]}
                    </span>
                    <span className="text-[10px] leading-tight text-slate-400">
                      {TALEP_SEKIL_ACIKLAMASI[s]}
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={konumumuKullan}
                disabled={konumAraniyor}
                className="flex w-full items-center justify-center gap-2 border border-emerald-600 bg-emerald-50 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <IconPin className="h-4 w-4" />
                {konumAraniyor
                  ? "Konum alınıyor…"
                  : sekil === "Point"
                    ? "Konumumu Kullan"
                    : "Konumumu Ekle"}
              </button>

              {sekil === "Point" ? (
                <>
                  <p className="mt-1.5 text-xs text-slate-400">
                    veya sağdaki haritaya tıklayarak işaretleyin.
                  </p>
                  {konum && (
                    <p className="mt-1 font-mono text-xs text-slate-600">
                      Seçilen: {konum[1].toFixed(5)}, {konum[0].toFixed(5)}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {/* Cizim ARACLARI haritanin altindaki panelde durur (personel
                      konsolundaki `CizimPaneli` ile ayni yer): kullanicinin
                      gozu cizerken haritada, dugmeler de orada olmali. Burada
                      yalnizca durum ozeti kalir. */}
                  <p className="mt-1.5 text-xs text-slate-400">
                    Haritaya tıkladıkça
                    {sekil === "LineString"
                      ? " hat uzar"
                      : " alanın köşeleri eklenir"}
                    . En az {EN_AZ_NOKTA[sekil]} nokta gerekir; bitince
                    haritanın altındaki “Tamamla” düğmesine basın.
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {noktalar.length} nokta
                    {olcu && (
                      <span className="ml-1.5 font-medium text-slate-800">
                        · {olcu}
                      </span>
                    )}
                    {cizimTamam && (
                      <span className="ml-1.5 font-medium text-emerald-700">
                        · tamamlandı
                      </span>
                    )}
                  </p>
                </>
              )}
              {konumHatasi && (
                <p className="mt-1 text-xs text-red-600">{konumHatasi}</p>
              )}
            </div>

            {hata && (
              <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {hata}
              </p>
            )}
            {basari && (
              <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Talebiniz alındı. İlgili müdürlük onayladığında aşağıdaki
                listeden durumunu takip edebilirsiniz.
              </p>
            )}

            <button
              type="submit"
              disabled={gonderiliyor}
              className="w-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {gonderiliyor ? "Gönderiliyor…" : "Talebi Gönder"}
            </button>
          </form>

          {/* Taleplerim - katlanabilir */}
          <div className="p-4">
            <button
              type="button"
              onClick={() => setListeAcik((a) => !a)}
              className="flex w-full items-center justify-between gap-2 text-left"
              aria-expanded={listeAcik}
            >
              <h2 className="text-sm font-semibold text-slate-900">
                Taleplerim{" "}
                <span className="text-xs font-normal text-slate-400">
                  ({taleplerim.length})
                </span>
              </h2>
              <IconChevronRight
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                  listeAcik ? "rotate-90" : ""
                }`}
              />
            </button>

            {listeAcik &&
              (taleplerim.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">
                  Henüz talep göndermediniz.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {taleplerim.map((t) => (
                    <TalepKarti
                      key={t.properties.id}
                      talep={t}
                      kaldiriliyor={kaldirilan === t.properties.id}
                      onKaldir={() => listedenKaldir(t.properties.id)}
                    />
                  ))}
                </ul>
              ))}
          </div>
         </div>
        </aside>

        {/* Harita: konum secme / cizim */}
        <div className="absolute inset-0">
          <KonumSecMap
            secili={konum}
            onSec={setKonum}
            cizim={cizim}
            ucus={ucus}
          />

          {/* Cizim araci: personel konsolundaki `CizimPaneli` ile ayni yerde
              (ekranin alt-ortasi; sol panel acilip kapaninca yeri degismez)
              ve ayni islerde - kose sayisi + anlik olcu, geri al/iptal ve
              cizimi bitiren "Tamamla". */}
          {sekil !== "Point" && (
            <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
              <div className="pointer-events-auto w-full max-w-sm rounded-xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: cizimRengi }}
                  />
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {sekil === "LineString" ? "Hat Çizimi" : "Alan Çizimi"}
                  </span>
                  <span className="ml-auto text-xs text-slate-600">
                    {noktalar.length} nokta
                    {olcu && (
                      <span className="ml-1.5 font-medium text-slate-800">
                        · {olcu}
                      </span>
                    )}
                  </span>
                </div>

                <p className="mt-1.5 text-xs text-slate-500">
                  {cizimTamam
                    ? "Çizim tamamlandı. Değiştirmek isterseniz “Düzenle” ile köşe eklemeye devam edebilirsiniz."
                    : `Haritaya tıklayarak köşe ekleyin (en az ${EN_AZ_NOKTA[sekil]}).`}
                </p>

                <div className="mt-2.5 flex gap-2">
                  {cizimTamam ? (
                    <button
                      type="button"
                      onClick={() => setCizimTamam(false)}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Düzenle
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setNoktalar([])}
                        disabled={!noktalar.length}
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        İptal
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoktalar((n) => n.slice(0, -1))}
                        disabled={!noktalar.length}
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Geri al
                      </button>
                      <button
                        type="button"
                        onClick={() => setCizimTamam(true)}
                        disabled={!cizimYeterli}
                        className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Tamamla
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Sekil secicideki kucuk gorsel: nokta / hat / alan siluetleri. Etiketten
 *  once bunlar okunur, bu yuzden birbirinden acikca farkli olmalari onemli. */
function SekilSimgesi({ tip }: { tip: TalepSekilTipi }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
      {tip === "Point" && <circle cx="12" cy="12" r="4.5" fill="currentColor" />}
      {tip === "LineString" && (
        <>
          <path
            d="M4 17 L10 9 L20 13"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="4" cy="17" r="2" fill="currentColor" />
          <circle cx="20" cy="13" r="2" fill="currentColor" />
        </>
      )}
      {tip === "Polygon" && (
        <path
          d="M5 8 L14 4 L20 12 L12 20 L4 15 Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          fill="currentColor"
          fillOpacity="0.2"
        />
      )}
    </svg>
  );
}

interface TalepKartiProps {
  talep: ReportFeature;
  kaldiriliyor: boolean;
  onKaldir: () => void;
}

function TalepKarti({ talep, kaldiriliyor, onKaldir }: TalepKartiProps) {
  const p = talep.properties;
  const fotoSrc = fotoUrl(p.photo_url);
  // Gorunum personel tarafiyla AYNI fonksiyondan gelir. Vatandas varlik
  // listesini goremedigi icin olusan varligin durumu talep yanitinda tasinir
  // (`asset_status`), boylece "Tamir Edildi" burada da gorunur. Alan her zaman
  // dolu geldiginden ucuncu arguman `true`.
  const gorunum = talepGorunumu(p.status, p.asset_status ?? undefined, true);

  return (
    <li className="relative border border-slate-200 bg-slate-50 p-2">
      {/* Listeden dusurur, SILMEZ: kayit belediyede durmaya devam eder.
          Onaylanmis bir talep gercekten silinseydi ondan olusan varlik ve
          saha gorevi sahipsiz kalirdi. */}
      <button
        type="button"
        onClick={onKaldir}
        disabled={kaldiriliyor}
        title="Listemden kaldır"
        aria-label="Listemden kaldır"
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6 L18 18 M18 6 L6 18" />
        </svg>
      </button>
      <div className="flex gap-3 pr-6">
        {fotoSrc && (
          <img
            src={fotoSrc}
            alt=""
            className="h-12 w-12 shrink-0 border border-slate-200 object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
          <p className="text-xs text-slate-500">
            {ASSET_TYPE_LABELS[p.type]}
            {talep.geometry.type !== "Point" && (
              <span className="text-slate-400">
                {" · "}
                {TALEP_SEKIL_ETIKETLERI[talep.geometry.type]}
              </span>
            )}
          </p>
          <div className="mt-1">
            <TalepDurumRozeti durum={gorunum} />
          </div>
          {p.status === "reddedildi" && p.review_note && (
            <p className="mt-1 text-xs text-red-600">
              Ret nedeni: {p.review_note}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
