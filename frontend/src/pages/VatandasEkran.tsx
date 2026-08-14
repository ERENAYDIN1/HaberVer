import { useEffect, useRef, useState } from "react";

import { createTalep, fotoUrl, hideTalep, myTalepler } from "../api/talepler";
import { useAuth } from "../auth/AuthContext";
import TalepDurumRozeti from "../components/TalepDurumRozeti";
import KonumSecMap from "../components/KonumSecMap";
import { inputClass, labelClass } from "../utils/formSiniflari";
import {
  IconCamera,
  IconChevronRight,
  IconKonum,
  IconLogout,
  IconMenu,
  IconPlus,
  IconTree,
  HaberVerLogo,
} from "../components/icons";
import Sheet from "../components/mobil/Sheet";
import { useMobil } from "../hooks/useMobil";
import TipSecenekleri from "../components/TipSecenekleri";
import {
  useDepartmanlar,
  useTurDepartmanEslemesi,
} from "../hooks/useDepartmanlar";
import { turAdi, turKodlari } from "../data/turSozlugu";
import type { AssetType } from "../types/asset";
import { departmanAdi } from "../types/departman";
import {
  talepGorunumu,
  type TalepFeature,
  type TalepGeometrisi,
} from "../types/talep";

/** Talep listesinin acik/kapali tercihi kalicidir: vatandas listeyi bir kez
 *  kapattiysa her girisinde tekrar kapatmak zorunda kalmamali. */
const LISTE_ANAHTARI = "haberver.taleplerim.acik";

export default function VatandasEkran() {
  const { user, cikisYap } = useAuth();
  const { data: departmanlar } = useDepartmanlar();
  const { data: esleme } = useTurDepartmanEslemesi();
  const mobil = useMobil();

  const [ad, setAd] = useState("");
  // Bilincli olarak BOS baslar: sessiz bir varsayilan kullanici fark etmeden
  // yanlis veri uretirdi. Gonderimde zorunlu alan olarak dogrulanir.
  const [tip, setTip] = useState<AssetType | "">("");
  const [not, setNot] = useState("");

  const [konum, setKonum] = useState<[number, number] | null>(null);

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
  /** Haritanin gizli konum kontrolunu tetikler (mobilde arti'nin ustundeki
   *  dugme buna baglidir). */
  const konumTetikleRef = useRef<(() => void) | null>(null);

  const [hata, setHata] = useState<string | null>(null);
  const [basari, setBasari] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const [taleplerim, setTaleplerim] = useState<TalepFeature[]>([]);
  const [listeAcik, setListeAcik] = useState(
    () => localStorage.getItem(LISTE_ANAHTARI) !== "0"
  );
  const [kaldirilan, setKaldirilan] = useState<string | null>(null);
  const [panelAcik, setPanelAcik] = useState(true);

  // --- Yalnizca mobil kabuk ---
  // Masaustunde form ve liste tek yan panelde durur; mobilde ayri sheet'tir.
  const [formAcik, setFormAcik] = useState(false);
  const [listeSheetAcik, setListeSheetAcik] = useState(false);
  // Konum isaretleme kipi: form sheet'i kapanir, harita tam ekran olur.
  // Mobilde form ile harita ayni anda kullanilamaz.
  const [konumKipi, setKonumKipi] = useState(false);
  /** Vatandasin kendi konumu - SECIM DEGIL, yalnizca haritada referans olsun
   *  diye gosterilen mavi nokta ("Neredeyim?" dugmesi doldurur). */
  const [benimKonumum, setBenimKonumum] = useState<[number, number] | null>(
    null
  );

  const talepleriYukle = () => {
    myTalepler()
      .then((d) => setTaleplerim(d.features))
      .catch(() => {});
  };
  useEffect(talepleriYukle, []);

  useEffect(() => {
    localStorage.setItem(LISTE_ANAHTARI, listeAcik ? "1" : "0");
  }, [listeAcik]);

  useEffect(() => {
    if (!foto) {
      setFotoOnizleme(null);
      return;
    }
    const url = URL.createObjectURL(foto);
    setFotoOnizleme(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  const hedefDepartman = tip ? esleme?.[tip] : undefined;

  const konumKipiniKapat = () => {
    setKonumKipi(false);
    setFormAcik(true);
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
        setKonum(nokta);
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

  /** "Neredeyim?": konumu YALNIZCA referans olarak gosterir (mavi nokta),
   *  secime/cizime dokunmaz - `konumumuKullan`'dan farki budur. */
  const neredeyim = () => {
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
        setBenimKonumum(nokta);
        setUcus({ anahtar: crypto.randomUUID(), merkez: nokta, zoom: 16 });
        setKonumAraniyor(false);
      },
      () => {
        setKonumHatasi("Konum alınamadı. Lütfen konum izni verin.");
        setKonumAraniyor(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const formuSifirla = () => {
    setAd("");
    setTip("");
    setNot("");
    setKonum(null);
    setFoto(null);
    if (fotoInputRef.current) fotoInputRef.current.value = "";
  };

  /** Form durumundan gonderilecek GeoJSON; konum secilmemisse null. */
  const geometri = (): TalepGeometrisi | null =>
    konum ? { type: "Point", coordinates: konum } : null;

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata(null);
    setBasari(false);
    if (!ad.trim()) return setHata("Lütfen bir başlık/isim girin");
    if (!tip) return setHata("Lütfen bir tür seçin");
    if (!not.trim()) return setHata("Lütfen bir açıklama girin");
    const geo = geometri();
    if (!geo) return setHata("Lütfen bir konum seçin");
    if (!foto) return setHata("Lütfen bir fotoğraf ekleyin");

    setGonderiliyor(true);
    try {
      await createTalep({
        name: ad.trim(),
        type: tip,
        geometry: geo,
        note: not.trim(),
        photo: foto,
      });
      formuSifirla();
      setBasari(true);
      talepleriYukle();
      // Mobilde form bir sheet: gonderim bitince kapanip yerini talep
      // listesine birakir.
      if (mobil) {
        setFormAcik(false);
        setListeSheetAcik(true);
      }
    } catch (err) {
      setHata((err as Error).message);
    } finally {
      setGonderiliyor(false);
    }
  };

  const listedenKaldir = async (id: string) => {
    setKaldirilan(id);
    try {
      await hideTalep(id);
      setTaleplerim((t) => t.filter((f) => f.properties.id !== id));
    } catch (err) {
      setHata((err as Error).message);
    } finally {
      setKaldirilan(null);
    }
  };

  /* Iki kabugun paylastigi parcalar; JSX burada bir kez kurulur. */
  const formIcerigi = (
          <form
            onSubmit={gonder}
            className="space-y-4 border-b border-slate-200 p-4"
            noValidate
          >
            <div className={mobil ? "hidden" : undefined}>
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
                <TipSecenekleri turler={turKodlari()} />
              </select>
              {/* Talebin nereye gidecegi SECIM ANINDA soylenir. */}
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

            <div>
              <label className={labelClass}>
                Konum <span className="text-red-500">*</span>
              </label>
              <p className="mb-2 text-xs text-slate-500">
                {mobil
                  ? "Haritada işaretleyin ya da konumunuzu kullanın."
                  : "Haritaya tıklayarak yeri işaretleyin."}
              </p>

              {mobil && (
                <button
                  type="button"
                  onClick={() => {
                    setFormAcik(false);
                    setKonumKipi(true);
                  }}
                  className="mb-2 flex w-full items-center justify-center gap-2 border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <IconKonum className="h-4 w-4" />
                  Haritada İşaretle
                </button>
              )}

              <div className="my-2 flex items-center gap-2">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-xs text-slate-400">ya da</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <button
                type="button"
                onClick={konumumuKullan}
                disabled={konumAraniyor}
                className="flex w-full items-center justify-center gap-2 border border-emerald-600 bg-emerald-50 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <IconKonum className="h-4 w-4" />
                {konumAraniyor ? "Konum alınıyor…" : "Konumumu Kullan"}
              </button>

              {konum && (
                <p className="mt-1 font-mono text-xs text-slate-600">
                  Seçilen: {konum[1].toFixed(5)}, {konum[0].toFixed(5)}
                </p>
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
                Talebiniz alındı. İlgili müdürlük onayladığında
                {mobil ? " “Taleplerim”" : " aşağıdaki listeden"} durumunu takip
                edebilirsiniz.
              </p>
            )}

            <button
              type="submit"
              disabled={gonderiliyor}
              className={`w-full bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400 ${
                mobil ? "py-3" : "py-2"
              }`}
            >
              {gonderiliyor ? "Gönderiliyor…" : "Talebi Gönder"}
            </button>
          </form>
  );

  /** Talep listesi; masaustunde katlanabilir baslik altinda, mobilde sheet
   *  govdesinde. */
  const talepListesi =
    taleplerim.length === 0 ? (
      <p className="mt-2 text-xs text-slate-400">Henüz talep göndermediniz.</p>
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
    );

  // Mobilde konum dugmesi arti'nin hemen ustunde; kontrol gizlenip
  // `konumTetikle` ile disaridan tetiklenir.
  const harita = (
    <KonumSecMap
      secili={konum}
      onSec={setKonum}
      ucus={ucus}
      benimKonumum={benimKonumum}
      konumDugmesi={mobil ? "gizli" : "harita"}
      konumRef={konumTetikleRef}
    />
  );

  // --- Mobil kabuk ---
  if (mobil) {
    return (
      <div className="ekran-yuksekligi flex w-screen flex-col overflow-hidden bg-slate-100">
        <header className="z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3">
          <div className="flex min-w-0 items-center gap-2">
            <HaberVerLogo className="h-8 w-auto shrink-0" />
            <p className="truncate text-[11px] text-slate-500">
              {user?.full_name || user?.email}
            </p>
          </div>
          <button
            onClick={cikisYap}
            aria-label="Çıkış yap"
            className="flex h-10 w-10 shrink-0 items-center justify-center border border-slate-300 bg-white text-slate-600"
          >
            <IconLogout className="h-4 w-4" />
          </button>
        </header>

        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0">{harita}</div>

          {konumKipi ? (
            /* Konum isaretleme kipi: harita tam ekran, form kapalidir. */
            <div className="guvenli-alt pointer-events-none absolute inset-x-0 bottom-0 z-40 px-3 pb-3">
              {/* "Neredeyim?" secime DOKUNMAZ, yalnizca mavi referans noktasi
                  koyar - bu yuzden "Konumumu Kullan"dan ayri bir dugmedir. */}
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={neredeyim}
                  disabled={konumAraniyor}
                  className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 py-2 pl-3 pr-3.5 text-xs font-medium text-slate-700 shadow-lg backdrop-blur-sm transition active:scale-95 disabled:opacity-60"
                >
                  <IconKonum className="h-4 w-4 text-blue-600" />
                  {konumAraniyor ? "Alınıyor…" : "Neredeyim?"}
                </button>
              </div>
              <div className="pointer-events-auto rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm">
                <p className="text-xs text-slate-600">
                      {konum ? (
                        <span className="font-mono">
                          Seçilen: {konum[1].toFixed(5)}, {konum[0].toFixed(5)}
                        </span>
                      ) : (
                    "Haritaya dokunarak konumu işaretleyin."
                  )}
                </p>
                {/* Isaretlenen yeri ONAYLAYAN dugme; isaret konmadan
                    kilitlidir. */}
                <button
                  type="button"
                  onClick={konumKipiniKapat}
                  disabled={!konum}
                  className="mt-2.5 w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Bu Konumu Onayla
                </button>

                {/* "Forma Dön" HICBIR ZAMAN kilitli degildir, aksi halde
                    kullanici kipte sikisir. */}
                <button
                  type="button"
                  onClick={konumKipiniKapat}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-medium text-slate-700"
                >
                  Forma Dön
                </button>
                {konumHatasi && (
                  <p className="mt-2 text-xs text-red-600">{konumHatasi}</p>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Sag alt dikey yigin: konum (ikincil) + yeni talep (birincil). */}
              <div className="absolute bottom-24 right-4 z-30 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => konumTetikleRef.current?.()}
                  aria-label="Konumumu göster"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition active:scale-95"
                >
                  <IconKonum className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormAcik(true);
                    setListeSheetAcik(false);
                  }}
                  aria-label="Yeni talep oluştur"
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/30 transition active:scale-95"
                >
                  <IconPlus className="h-6 w-6" />
                </button>
              </div>

              {/* Taleplerim: haritanin uzerinde yuzen bir kart. */}
              <button
                type="button"
                onClick={() => setListeSheetAcik(true)}
                aria-label="Taleplerimi aç"
                className="guvenli-alt-bosluk absolute inset-x-3 bottom-3 z-20 rounded-2xl border border-slate-200 bg-white px-4 pb-3 pt-2 text-left shadow-lg shadow-slate-900/10 transition active:scale-[0.99]"
              >
                <span className="mx-auto mb-2 block h-1 w-9 rounded-full bg-slate-300" />
                <span className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                    <IconTree className="h-4 w-4 text-emerald-600" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight text-slate-900">
                      Taleplerim
                    </span>
                    <span className="block text-xs leading-tight text-slate-500">
                      {taleplerim.length > 0
                        ? `${taleplerim.length} talep · durumunu gör`
                        : "Henüz talebiniz yok"}
                    </span>
                  </span>
                  <IconChevronRight className="ml-auto h-5 w-5 shrink-0 -rotate-90 text-slate-400" />
                </span>
              </button>
            </>
          )}

          <Sheet
            acik={formAcik}
            baslik="Yeni Talep"
            baslangic="tam"
            onKapat={() => setFormAcik(false)}
            ikon={
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50">
                <IconPlus className="h-4 w-4 text-emerald-600" />
              </span>
            }
          >
            {formIcerigi}
          </Sheet>

          <Sheet
            acik={listeSheetAcik}
            baslik={`Taleplerim (${taleplerim.length})`}
            onKapat={() => setListeSheetAcik(false)}
            ikon={
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
                <IconTree className="h-4 w-4 text-slate-500" />
              </span>
            }
          >
            <div className="px-4 pb-6">{talepListesi}</div>
          </Sheet>
        </div>
      </div>
    );
  }

  // --- Masaustu kabugu (degismedi) ---
  return (
    <div className="ekran-yuksekligi flex w-screen flex-col overflow-hidden bg-slate-100">
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

          <div className="flex select-none items-center gap-3">
            <HaberVerLogo className="h-9 w-auto shrink-0" />
            <p className="hidden text-[9.5px] font-semibold uppercase leading-[1.5] tracking-[0.14em] text-slate-400 lg:block">
              Vatandaş
              <br />
              Bildirim Ekranı
            </p>
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
          {formIcerigi}

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

            {listeAcik && talepListesi}
          </div>
         </div>
        </aside>

        {/* Harita: konum secme / cizim */}
        <div className="absolute inset-0">
          {harita}

          {/* Mobildeki ile ayni "Neredeyim?": isaret koymadan yalnizca mavi
              referans noktasi. */}
          <div className="pointer-events-none absolute right-3 top-3 z-10 flex justify-end">
            <button
              type="button"
              onClick={neredeyim}
              disabled={konumAraniyor}
              className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 py-2 pl-3 pr-3.5 text-xs font-medium text-slate-700 shadow-lg backdrop-blur-sm transition hover:bg-white disabled:opacity-60"
            >
              <IconKonum className="h-4 w-4 text-blue-600" />
              {konumAraniyor ? "Alınıyor…" : "Neredeyim?"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


interface TalepKartiProps {
  talep: TalepFeature;
  kaldiriliyor: boolean;
  onKaldir: () => void;
}

function TalepKarti({ talep, kaldiriliyor, onKaldir }: TalepKartiProps) {
  const p = talep.properties;
  const fotoSrc = fotoUrl(p.photo_url);
  // Gorunum personel tarafiyla AYNI fonksiyondan gelir; `asset_status` API
  // yanitinda tasindigi icin "Tamir Edildi" burada da gorunur.
  const gorunum = talepGorunumu(p.status, p.asset_status ?? undefined, true);

  return (
    <li className="relative border border-slate-200 bg-slate-50 p-2">
      {/* Listeden dusurur, SILMEZ: kayit belediyede durmaya devam eder. */}
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
            {turAdi(p.type)}
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
