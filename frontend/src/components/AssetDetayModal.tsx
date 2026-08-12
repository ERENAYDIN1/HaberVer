import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { fotoUrl } from "../api/reports";
import { ekibeAta, gorevDurumu, gorevGeriAl } from "../api/saha";
import { useAuth } from "../auth/AuthContext";
import { useDeleteAsset, useRepairAsset } from "../hooks/useAssets";
import { useKonumCozumu } from "../hooks/useSinirlar";
import {
  useDepartmanlar,
  useTurDepartmanEslemesi,
} from "../hooks/useDepartmanlar";
import { turAdi } from "../data/turSozlugu";
import {
  ASSET_SOURCE_LABELS,
  durumEtiketi,
  kalanSilmeGunu,
  type AssetFeature,
} from "../types/asset";
import {
  MAKS_ATAMA_MESAFE_KM,
  yakaEtiketi,
  type EkipOzet,
} from "../types/saha";
import { AksiyonAyraci, AksiyonButonu, AksiyonSeridi, SilOnayi } from "./Aksiyonlar";
import EkipSecici from "./EkipSecici";
import { IconCheck, IconPin } from "./icons";
import Modal from "./Modal";

interface AssetDetayModalProps {
  asset: AssetFeature | null;
  onKapat: () => void;
  /** Personel ise bakim varligini elle bir ekibe yonlendirebilir. */
  atayabilir?: boolean;
  ekipler?: EkipOzet[];
  /** Soz donerse BEKLENIR: modal tazeleme bitmeden "islem bitti" dememeli. */
  onAtandi?: () => void | Promise<unknown>;
  /** Verilirse "Düzenle" cikar; formu acmak ust bilesenin isi. */
  onDuzenle?: (asset: AssetFeature) => void;
  /** Verilirse "Sil" cikar; silme bu modalin icinde yapilir. */
  onSilindi?: () => void;
  /** Verilirse "Konuma Git" cikar; modali acmak haritayi oynatmaz. */
  onGit?: (asset: AssetFeature) => void;
}

/** Varlik yonetimi icin gereken ortak prop kumesi; liste, talep paneli ve
 *  harita isaretcisi ayni yetenekleri sunsun diye tek yerde durur. */
export interface VarlikYonetimProplari {
  atayabilir: boolean;
  ekipler?: EkipOzet[];
  onAtandi: () => void | Promise<unknown>;
  onDuzenle?: (asset: AssetFeature) => void;
  onSilindi: () => void;
  onGit?: (asset: AssetFeature) => void;
}

export function useVarlikYonetimi({
  ekipler,
  onDuzenle,
  onGit,
  detayKapat,
}: {
  ekipler?: EkipOzet[];
  onDuzenle?: (asset: AssetFeature) => void;
  onGit?: (asset: AssetFeature) => void;
  detayKapat: () => void;
}): VarlikYonetimProplari {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const yetkili = user?.role !== "saha_calisani";
  return {
    atayabilir: yetkili,
    ekipler,
    // Soz DONDURULUR: "islem bitti" yeni veriden once gelmesin diye tazeleme
    // beklenir (bkz. AssetDetayModal::tazele).
    onAtandi: () => queryClient.invalidateQueries({ queryKey: ["saha"] }),
    onDuzenle:
      yetkili && onDuzenle
        ? (asset) => {
            detayKapat();
            onDuzenle(asset);
          }
        : undefined,
    onSilindi: detayKapat,
    onGit,
  };
}

export default function AssetDetayModal({
  asset,
  onKapat,
  atayabilir = false,
  ekipler,
  onAtandi,
  onDuzenle,
  onSilindi,
  onGit,
}: AssetDetayModalProps) {
  const koord = asset ? asset.geometry.coordinates : null;
  const { data: konum } = useKonumCozumu(koord ? koord[1] : null, koord ? koord[0] : null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const deleteAsset = useDeleteAsset();
  const repairAsset = useRepairAsset();
  const islemModu = Boolean(onDuzenle || onSilindi || onGit);
  const tamCrudYetkisi = user?.role !== "saha_calisani";

  const [atamaHatasi, setAtamaHatasi] = useState<string | null>(null);
  const [atamaBasari, setAtamaBasari] = useState<string | null>(null);
  const [atanıyor, setAtaniyor] = useState(false);

  const assetId = asset?.properties.id;
  const bakimVar = asset?.properties.status === "bakim_lazim";
  const atamaGoster = Boolean(atayabilir && bakimVar && assetId);

  const { data: durum, isLoading: gorevYukleniyor } = useQuery({
    queryKey: ["saha", "gorev", assetId],
    queryFn: () => gorevDurumu(assetId!),
    enabled: atamaGoster,
  });
  const { data: departmanlar } = useDepartmanlar();
  const { data: esleme } = useTurDepartmanEslemesi();
  const mevcutGorev = durum?.gorev ?? null;
  const varlikYaka = durum?.varlik_yaka ?? null;

  // Isin departmani turunden turetilir; elle atama yaka/departman kisitindan
  // muaftir ama EkipSecici personeli uyarir.
  const varlikDepartman = asset ? esleme?.[asset.properties.type] : undefined;

  useEffect(() => {
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

  // Soz beklenmezse "islem bitti" yeni veriden once gelir ve mevcutGorev
  // bir an eski atamayi gosterir (yeni havuza alinan kayit "zaten atalı" gorunur).
  const tazele = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["saha", "gorev", p.id] }),
      onAtandi?.(),
    ]);

  const atamaYap = async (workerId: string) => {
    setAtaniyor(true);
    setAtamaHatasi(null);
    setAtamaBasari(null);
    try {
      await ekibeAta(p.id, workerId);
      const ek = ekipler?.find((x) => x.id === workerId);
      setAtamaBasari(`${ek?.full_name || ek?.email || "Ekip"} ekibine yönlendirildi`);
      await tazele();
    } catch (e) {
      setAtamaHatasi((e as Error).message);
    } finally {
      setAtaniyor(false);
    }
  };

  const geriAlYap = async () => {
    setAtaniyor(true);
    setAtamaHatasi(null);
    setAtamaBasari(null);
    try {
      await gorevGeriAl(p.id);
      setAtamaBasari("Görev geri alındı; varlık havuzda bekliyor.");
      await tazele();
    } catch (e) {
      setAtamaHatasi((e as Error).message);
    } finally {
      setAtaniyor(false);
    }
  };

  return (
    <Modal acik={asset !== null} baslik="Varlık Detayı" onKapat={onKapat} ustte>
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

        {islemModu && (
          <AksiyonSeridi>
            {bakim && (
              <AksiyonButonu
                tur="birincil"
                onClick={() =>
                  repairAsset.mutate(p.id, { onSuccess: () => onKapat() })
                }
                disabled={repairAsset.isPending}
              >
                <IconCheck className="h-3.5 w-3.5" />
                {repairAsset.isPending ? "…" : "Tamir Edildi"}
              </AksiyonButonu>
            )}
            {tamCrudYetkisi && onDuzenle && (
              <AksiyonButonu onClick={() => onDuzenle(asset)}>Düzenle</AksiyonButonu>
            )}
            {onGit && (
              <>
                {(bakim || (tamCrudYetkisi && onDuzenle)) && <AksiyonAyraci />}
                <AksiyonButonu
                  tur="gezinme"
                  onClick={() => {
                    onGit(asset);
                    onKapat();
                  }}
                >
                  <IconPin className="h-3.5 w-3.5" />
                  Konuma Git
                </AksiyonButonu>
              </>
            )}
            {tamCrudYetkisi && onSilindi && (
              <SilOnayi
                ad={p.name}
                sifirlaAnahtari={p.id}
                siliniyor={deleteAsset.isPending}
                onSil={() =>
                  deleteAsset.mutate(p.id, { onSuccess: () => onSilindi() })
                }
              />
            )}
            {(deleteAsset.isError || repairAsset.isError) && (
              <p className="w-full text-xs text-red-600">
                {(deleteAsset.error ?? repairAsset.error)?.message}
              </p>
            )}
          </AksiyonSeridi>
        )}

        {atamaGoster && (
          <div className="border-t border-slate-200 pt-3">
            <p className="mb-1.5 text-xs font-semibold text-slate-700">
              Saha ekibine yönlendir
              {yakaEtiketi(varlikYaka) && (
                <span className="ml-1.5 font-normal text-slate-500">
                  · varlık {yakaEtiketi(varlikYaka)}'nda
                </span>
              )}
            </p>

            <div
              className={`mb-2 border px-2.5 py-1.5 text-xs ${
                mevcutGorev
                  ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {gorevYukleniyor ? (
                "Görev durumu yükleniyor…"
              ) : mevcutGorev ? (
                <>
                  Şu an <strong>{mevcutGorev.worker_ad}</strong> ekibinde
                  <span className="text-indigo-500">
                    {" "}
                    ({mevcutGorev.otomatik ? "otomatik atandı" : "elle atandı"})
                  </span>
                  . Başka bir ekip seçip yeniden yönlendirebilirsiniz.
                </>
              ) : (
                `Henüz bir ekibe atanmadı — havuzda bekliyor (aynı yakada ~${MAKS_ATAMA_MESAFE_KM} km içinde konumu bilinen boş ekip yok).`
              )}
            </div>

            {/* Bolge/guzergah atamasiyla ayni secici (ayni kotayi paylasan
                "gorev"ler); siralama once isin mudurlugu, sonra mesafe. */}
            <EkipSecici
              ekipler={ekipler}
              is={{
                konum: [lng, lat],
                yaka: varlikYaka,
                departman: varlikDepartman ?? null,
              }}
              mevcutWorkerId={mevcutGorev?.worker_id ?? null}
              departmanlar={departmanlar}
              onAta={(id) => (id ? atamaYap(id) : geriAlYap())}
              islemde={atanıyor}
              kaldirilabilir={Boolean(mevcutGorev)}
            />

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
