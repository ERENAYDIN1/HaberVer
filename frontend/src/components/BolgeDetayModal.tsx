import { BOLGE_TIP_ETIKETLERI, type Bolge } from "../types/bolge";
import {
  alanEtiketi,
  cokHalkaliAlanM2,
  mesafeEtiketi,
  poligonMerkezi,
  enBuyukHalkaMerkezi,
} from "../utils/geo";
import { IconCheck, IconLasso, IconRoute, IconUsers } from "./icons";
import Modal from "./Modal";

interface BolgeDetayModalProps {
  bolge: Bolge | null;
  onKapat: () => void;
  /** Haritada sekil duzenlemeyi baslatir (modal kapanir). */
  onSekilDuzenle?: (bolge: Bolge) => void;
  /** Kaydin uzerine ucar. */
  onGit?: (bolge: Bolge) => void;
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
}: BolgeDetayModalProps) {
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

        <div className="flex gap-2 border-t border-slate-200 pt-3">
          {onGit && (
            <button
              onClick={() => {
                onGit(bolge);
                onKapat();
              }}
              className="flex-1 border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Haritada göster
            </button>
          )}
          {onSekilDuzenle && (
            <button
              onClick={() => {
                onSekilDuzenle(bolge);
                onKapat();
              }}
              className="flex-1 bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-500"
            >
              Şekli Düzenle
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
