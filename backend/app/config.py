from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    frontend_origin: str = "http://localhost:5173"

    # JWT / kimlik dogrulama (gecici; ileride Keycloak'a tasinacak).
    # Uretimde JWT_SECRET mutlaka ortam degiskeniyle verilmelidir.
    jwt_secret: str = "gelistirme-icin-degistir-bu-anahtari"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 1 gun

    # Migration ile tohumlanan varsayilan admin hesabi.
    default_admin_email: str = "admin@greenasset.com"
    default_admin_password: str = "admin1234"

    # Yuklenen dosyalarin (ihbar fotograflari) kaydedilecegi dizin.
    media_dir: str = "media"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
