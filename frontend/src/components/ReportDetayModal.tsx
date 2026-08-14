import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getAsset } from "../api/assets";
import { approveReport, fotoUrl, rejectReport, reopenReport } from "../api/reports";
import { gorevDurumu } from "../api/saha";
import { useKonumCozumu } from "../hooks/useSinirlar";
import { turAdi, turKodlari } from "../data/turSozlugu";
import { durumEtiketi, type AssetType } from "../types/asset";
import { talepNoktasi } from "../types/report";
import type { ReportFeature } from "../types/report";
import { AksiyonButonu, AksiyonSeridi } from "./Aksiyonlar";
import { IconCheck } from "./icons";
import TalepDurumRozeti from "./TalepDurumRozeti";
import Modal from "./Modal";
import TipSecenekleri from "./TipSecenekleri";

interface ReportDetayModalProps {
  report: ReportFeature | null;
  onKapat: () => void;
  /** Personel (admin/calisan) ise bekleyen talebi buradan onaylayip reddedebilir. */
  islemYetkisi?: boolean;
  onIslemBitti?: () => void;
  /** Onaylanmis talepte "Varlığı Yönet": ondan olusan varligin detay/yonetim
   *  modalini acar (haritadaki popup ile ayni islem). */
  onVarligiYonet?: (raporId: string) => void;
}

export default function ReportDetayModal({
  report,
  onKapat,
  islemYetkisi = false,
  onIslemBitti,
  onVarligiYonet,
}: ReportDetayModalProps) {
  const koord = report ? talepNoktasi(report) : null;
  const { data: konum } = useKonumCozumu(koord ? koord[1] : null, koord ? koord[0] : null);
  const [islemde, setIslemde] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  // Secim hangi talep icin yapildigiyla birlikte tutulur, boylece baska bir
  // talebe gecince "duzeltildi" isareti yanlislikla yanmaz (sifirlayan effect gerekmez).
  const [tipSecim, setTipSecim] = useState<{ raporId: string; tip: AssetType } | null>(
    null
  );

  const varlikId =
    report?.properties.status === "onaylandi"
      ? report.properties.created_asset_id
      : null;
  const { data: varlik, isLoading: varlikYukleniyor } = useQuery({
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

        {/* Tur duzeltme burada: fotografin gorulup karar verildigi ekran.
            Paneldeki satir ici "Onayla" vatandasin turunu aynen kabul eder. */}
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
            {onVarligiYonet && (
              <AksiyonSeridi>
                <AksiyonButonu tur="birincil" onClick={() => onVarligiYonet(p.id)}>
                  Varlığı Yönet
                </AksiyonButonu>
              </AksiyonSeridi>
            )}
          </div>
        )}

        {/* Onaylanmis taleplerde yoktur: onay bir varlik olusturdugundan geri alinamaz. */}
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
