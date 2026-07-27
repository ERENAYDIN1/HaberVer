import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { repairAsset } from "../api/assets";
import { fotoUrl } from "../api/reports";
import { gorevlerim, konumGuncelle } from "../api/saha";
import { useAuth } from "../auth/AuthContext";
import KonumSecMap, { type HaritaIsaret } from "../components/KonumSecMap";
import {
  IconBench,
  IconCheck,
  IconDrop,
  IconLamp,
  IconLogout,
  IconPin,
  IconRoute,
  IconTree,
  IconWarning,
} from "../components/icons";
import { ASSET_TYPE_LABELS, type AssetType } from "../types/asset";

const TIP_IKON: Record<AssetType, (p: { className?: string }) => React.ReactElement> = {
  agac: IconTree,
  bank: IconBench,
  direk: IconLamp,
  sulama: IconDrop,
};

const GOREV_RENGI = "#d97706"; // amber - "iş bekliyor"

/** Google Haritalar'da bu noktaya (kullanicinin konumundan) yol tarifi acar. */
function yolTarifiAc(lng: number, lat: number) {
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    "_blank",
    "noopener"
  );
}

/** Popup HTML'ine gomulen metinleri kacisla (basit XSS korumasi). */
function kacis(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

/** Saha ekibi ekrani: konumunu periyodik yayinlar, yalnizca kendisine atanan
 *  gorevleri (varliklari) gorur ve tamamladikca "Tamir Edildi" isaretler. */
export default function SahaEkran() {
  const { user, cikisYap } = useAuth();
  const queryClient = useQueryClient();

  const [benimKonumum, setBenimKonumum] = useState<[number, number] | null>(null);
  const [konumHatasi, setKonumHatasi] = useState<string | null>(null);
  const [ucus, setUcus] = useState<{
    anahtar: string;
    merkez: [number, number];
    zoom?: number;
  } | null>(null);
  const [tamirEdilen, setTamirEdilen] = useState<string | null>(null);
  // "Tamir Edildi" iki adimli: ilk tik onay ister, ikinci tik tamamlar.
  const [onayBekleyen, setOnayBekleyen] = useState<string | null>(null);

  // Konum yayini: mount'ta ve her 30sn'de bir tarayici konumunu backend'e gonder.
  useEffect(() => {
    if (!navigator.geolocation) {
      setKonumHatasi("Tarayıcınız konum servisini desteklemiyor");
      return;
    }
    let durduruldu = false;
    const gonder = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (durduruldu) return;
          const lon = Number(pos.coords.longitude.toFixed(6));
          const lat = Number(pos.coords.latitude.toFixed(6));
          setBenimKonumum([lon, lat]);
          setKonumHatasi(null);
          konumGuncelle(lon, lat).catch(() => {});
        },
        () => {
          if (!durduruldu)
            setKonumHatasi(
              "Konum alınamadı. Personelin sizi haritada görebilmesi için tarayıcı konum iznini verin."
            );
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    };
    gonder();
    const t = window.setInterval(gonder, 30000);
    return () => {
      durduruldu = true;
      window.clearInterval(t);
    };
  }, []);

  const gorevSorgu = useQuery({
    queryKey: ["saha", "gorevlerim"],
    queryFn: gorevlerim,
    refetchInterval: 20000,
  });
  const gorevler = gorevSorgu.data?.features ?? [];

  const isaretler = useMemo<HaritaIsaret[]>(
    () =>
      (gorevSorgu.data?.features ?? []).map((g) => {
        const p = g.properties;
        const [lng, lat] = g.geometry.coordinates;
        const foto = fotoUrl(p.photo_url);
        // Haritadaki pine tiklaninca: foto + detay + Google yol tarifi baglantisi.
        const popupHtml =
          `<div style="font-family:system-ui,sans-serif;width:200px">` +
          (foto
            ? `<img src="${kacis(foto)}" style="width:100%;max-height:110px;object-fit:cover;border:1px solid #e2e8f0;border-radius:4px;margin-bottom:6px"/>`
            : "") +
          `<div style="font-weight:600;font-size:13px;color:#0f172a">${kacis(p.name)}</div>` +
          `<div style="font-size:11px;color:#64748b;margin:2px 0 6px">${kacis(
            ASSET_TYPE_LABELS[p.type]
          )}${p.brand_model ? " · " + kacis(p.brand_model) : ""}</div>` +
          `<div style="font-size:10px;color:#94a3b8;margin-bottom:6px">#${kacis(
            p.asset_id.slice(0, 8)
          )}</div>` +
          `<a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" ` +
          `target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;` +
          `background:#059669;color:#fff;font-size:12px;font-weight:600;padding:5px 10px;` +
          `border-radius:6px;text-decoration:none">▸ Yol tarifi al</a>` +
          `</div>`;
        return {
          id: p.assignment_id,
          lng,
          lat,
          renk: GOREV_RENGI,
          popupHtml,
        };
      }),
    [gorevSorgu.data]
  );

  const tamirEt = async (assetId: string) => {
    setTamirEdilen(assetId);
    try {
      await repairAsset(assetId);
      await queryClient.invalidateQueries({ queryKey: ["saha", "gorevlerim"] });
    } finally {
      setTamirEdilen(null);
      setOnayBekleyen(null);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center border border-emerald-700 bg-emerald-600">
            <IconPin className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold tracking-tight text-slate-900">
              GreenAsset · Saha
            </h1>
            <p className="text-[11px] text-slate-500">Görev Ekranı</p>
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
        {/* Sol: gorev listesi */}
        <aside className="flex w-[380px] shrink-0 flex-col overflow-y-auto border-r border-slate-300 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Görevlerim{" "}
              <span className="text-xs font-normal text-slate-400">
                ({gorevler.length})
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Size atanan bakım işleri. Tamamladıkça "Tamir Edildi" ile kapatın.
            </p>
            {konumHatasi && (
              <p className="mt-2 flex items-start gap-1.5 border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                <IconWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{konumHatasi}</span>
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 p-4">
            {gorevSorgu.isLoading ? (
              <p className="text-xs text-slate-400">Yükleniyor…</p>
            ) : gorevSorgu.isError ? (
              <p className="text-xs text-red-600">
                Görevler yüklenemedi: {(gorevSorgu.error as Error).message}
              </p>
            ) : gorevler.length === 0 ? (
              <p className="text-xs text-slate-400">
                Şu an size atanmış bir görev yok. Yeni bir iş atandığında burada
                görünür.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {gorevler.map((g) => {
                  const p = g.properties;
                  const Ikon = TIP_IKON[p.type];
                  const fotoSrc = fotoUrl(p.photo_url);
                  return (
                    <li
                      key={p.assignment_id}
                      className="overflow-hidden border border-slate-200 bg-white shadow-sm"
                    >
                      <button
                        onClick={() =>
                          setUcus({
                            anahtar: crypto.randomUUID(),
                            merkez: g.geometry.coordinates,
                            zoom: 16,
                          })
                        }
                        className="flex w-full gap-3 p-2.5 text-left transition hover:bg-slate-50"
                      >
                        {fotoSrc ? (
                          <img
                            src={fotoSrc}
                            alt=""
                            className="h-14 w-14 shrink-0 border border-slate-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-slate-200 bg-slate-50">
                            <Ikon className="h-6 w-6 text-slate-400" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {p.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {ASSET_TYPE_LABELS[p.type]}
                            {p.brand_model ? ` · ${p.brand_model}` : ""}
                          </p>
                          <p className="mt-1 inline-flex items-center gap-1 bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                            <IconWarning className="h-3 w-3" />
                            Bakım Lazım
                          </p>
                          <p className="mt-1 font-mono text-[10px] text-slate-400">
                            #{p.asset_id.slice(0, 8)} ·{" "}
                            {g.geometry.coordinates[1].toFixed(5)},{" "}
                            {g.geometry.coordinates[0].toFixed(5)}
                          </p>
                        </div>
                      </button>
                      <div className="space-y-1.5 border-t border-slate-100 p-2">
                        <button
                          onClick={() =>
                            yolTarifiAc(
                              g.geometry.coordinates[0],
                              g.geometry.coordinates[1]
                            )
                          }
                          className="flex w-full items-center justify-center gap-1.5 border border-emerald-600 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                        >
                          <IconRoute className="h-3.5 w-3.5" />
                          Yol tarifi al
                        </button>

                        {onayBekleyen === p.asset_id ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setOnayBekleyen(null)}
                              disabled={tamirEdilen === p.asset_id}
                              className="flex-1 border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                            >
                              Vazgeç
                            </button>
                            <button
                              onClick={() => tamirEt(p.asset_id)}
                              disabled={tamirEdilen === p.asset_id}
                              className="flex flex-1 items-center justify-center gap-1.5 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                            >
                              <IconCheck className="h-3.5 w-3.5" />
                              {tamirEdilen === p.asset_id
                                ? "Kaydediliyor…"
                                : "Evet, tamamla"}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setOnayBekleyen(p.asset_id)}
                            className="flex w-full items-center justify-center gap-1.5 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
                          >
                            <IconCheck className="h-3.5 w-3.5" />
                            Tamir Edildi
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Sag: gorev pinleri + kendi konumu */}
        <div className="relative min-w-0 flex-1">
          <KonumSecMap
            secili={null}
            onSec={() => {}}
            tiklanabilir={false}
            isaretler={isaretler}
            benimKonumum={benimKonumum}
            ucus={ucus}
          />
        </div>
      </div>
    </div>
  );
}
