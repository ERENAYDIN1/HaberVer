from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    frontend_origin: str = "http://localhost:5173"

    # Uygulamanin tarayicidan gorunen TEK origin'i: frontend, /api ve /media
    # ayni yerden servis edilir (dev'de Vite proxy'si). Keycloak donus adresi
    # ve cikis sonrasi yonlendirme buradan turetilir.
    app_base_url: str = "http://localhost:5173"

    # --- Keycloak (kimlik saglayici) ---
    # public: tarayicinin gordugu adres - token'daki `iss` budur.
    # internal: backend'in docker agi icinden gittigi adres (token/JWKS/Admin API).
    # Ikisi ayri oldugu icin uc adresleri OIDC kesif belgesinden degil, elle
    # kurulur: kesif belgesi tek bir hostname dondurur ve iki taraftan biri
    # her zaman yanlis olurdu.
    keycloak_public_url: str = "http://localhost:8081"
    keycloak_internal_url: str = "http://keycloak:8080"
    keycloak_realm: str = "greenasset"
    keycloak_client_id: str = "greenasset-bff"
    keycloak_client_secret: str = "gelistirme-icin-degistir-bu-secreti"

    # --- Oturum (BFF) ---
    # Tarayici yalnizca bu cookie'yi gorur; Keycloak token'lari sunucuda kalir.
    session_cookie_name: str = "greenasset_session"
    session_cookie_secure: bool = False  # production'da mutlaka True (HTTPS)
    session_max_hours: int = 12
    # Rolleri Keycloak'tan en fazla bu araliklarla tazele (yetki degisikliginin
    # yansima suresi); arada access token yenilenir, iptal edilmis oturum
    # yenilenemedigi icin burada yakalanir.
    session_yenileme_dakika: int = 5

    # Yerel satirla eslesecek ilk admin hesabinin e-postasi (parola Keycloak'ta).
    default_admin_email: str = "admin@greenasset.com"
    default_admin_password: str = "admin1234"

    # Yuklenen dosyalarin (ihbar fotograflari) kaydedilecegi dizin.
    media_dir: str = "media"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
