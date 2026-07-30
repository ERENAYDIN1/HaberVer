import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import keycloak
from ..models.log import LogAction
from ..models.user import User, UserRole
from .log import add_log


def get_by_email(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def get_by_keycloak_id(db: Session, keycloak_id: uuid.UUID) -> User | None:
    return db.execute(
        select(User).where(User.keycloak_id == keycloak_id)
    ).scalar_one_or_none()


def keycloak_eslestir(
    db: Session,
    *,
    keycloak_id: uuid.UUID,
    email: str,
    full_name: str | None,
    role: UserRole,
) -> User:
    """Keycloak'tan gelen kimligi yerel satirla eslestirir ("provisioning").

    Uc durum:
      1. `keycloak_id` zaten baglanmis  -> satiri tazele (rol/ad/e-posta aynasi).
      2. Ayni e-postali yerel satir var -> baglantiyi kur (Keycloak'a gecmeden
         once olusmus tum hesaplar - ilk admin, seed'lenen ekipler - bu yolla
         kimliklerini korur: id'leri degismedigi icin gorevleri/bolgeleri durur).
      3. Hicbiri yok                    -> yeni satir (Keycloak'ta kendi kaydolan
         vatandaslar ilk API isteginde burada olusur).

    Rol Keycloak'ta yasar; buradaki kolon SORGU icin tutulan bir aynadir
    (bkz. security.py) ve her istekte token'daki rolle guncellenir.
    """
    email = email.lower()
    user = get_by_keycloak_id(db, keycloak_id) or get_by_email(db, email)

    if user is None:
        user = User(keycloak_id=keycloak_id, email=email, full_name=full_name, role=role)
        db.add(user)
    else:
        user.keycloak_id = keycloak_id
        user.email = email
        user.role = role
        # Ad Keycloak'ta duzenlenir; yerelde bos kalmasin diye kopyalanir.
        if full_name:
            user.full_name = full_name

    db.commit()
    db.refresh(user)
    return user


def get(db: Session, user_id: uuid.UUID) -> User | None:
    return db.get(User, user_id)


def list_users(db: Session) -> list[User]:
    return list(db.execute(select(User).order_by(User.created_at.desc())).scalars())


def create_user(
    db: Session,
    email: str,
    password: str,
    role: UserRole,
    full_name: str | None = None,
    actor: User | None = None,
    yaka: str | None = None,
) -> User:
    """Personel/admin hesabini ONCE Keycloak'ta acar, sonra yerel satiri baglar.

    Sira bilincli: Keycloak yazamazsak yerelde oksuz bir satir kalmaz. Tersi
    olsaydi (once yerel) giris yapamayan bir "hayalet ekip" iş atamalarina
    girerdi.

    Yerel satir eager olarak acilir (JIT provisioning'e birakilmaz): yeni bir
    saha ekibi, daha ilk girisini yapmadan `GET /api/saha/ekipler` listesinde
    gorunup is alabilmelidir.

    actor verildiginde bir log kaydi olusur. yaka yalnizca saha_calisani icin
    anlamlidir (bkz. models/yaka.py); diger rollerde yok sayilir."""
    keycloak_id = keycloak.kullanici_olustur(
        email=email.lower(), parola=password, full_name=full_name, rol=role.value
    )
    user = User(
        email=email.lower(),
        keycloak_id=uuid.UUID(keycloak_id),
        full_name=full_name,
        role=role,
        yaka=yaka if role == UserRole.saha_calisani else None,
    )
    db.add(user)
    db.flush()  # id'yi almak icin

    if actor is not None:
        add_log(
            db,
            action=LogAction.user_created,
            actor=actor,
            entity_type="user",
            entity_id=user.id,
            entity_name=user.email,
            detail=role.value,
        )

    db.commit()
    db.refresh(user)
    return user


def set_yaka(db: Session, user: User, yaka: str | None, actor: User) -> User:
    """Bir saha ekibinin kadro yakasini ayarlar/temizler (None: yaka artik son
    konumdan turetilir)."""
    user.yaka = yaka
    add_log(
        db,
        action=LogAction.user_updated,
        actor=actor,
        entity_type="user",
        entity_id=user.id,
        entity_name=user.email,
        detail=f"Yaka: {yaka or 'konumdan türet'}",
    )
    db.commit()
    db.refresh(user)
    return user
