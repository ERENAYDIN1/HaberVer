import { useEffect, useState } from "react";

import { createUser, listUsers } from "../api/auth";
import {
  USER_ROLE_LABELS,
  type User,
  type UserRole,
} from "../types/auth";

const inputClass =
  "w-full border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
const labelClass = "block text-sm font-medium text-slate-700 mb-1";

// Admin bu ekrandan personel (calisan) veya baska admin olusturabilir.
const OLUSTURULABILIR_ROLLER: UserRole[] = ["calisan", "admin"];

export default function PersonelYonetimi() {
  const [kullanicilar, setKullanicilar] = useState<User[]>([]);
  const [ad, setAd] = useState("");
  const [email, setEmail] = useState("");
  const [parola, setParola] = useState("");
  const [rol, setRol] = useState<UserRole>("calisan");
  const [hata, setHata] = useState<string | null>(null);
  const [basari, setBasari] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const yukle = () => {
    listUsers()
      .then(setKullanicilar)
      .catch((e) => setHata((e as Error).message));
  };
  useEffect(yukle, []);

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata(null);
    setBasari(null);
    if (parola.length < 6) return setHata("Parola en az 6 karakter olmalı");
    setGonderiliyor(true);
    try {
      const u = await createUser({
        email: email.trim(),
        password: parola,
        full_name: ad.trim() || undefined,
        role: rol,
      });
      setBasari(`${u.email} (${USER_ROLE_LABELS[u.role]}) oluşturuldu`);
      setAd("");
      setEmail("");
      setParola("");
      setRol("calisan");
      yukle();
    } catch (err) {
      setHata((err as Error).message);
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <form onSubmit={gonder} className="space-y-3 border-b border-slate-200 p-4" noValidate>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Yeni Hesap</h2>
          <p className="text-xs text-slate-500">
            Personel veya yönetici hesabı oluşturun.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="p-ad">
            Ad Soyad <span className="text-slate-400">(opsiyonel)</span>
          </label>
          <input
            id="p-ad"
            className={inputClass}
            value={ad}
            onChange={(e) => setAd(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="p-email">
            E-posta
          </label>
          <input
            id="p-email"
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="p-parola">
              Parola
            </label>
            <input
              id="p-parola"
              type="password"
              className={inputClass}
              value={parola}
              onChange={(e) => setParola(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="p-rol">
              Rol
            </label>
            <select
              id="p-rol"
              className={inputClass}
              value={rol}
              onChange={(e) => setRol(e.target.value as UserRole)}
            >
              {OLUSTURULABILIR_ROLLER.map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hata && (
          <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {hata}
          </p>
        )}
        {basari && (
          <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {basari}
          </p>
        )}

        <button
          type="submit"
          disabled={gonderiliyor}
          className="w-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {gonderiliyor ? "Oluşturuluyor…" : "Hesap Oluştur"}
        </button>
      </form>

      <div className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          Kullanıcılar{" "}
          <span className="text-xs font-normal text-slate-400">
            ({kullanicilar.length})
          </span>
        </h2>
        <ul className="divide-y divide-slate-100 border border-slate-200">
          {kullanicilar.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-800">
                  {u.full_name || u.email}
                </p>
                {u.full_name && (
                  <p className="truncate text-xs text-slate-400">{u.email}</p>
                )}
              </div>
              <span className="shrink-0 border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                {USER_ROLE_LABELS[u.role]}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
