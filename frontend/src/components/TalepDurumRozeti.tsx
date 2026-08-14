import { TALEP_DURUM_ETIKETLERI, type TalepGorunumu } from "../types/talep";

/** Rozet backend'in uc durumunu degil arayuzun dort gorunumunu gosterir:
 *  onaylanmis bir talep, olusan varlik tamir edilince "Tamir Edildi"ye gecer. */

const STIL: Record<TalepGorunumu, string> = {
  beklemede: "border-amber-300 bg-amber-50 text-amber-800",
  onaylandi: "border-emerald-300 bg-emerald-50 text-emerald-800",
  reddedildi: "border-red-300 bg-red-50 text-red-700",
  // Notr gri, TALEP_DURUM_RENGI'ndeki tamir rengiyle ayni anlami tasir.
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
      {TALEP_DURUM_ETIKETLERI[durum]}
    </span>
  );
}
