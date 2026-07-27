import { useQuery } from "@tanstack/react-query";

import { ekipler as ekipleriGetir } from "../api/saha";
import { IconRefresh, IconUsers, IconWarning } from "./icons";
import { MAKS_AKTIF_GOREV, type EkipOzet } from "../types/saha";

/** Son gorulme tazeligine gore renk + insana okunur metin. */
function tazelik(iso: string | null): { renk: string; metin: string } {
  if (!iso) return { renk: "#94a3b8", metin: "konum yok" };
  const farkSn = (Date.now() - new Date(iso).getTime()) / 1000;
  const metin =
    farkSn < 60
      ? "az önce"
      : farkSn < 3600
        ? `${Math.floor(farkSn / 60)} dk önce`
        : farkSn < 86400
          ? `${Math.floor(farkSn / 3600)} sa önce`
          : new Date(iso).toLocaleDateString("tr-TR");
  const renk = farkSn < 120 ? "#059669" : farkSn < 900 ? "#d97706" : "#94a3b8";
  return { renk, metin };
}

function EkipSatiri({ e }: { e: EkipOzet }) {
  const t = tazelik(e.last_seen_at);
  const dolu = e.aktif_gorev >= MAKS_AKTIF_GOREV;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600"
        title={e.email}
      >
        <IconUsers className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">
          {e.full_name || e.email}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: t.renk }}
          />
          {t.metin}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            dolu
              ? "bg-red-100 text-red-700"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {dolu && <IconWarning className="h-3 w-3" />}
          {e.aktif_gorev}/{MAKS_AKTIF_GOREV} görev
        </span>
      </div>
    </li>
  );
}

/** Personel icin saha ekiplerini konum tazeligi + yuk (kuyruk) ile izleme
 *  ekrani. Elle yonlendirme varlik detay pop up'inda yapilir. */
export default function SahaEkipleri() {
  const sorgu = useQuery({
    queryKey: ["saha", "ekipler"],
    queryFn: ekipleriGetir,
    refetchInterval: 20000,
  });
  const ekipler = sorgu.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Saha Ekipleri{" "}
            <span className="text-xs font-normal text-slate-400">
              ({ekipler.length})
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            Ekiplerin canlı konumu haritada, güncel yükü aşağıda. Bir ihbar
            onaylanınca en yakın uygun ekibe otomatik atanır.
          </p>
        </div>
        <button
          onClick={() => sorgu.refetch()}
          title="Yenile"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <IconRefresh className="h-4 w-4" />
        </button>
      </div>

      {sorgu.isLoading ? (
        <p className="text-xs text-slate-400">Yükleniyor…</p>
      ) : sorgu.isError ? (
        <p className="text-xs text-red-600">
          Ekipler yüklenemedi: {(sorgu.error as Error).message}
        </p>
      ) : ekipler.length === 0 ? (
        <p className="text-xs text-slate-400">
          Henüz saha çalışanı hesabı yok. Personel yönetiminden ekleyebilirsiniz.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {ekipler.map((e) => (
            <EkipSatiri key={e.id} e={e} />
          ))}
        </ul>
      )}
    </div>
  );
}
