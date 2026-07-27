import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { repairAsset } from "../api/assets";
import { fotoUrl } from "../api/reports";
import {
  gorevlerim,
  konumGuncelle,
  tamamlananiGeriAl,
  tamamlananlarim,
} from "../api/saha";
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
  // Geri alinmakta olan tamamlanmis gorev (assignment_id).
  const [geriAlinan, setGeriAlinan] = useState<string | null>(null);
  // Bu oturumda geri alinan gorevler (assignment_id) - aktif listede "geri
  // alindi" rozetiyle isaretlenir ki hangi isin geri getirildigi belli olsun.
  const [geriAlinanlar, setGeriAlinanlar] = useState<Set<string>>(new Set());
  // Islem sonrasi bilgilendirme seridi.
  const [durum, setDurum] = useState<{ ok: boolean; metin: string } | null>(null);

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

  // Tamamlanan isler: hemen silinmez, burada tutulur ve geri alinabilir.
  const tamamlananSorgu = useQuery({
    queryKey: ["saha", "tamamlananlarim"],
    queryFn: tamamlananlarim,
    refetchInterval: 20000,
  });
  const tamamlananlar = tamamlananSorgu.data?.features ?? [];

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

  const tamirEt = async (assetId: string, ad: string) => {
    setTamirEdilen(assetId);
    try {
      await repairAsset(assetId);
      // Aktif liste + tamamlananlar tazelenir; is silinmez, alttaki
      // "Tamamlanan İşler"e taşınır ve oradan geri alınabilir.
      await queryClient.invalidateQueries({ queryKey: ["saha"] });
      setDurum({ ok: true, metin: `"${ad}" işi tamamlandı olarak işaretlendi.` });
    } catch (e) {
      setDurum({ ok: false, metin: (e as Error).message });
    } finally {
      setTamirEdilen(null);
      setOnayBekleyen(null);
    }
  };

  const geriAl = async (assignmentId: string, ad: string) => {
    setGeriAlinan(assignmentId);
    try {
      await tamamlananiGeriAl(assignmentId);
      setGeriAlinanlar((prev) => new Set(prev).add(assignmentId));
      await queryClient.invalidateQueries({ queryKey: ["saha"] });
      setDurum({ ok: true, metin: `"${ad}" işi geri alındı, yeniden bakım bekliyor.` });
    } catch (e) {
      setDurum({ ok: false, metin: (e as Error).message });
    } finally {
      setGeriAlinan(null);
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
            {durum && (
              <div
                className={`mt-2 flex items-start justify-between gap-2 border px-2.5 py-1.5 text-xs ${
                  durum.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                <span>{durum.metin}</span>
                <button
                  onClick={() => setDurum(null)}
                  className="shrink-0 font-medium opacity-70 hover:opacity-100"
                  aria-label="Kapat"
                >
                  ×
                </button>
              </div>
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
                          <p className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="inline-flex items-center gap-1 bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                              <IconWarning className="h-3 w-3" />
                              Bakım Lazım
                            </span>
                            {geriAlinanlar.has(p.assignment_id) && (
                              <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                                ↩ Geri alındı
                              </span>
                            )}
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
                              onClick={() => tamirEt(p.asset_id, p.name)}
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

            {/* Tamamlanan İşler: tamamlanan is hemen silinmez; yanlislikla
                isaretlenirse buradan geri alinabilir. */}
            {tamamlananlar.length > 0 && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <IconCheck className="h-4 w-4 text-emerald-600" />
                  Tamamlanan İşler{" "}
                  <span className="text-xs font-normal text-slate-400">
                    ({tamamlananlar.length})
                  </span>
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Yanlışlıkla tamamladıysanız "Geri Al" ile yeniden bakıma
                  alabilirsiniz.
                </p>
                <ul className="mt-2 space-y-2">
                  {tamamlananlar.map((g) => {
                    const p = g.properties;
                    const Ikon = TIP_IKON[p.type];
                    return (
                      <li
                        key={p.assignment_id}
                        className="flex items-center gap-2.5 border border-slate-200 bg-slate-50 p-2.5"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-slate-200 bg-white">
                          <Ikon className="h-4 w-4 text-slate-400" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-700 line-through decoration-slate-300">
                            {p.name}
                          </p>
                          <p className="text-[11px] text-emerald-700">
                            Tamamlandı
                            {p.completed_at
                              ? ` · ${new Date(p.completed_at).toLocaleString("tr-TR")}`
                              : ""}
                          </p>
                        </div>
                        <button
                          onClick={() => geriAl(p.assignment_id, p.name)}
                          disabled={geriAlinan === p.assignment_id}
                          className="shrink-0 border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                        >
                          {geriAlinan === p.assignment_id ? "Geri alınıyor…" : "↩ Geri Al"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
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
