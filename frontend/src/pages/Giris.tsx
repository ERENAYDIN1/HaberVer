import { useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import AuthKabuk, { authButtonClass } from "../components/AuthKabuk";

/** TEK giris sayfasi ve ayni zamanda KACIS NOKTASI.
 *
 *  Normal akista bu sayfa hic gorulmez: korumali bir rotaya girildiginde
 *  RequireRole dogrudan Keycloak'a yonlendirir (rol token'dan geldigi icin
 *  "personel mi vatandas mi" diye onden sormak gereksiz). Buraya yalnizca iki
 *  yoldan gelinir: (1) otomatik yonlendirme dongude kaldi (`?hata=oturum`),
 *  (2) kullanici eski bir baglantiyla/elle geldi. Bu yuzden sayfa ASLA
 *  kendiliginden yonlendirmez - dongunun durdugu yer burasidir. */
export default function Giris() {
  const { girisYap, kayitOl } = useAuth();
  const [parametreler] = useSearchParams();
  const hata = parametreler.get("hata");

  return (
    <AuthKabuk
      baslik="Giriş"
      altBaslik="Personel ve vatandaşlar için tek giriş"
      altAlan={
        <span className="text-slate-500">
          Personel hesapları yönetici tarafından açılır.
        </span>
      }
    >
      <div className="space-y-4">
        {hata && (
          <div className="border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            Oturum kurulamadı. Tarayıcınız çerezleri engelliyor olabilir ya da
            kimlik sunucusuna ulaşılamıyor. Aşağıdan tekrar deneyebilirsiniz.
          </div>
        )}
        <p className="text-sm text-slate-600">
          Giriş, kurumun kimlik sunucusu (Keycloak) üzerinden yapılır. Yetkiniz
          giriş sonrasında belirlenir; doğru ekrana otomatik yönlendirilirsiniz.
        </p>
        <button type="button" onClick={() => girisYap("/")} className={authButtonClass}>
          Giriş Yap
        </button>
        <button
          type="button"
          onClick={() => kayitOl("/vatandas")}
          className="w-full border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
        >
          Vatandaş Hesabı Oluştur
        </button>
      </div>
    </AuthKabuk>
  );
}
