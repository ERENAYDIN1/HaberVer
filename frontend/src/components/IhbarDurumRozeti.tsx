import { REPORT_STATUS_LABELS, type ReportStatus } from "../types/report";

const STIL: Record<ReportStatus, string> = {
  beklemede: "border-amber-300 bg-amber-50 text-amber-800",
  onaylandi: "border-emerald-300 bg-emerald-50 text-emerald-800",
  reddedildi: "border-red-300 bg-red-50 text-red-700",
};

const NOKTA: Record<ReportStatus, string> = {
  beklemede: "bg-amber-500",
  onaylandi: "bg-emerald-500",
  reddedildi: "bg-red-500",
};

export default function IhbarDurumRozeti({ durum }: { durum: ReportStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] font-medium ${STIL[durum]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${NOKTA[durum]}`} />
      {REPORT_STATUS_LABELS[durum]}
    </span>
  );
}
