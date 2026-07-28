import { useEffect, useRef, useState } from "react";

import { createReport, fotoUrl, myReports } from "../api/reports";
import { useAuth } from "../auth/AuthContext";
import IhbarDurumRozeti from "../components/IhbarDurumRozeti";
import KonumSecMap from "../components/KonumSecMap";
import { IconCamera, IconLogout, IconPin, IconTree } from "../components/icons";
import { ASSET_TYPES, ASSET_TYPE_LABELS, type AssetType } from "../types/asset";
import type { ReportFeature } from "../types/report";

const inputClass =
  "w-full border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
const labelClass = "block text-sm font-medium text-slate-700 mb-1";

export default function VatandasEkran() {
  const { user, cikisYap } = useAuth();

  const [ad, setAd] = useState("");
  const [tip, setTip] = useState<AssetType>("agac");
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

  const [hata, setHata] = useState<string | null>(null);
  const [basari, setBasari] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const [ihbarlarim, setIhbarlarim] = useState<ReportFeature[]>([]);

  const ihbarlariYukle = () => {
    myReports()
      .then((d) => setIhbarlarim(d.features))
      .catch(() => {});
  };
  useEffect(ihbarlariYukle, []);

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

  const konumumuKullan = () => {
    setKonumHatasi(null);
    if (!navigator.geolocation) {
      setKonumHatasi("Tarayıcınız konum servisini desteklemiyor");
      return;
    }
    setKonumAraniyor(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const konum: [number, number] = [
          Number(pos.coords.longitude.toFixed(6)),
          Number(pos.coords.latitude.toFixed(6)),
        ];
        setKonum(konum);
        setUcus({ anahtar: crypto.randomUUID(), merkez: konum, zoom: 16 });
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
    setTip("agac");
    setNot("");
    setKonum(null);
    setFoto(null);
    if (fotoInputRef.current) fotoInputRef.current.value = "";
  };

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata(null);
    setBasari(false);
    if (!ad.trim()) return setHata("Lütfen bir başlık/isim girin");
    if (!not.trim()) return setHata("Lütfen bir açıklama girin");
    if (!konum) return setHata("Lütfen bir konum seçin");
    if (!foto) return setHata("Lütfen bir fotoğraf ekleyin");

    setGonderiliyor(true);
    try {
      await createReport({
        name: ad.trim(),
        type: tip,
        longitude: konum[0],
        latitude: konum[1],
        note: not.trim(),
        photo: foto,
      });
      formuSifirla();
      setBasari(true);
      ihbarlariYukle();
    } catch (err) {
      setHata((err as Error).message);
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100">
      {/* Ust bar */}
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center border border-emerald-700 bg-emerald-600">
            <IconTree className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold tracking-tight text-slate-900">
              GreenAsset · İhbar
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

      <div className="flex min-h-0 flex-1">
        {/* Sol: form + ihbarlarim */}
        <aside className="flex w-[380px] shrink-0 flex-col overflow-y-auto border-r border-slate-300 bg-white">
          <form onSubmit={gonder} className="space-y-4 border-b border-slate-200 p-4" noValidate>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Yeni İhbar</h2>
              <p className="text-xs text-slate-500">
                Bakıma muhtaç gördüğünüz bir şeyi bildirin. Onaylandıktan sonra
                sisteme eklenir.
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
                Tür
              </label>
              <select
                id="tip"
                className={inputClass}
                value={tip}
                onChange={(e) => setTip(e.target.value as AssetType)}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ASSET_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
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
              <button
                type="button"
                onClick={konumumuKullan}
                disabled={konumAraniyor}
                className="flex w-full items-center justify-center gap-2 border border-emerald-600 bg-emerald-50 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <IconPin className="h-4 w-4" />
                {konumAraniyor ? "Konum alınıyor…" : "Konumumu Kullan"}
              </button>
              <p className="mt-1.5 text-xs text-slate-400">
                veya sağdaki haritaya tıklayarak işaretleyin.
              </p>
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
                İhbarınız alındı. Onaylandığında haritada görünecek.
              </p>
            )}

            <button
              type="submit"
              disabled={gonderiliyor}
              className="w-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {gonderiliyor ? "Gönderiliyor…" : "İhbarı Gönder"}
            </button>
          </form>

          {/* Ihbarlarim */}
          <div className="p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">
              İhbarlarım{" "}
              <span className="text-xs font-normal text-slate-400">
                ({ihbarlarim.length})
              </span>
            </h2>
            {ihbarlarim.length === 0 ? (
              <p className="text-xs text-slate-400">Henüz ihbar göndermediniz.</p>
            ) : (
              <ul className="space-y-2">
                {ihbarlarim.map((ih) => {
                  const p = ih.properties;
                  const fotoSrc = fotoUrl(p.photo_url);
                  return (
                    <li
                      key={p.id}
                      className="flex gap-3 border border-slate-200 bg-slate-50 p-2"
                    >
                      {fotoSrc && (
                        <img
                          src={fotoSrc}
                          alt=""
                          className="h-12 w-12 shrink-0 border border-slate-200 object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {p.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {ASSET_TYPE_LABELS[p.type]}
                        </p>
                        <div className="mt-1">
                          <IhbarDurumRozeti durum={p.status} />
                        </div>
                        {p.status === "reddedildi" && p.review_note && (
                          <p className="mt-1 text-xs text-red-600">
                            Ret nedeni: {p.review_note}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Sag: konum secme haritasi */}
        <div className="relative min-w-0 flex-1">
          <KonumSecMap secili={konum} onSec={setKonum} ucus={ucus} />
        </div>
      </div>
    </div>
  );
}
