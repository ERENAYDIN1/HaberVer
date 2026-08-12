import { useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import AuthKabuk, { authButtonClass } from "../components/AuthKabuk";

/** Backend'in `/api/auth/callback`den yonlendirdigi `?hata=` kodlari icin
 *  kullaniciya gosterilecek metin. Bilinmeyen/eksik kod jenerik mesaja duser. */
const HATA_MESAJLARI: Record<string, string> = {
  oturum:
    "Oturum kurulamadı. Tarayıcınız çerezleri engelliyor olabilir ya da geri tuşuyla eski bir giriş adımına dönülmüş olabilir. Aşağıdan tekrar deneyebilirsiniz.",
  eksik: "Kimlik sunucusundan beklenen yanıt eksik geldi. Tekrar deneyin.",
  keycloak:
    "Kimlik sunucusuna ulaşılamadı ya da giriş kodu artık geçerli değil (ör. geri tuşuyla eski bir sayfaya dönüldü). Tekrar deneyin.",
  eposta:
    "Hesabınızda e-posta adresi tanımlı değil. Yöneticinizden hesabınıza e-posta eklemesini isteyin.",
  devre_disi: "Hesabınız devre dışı bırakılmış. Yöneticinizle iletişime geçin.",
};

/** Tek giris sayfasi ve ayni zamanda kacis noktasi: normalde RequireRole
 *  dogrudan Keycloak'a yonlendirdigi icin bu sayfa gorulmez. Buraya yalnizca
 *  yonlendirme dongude kalinca / hatali donuste (`?hata=`) ya da elle
 *  gelinir; bu yuzden sayfa kendiliginden ASLA yonlendirmez. */
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
            {HATA_MESAJLARI[hata] ?? HATA_MESAJLARI.oturum}
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
