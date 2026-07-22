import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { login } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { rolAnaSayfasi } from "../auth/RequireRole";
import AuthKabuk, {
  authButtonClass,
  authInputClass,
  authLabelClass,
} from "../components/AuthKabuk";

export default function LoginPersonel() {
  const { oturumAyarla } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [parola, setParola] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata(null);
    setYukleniyor(true);
    try {
      const yanit = await login(email.trim(), parola);
      oturumAyarla(yanit);
      navigate(rolAnaSayfasi(yanit.user.role), { replace: true });
    } catch (err) {
      setHata((err as Error).message);
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <AuthKabuk
      baslik="Personel Girişi"
      altBaslik="Yönetici ve saha personeli için"
      altAlan={
        <span className="text-slate-500">
          Vatandaş mısınız?{" "}
          <Link to="/vatandas/giris" className="font-medium text-emerald-700 hover:underline">
            İhbar girişi
          </Link>
        </span>
      }
    >
      <form onSubmit={gonder} className="space-y-4" noValidate>
        <div>
          <label className={authLabelClass} htmlFor="email">
            E-posta
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            className={authInputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={authLabelClass} htmlFor="parola">
            Parola
          </label>
          <input
            id="parola"
            type="password"
            autoComplete="current-password"
            className={authInputClass}
            value={parola}
            onChange={(e) => setParola(e.target.value)}
            required
          />
        </div>

        {hata && (
          <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {hata}
          </p>
        )}

        <button type="submit" disabled={yukleniyor} className={authButtonClass}>
          {yukleniyor ? "Giriş yapılıyor…" : "Giriş Yap"}
        </button>
      </form>
    </AuthKabuk>
  );
}
