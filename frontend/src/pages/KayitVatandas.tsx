import { useEffect } from "react";

import { useAuth } from "../auth/AuthContext";
import AuthKabuk from "../components/AuthKabuk";

/** Vatandas kaydi artik Keycloak'in kendi kayit ekraninda yapiliyor; bu rota
 *  eski baglantilar (yer imleri, paylasilan adresler) kirilmasin diye duruyor
 *  ve dogrudan oraya yonlendiriyor. */
export default function KayitVatandas() {
  const { kayitOl } = useAuth();

  useEffect(() => {
    kayitOl("/vatandas");
  }, [kayitOl]);

  return (
    <AuthKabuk baslik="Kayıt" altBaslik="Kimlik sunucusuna yönlendiriliyorsunuz…">
      <p className="text-sm text-slate-600">
        Sayfa açılmazsa{" "}
        <button
          type="button"
          onClick={() => kayitOl("/vatandas")}
          className="font-medium text-emerald-700 hover:underline"
        >
          buraya tıklayın
        </button>
        .
      </p>
    </AuthKabuk>
  );
}
