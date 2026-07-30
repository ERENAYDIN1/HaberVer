import { useState } from "react";

import { approveReport, fotoUrl, rejectReport, reopenReport } from "../api/reports";
import { useKonumCozumu } from "../hooks/useSinirlar";
import { ASSET_TYPES, ASSET_TYPE_LABELS, type AssetType } from "../types/asset";
import type { ReportFeature } from "../types/report";
import { AksiyonButonu, AksiyonSeridi } from "./Aksiyonlar";
import { IconCheck } from "./icons";
import IhbarDurumRozeti from "./IhbarDurumRozeti";
import Modal from "./Modal";
import TipSecenekleri from "./TipSecenekleri";

interface ReportDetayModalProps {
  report: ReportFeature | null;
  onKapat: () => void;
  /** Personel (admin/calisan) ise bekleyen ihbari buradan onaylayip
   *  reddedebilir - haritadaki isaretciden de islem yapilabilmesi icin. */
  islemYetkisi?: boolean;
  /** Onay/ret basarili olunca (ust bilesen sorgulari tazeler, modali kapatir). */
  onIslemBitti?: () => void;
  /** Onaylanmis ihbarda "Varlığı Yönet": ondan olusan varligin detay/yonetim
   *  modalini acar. Haritadaki popup'in ayni adli dugmesiyle TEK islemdir -
   *  ihbar ekrani ile varlik ekrani arasindaki tek gecis noktasi. */
  onVarligiYonet?: (raporId: string) => void;
}

/** Bir ihbarin (bekleyen/onaylanmis/reddedilen) tum detaylarini (foto dahil)
 *  kucuk bir pop up icinde gosterir - AssetDetayModal ile ayni tasarim
 *  dilini kullanir, boylece "Detay" her yerde tek, tutarli bir modal acar. */
export default function ReportDetayModal({
  report,
  onKapat,
  islemYetkisi = false,
  onIslemBitti,
  onVarligiYonet,
}: ReportDetayModalProps) {
  const koord = report ? report.geometry.coordinates : null;
  const { data: konum } = useKonumCozumu(koord ? koord[1] : null, koord ? koord[0] : null);
  const [islemde, setIslemde] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  // Onayda uygulanacak tur, hangi ihbar icin secildigiyle birlikte tutulur:
  // kayit yoksa ya da baska bir ihbara gecildiyse vatandasin sectigi tur
  // gecerlidir. Boylece ilk render'da "duzeltildi" isareti yanlislikla yanmaz
  // ve modal baska bir ihbara gecerken sifirlayan bir effect'e gerek kalmaz.
  const [tipSecim, setTipSecim] = useState<{ raporId: string; tip: AssetType } | null>(
    null
  );

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
  const [lng, lat] = report.geometry.coordinates;
  const fotoSrc = fotoUrl(p.photo_url);
  const konumMetni = konum
    ? [konum.mahalle?.ad, konum.ilce?.ad].filter(Boolean).join(", ")
    : "";

  return (
    <Modal acik={report !== null} baslik="İhbar Detayı" onKapat={onKapat}>
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
          <p className="text-xs text-slate-500">{ASSET_TYPE_LABELS[p.type]}</p>
        </div>

        <IhbarDurumRozeti durum={p.status} />

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
              etiket duruma gore degisir. Bekleyen ihbarda satir hic cikmaz. */}
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

        {/* Onay/ret: haritadaki ihbar isaretcisinden de karar verilebilsin diye
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
                <TipSecenekleri turler={ASSET_TYPES} />
              </select>
              {tip !== p.type && (
                <p className="mt-1 text-[11px] text-amber-700">
                  Oluşacak varlık ve arşivlenen ihbar “{ASSET_TYPE_LABELS[tip]}”
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

        {/* Onaylanmis ihbarin isi artik ondan olusan VARLIK uzerinden yurur
            (ekibe atama, tamir, duzenleme, silme). Bu dugme, haritadaki ihbar
            popup'indaki "Varlığı Yönet" ile ayni modali acar - iki yol da ayni
            yere ciksin diye. */}
        {islemYetkisi && p.status === "onaylandi" && onVarligiYonet && (
          <AksiyonSeridi>
            <AksiyonButonu tur="birincil" onClick={() => onVarligiYonet(p.id)}>
              Varlığı Yönet
            </AksiyonButonu>
            <span className="text-[11px] text-slate-500">
              Ekibe atama, tamir, düzenleme ve silme varlık kartında.
            </span>
          </AksiyonSeridi>
        )}

        {/* Reddi geri alma: yanlislikla reddedilen (ya da sonradan gecerli
            oldugu anlasilan) ihbar tekrar "beklemede"ye cekilir, boylece
            onaylanip varliga donusebilir. Onaylanmis ihbarlarda yoktur -
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
              İhbar tekrar “Bekleyen” listesine döner, ret nedeni silinir.
            </span>
          </AksiyonSeridi>
        )}

        {hata && <p className="text-xs text-red-600">{hata}</p>}
      </div>
    </Modal>
  );
}
