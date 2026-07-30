import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import AuthKabuk, { authButtonClass } from "../components/AuthKabuk";

/** Personel girisi. Parola formu KALDIRILDI: kimlik dogrulama Keycloak'ta
 *  yapiliyor, bu sayfa yalnizca akisi baslatan kapi. Parola uygulamaya hic
 *  ugramadigi icin saklanan/iletilen bir kimlik bilgisi de yok (bkz.
 *  auth/token.ts). */
export default function LoginPersonel() {
  const { girisYap } = useAuth();

  return (
    <AuthKabuk
      baslik="Personel Girişi"
      altBaslik="Yönetici ve saha personeli için"
      altAlan={
        <span className="text-slate-500">
          Vatandaş mısınız?{" "}
          <Link
            to="/vatandas/giris"
            className="font-medium text-emerald-700 hover:underline"
          >
            İhbar girişi
          </Link>
        </span>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Giriş, kurumun kimlik sunucusu (Keycloak) üzerinden yapılır. Devam
          ettiğinizde giriş ekranına yönlendirilirsiniz.
        </p>
        <button
          type="button"
          onClick={() => girisYap("/")}
          className={authButtonClass}
        >
          Giriş Yap
        </button>
      </div>
    </AuthKabuk>
  );
}
