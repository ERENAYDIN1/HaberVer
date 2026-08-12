import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getAsset } from "../api/assets";
import { approveReport, fotoUrl, rejectReport, reopenReport } from "../api/reports";
import { gorevDurumu } from "../api/saha";
import { useKonumCozumu } from "../hooks/useSinirlar";
import { turAdi, turKodlari } from "../data/turSozlugu";
import { durumEtiketi, type AssetType } from "../types/asset";
import { sekilliTalep, talepNoktasi } from "../types/report";
import type { ReportFeature } from "../types/report";
import { AksiyonButonu, AksiyonSeridi } from "./Aksiyonlar";
import { IconCheck } from "./icons";
import TalepDurumRozeti from "./TalepDurumRozeti";
import Modal from "./Modal";
import TipSecenekleri from "./TipSecenekleri";

interface ReportDetayModalProps {
  report: ReportFeature | null;
  onKapat: () => void;
  /** Personel (admin/calisan) ise bekleyen talebi buradan onaylayip
   *  reddedebilir - haritadaki isaretciden de islem yapilabilmesi icin. */
  islemYetkisi?: boolean;
  /** Onay/ret basarili olunca (ust bilesen sorgulari tazeler, modali kapatir). */
  onIslemBitti?: () => void;
  /** Onaylanmis talepte "Varlığı Yönet": ondan olusan varligin detay/yonetim
   *  modalini acar. Haritadaki popup'in ayni adli dugmesiyle TEK islemdir -
   *  talep ekrani ile varlik ekrani arasindaki tek gecis noktasi. */
  onVarligiYonet?: (raporId: string) => void;
  /** "Şekli Düzenle": vatandasin cizdigi CIZGI/ALAN yanlis olabilir - haritada
   *  koseleri surukleyerek duzeltme modunu acar (kaydedilmis bolge/guzergah
   *  seklinin duzenlenmesiyle ayni mekanizma). Yalnizca cizgi/alan taleplerde
   *  gosterilir; nokta taleplerde "sekil" diye bir sey yok. */
  onSekilDuzenle?: (report: ReportFeature) => void;
}

/** Bir talebin (bekleyen/onaylanmis/reddedilen) tum detaylarini (foto dahil)
 *  kucuk bir pop up icinde gosterir - AssetDetayModal ile ayni tasarim
 *  dilini kullanir, boylece "Detay" her yerde tek, tutarli bir modal acar. */
export default function ReportDetayModal({
  report,
  onKapat,
  islemYetkisi = false,
  onIslemBitti,
  onVarligiYonet,
  onSekilDuzenle,
}: ReportDetayModalProps) {
  const koord = report ? talepNoktasi(report) : null;
  const { data: konum } = useKonumCozumu(koord ? koord[1] : null, koord ? koord[0] : null);
  const [islemde, setIslemde] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  // Onayda uygulanacak tur, hangi talep icin secildigiyle birlikte tutulur:
  // kayit yoksa ya da baska bir talebe gecildiyse vatandasin sectigi tur
  // gecerlidir. Boylece ilk render'da "duzeltildi" isareti yanlislikla yanmaz
  // ve modal baska bir talebe gecerken sifirlayan bir effect'e gerek kalmaz.
  const [tipSecim, setTipSecim] = useState<{ raporId: string; tip: AssetType } | null>(
    null
  );

  // Onaylanmis talebin isi artik ondan olusan VARLIK uzerinden yurur. O varligin
  // guncel durumu burada salt-okunur gosterilir ki "Detay" bir cikmaz sokak
  // olmasin: kullanici ne oldugunu gormeden "Varlığı Yönet"e basmak zorunda
  // kalmasin. Islemler yine yalnizca varlik kartinda.
  const varlikId =
    report?.properties.status === "onaylandi"
      ? report.properties.created_asset_id
      : null;
  const { data: varlik, isLoading: varlikYukleniyor } = useQuery({
    // AssetDetayModal ile ayni anahtar sekli degil; tekil cekim burada yeterli.
    queryKey: ["assets", "tekil", varlikId],
    queryFn: () => getAsset(varlikId!),
    enabled: Boolean(islemYetkisi && varlikId),
  });
  // Anahtar AssetDetayModal'inkiyle ayni: ikisi ayni onbellek satirini paylasir.
  const { data: gorevDurum } = useQuery({
    queryKey: ["saha", "gorev", varlikId],
    queryFn: () => gorevDurumu(varlikId!),
    enabled: Boolean(
      islemYetkisi && varlikId && varlik?.properties.status === "bakim_lazim"
    ),
  });

  const islemYap = async (calistir: () => Promise<unknown>) => {
    setIslemde(true);
    setHata(null);
    try {
      await calistir();
      onIslemBitti?.();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setIslemde(false);
    }
  };

  if (!report) return null;
  const p = report.properties;
  const tip = tipSecim?.raporId === p.id ? tipSecim.tip : p.type;
  const [lng, lat] = talepNoktasi(report) ?? [0, 0];
  const fotoSrc = fotoUrl(p.photo_url);
  const konumMetni = konum
    ? [konum.mahalle?.ad, konum.ilce?.ad].filter(Boolean).join(", ")
    : "";

  return (
    <Modal acik={report !== null} baslik="Talep Detayı" onKapat={onKapat} ustte>
      <div className="space-y-3">
        {fotoSrc && (
          <img
            src={fotoSrc}
            alt=""
            className="max-h-52 w-full border border-slate-200 object-cover"
          />
        )}

        <div>
          <h3 className="text-base font-semibold text-slate-900">{p.name}</h3>
          <p className="text-xs text-slate-500">{turAdi(p.type)}</p>
        </div>

        <TalepDurumRozeti durum={p.status} />

        <dl className="space-y-1.5 text-xs">
          {konumMetni && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">İlçe / Mahalle</dt>
              <dd className="text-right text-slate-800">{konumMetni}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Koordinat</dt>
            <dd className="font-mono text-slate-800">
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Bildirim Tarihi</dt>
            <dd className="text-slate-800">
              {new Date(p.created_at).toLocaleString("tr-TR")}
            </dd>
          </div>
          {/* Sonuclanma tarihi (`reviewed_at`) hem onayda hem redde yazilir;
              etiket duruma gore degisir. Bekleyen talepte satir hic cikmaz. */}
          {p.reviewed_at && p.status !== "beklemede" && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">
                {p.status === "onaylandi" ? "Kabul Tarihi" : "Ret Tarihi"}
              </dt>
              <dd className="text-slate-800">
                {new Date(p.reviewed_at).toLocaleString("tr-TR")}
              </dd>
            </div>
          )}
        </dl>

        {(p.note || p.review_note) && (
          <div className="space-y-1.5 border-t border-slate-100 pt-2.5 text-xs">
            {p.note && (
              <p>
                <span className="font-medium text-slate-500">Açıklama: </span>
                <span className="text-slate-700">{p.note}</span>
              </p>
            )}
            {p.status === "reddedildi" && p.review_note && (
              <p>
                <span className="font-medium text-red-500">Ret nedeni: </span>
                <span className="text-red-600">{p.review_note}</span>
              </p>
            )}
          </div>
        )}

        {/* Sekil duzenleme: vatandas yol catlagini/alani yanlis cizmis olabilir.
            Yalnizca CIZGI/ALAN taleplerde (nokta talepte "sekil" yoktur) ve
            reddedilmemis durumda - reddedilmis kapanmis bir istir. ONAYLANDI
            durumunda "Varligi Yonet" ile AYNI seritte durur (asagida); burada
            yalnizca BEKLEMEDE durumu icin (o blokta "Varligi Yonet" yoktur). */}
        {islemYetkisi &&
          onSekilDuzenle &&
          sekilliTalep(report) &&
          p.status === "beklemede" && (
            <AksiyonSeridi>
              <AksiyonButonu tur="mor" onClick={() => onSekilDuzenle(report)}>
                Şekli Düzenle
              </AksiyonButonu>
              <span className="text-[11px] text-slate-500">
                Vatandaşın çizdiği şekil yanlışsa haritada düzeltin.
              </span>
            </AksiyonSeridi>
          )}

        {/* Onay/ret: haritadaki talep isaretcisinden de karar verilebilsin diye
            (popup -> "Detay" -> buradaki butonlar). Onay yeni bir bakim varligi
            olusturur ve otomatik atamayi tetikler (bkz. crud/report.py).

            Tur duzeltme bilincli olarak BURADA: fotografin gorulup gercek
            kararin verildigi ekran burasi. Paneldeki satir ici "Onayla"
            kisayolu vatandasin turunu aynen kabul eder. */}
        {islemYetkisi && p.status === "beklemede" && (
          <div className="space-y-2 border-t border-slate-100 pt-2.5">
            <div>
              <label
                className="mb-1 block text-[11px] font-medium text-slate-500"
                htmlFor="onay-tip"
              >
                Tür {tip !== p.type && <span className="text-amber-600">· düzeltildi</span>}
              </label>
              <select
                id="onay-tip"
                className="w-full border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                value={tip}
                onChange={(e) =>
                  setTipSecim({ raporId: p.id, tip: e.target.value as AssetType })
                }
                disabled={islemde}
              >
                <TipSecenekleri turler={turKodlari()} />
              </select>
              {tip !== p.type && (
                <p className="mt-1 text-[11px] text-amber-700">
                  Oluşacak varlık ve arşivlenen talep “{turAdi(tip)}”
                  olarak kaydedilecek.
                </p>
              )}
            </div>
            <AksiyonSeridi>
            <AksiyonButonu
              tur="birincil"
              onClick={() => islemYap(() => approveReport(p.id, tip))}
              disabled={islemde}
            >
              <IconCheck className="h-3.5 w-3.5" />
              {islemde ? "…" : "Onayla"}
            </AksiyonButonu>
            <AksiyonButonu
              tur="tehlikeIkincil"
              onClick={() => {
                const neden = window.prompt("Ret nedeni (opsiyonel):") ?? undefined;
                islemYap(() => rejectReport(p.id, neden || undefined));
              }}
              disabled={islemde}
            >
              Reddet
            </AksiyonButonu>
            </AksiyonSeridi>
          </div>
        )}

        {/* Onaylanmis talebin isi artik ondan olusan VARLIK uzerinden yurur
            (ekibe atama, tamir, duzenleme, silme). Once o varligin nerede
            oldugu ozetlenir, sonra tek gecis dugmesi gelir. */}
        {islemYetkisi && p.status === "onaylandi" && (
          <div className="space-y-2 border-t border-slate-100 pt-2.5">
            <div className="border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs">
              {varlik ? (
                <>
                  <div className="font-medium text-slate-900">
                    {varlik.properties.name}
                  </div>
                  <div className="mt-0.5 text-slate-600">
                    {durumEtiketi(varlik.properties.status, varlik.properties.source)}
                    {varlik.properties.status === "bakim_lazim" &&
                      (gorevDurum?.gorev
                        ? ` · ${gorevDurum.gorev.worker_ad} ekibinde`
                        : " · havuzda bekliyor")}
                  </div>
                </>
              ) : varlikYukleniyor ? (
                <span className="text-slate-500">Varlık bilgisi yükleniyor…</span>
              ) : (
                <span className="text-slate-500">
                  {varlikId
                    ? "Varlık bulunamadı — tamir sonrası otomatik silinmiş olabilir."
                    : "Bu talebe bağlı bir varlık kaydı yok."}
                </span>
              )}
            </div>
            {(onVarligiYonet || (onSekilDuzenle && sekilliTalep(report))) && (
              <AksiyonSeridi>
                {onVarligiYonet && (
                  <AksiyonButonu tur="birincil" onClick={() => onVarligiYonet(p.id)}>
                    Varlığı Yönet
                  </AksiyonButonu>
                )}
                {onSekilDuzenle && sekilliTalep(report) && (
                  <AksiyonButonu tur="mor" onClick={() => onSekilDuzenle(report)}>
                    Şekli Düzenle
                  </AksiyonButonu>
                )}
              </AksiyonSeridi>
            )}
          </div>
        )}

        {/* Reddi geri alma: yanlislikla reddedilen (ya da sonradan gecerli
            oldugu anlasilan) talep tekrar "beklemede"ye cekilir, boylece
            onaylanip varliga donusebilir. Onaylanmis taleplerde yoktur -
            onay bir varlik olusturdugundan geri alinamaz. */}
        {islemYetkisi && p.status === "reddedildi" && (
          <AksiyonSeridi>
            <AksiyonButonu
              tur="uyari"
              onClick={() => islemYap(() => reopenReport(p.id))}
              disabled={islemde}
            >
              {islemde ? "…" : "Reddi Geri Al"}
            </AksiyonButonu>
            <span className="text-[11px] text-slate-500">
              Talep tekrar “Bekleyen” listesine döner, ret nedeni silinir.
            </span>
          </AksiyonSeridi>
        )}

        {hata && <p className="text-xs text-red-600">{hata}</p>}
      </div>
    </Modal>
  );
}
