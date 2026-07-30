import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import AuthKabuk, { authButtonClass } from "../components/AuthKabuk";

/** Vatandas girisi. Hem giris hem kayit Keycloak'ta yapilir; bu sayfa iki
 *  akisi da baslatan kapidir. */
export default function LoginVatandas() {
  const { girisYap, kayitOl } = useAuth();

  return (
    <AuthKabuk
      baslik="Vatandaş Girişi"
      altBaslik="İhbar göndermek için"
      altAlan={
        <span className="text-slate-500">
          Personel misiniz?{" "}
          <Link to="/giris" className="font-medium text-emerald-700 hover:underline">
            Personel girişi
          </Link>
        </span>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Giriş ve kayıt, kimlik sunucusu (Keycloak) üzerinden yapılır.
        </p>
        <button
          type="button"
          onClick={() => girisYap("/vatandas")}
          className={authButtonClass}
        >
          Giriş Yap
        </button>
        <button
          type="button"
          onClick={() => kayitOl("/vatandas")}
          className="w-full border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
        >
          Yeni Hesap Oluştur
        </button>
      </div>
    </AuthKabuk>
  );
}
