import { useEffect, useState } from "react";

import { fotoUrl } from "../api/reports";
import { ekibeAta } from "../api/saha";
import { useKonumCozumu } from "../hooks/useSinirlar";
import {
  ASSET_SOURCE_LABELS,
  ASSET_TYPE_LABELS,
  durumEtiketi,
  kalanSilmeGunu,
  type AssetFeature,
} from "../types/asset";
import { MAKS_AKTIF_GOREV, type EkipOzet } from "../types/saha";
import { IconCheck } from "./icons";
import Modal from "./Modal";

interface AssetDetayModalProps {
  asset: AssetFeature | null;
  onKapat: () => void;
  /** Personel (admin/calisan) ise bakim varligini elle bir ekibe yonlendirebilir. */
  atayabilir?: boolean;
  /** Elle atama icin secilebilecek saha ekipleri (canli yuk bilgisiyle). */
  ekipler?: EkipOzet[];
  /** Basarili atama sonrasi (liste/ekip ozetini tazelemek icin). */
  onAtandi?: () => void;
}

/** Bir varligin tum detaylarini (foto dahil) kucuk bir pop up icinde gosterir.
 *  Saha calisaninin ihbar edilen varligi sahada bulmasini kolaylastirmak icin
 *  fotograf her zaman (varsa) gorunur olur. */
export default function AssetDetayModal({
  asset,
  onKapat,
  atayabilir = false,
  ekipler,
  onAtandi,
}: AssetDetayModalProps) {
  const koord = asset ? asset.geometry.coordinates : null;
  const { data: konum } = useKonumCozumu(koord ? koord[1] : null, koord ? koord[0] : null);

  const [seciliEkip, setSeciliEkip] = useState("");
  const [atamaHatasi, setAtamaHatasi] = useState<string | null>(null);
  const [atamaBasari, setAtamaBasari] = useState<string | null>(null);
  const [atanıyor, setAtaniyor] = useState(false);

  // Varlik degisince atama durumunu sifirla.
  useEffect(() => {
    setSeciliEkip("");
    setAtamaHatasi(null);
    setAtamaBasari(null);
  }, [asset?.properties.id]);

  if (!asset) return null;
  const p = asset.properties;
  const [lng, lat] = asset.geometry.coordinates;
  const bakim = p.status === "bakim_lazim";
  const fotoSrc = fotoUrl(p.photo_url);
  const konumMetni = konum
    ? [konum.mahalle?.ad, konum.ilce?.ad].filter(Boolean).join(", ")
    : "";
  const kalanGun =
    p.source === "ihbar" && p.status === "iyi"
      ? kalanSilmeGunu(p.repaired_at)
      : null;

  // Elle yonlendirme yalnizca bakim bekleyen varliklarda ve personele acilir.
  const atamaGoster = atayabilir && bakim;

  const atamaYap = async () => {
    if (!seciliEkip) return;
    setAtaniyor(true);
    setAtamaHatasi(null);
    setAtamaBasari(null);
    try {
      await ekibeAta(p.id, seciliEkip);
      const ek = ekipler?.find((x) => x.id === seciliEkip);
      setAtamaBasari(`${ek?.full_name || ek?.email || "Ekip"} ekibine yönlendirildi`);
      setSeciliEkip("");
      onAtandi?.();
    } catch (e) {
      setAtamaHatasi((e as Error).message);
    } finally {
      setAtaniyor(false);
    }
  };

  return (
    <Modal acik={asset !== null} baslik="Varlık Detayı" onKapat={onKapat}>
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

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] font-medium ${
              bakim
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-emerald-300 bg-emerald-50 text-emerald-800"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${bakim ? "bg-amber-500" : "bg-emerald-500"}`}
            />
            {durumEtiketi(p.status, p.source)}
          </span>
          <span
            className={`inline-flex items-center border px-1.5 py-0.5 text-[11px] font-medium ${
              p.source === "ihbar"
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-emerald-300 bg-emerald-50 text-emerald-800"
            }`}
          >
            {ASSET_SOURCE_LABELS[p.source]}
          </span>
        </div>

        {kalanGun !== null && (
          <p className="border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {kalanGun === 0
              ? "Bu varlık tamir edildiği için bugün otomatik silinecek."
              : `Bu varlık tamir edildi; ${kalanGun} gün sonra otomatik silinecek.`}
          </p>
        )}

        <dl className="space-y-1.5 text-xs">
          {p.brand_model && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Marka / Model</dt>
              <dd className="text-right text-slate-800">{p.brand_model}</dd>
            </div>
          )}
          {p.install_date && (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Kurulum Tarihi</dt>
              <dd className="text-slate-800">{p.install_date}</dd>
            </div>
          )}
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
            <dt className="text-slate-500">Eklenme Tarihi</dt>
            <dd className="text-slate-800">
              {new Date(p.created_at).toLocaleString("tr-TR")}
            </dd>
          </div>
        </dl>

        {atamaGoster && (
          <div className="border-t border-slate-200 pt-3">
            <p className="mb-1.5 text-xs font-semibold text-slate-700">
              Saha ekibine yönlendir
            </p>
            <div className="flex gap-2">
              <select
                value={seciliEkip}
                onChange={(e) => setSeciliEkip(e.target.value)}
                className="min-w-0 flex-1 border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Ekip seçin…</option>
                {(ekipler ?? []).map((e) => {
                  const dolu = e.aktif_gorev >= MAKS_AKTIF_GOREV;
                  return (
                    <option key={e.id} value={e.id} disabled={dolu}>
                      {(e.full_name || e.email) +
                        ` (${e.aktif_gorev}/${MAKS_AKTIF_GOREV}` +
                        (dolu ? " · dolu)" : ")") +
                        (e.last_seen_at ? "" : " · konum yok")}
                    </option>
                  );
                })}
              </select>
              <button
                onClick={atamaYap}
                disabled={!seciliEkip || atanıyor}
                className="flex shrink-0 items-center gap-1.5 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                <IconCheck className="h-3.5 w-3.5" />
                {atanıyor ? "…" : "Ata"}
              </button>
            </div>
            {atamaHatasi && (
              <p className="mt-1.5 text-xs text-red-600">{atamaHatasi}</p>
            )}
            {atamaBasari && (
              <p className="mt-1.5 text-xs text-emerald-700">{atamaBasari}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
