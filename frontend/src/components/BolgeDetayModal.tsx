import { useEffect, useState } from "react";

import { bolgeAta, bolgeSil } from "../api/bolgeler";
import { BOLGE_TIP_ETIKETLERI, type Bolge } from "../types/bolge";
import { YAKA_KISA, type EkipOzet, type Yaka } from "../types/saha";
import {
  alanEtiketi,
  cokHalkaliAlanM2,
  mesafeEtiketi,
  poligonMerkezi,
  enBuyukHalkaMerkezi,
} from "../utils/geo";
import { AksiyonButonu, AksiyonSeridi, SilOnayi } from "./Aksiyonlar";
import { IconCheck, IconLasso, IconRoute, IconUsers } from "./icons";
import Modal from "./Modal";

interface BolgeDetayModalProps {
  bolge: Bolge | null;
  onKapat: () => void;
  /** Haritada sekil duzenlemeyi baslatir (modal kapanir). */
  onSekilDuzenle?: (bolge: Bolge) => void;
  /** Kaydin uzerine ucar. */
  onGit?: (bolge: Bolge) => void;
  /** Ekibe aktarma/silme yetkisi (personel). */
  yonetebilir?: boolean;
  /** Atama listesini besleyen saha ekipleri. */
  ekipler?: EkipOzet[];
  /** Atama degisince (ust bilesen ["bolgeler"] sorgusunu tazeler). */
  onDegisti?: () => void;
  /** Silme basarili olunca (ust bilesen modali kapatir, secimi birakir). */
  onSilindi?: () => void;
}

function tarih(deger: string | null | undefined): string | null {
  return deger ? new Date(deger).toLocaleString("tr-TR") : null;
}

/** Haritadaki bir alana/cizgiye tiklayip "Detay" dendiginde acilan kart:
 *  varlik detay modalinin bolge/guzergah karsiligi. Alanlar ve cizgiler de
 *  birer isaretci gibi secilebildiginden bu ekran da onlarla ayni dili konusur. */
export default function BolgeDetayModal({
  bolge,
  onKapat,
  onSekilDuzenle,
  onGit,
  yonetebilir = false,
  ekipler,
  onDegisti,
  onSilindi,
}: BolgeDetayModalProps) {
  const [islemde, setIslemde] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  // Modal her zaman monte kalir (bolge yokken null doner), bu yuzden kayit
  // degisince islem durumu elle sifirlanir - yoksa bir onceki silme/atama
  // isleminin "islemde" durumu yeni kayda tasinir. (Acik silme onayini
  // SilOnayi kendi `sifirlaAnahtari` prop'uyla birakir.)
  useEffect(() => {
    setIslemde(false);
    setHata(null);
  }, [bolge?.id]);

  const ata = async (workerId: string | null) => {
    if (!bolge) return;
    setIslemde(true);
    setHata(null);
    try {
      await bolgeAta(bolge.id, workerId);
      onDegisti?.();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setIslemde(false);
    }
  };

  const sil = async () => {
    if (!bolge) return;
    setIslemde(true);
    setHata(null);
    try {
      await bolgeSil(bolge.id);
      onSilindi?.();
    } catch (e) {
      setHata((e as Error).message);
      setIslemde(false);
    }
  };

  if (!bolge) return null;

  const cizgi = bolge.tip === "cizgi";
  const Ikon = cizgi ? IconRoute : IconLasso;
  const olcu = cizgi
    ? bolge.uzunluk_m != null
      ? mesafeEtiketi(bolge.uzunluk_m)
      : null
    : alanEtiketi(bolge.alan_m2 ?? cokHalkaliAlanM2(bolge.noktalar));
  const noktaSayisi = bolge.noktalar.reduce((t, h) => t + h.length, 0);
  const merkez = cizgi
    ? poligonMerkezi(bolge.noktalar[0] ?? [])
    : enBuyukHalkaMerkezi(bolge.noktalar);

  const satirlar: [string, string | null][] = [
    [cizgi ? "Uzunluk" : "Alan", olcu],
    ["Köşe sayısı", `${noktaSayisi}`],
    ["Parça", bolge.noktalar.length > 1 ? `${bolge.noktalar.length} parça` : null],
    ["Merkez", `${merkez[1].toFixed(5)}, ${merkez[0].toFixed(5)}`],
    ["Atandı", tarih(bolge.assigned_at)],
    ["Tamamlandı", tarih(bolge.tamamlandi_at)],
    ["Oluşturuldu", tarih(bolge.created_at)],
    ["Güncellendi", tarih(bolge.updated_at)],
  ];

  return (
    <Modal acik baslik={BOLGE_TIP_ETIKETLERI[bolge.tip]} onKapat={onKapat}>
      <div className="space-y-3">
        <div className="flex items-start gap-2.5">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ background: bolge.renk }}
          >
            <Ikon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{bolge.ad}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1">
              {bolge.worker_ad ? (
                <span className="inline-flex items-center gap-1 bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">
                  <IconUsers className="h-3 w-3" />
                  {bolge.worker_ad}
                </span>
              ) : (
                <span className="inline-flex items-center bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                  Atanmamış
                </span>
              )}
              {bolge.tamamlandi_at && (
                <span className="inline-flex items-center gap-1 bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                  <IconCheck className="h-3 w-3" />
                  Tamamlandı
                </span>
              )}
            </p>
          </div>
        </div>

        {bolge.aciklama && (
          <p className="whitespace-pre-line border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {bolge.aciklama}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          {satirlar
            .filter(([, deger]) => deger)
            .map(([etiket, deger]) => (
              <div key={etiket} className="contents">
                <dt className="text-slate-500">{etiket}</dt>
                <dd className="text-right font-medium text-slate-800">{deger}</dd>
              </div>
            ))}
        </dl>

        {/* Ekibe aktarma: haritadaki alan/cizgi -> popup -> "Detay" yolundan da
            yonlendirme yapilabilsin (paneldeki kartla ayni islem). */}
        {yonetebilir && (
          <div className="flex items-center gap-2 border-t border-slate-200 pt-3">
            <label className="text-xs text-slate-500">
              {cizgi ? "Güzergâh ekibi" : "Görev ekibi"}
            </label>
            <select
              value={bolge.worker_id ?? ""}
              disabled={islemde}
              onChange={(e) => ata(e.target.value || null)}
              className="min-w-0 flex-1 border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              <option value="">Atanmamış</option>
              {(ekipler ?? []).map((ekip) => (
                <option key={ekip.id} value={ekip.id}>
                  {ekip.full_name || ekip.email}
                  {ekip.yaka ? ` · ${YAKA_KISA[ekip.yaka as Yaka] ?? ekip.yaka}` : ""}
                </option>
              ))}
            </select>
            {islemde && <span className="text-[11px] text-slate-400">…</span>}
          </div>
        )}

        {hata && <p className="text-xs text-red-600">{hata}</p>}

        {/* Islem seridi varlik/ihbar detay modalleriyle ayni: soldan islemler,
            saga itilmis iki adimli silme. */}
        <AksiyonSeridi>
          {onGit && (
            <AksiyonButonu
              onClick={() => {
                onGit(bolge);
                onKapat();
              }}
            >
              Haritada göster
            </AksiyonButonu>
          )}
          {onSekilDuzenle && (
            <AksiyonButonu
              tur="mor"
              onClick={() => {
                onSekilDuzenle(bolge);
                onKapat();
              }}
            >
              Şekli Düzenle
            </AksiyonButonu>
          )}
          {yonetebilir && onSilindi && (
            <SilOnayi
              ad={bolge.ad}
              sifirlaAnahtari={bolge.id}
              siliniyor={islemde}
              onSil={sil}
            />
          )}
        </AksiyonSeridi>
      </div>
    </Modal>
  );
}
