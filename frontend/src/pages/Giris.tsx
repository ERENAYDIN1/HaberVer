import { useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import AuthKabuk, { authButtonClass } from "../components/AuthKabuk";

/** Backend'in `/api/auth/callback`den yonlendirdigi `?hata=` kodlari
 *  (`backend/app/routers/auth.py::_hata_yonlendir`) icin kullaniciya
 *  gosterilecek metin. Bilinmeyen/eksik bir kod jenerik mesaja duser -
 *  yeni bir kod eklenip burada unutulursa kullanici yine de bos kalmaz. */
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

/** TEK giris sayfasi ve ayni zamanda KACIS NOKTASI.
 *
 *  Normal akista bu sayfa hic gorulmez: korumali bir rotaya girildiginde
 *  RequireRole dogrudan Keycloak'a yonlendirir (rol token'dan geldigi icin
 *  "personel mi vatandas mi" diye onden sormak gereksiz). Buraya yalnizca iki
 *  yoldan gelinir: (1) otomatik yonlendirme dongude kaldi ya da callback
 *  kurtarilabilir bir hatayla geri dondu (`?hata=<kod>`), (2) kullanici eski
 *  bir baglantiyla/elle geldi. Bu yuzden sayfa ASLA kendiliginden
 *  yonlendirmez - dongunun durdugu yer burasidir. */
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
