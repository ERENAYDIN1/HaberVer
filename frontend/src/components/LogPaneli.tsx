import { useLogs } from "../hooks/useLogs";
import { LOG_ACTION_LABELS, type LogAction, type LogEntry } from "../types/log";
import {
  IconBox,
  IconCheck,
  IconHistory,
  IconInbox,
  IconLasso,
  IconPlus,
  IconUsers,
  IconX,
} from "./icons";

const ACTION_STIL: Record<
  LogAction,
  { ikon: (p: { className?: string }) => React.ReactElement; rozet: string }
> = {
  asset_created: { ikon: IconPlus, rozet: "bg-emerald-100 text-emerald-700" },
  asset_updated: { ikon: IconBox, rozet: "bg-blue-100 text-blue-700" },
  asset_status_changed: { ikon: IconHistory, rozet: "bg-amber-100 text-amber-700" },
  asset_deleted: { ikon: IconX, rozet: "bg-red-100 text-red-700" },
  report_approved: { ikon: IconCheck, rozet: "bg-emerald-100 text-emerald-700" },
  report_rejected: { ikon: IconX, rozet: "bg-red-100 text-red-700" },
  report_reopened: { ikon: IconHistory, rozet: "bg-amber-100 text-amber-700" },
  user_created: { ikon: IconUsers, rozet: "bg-indigo-100 text-indigo-700" },
  user_updated: { ikon: IconUsers, rozet: "bg-blue-100 text-blue-700" },
  assignment_created: { ikon: IconUsers, rozet: "bg-indigo-100 text-indigo-700" },
  assignment_completed: { ikon: IconCheck, rozet: "bg-emerald-100 text-emerald-700" },
  assignment_cancelled: { ikon: IconInbox, rozet: "bg-slate-100 text-slate-600" },
  bolge_created: { ikon: IconLasso, rozet: "bg-emerald-100 text-emerald-700" },
  bolge_updated: { ikon: IconLasso, rozet: "bg-blue-100 text-blue-700" },
  bolge_deleted: { ikon: IconX, rozet: "bg-red-100 text-red-700" },
  bolge_assigned: { ikon: IconUsers, rozet: "bg-indigo-100 text-indigo-700" },
};

/** Backend ileride yeni bir islem turu eklerse (frontend guncellenmeden once)
 *  panel cokmesin: bilinmeyen tur notr bir rozetle, ham adiyla gosterilir. */
const VARSAYILAN_STIL = { ikon: IconHistory, rozet: "bg-slate-100 text-slate-600" };

/** Sistem genelindeki islem gecmisi: varlik ekleme/guncelleme/silme, durum
 *  degisimi, talep onay/ret, personel ekleme - kim, ne zaman, ne yapti. */
export default function LogPaneli() {
  const { data, isLoading, isError, error, refetch, isFetching } = useLogs();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <p className="text-xs font-medium text-slate-500">Sistem işlem geçmişi</p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
        >
          {isFetching ? "Yenileniyor…" : "Yenile"}
        </button>
      </div>

      {isError && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {(error as Error).message}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-slate-500">Yükleniyor…</p>}
        {!isLoading && data && data.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">Henüz bir kayıt yok.</p>
        )}

        <ul className="divide-y divide-slate-100">
          {data?.map((log) => (
            <LogSatiri key={log.id} log={log} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function LogSatiri({ log }: { log: LogEntry }) {
  const stil = ACTION_STIL[log.action] ?? VARSAYILAN_STIL;
  const Ikon = stil.ikon;
  return (
    <li className="flex gap-3 p-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${stil.rozet}`}
      >
        <Ikon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-800">
          <span className="font-medium">{log.actor_name ?? "Sistem"}</span>{" "}
          <span className="text-slate-500">
            {(LOG_ACTION_LABELS[log.action] ?? log.action).toLocaleLowerCase("tr-TR")}
          </span>
          {log.entity_name && (
            <>
              {": "}
              <span className="font-medium">{log.entity_name}</span>
            </>
          )}
        </p>
        {log.detail && <p className="mt-0.5 text-xs text-slate-500">{log.detail}</p>}
        <p className="mt-0.5 text-[11px] text-slate-400">
          {new Date(log.created_at).toLocaleString("tr-TR")}
        </p>
      </div>
    </li>
  );
}
