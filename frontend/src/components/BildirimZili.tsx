import { useEffect, useRef, useState } from "react";

import { turRengi } from "../data/turSozlugu";
import type { AssetType } from "../types/asset";
import { IconBell, IconInbox, IconWarning, tipIkonu } from "./icons";

export interface Bildirim {
  id: string;
  tip: AssetType;
  baslik: string;
  altbaslik: string;
  zaman: string;
  kategori: "bakim" | "talep";
  onTikla: () => void;
}

interface BildirimZiliProps {
  bildirimler: Bildirim[];
}

/** Header'daki bildirim zili + acilir "Son Bildirimler" paneli. */
export default function BildirimZili({ bildirimler }: BildirimZiliProps) {
  const [acik, setAcik] = useState(false);
  const kutuRef = useRef<HTMLDivElement>(null);
  const adet = bildirimler.length;

  useEffect(() => {
    if (!acik) return;
    const disariTikla = (e: MouseEvent) => {
      if (kutuRef.current && !kutuRef.current.contains(e.target as Node)) {
        setAcik(false);
      }
    };
    const escBas = (e: KeyboardEvent) => e.key === "Escape" && setAcik(false);
    document.addEventListener("mousedown", disariTikla);
    document.addEventListener("keydown", escBas);
    return () => {
      document.removeEventListener("mousedown", disariTikla);
      document.removeEventListener("keydown", escBas);
    };
  }, [acik]);

  return (
    <div ref={kutuRef} className="relative">
      <button
        onClick={() => setAcik((v) => !v)}
        aria-label="Bildirimler"
        title="Bildirimler"
        className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
          acik
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        }`}
      >
        <IconBell className="h-[18px] w-[18px]" />
        {adet > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {adet > 99 ? "99+" : adet}
          </span>
        )}
      </button>

      {acik && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Son Bildirimler</h3>
            {adet > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                {adet}
              </span>
            )}
          </div>

          {adet === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <IconBell className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">Yeni bildirim yok</p>
              <p className="text-xs text-slate-400">
                Bakım bekleyen varlık ve talepler burada görünür.
              </p>
            </div>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {bildirimler.map((b) => {
                const Ikon = tipIkonu(b.tip);
                const renk = turRengi(b.tip);
                return (
                  <li key={`${b.kategori}-${b.id}`}>
                    <button
                      onClick={() => {
                        b.onTikla();
                        setAcik(false);
                      }}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                    >
                      <span className="relative shrink-0">
                        <span
                          className="flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-white"
                          style={{ backgroundColor: renk }}
                        >
                          <Ikon className="h-4 w-4 text-white" />
                        </span>
                        {b.kategori === "bakim" ? (
                          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white">
                            <IconWarning className="h-3.5 w-3.5 text-amber-500" />
                          </span>
                        ) : (
                          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white">
                            <IconInbox className="h-3.5 w-3.5 text-purple-500" />
                          </span>
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {b.baslik}
                        </p>
                        <p className="truncate text-xs text-slate-500">{b.altbaslik}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {zamanOnce(b.zaman)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** ISO tarihi "x dakika önce" gibi goreli Turkce metne cevirir. */
function zamanOnce(iso: string): string {
  const fark = Date.now() - new Date(iso).getTime();
  const dk = Math.floor(fark / 60000);
  if (dk < 1) return "az önce";
  if (dk < 60) return `${dk} dakika önce`;
  const saat = Math.floor(dk / 60);
  if (saat < 24) return `${saat} saat önce`;
  const gun = Math.floor(saat / 24);
  if (gun < 30) return `${gun} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR");
}
