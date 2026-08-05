import { REPORT_STATUS_LABELS, type TalepGorunumu } from "../types/report";

/** Rozet backend'in UC durumunu degil arayuzun DORT GORUNUMUNU gosterir:
 *  onaylanmis bir talep, olusan varlik tamir edilince "Tamir Edildi"ye gecer.
 *  Vatandas ve personel tarafi ayni rozeti kullanir - biten is her iki yerde de
 *  ayni sekilde okunmali. */

const STIL: Record<TalepGorunumu, string> = {
  beklemede: "border-amber-300 bg-amber-50 text-amber-800",
  onaylandi: "border-emerald-300 bg-emerald-50 text-emerald-800",
  reddedildi: "border-red-300 bg-red-50 text-red-700",
  // Notr gri: "artik is yok" - haritadaki tamir rengiyle (TALEP_DURUM_RENGI)
  // ayni anlami tasir.
  tamir: "border-slate-300 bg-slate-100 text-slate-600",
};

const NOKTA: Record<TalepGorunumu, string> = {
  beklemede: "bg-amber-500",
  onaylandi: "bg-emerald-500",
  reddedildi: "bg-red-500",
  tamir: "bg-slate-400",
};

export default function TalepDurumRozeti({ durum }: { durum: TalepGorunumu }) {
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] font-medium ${STIL[durum]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${NOKTA[durum]}`} />
      {REPORT_STATUS_LABELS[durum]}
    </span>
  );
}
