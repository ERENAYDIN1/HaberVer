import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { repairAsset } from "../api/assets";
import { bolgelerim as bolgelerimGetir, bolgeTamamla } from "../api/bolgeler";
import { fotoUrl } from "../api/reports";
import {
  gorevlerim,
  konumGuncelle,
  tamamlananiGeriAl,
  tamamlananlarim,
} from "../api/saha";
import { useAuth } from "../auth/AuthContext";
import DepartmanEtiketi from "../components/DepartmanEtiketi";
import KonumSecMap, {
  type HaritaAlani,
  type HaritaIsaret,
} from "../components/KonumSecMap";
import {
  IconCheck,
  IconChevronRight,
  IconLasso,
  IconLogout,
  IconMenu,
  IconPin,
  IconRoute,
  IconWarning,
  tipIkonu,
} from "../components/icons";
import Sheet from "../components/mobil/Sheet";
import { useMobil } from "../hooks/useMobil";
import { turAdi } from "../data/turSozlugu";
import type { Bolge } from "../types/bolge";
import { TALEP_SEKIL_ETIKETLERI } from "../types/report";
import { gorevSekli } from "../types/saha";
import {
  alanEtiketi,
  mesafeEtiketi,
  mesafeMetre,
  poligonAlaniM2,
  toplamMesafeMetre,
} from "../utils/geo";
import { kacis } from "../utils/html";

const GOREV_RENGI = "#d97706"; // amber - "iş bekliyor"

/** Isin buyuklugu: cizgide hattin uzunlugu, alanda yuzolcum. Nokta islerde
 *  null - pin zaten tek noktayi gosteriyor, olculecek bir sey yok. */
function sekilOlcusu(sekil: ReturnType<typeof gorevSekli>): string | null {
  if (!sekil) return null;
  return sekil.tip === "LineString"
    ? mesafeEtiketi(toplamMesafeMetre(sekil.halkalar[0]))
    : alanEtiketi(poligonAlaniM2(sekil.halkalar[0]));
}

/** Google Haritalar'da bu noktaya yol tarifi acar. */
function yolTarifiAc(lng: number, lat: number) {
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    "_blank",
    "noopener"
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
  // Ayrintisi acik olan gorev (assignment_id). Aciklama karta hep basili
  // olsaydi liste okunmaz hale gelirdi; tek tek acilir.
  const [acikDetay, setAcikDetay] = useState<string | null>(null);
  // "Tamir Edildi" iki adimli: ilk tik onay ister, ikinci tik tamamlar.
  const [onayBekleyen, setOnayBekleyen] = useState<string | null>(null);
  // Geri alinmakta olan tamamlanmis gorev (assignment_id).
  const [geriAlinan, setGeriAlinan] = useState<string | null>(null);
  // Islem gormekte olan gorev bolgesi / guzergah (bolge id) ve onay bekleyeni.
  const [bolgeIslemde, setBolgeIslemde] = useState<string | null>(null);
  const [bolgeOnayBekleyen, setBolgeOnayBekleyen] = useState<string | null>(null);
  // Bu oturumda geri alinan gorevler; aktif listede rozetle isaretlenir.
  const [geriAlinanlar, setGeriAlinanlar] = useState<Set<string>>(new Set());
  // Islem sonrasi bilgilendirme seridi.
  const [durum, setDurum] = useState<{ ok: boolean; metin: string } | null>(null);
  const [panelAcik, setPanelAcik] = useState(true);
  const mobil = useMobil();
  // Mobilde gorev listesi bir sheet: acilista yarim kademede durur ki ekip
  // hem isini hem haritadaki yerini ayni anda gorsun - ekranin tek isi bu.
  const [sheetAcik, setSheetAcik] = useState(true);

  // Konum yayini: acilista ve her 30 sn'de bir backend'e gonderilir.
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

  // Ekibe atanan gorev bolgeleri ve guzergahlar. Uc, tamamlananlari da
  // dondurur ki ekip geri alabilsin.
  const bolgeSorgu = useQuery({
    queryKey: ["saha", "bolgelerim"],
    queryFn: bolgelerimGetir,
    refetchInterval: 60000,
  });
  const bolgeler = bolgeSorgu.data ?? [];
  const aktifBolgeler = bolgeler.filter((b) => !b.tamamlandi_at);
  const tamamlananBolgeler = bolgeler.filter((b) => b.tamamlandi_at);
  const aktifAlanlar = aktifBolgeler.filter((b) => b.tip === "alan");
  const aktifGuzergahlar = aktifBolgeler.filter((b) => b.tip === "cizgi");

  // Haritada yalnizca aktif kayitlar cizilir; tamamlananlar listede durur.
  const bolgeAlanlari = useMemo<HaritaAlani[]>(
    () =>
      (bolgeSorgu.data ?? [])
        .filter((b) => !b.tamamlandi_at)
        .map((b) => ({
          id: b.id,
          noktalar: b.noktalar,
          renk: b.renk,
          etiket: b.ad,
          cizgi: b.tip === "cizgi",
        })),
    [bolgeSorgu.data]
  );

  /** Isin KENDI sekli: vatandas bir hat ya da bolge cizdiyse haritada oyle
   *  gorunur. Varlik nokta oldugu icin (envanter/atama tek nokta uzerinden
   *  calisir) pin yerinde kalir; sekil pinin altina, isin buyuklugunu
   *  gostermek icin cizilir. Kenarlik DUZ: kesikli olan gorev bolgesidir. */
  const gorevSekilleri = useMemo<HaritaAlani[]>(
    () =>
      (gorevSorgu.data?.features ?? []).flatMap((g) => {
        const sekil = gorevSekli(g.properties);
        if (!sekil) return [];
        return [
          {
            id: `gorev-${g.properties.assignment_id}`,
            noktalar: sekil.halkalar,
            renk: GOREV_RENGI,
            etiket: sekilOlcusu(sekil) ?? undefined,
            cizgi: sekil.tip === "LineString",
            kesikli: false,
          },
        ];
      }),
    [gorevSorgu.data]
  );

  // Sekiller bolgelerden SONRA: is, uzerinde calisilan bolgenin ustunde durmali.
  const haritaAlanlari = useMemo(
    () => [...bolgeAlanlari, ...gorevSekilleri],
    [bolgeAlanlari, gorevSekilleri]
  );

  /** Konum biliniyorsa gorevler en yakindan uzaga siralanir; bilinmiyorsa
   *  backend'in verdigi sira (atama zamani) korunur. */
  const siraliGorevler = useMemo(() => {
    const liste = (gorevSorgu.data?.features ?? []).map((g) => ({
      gorev: g,
      mesafe: benimKonumum
        ? mesafeMetre(benimKonumum, g.geometry.coordinates)
        : null,
    }));
    if (benimKonumum) liste.sort((a, b) => (a.mesafe ?? 0) - (b.mesafe ?? 0));
    return liste;
  }, [gorevSorgu.data, benimKonumum]);

  const isaretler = useMemo<HaritaIsaret[]>(
    () =>
      (gorevSorgu.data?.features ?? []).map((g) => {
        const p = g.properties;
        const [lng, lat] = g.geometry.coordinates;
        const foto = fotoUrl(p.photo_url);
        const sekil = gorevSekli(p);
        const olcu = sekilOlcusu(sekil);
        // Pin popup'i: foto + detay + yol tarifi baglantisi.
        const popupHtml =
          `<div style="font-family:system-ui,sans-serif;width:200px">` +
          (foto
            ? `<img src="${kacis(foto)}" style="width:100%;max-height:110px;object-fit:cover;border:1px solid #e2e8f0;border-radius:4px;margin-bottom:6px"/>`
            : "") +
          `<div style="font-weight:600;font-size:13px;color:#0f172a">${kacis(p.name)}</div>` +
          `<div style="font-size:11px;color:#64748b;margin:2px 0 6px">${kacis(
            turAdi(p.type)
          )}${p.brand_model ? " · " + kacis(p.brand_model) : ""}</div>` +
          // Isin sekli: pin tek nokta gosterir, isin gercek buyuklugu burada.
          (sekil
            ? `<div style="font-size:11px;color:#b45309;font-weight:600;margin-bottom:4px">` +
              `${kacis(TALEP_SEKIL_ETIKETLERI[sekil.tip])}${olcu ? " · " + kacis(olcu) : ""}` +
              `</div>`
            : "") +
          (p.talep_notu
            ? `<div style="font-size:11px;color:#475569;line-height:1.4;margin-bottom:6px;` +
              `border-left:2px solid #fcd34d;padding-left:6px">${kacis(p.talep_notu)}</div>`
            : "") +
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
      // Is silinmez, "Tamamlanan İşler" listesine taşınır.
      await queryClient.invalidateQueries({ queryKey: ["saha"] });
      setDurum({ ok: true, metin: `"${ad}" işi tamamlandı olarak işaretlendi.` });
    } catch (e) {
      setDurum({ ok: false, metin: (e as Error).message });
    } finally {
      setTamirEdilen(null);
      setOnayBekleyen(null);
    }
  };

  /** Bolge/guzergah kapatma ve geri alma; bakim gorevleriyle ayni desen. */
  const bolgeDurumDegis = async (id: string, ad: string, tamamlandi: boolean) => {
    setBolgeIslemde(id);
    try {
      await bolgeTamamla(id, tamamlandi);
      await queryClient.invalidateQueries({ queryKey: ["saha"] });
      setDurum({
        ok: true,
        metin: tamamlandi
          ? `"${ad}" tamamlandı olarak işaretlendi.`
          : `"${ad}" geri alındı, yeniden aktif.`,
      });
    } catch (e) {
      setDurum({ ok: false, metin: (e as Error).message });
    } finally {
      setBolgeIslemde(null);
      setBolgeOnayBekleyen(null);
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

  /* --- Iki kabugun paylastigi panel icerigi ---
     JSX burada bir kez kurulur, asagida ya masaustu yan paneline ya da mobil
     sheet'ine yerlestirilir; iki kabuk arasinda kopyalanan tek satir yok. */
  const panelIcerigi = (
    <>
          {/* Ust ozet: is yuku + konum yayininin canli olup olmadigi (personel
              ekibi haritada ancak konum gelirse gorur). */}
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 p-4 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Görevlerim</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Tamamladıkça "Tamir Edildi" ile kapatın.
                </p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${
                  benimKonumum
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-slate-100 text-slate-500 ring-slate-200"
                }`}
                title={
                  benimKonumum
                    ? "Konumunuz personele canlı iletiliyor"
                    : "Konum henüz alınamadı"
                }
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    benimKonumum ? "animate-pulse bg-emerald-500" : "bg-slate-400"
                  }`}
                />
                {benimKonumum ? "Konum canlı" : "Konum yok"}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <OzetKutusu
                etiket="Aktif"
                deger={gorevler.length}
                renk="amber"
                ikon={IconWarning}
              />
              <OzetKutusu
                etiket="Bitti"
                deger={tamamlananlar.length + tamamlananBolgeler.length}
                renk="emerald"
                ikon={IconCheck}
              />
              <OzetKutusu
                etiket="Bölge"
                deger={aktifBolgeler.length}
                renk="violet"
                ikon={IconLasso}
              />
            </div>

            {konumHatasi && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                <IconWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{konumHatasi}</span>
              </p>
            )}
            {durum && (
              <div
                className={`mt-3 flex items-start justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
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

          {/* Ekibe atanmis calisma alanlari ve hatlar; haritada kesik cizgili.
              Tamamlananlar asagidaki "Tamamlanan İşler"e duser. */}
          {aktifBolgeler.length > 0 && (
            <div className="space-y-4 border-b border-slate-200 bg-white px-4 py-3.5">
              {aktifAlanlar.length > 0 && (
                <section>
                  <BolumBasligi
                    baslik="Görev Bölgem"
                    altBaslik="Çalışacağım alan"
                    ikon={IconLasso}
                    renk="violet"
                    sayi={aktifAlanlar.length}
                  />
                  <ul className="mt-2 space-y-1.5">
                    {aktifAlanlar.map((b) => (
                      <BolgeKarti
                        key={b.id}
                        bolge={b}
                        olcu={b.alan_m2 != null ? alanEtiketi(b.alan_m2) : "Alan"}
                        vurgu="hover:border-violet-300"
                        islemde={bolgeIslemde === b.id}
                        onayBekliyor={bolgeOnayBekleyen === b.id}
                        onGit={() =>
                          setUcus({
                            anahtar: crypto.randomUUID(),
                            merkez: b.noktalar[0][0],
                            zoom: 13,
                          })
                        }
                        onOnayIste={() => setBolgeOnayBekleyen(b.id)}
                        onVazgec={() => setBolgeOnayBekleyen(null)}
                        onTamamla={() => bolgeDurumDegis(b.id, b.ad, true)}
                      />
                    ))}
                  </ul>
                </section>
              )}

              {aktifGuzergahlar.length > 0 && (
                <section>
                  <BolumBasligi
                    baslik="Güzergâhlarım"
                    altBaslik="İzleyeceğim hat"
                    ikon={IconRoute}
                    renk="blue"
                    sayi={aktifGuzergahlar.length}
                  />
                  <ul className="mt-2 space-y-1.5">
                    {aktifGuzergahlar.map((b) => (
                      <BolgeKarti
                        key={b.id}
                        bolge={b}
                        olcu={
                          b.uzunluk_m != null ? mesafeEtiketi(b.uzunluk_m) : "Güzergâh"
                        }
                        vurgu="hover:border-blue-300"
                        islemde={bolgeIslemde === b.id}
                        onayBekliyor={bolgeOnayBekleyen === b.id}
                        onGit={() =>
                          setUcus({
                            anahtar: crypto.randomUUID(),
                            merkez: b.noktalar[0][0],
                            zoom: 14,
                          })
                        }
                        onOnayIste={() => setBolgeOnayBekleyen(b.id)}
                        onVazgec={() => setBolgeOnayBekleyen(null)}
                        onTamamla={() => bolgeDurumDegis(b.id, b.ad, true)}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 p-4">
            {gorevSorgu.isLoading ? (
              <p className="text-xs text-slate-400">Yükleniyor…</p>
            ) : gorevSorgu.isError ? (
              <p className="text-xs text-red-600">
                Görevler yüklenemedi: {(gorevSorgu.error as Error).message}
              </p>
            ) : gorevler.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                  <IconCheck className="h-5 w-5" />
                </span>
                <p className="text-sm font-medium text-slate-700">
                  Bekleyen görev yok
                </p>
                <p className="text-xs text-slate-400">
                  Yeni bir iş atandığında burada görünür.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                <li>
                  <BolumBasligi
                    baslik="Bakım İşlerim"
                    altBaslik="En yakından uzağa"
                    ikon={IconWarning}
                    renk="amber"
                    sayi={gorevler.length}
                  />
                </li>
                {siraliGorevler.map(({ gorev: g, mesafe }, sira) => {
                  const p = g.properties;
                  const Ikon = tipIkonu(p.type);
                  const fotoSrc = fotoUrl(p.photo_url);
                  const sekil = gorevSekli(p);
                  const olcu = sekilOlcusu(sekil);
                  const detayAcik = acikDetay === p.assignment_id;
                  return (
                    <li
                      key={p.assignment_id}
                      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-emerald-300 hover:shadow"
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
                        <div className="relative shrink-0">
                          {fotoSrc ? (
                            <img
                              src={fotoSrc}
                              alt=""
                              className="h-14 w-14 rounded-md border border-slate-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-md border border-slate-200 bg-slate-50">
                              <Ikon className="h-6 w-6 text-slate-400" />
                            </div>
                          )}
                          {/* Sira rozeti = gidis sirasi (en yakindan uzaga). */}
                          <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white ring-2 ring-white">
                            {sira + 1}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {p.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {turAdi(p.type)}
                            {p.brand_model ? ` · ${p.brand_model}` : ""}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                              <IconWarning className="h-3 w-3" />
                              Bakım Lazım
                            </span>
                            {/* Isin sekli: nokta islerde rozet cizilmez, pin
                                zaten tek yeri gosteriyor. */}
                            {sekil && (
                              <span
                                className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-300"
                                title="İşin kapsadığı alan/hat - haritada düz çizgiyle gösterilir"
                              >
                                {sekil.tip === "LineString" ? (
                                  <IconRoute className="h-3 w-3" />
                                ) : (
                                  <IconLasso className="h-3 w-3" />
                                )}
                                {TALEP_SEKIL_ETIKETLERI[sekil.tip]}
                                {olcu ? ` · ${olcu}` : ""}
                              </span>
                            )}
                            {mesafe != null && (
                              <span
                                className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600"
                                title="Konumunuza kuş uçuşu mesafe"
                              >
                                <IconRoute className="h-3 w-3" />
                                {mesafeEtiketi(mesafe)}
                              </span>
                            )}
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

                      {/* Ayrinti: vatandasin aciklamasi + fotograf + kunye.
                          `assets`te not sutunu olmadigi icin "hangi bank
                          kirik" bilgisi yalnizca buradan okunabilir. Karta hep
                          basili olsaydi liste okunmaz hale gelirdi; kapali
                          durumda yalnizca ilk satiri sizar. */}
                      <div className="border-t border-slate-100">
                        <button
                          onClick={() =>
                            setAcikDetay(detayAcik ? null : p.assignment_id)
                          }
                          aria-expanded={detayAcik}
                          className="flex w-full items-center gap-1 px-2.5 py-1.5 text-left text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                        >
                          <IconChevronRight
                            className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                              detayAcik ? "rotate-90" : ""
                            }`}
                          />
                          <span className="shrink-0">
                            {detayAcik ? "Ayrıntıyı gizle" : "Ayrıntı"}
                          </span>
                          {!detayAcik && p.talep_notu && (
                            <span className="min-w-0 flex-1 truncate font-normal text-slate-400">
                              · {p.talep_notu}
                            </span>
                          )}
                        </button>

                        {detayAcik && (
                          <div className="space-y-2 border-t border-slate-100 bg-slate-50 p-2.5">
                            {p.talep_notu ? (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                  Vatandaşın açıklaması
                                </p>
                                <p className="mt-1 whitespace-pre-line rounded border-l-2 border-amber-300 bg-white px-2 py-1.5 text-xs leading-relaxed text-slate-700">
                                  {p.talep_notu}
                                </p>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400">
                                Bu iş için bir açıklama girilmemiş.
                              </p>
                            )}

                            {fotoSrc && (
                              <img
                                src={fotoSrc}
                                alt=""
                                className="max-h-56 w-full rounded border border-slate-200 object-cover"
                              />
                            )}

                            <dl className="space-y-1">
                              <DetaySatiri
                                etiket="Tür"
                                deger={turAdi(p.type)}
                              />
                              {p.brand_model && (
                                <DetaySatiri
                                  etiket="Marka / model"
                                  deger={p.brand_model}
                                />
                              )}
                              {olcu && (
                                <DetaySatiri etiket="İşin büyüklüğü" deger={olcu} />
                              )}
                              {p.talep_tarihi && (
                                <DetaySatiri
                                  etiket="Talep tarihi"
                                  deger={new Date(p.talep_tarihi).toLocaleString(
                                    "tr-TR"
                                  )}
                                />
                              )}
                              <DetaySatiri
                                etiket="Size atandı"
                                deger={new Date(p.assigned_at).toLocaleString(
                                  "tr-TR"
                                )}
                              />
                              <DetaySatiri
                                etiket="Konum"
                                deger={`${g.geometry.coordinates[1].toFixed(5)}, ${g.geometry.coordinates[0].toFixed(5)}`}
                              />
                            </dl>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5 border-t border-slate-100 p-2">
                        <button
                          onClick={() =>
                            yolTarifiAc(
                              g.geometry.coordinates[0],
                              g.geometry.coordinates[1]
                            )
                          }
                          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                        >
                          <IconRoute className="h-3.5 w-3.5" />
                          Yol tarifi al
                        </button>

                        {onayBekleyen === p.asset_id ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setOnayBekleyen(null)}
                              disabled={tamirEdilen === p.asset_id}
                              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                            >
                              Vazgeç
                            </button>
                            <button
                              onClick={() => tamirEt(p.asset_id, p.name)}
                              disabled={tamirEdilen === p.asset_id}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
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
                            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
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

            {/* Tamamlanan isler silinmez; yanlislikla isaretlenirse buradan
                geri alinabilir. */}
            {tamamlananlar.length + tamamlananBolgeler.length > 0 && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <BolumBasligi
                  baslik="Tamamlanan İşler"
                  altBaslik="Geri alınabilir"
                  ikon={IconCheck}
                  renk="emerald"
                  sayi={tamamlananlar.length + tamamlananBolgeler.length}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Yanlışlıkla tamamladıysanız "Geri Al" ile yeniden aktif hale
                  getirebilirsiniz.
                </p>
                <ul className="mt-2 space-y-2">
                  {/* Bolgeler bakim isleriyle ayni listede, tur ikonuyla. */}
                  {tamamlananBolgeler.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50"
                        style={{ color: b.renk }}
                      >
                        {b.tip === "alan" ? (
                          <IconLasso className="h-4 w-4" />
                        ) : (
                          <IconRoute className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-700 line-through decoration-slate-300">
                          {b.ad}
                        </p>
                        <p className="text-[11px] text-emerald-700">
                          {b.tip === "alan" ? "Görev bölgesi" : "Güzergâh"} ·
                          tamamlandı
                          {b.tamamlandi_at
                            ? ` · ${new Date(b.tamamlandi_at).toLocaleString("tr-TR")}`
                            : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => bolgeDurumDegis(b.id, b.ad, false)}
                        disabled={bolgeIslemde === b.id}
                        className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                      >
                        {bolgeIslemde === b.id ? "Geri alınıyor…" : "↩ Geri Al"}
                      </button>
                    </li>
                  ))}
                  {tamamlananlar.map((g) => {
                    const p = g.properties;
                    const Ikon = tipIkonu(p.type);
                    return (
                      <li
                        key={p.assignment_id}
                        className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50">
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
                          className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
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
    </>
  );

  const harita = (
    <KonumSecMap
      secili={null}
      onSec={() => {}}
      tiklanabilir={false}
      isaretler={isaretler}
      alanlar={haritaAlanlari}
      benimKonumum={benimKonumum}
      ucus={ucus}
    />
  );

  // --- Mobil kabuk ---
  if (mobil) {
    return (
      <div className="ekran-yuksekligi flex w-screen flex-col overflow-hidden bg-slate-100">
        <header className="z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 shadow-sm shadow-emerald-600/30">
              <IconPin className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-sm font-semibold tracking-tight text-slate-900">
                GreenAsset · Saha
              </h1>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[11px] text-slate-500">
                  {user?.full_name || user?.email}
                </span>
                <DepartmanEtiketi kod={user?.departman} />
              </div>
            </div>
          </div>
          <button
            onClick={cikisYap}
            aria-label="Çıkış yap"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm"
          >
            <IconLogout className="h-4 w-4" />
          </button>
        </header>

        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0">{harita}</div>

          {/* Sheet kapaliyken haritayi tam gormek icin; seritteki sayilar
              paneli acmadan da "kac isim var" sorusunu cevaplar. */}
          {!sheetAcik && (
            <button
              type="button"
              onClick={() => setSheetAcik(true)}
              aria-label="Görevlerimi aç"
              className="guvenli-alt absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-slate-200 bg-white px-4 py-3 text-left"
            >
              <span className="text-sm font-semibold text-slate-800">
                Görevlerim
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {gorevler.length} aktif
              </span>
              {aktifBolgeler.length > 0 && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                  {aktifBolgeler.length} bölge
                </span>
              )}
              <IconChevronRight className="ml-auto h-4 w-4 -rotate-90 text-slate-400" />
            </button>
          )}

          <Sheet
            acik={sheetAcik}
            baslik="Görevlerim"
            onKapat={() => setSheetAcik(false)}
            baslikSinifi="border-slate-200 bg-slate-50"
            ikon={
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white">
                <IconWarning className="h-4 w-4" />
              </span>
            }
            govdeSinifi="flex-1 overflow-y-auto overscroll-contain bg-slate-50"
          >
            {panelIcerigi}
          </Sheet>
        </div>
      </div>
    );
  }

  // --- Masaustu kabugu (degismedi) ---
  return (
    <div className="ekran-yuksekligi flex w-screen flex-col overflow-hidden bg-slate-100">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setPanelAcik((v) => !v)}
            aria-label="Görev panelini aç/kapat"
            aria-pressed={panelAcik}
            title="Görev paneli"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <IconMenu className="h-5 w-5" />
          </button>

          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 shadow-sm shadow-emerald-600/30">
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
          {/* Ekip hangi mudurlugun isini aldigini gormeli: otomatik atama
              departmana gore de suzuluyor (bkz. en_yakin_uygun_ekip). */}
          <div className="flex flex-col items-end leading-tight">
            <span className="text-xs text-slate-500">
              {user?.full_name || user?.email}
            </span>
            <DepartmanEtiketi kod={user?.departman} className="mt-0.5" />
          </div>
          <button
            onClick={cikisYap}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-red-500"
          >
            <IconLogout className="h-3.5 w-3.5" />
            Çıkış
          </button>
        </div>
      </header>

      {/* Panel haritanin uzerine biner: akista olsaydi acilip kapanmasi
          haritayi yeniden boyutlandirir ve goruntu titrerdi. */}
      <div className="relative min-h-0 flex-1">
        {/* Sol: gorev listesi */}
        <aside
          className={`absolute inset-y-0 left-0 z-30 flex flex-col overflow-y-auto overflow-x-hidden border-r bg-slate-50 transition-[width] duration-200 ease-out ${
            panelAcik
              ? "w-[380px] border-slate-200 shadow-lg"
              : "w-0 border-transparent"
          }`}
        >
         <div className="flex min-h-full w-[380px] shrink-0 flex-col">
          {panelIcerigi}
         </div>
        </aside>

        {/* Harita: gorev pinleri + kendi konumu + gorev bolgesi */}
        <div className="absolute inset-0">{harita}</div>
      </div>
    </div>
  );
}

/** Bolum basligi renkleri (acik Tailwind sinif adlari). */
const BOLUM_RENKLERI = {
  amber: {
    rozet: "bg-amber-500 text-white shadow-amber-500/30",
    cizgi: "border-amber-200",
    sayac: "bg-amber-100 text-amber-700",
  },
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
  emerald: {
    rozet: "bg-emerald-600 text-white shadow-emerald-600/30",
    cizgi: "border-emerald-200",
    sayac: "bg-emerald-100 text-emerald-700",
  },
};

/** Sol paneldeki bolum basligi (BolgePaneli'ndeki ile ayni dil): ekran uc ayri
 *  is turunu yan yana listeledigi icin bilincli olarak belirgin. */
function BolumBasligi({
  baslik,
  altBaslik,
  ikon: Ikon,
  renk,
  sayi,
}: {
  baslik: string;
  altBaslik: string;
  ikon: (p: { className?: string }) => React.ReactElement;
  renk: keyof typeof BOLUM_RENKLERI;
  sayi: number;
}) {
  const r = BOLUM_RENKLERI[renk];
  return (
    <div className={`flex items-center gap-2 border-b-2 pb-1.5 ${r.cizgi}`}>
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
        {sayi}
      </span>
    </div>
  );
}

/** Bolge/guzergah karti: tiklayinca haritada o kayda ucar, "Tamamlandı" ile
 *  iki adimli onaydan gecerek kapatilir. */
function BolgeKarti({
  bolge,
  olcu,
  vurgu,
  islemde,
  onayBekliyor,
  onGit,
  onOnayIste,
  onVazgec,
  onTamamla,
}: {
  bolge: Bolge;
  olcu: string;
  vurgu: string;
  islemde: boolean;
  onayBekliyor: boolean;
  onGit: () => void;
  onOnayIste: () => void;
  onVazgec: () => void;
  onTamamla: () => void;
}) {
  return (
    <li className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        onClick={onGit}
        className={`flex w-full items-stretch gap-2.5 p-2.5 text-left transition hover:shadow ${vurgu}`}
      >
        {/* Kaydin rengini tasiyan ince dikey serit. */}
        <span
          className="w-px shrink-0 rounded-full"
          style={{ background: bolge.renk }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-800">
            {bolge.ad}
          </span>
          <span className="block text-xs text-slate-500">
            {olcu} · haritada kesik çizgili
          </span>
          {bolge.aciklama && (
            <span className="mt-0.5 block text-[11px] text-slate-400">
              {bolge.aciklama}
            </span>
          )}
        </span>
      </button>
      <div className="border-t border-slate-100 p-2">
        {onayBekliyor ? (
          <div className="flex gap-1.5">
            <button
              onClick={onVazgec}
              disabled={islemde}
              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              onClick={onTamamla}
              disabled={islemde}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              <IconCheck className="h-3.5 w-3.5" />
              {islemde ? "Kaydediliyor…" : "Evet, tamamla"}
            </button>
          </div>
        ) : (
          <button
            onClick={onOnayIste}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
          >
            <IconCheck className="h-3.5 w-3.5" />
            Tamamlandı olarak işaretle
          </button>
        )}
      </div>
    </li>
  );
}

/** Gorev ayrintisindaki tek kunye satiri (etiket solda, deger sagda). */
function DetaySatiri({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px]">
      <dt className="shrink-0 text-slate-400">{etiket}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-slate-700">
        {deger}
      </dd>
    </div>
  );
}

/** Ozet kutusu renkleri; Tailwind JIT sablon dizgilerini taramaz. */
const OZET_RENKLERI: Record<string, string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
};

/** Ust ozetteki kucuk sayac kutusu (aktif is / biten is / gorev bolgesi). */
function OzetKutusu({
  etiket,
  deger,
  renk,
  ikon: Ikon,
}: {
  etiket: string;
  deger: number;
  renk: keyof typeof OZET_RENKLERI;
  ikon: (p: { className?: string }) => React.ReactElement;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 ${OZET_RENKLERI[renk]}`}
    >
      <Ikon className="h-3.5 w-3.5" />
      <span className="text-base font-bold leading-none tabular-nums">{deger}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
        {etiket}
      </span>
    </div>
  );
}
