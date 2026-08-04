from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Uygulama ayarlari.

    Sir niteligindeki alanlarin (istemci secret'i, ilk admin parolasi)
    varsayilani yoktur: eksik birakilirlarsa uygulama acilista hata verir.
    Varsayilan vermek, ortam degiskeni ulasmadiginda sistemin bilinen bir
    parolayla sessizce ayaga kalkmasi demek olurdu.
    """

    database_url: str
    frontend_origin: str = "http://localhost:5173"

    # Uygulamanin tarayicidan gorunen tek origin'i: frontend, /api ve /media
    # ayni yerden servis edilir (dev'de Vite proxy'si). Keycloak donus adresleri
    # buradan turetilir.
    app_base_url: str = "http://localhost:5173"

    # --- Keycloak (kimlik saglayici) ---
    # public: tarayicinin gordugu adres, token'daki `iss` budur.
    # internal: backend'in docker agi icinden gittigi adres.
    keycloak_public_url: str = "http://localhost:8081"
    keycloak_internal_url: str = "http://keycloak:8080"
    keycloak_realm: str = "greenasset"
    keycloak_client_id: str = "greenasset-bff"
    # Zorunlu: realm JSON'undaki `secret` ile ayni olmali.
    keycloak_client_secret: str = Field(min_length=8)

    # --- Oturum (BFF) ---
    # Tarayici yalnizca bu cookie'yi gorur; Keycloak token'lari sunucuda kalir.
    session_cookie_name: str = "greenasset_session"
    session_cookie_secure: bool = False  # production'da mutlaka True (HTTPS)
    session_max_hours: int = 12
    # Not: rol tazeleme araligi Keycloak'taki access token omruyle belirlenir
    # (crud/session.py suresi dolunca yeniler); burada bir ayari yoktur.

    # Yerel satirla eslesecek ilk admin hesabinin e-postasi (parola Keycloak'ta).
    default_admin_email: str = "admin@greenasset.com"
    # Zorunlu: bu parolayla Keycloak'ta ilk admin acilir.
    default_admin_password: str = Field(min_length=8)

    # Yuklenen dosyalarin (ihbar fotograflari) kaydedilecegi dizin.
    media_dir: str = "media"

    # Suresi gecmis oturumlarin temizlenme araligi (saat). Temizlik bir arka
    # plan gorevidir, okuma uclarina iliştirilmez (bkz. main.py).
    oturum_temizleme_saat: int = 6

    @property
    def media_yolu(self) -> Path:
        return Path(self.media_dir)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
