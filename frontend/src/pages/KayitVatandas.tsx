import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { register } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import AuthKabuk, {
  authButtonClass,
  authInputClass,
  authLabelClass,
} from "../components/AuthKabuk";

export default function KayitVatandas() {
  const { oturumAyarla } = useAuth();
  const navigate = useNavigate();
  const [ad, setAd] = useState("");
  const [email, setEmail] = useState("");
  const [parola, setParola] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata(null);
    if (parola.length < 6) {
      setHata("Parola en az 6 karakter olmalı");
      return;
    }
    setYukleniyor(true);
    try {
      const yanit = await register(email.trim(), parola, ad.trim() || undefined);
      oturumAyarla(yanit);
      navigate("/vatandas", { replace: true });
    } catch (err) {
      setHata((err as Error).message);
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <AuthKabuk
      baslik="Vatandaş Kaydı"
      altBaslik="İhbar gönderebilmek için basit bir hesap oluşturun."
      altAlan={
        <span className="text-slate-500">
          Zaten hesabınız var mı?{" "}
          <Link to="/vatandas/giris" className="font-medium text-emerald-700 hover:underline">
            Giriş yapın
          </Link>
        </span>
      }
    >
      <form onSubmit={gonder} className="space-y-4" noValidate>
        <div>
          <label className={authLabelClass} htmlFor="ad">
            Ad Soyad <span className="text-slate-400">(opsiyonel)</span>
          </label>
          <input
            id="ad"
            className={authInputClass}
            value={ad}
            onChange={(e) => setAd(e.target.value)}
          />
        </div>
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
            Parola <span className="text-slate-400">(en az 6 karakter)</span>
          </label>
          <input
            id="parola"
            type="password"
            autoComplete="new-password"
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
          {yukleniyor ? "Kaydolunuyor…" : "Kayıt Ol"}
        </button>
      </form>
    </AuthKabuk>
  );
}
