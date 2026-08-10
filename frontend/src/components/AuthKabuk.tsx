import type { ReactNode } from "react";

import { HaberVerLogo } from "./icons";

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
        <div className="mb-6 flex flex-col items-center gap-4">
          <HaberVerLogo className="h-14 w-auto" />
          <p className="text-xs tracking-[0.08em] text-slate-500">
            Akıllı Şehir · Hızlı Çözüm
          </p>
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

// Not: `authInputClass` / `authLabelClass` kaldirildi. Giris artik Keycloak'in
// kendi ekraninda yapiliyor, bu sayfalarda form alani kalmadi - geriye yalnizca
// akisi baslatan dugme kaldi.
export const authButtonClass =
  "w-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400";
