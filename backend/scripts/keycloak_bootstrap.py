"""Ilk admin hesabini Keycloak'ta acar ve yerel satirla eslestirir.

Neden ayri bir adim: baseline migration (0001) yerel `users` satirini olusturur
ama artik parola tutmuyor - giris Keycloak'ta yapiliyor. Realm import'u da
kullanici tasimiyor (realm JSON'una parola gomulmesin diye; ayrica ortam
degiskeni ikamesi orada guvenilir degil). Bu bosluk burada kapatilir.

Idempotenttir: hesap zaten varsa yalnizca rolu ve baglantiyi dogrular.

Kullanim (backend container icinde):
    python scripts/keycloak_bootstrap.py
"""
import sys
import time
import uuid
from pathlib import Path

import sqlalchemy as sa

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import keycloak  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402


def keycloak_bekle(deneme: int = 30, aralik: float = 2.0) -> None:
    """Keycloak'in acilmasini bekler: compose'da `depends_on` yalnizca
    konteynerin baslatildigini garanti eder, hazir oldugunu degil."""
    for i in range(deneme):
        try:
            keycloak._admin_token_al()
            return
        except keycloak.KeycloakHatasi as e:
            if i == deneme - 1:
                raise SystemExit(f"Keycloak'a ulasilamadi: {e}")
            time.sleep(aralik)


def main() -> None:
    keycloak_bekle()
    email = settings.default_admin_email.lower()
    kimlik = keycloak.kullanici_olustur(
        email=email,
        parola=settings.default_admin_password,
        full_name="Sistem Yoneticisi",
        rol="admin",
    )

    db = SessionLocal()
    try:
        # Yerel satir 0001'de acilmis olabilir; keycloak_id'yi baglayip rolu
        # sabitleriz. Satir yoksa (temiz kurulumda olmamali) olustururuz -
        # boylece bu script tek basina da yeterli olur.
        sonuc = db.execute(
            sa.text(
                """
                UPDATE users SET keycloak_id = :kid, role = 'admin'
                WHERE email = :email
                """
            ),
            {"kid": uuid.UUID(kimlik), "email": email},
        )
        if sonuc.rowcount == 0:
            db.execute(
                sa.text(
                    """
                    INSERT INTO users (email, keycloak_id, full_name, role)
                    VALUES (:email, :kid, 'Sistem Yoneticisi', 'admin')
                    """
                ),
                {"kid": uuid.UUID(kimlik), "email": email},
            )
        db.commit()
    finally:
        db.close()

    print(f"[keycloak] Admin hazir: {email} (keycloak_id={kimlik})")


if __name__ == "__main__":
    main()
