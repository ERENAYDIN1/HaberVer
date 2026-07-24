import type { ReactNode } from "react";

import { LogoAmblem } from "./icons";

interface AuthKabukProps {
  baslik: string;
  altBaslik?: string;
  children: ReactNode;
  /** Kartin altinda gosterilecek baglanti/ipucu alani. */
  altAlan?: ReactNode;
}

/** Giris/kayit sayfalari icin ortak, ortalanmis kart duzeni. */
export default function AuthKabuk({
  baslik,
  altBaslik,
  children,
  altAlan,
}: AuthKabukProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <LogoAmblem className="h-16 w-16" />
          <div className="text-center">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              GreenAsset
            </h1>
            <p className="text-xs text-slate-500">Akıllı Şehir Varlık Yönetimi</p>
          </div>
        </div>

        <div className="border border-slate-300 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-slate-900">{baslik}</h2>
          {altBaslik && <p className="mb-4 text-xs text-slate-500">{altBaslik}</p>}
          {!altBaslik && <div className="mb-4" />}
          {children}
        </div>

        {altAlan && <div className="mt-4 text-center text-sm">{altAlan}</div>}
      </div>
    </div>
  );
}

export const authInputClass =
  "w-full border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
export const authLabelClass = "block text-sm font-medium text-slate-700 mb-1";
export const authButtonClass =
  "w-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400";
